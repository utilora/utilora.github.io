/**
 * S-22: GoTrue 密码 / 二次验证钩子
 * 直接打 /auth/v1 也会记账与锁定，不能只靠页面上的冷却检查。
 * 密钥 AUTH_HOOK_SECRET（v1,whsec_… 或 Bearer）；未配置则拒绝。
 */

import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { clientIp, hashIp, rpc } from "../_shared/request.ts";

type HookBody = {
  user?: { email?: string; id?: string; email_address?: string };
  email?: string;
  user_id?: string;
  factor_id?: string;
  valid?: boolean;
};

function hookEmail(body: HookBody): string | null {
  const raw = body.email || body.user?.email || body.user?.email_address || "";
  const v = String(raw).trim().toLowerCase();
  if (!v || v.length > 320 || !v.includes("@")) return null;
  return v;
}

function decodeWhsec(secret: string): Uint8Array | null {
  let key = secret.trim();
  if (key.startsWith("v1,")) key = key.slice(3);
  if (key.startsWith("whsec_")) key = key.slice(6);
  try {
    const bin = atob(key);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacEqual(secret: string, payload: string, signatures: string): Promise<boolean> {
  const keyBytes = decodeWhsec(secret);
  if (!keyBytes) return false;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return signatures.split(/[\s,]/).some((part) => part.replace(/^v1,/, "") === expected);
}

async function authorized(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("AUTH_HOOK_SECRET") || "";
  if (!secret) return false;
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (auth && (auth === secret || secret.endsWith(auth))) return true;
  const headerSecret = (req.headers.get("x-supabase-api-hook-secret") || req.headers.get("webhook-secret") || "").trim();
  if (headerSecret && (headerSecret === secret || secret.endsWith(headerSecret))) return true;
  const id = req.headers.get("webhook-id") || "";
  const ts = req.headers.get("webhook-timestamp") || "";
  const sig = req.headers.get("webhook-signature") || "";
  if (!id || !ts || !sig) return false;
  return hmacEqual(secret, `${id}.${ts}.${rawBody}`, sig);
}

function reject(message: string): Response {
  return json({ decision: "reject", message });
}

function continueOk(): Response {
  return json({ decision: "continue" });
}

function lockMessage(data: Record<string, unknown>, kind: "login" | "mfa"): string {
  const mins = Number(data?.remaining_minutes || data?.cooldown_minutes || 15) || 15;
  if (kind === "mfa") return `二次验证失败次数过多，请约 ${mins} 分钟后再试。`;
  return `登录失败次数过多，请约 ${mins} 分钟后再试。`;
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!Deno.env.get("AUTH_HOOK_SECRET")) {
    return json({ error: "hook_unconfigured" }, 503);
  }

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !serviceKey) return json({ error: "server misconfigured" }, 500);

  const rawBody = await req.text();
  if (!(await authorized(req, rawBody))) return json({ error: "unauthorized" }, 401);

  let body: HookBody = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const email = hookEmail(body);
  if (!email) return reject("无法识别账号");

  const mfa = Boolean(body.factor_id);
  const valid = body.valid !== false;

  try {
    if (mfa) {
      const check = await rpc("check_mfa_allowed", { p_email: email }, serviceKey, apiUrl);
      const data = (check.data || {}) as Record<string, unknown>;
      if (check.ok && data.allowed === false) {
        return reject(lockMessage(data, "mfa"));
      }
      if (!valid) {
        const recorded = await rpc("record_mfa_failure", { p_email: email }, serviceKey, apiUrl);
        const rec = (recorded.data || {}) as Record<string, unknown>;
        if (recorded.ok && (rec.locked || rec.reason === "mfa_lock")) {
          return reject(lockMessage(rec, "mfa"));
        }
        return continueOk();
      }
      await rpc("clear_mfa_failures", { p_email: email }, serviceKey, apiUrl);
      return continueOk();
    }

    const ipHash = await hashIp(clientIp(req));
    const check = await rpc(
      "check_login_allowed",
      { p_email: email, p_ip_hash: ipHash },
      serviceKey,
      apiUrl,
    );
    const data = (check.data || {}) as Record<string, unknown>;
    if (check.ok && data.allowed === false) {
      return reject(lockMessage(data, "login"));
    }
    if (!valid) {
      const recorded = await rpc(
        "record_login_failure",
        { p_email: email, p_ip_hash: ipHash },
        serviceKey,
        apiUrl,
      );
      const rec = (recorded.data || {}) as Record<string, unknown>;
      if (recorded.ok && (rec.locked || rec.reason === "email_lock" || rec.reason === "ip_lock")) {
        return reject(lockMessage(rec, "login"));
      }
      return continueOk();
    }
    await rpc("clear_login_failures", { p_email: email, p_ip_hash: ipHash }, serviceKey, apiUrl);
    return continueOk();
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "internal error" },
      500,
    );
  }
}

Deno.serve(withEdgeGuard("auth-hooks", handler));
