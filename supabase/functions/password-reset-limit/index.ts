/**
 * S-08: 找回密码限流（发送重置邮件 / 提交新密码）
 * IP 从请求头读取；邮箱由客户端传入并规范化。
 * 超限返回统一文案，不泄露邮箱是否存在。
 */

import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0]?.trim();
  if (first) return first;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "0.0.0.0";
}

function normalizeEmail(email: unknown): string | null {
  const v = String(email || "").trim().toLowerCase();
  if (!v || v.length > 320 || !v.includes("@")) return null;
  return v;
}

async function sha256Hex(value: string): Promise<string> {
  const salt = Deno.env.get("REGISTRATION_IP_SALT") || "utilora";
  const data = new TextEncoder().encode(salt + "|" + value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
  serviceKey: string,
  apiUrl: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { ok: response.ok, status: response.status, data };
}

function limitMessage(): string {
  return "重置次数已达上限，请稍后再试。";
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !serviceKey) {
    return json({ error: "server misconfigured" }, 500);
  }

  let body: { action?: string; email?: string; kind?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(body.action || "").toLowerCase();
  const kind = String(body.kind || "send").toLowerCase() === "submit" ? "submit" : "send";
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid email" }, 400);

  const ipHash = await sha256Hex(clientIp(req));

  try {
    if (action === "check") {
      const result = await rpc(
        "check_password_reset_allowed",
        { p_email: email, p_ip_hash: ipHash },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        return json({ error: "check failed", detail: result.data }, result.status >= 400 ? result.status : 500);
      }
      const data = result.data as Record<string, unknown>;
      const allowed = Boolean(data?.allowed);
      return json({
        allowed,
        message: allowed ? null : limitMessage(),
        reason: data?.reason ?? null,
      });
    }

    if (action === "record") {
      const result = await rpc(
        "record_password_reset",
        { p_email: email, p_ip_hash: ipHash, p_kind: kind },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        const detail = JSON.stringify(result.data || "");
        if (/password_reset_limit_exceeded/i.test(detail)) {
          return json(
            {
              error: "password_reset_limit_exceeded",
              message: limitMessage(),
            },
            429,
          );
        }
        return json({ error: "record failed", detail: result.data }, result.status >= 400 ? result.status : 500);
      }
      return json(result.data);
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "internal error" },
      500,
    );
  }
}

Deno.serve(withEdgeGuard("password-reset-limit", handler));
