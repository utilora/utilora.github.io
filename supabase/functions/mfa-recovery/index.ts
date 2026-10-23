/**
 * 二次验证恢复码：签发、核销。明文只在签发时返回一次。
 */
import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { rpc } from "../_shared/request.ts";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_COUNT = 10;

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1] || "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeCode(raw: string): string {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatCode(raw: string): string {
  const n = normalizeCode(raw);
  return n.slice(0, 4) + "-" + n.slice(4, 8);
}

function randomCodes(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < CODE_COUNT) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let body = "";
    for (const b of bytes) body += CHARSET[b % CHARSET.length];
    if (seen.has(body)) continue;
    seen.add(body);
    out.push(formatCode(body));
  }
  return out;
}

async function hashCode(userId: string, code: string): Promise<string> {
  const salt = Deno.env.get("REGISTRATION_IP_SALT") || "utilora";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(salt + "|mfa-recovery|" + userId + "|" + normalizeCode(code)),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authUser(token: string, apiUrl: string, anonKey: string) {
  const res = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

async function listTotpFactors(token: string, apiUrl: string, anonKey: string) {
  const res = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const data = res.ok ? await res.json().catch(() => ({})) : {};
  const list = Array.isArray(data?.factors) ? data.factors : [];
  return list.filter((factor: { factor_type?: string; type?: string; status?: string }) => {
    const type = String(factor.factor_type || factor.type || "");
    return type === "totp" && factor.status === "verified";
  });
}

async function deleteFactor(userId: string, factorId: string, apiUrl: string, serviceKey: string) {
  await fetch(`${apiUrl}/auth/v1/admin/users/${userId}/factors/${factorId}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
}

async function insertActivity(
  apiUrl: string,
  serviceKey: string,
  user: { id: string; email?: string },
  eventType: string,
  detail: Record<string, unknown>,
) {
  await fetch(`${apiUrl}/rest/v1/user_activity_logs`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: user.id,
      email: String(user.email || "").toLowerCase(),
      event_type: eventType,
      category: "auth",
      path: "/account/",
      detail,
    }),
  }).catch(() => {});
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!apiUrl || !serviceKey || !anonKey) return json({ error: "server misconfigured" }, 500);

  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!userToken || userToken === anonKey || userToken === serviceKey) {
    return json({ error: "auth_required", message: "请先登录" }, 401);
  }
  const user = await authUser(userToken, apiUrl, anonKey);
  if (!user?.id) return json({ error: "auth_required", message: "请先登录" }, 401);

  const body = await req.json().catch(() => ({})) as { action?: string; code?: string };
  const action = String(body.action || "").trim().toLowerCase();
  const aal = String(jwtPayload(userToken).aal || "");

  if (action === "issue") {
    if (aal !== "aal2") {
      return json({ error: "aal2_required", message: "签发恢复码须先通过二次验证。" }, 403);
    }
    const totp = await listTotpFactors(userToken, apiUrl, anonKey);
    if (!totp.length) {
      return json({ error: "mfa_required", message: "请先开启二次验证。" }, 400);
    }
    const codes = randomCodes();
    const hashes = [];
    for (const code of codes) hashes.push(await hashCode(user.id, code));
    const stored = await rpc("replace_mfa_recovery_codes", {
      p_user_id: user.id,
      p_hashes: hashes,
    }, serviceKey, apiUrl);
    if (!stored.ok) {
      return json({ error: "issue_failed", detail: stored.data }, 500);
    }
    await insertActivity(apiUrl, serviceKey, user, "profile_update", { source: "mfa_recovery_issue" });
    return json({ ok: true, codes, remaining: codes.length });
  }

  if (action === "redeem") {
    const code = String(body.code || "");
    if (normalizeCode(code).length !== 8) {
      return json({ error: "invalid", message: "恢复码格式不对。" }, 400);
    }
    const hashed = await hashCode(user.id, code);
    const peeked = await rpc("peek_mfa_recovery_code", {
      p_user_id: user.id,
      p_code_hash: hashed,
    }, serviceKey, apiUrl);
    const peek = peeked.data && typeof peeked.data === "object" ? peeked.data as { ok?: boolean; error?: string } : {};
    if (!peeked.ok || peek.ok !== true) {
      const locked = peek.error === "locked";
      return json({
        error: locked ? "locked" : "invalid",
        message: locked ? "恢复码尝试次数过多，请约 15 分钟后再试。" : "恢复码不对或已用过。",
      }, locked ? 429 : 400);
    }
    const factors = await listTotpFactors(userToken, apiUrl, anonKey);
    for (const factor of factors) {
      if (factor?.id) await deleteFactor(user.id, factor.id, apiUrl, serviceKey);
    }
    const marked = await rpc("mark_mfa_recovery_code_used", {
      p_user_id: user.id,
      p_code_hash: hashed,
    }, serviceKey, apiUrl);
    const remain = marked.data && typeof marked.data === "object"
      ? Number((marked.data as { remaining?: number }).remaining || 0)
      : 0;
    await insertActivity(apiUrl, serviceKey, user, "login", {
      source: "mfa_recovery",
      remaining: remain,
    });
    return json({ ok: true, totp_removed: true, remaining: remain });
  }

  return json({ error: "unknown_action" }, 400);
}

Deno.serve(withEdgeGuard("mfa-recovery", handler));
