/**
 * S-02: 验证码发送服务端限额
 * - action=check：发码前查询邮箱/IP 是否超限
 * - action=record：点发送时记账（超限拒绝）
 * IP 从请求头读取；邮箱由客户端传入并在服务端规范化。
 * S-06: 经 withEdgeGuard（拒绝 service-role、超时、日调用上限）
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
  const salt = Deno.env.get("REGISTRATION_IP_SALT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "utilora";
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

function limitMessage(reason: string | null | undefined): string {
  if (reason === "ip_limit") {
    return "当前网络发送验证码次数已达上限，请稍后再试或更换网络。";
  }
  return "该邮箱发送验证码次数已达上限，请稍后再试。";
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !serviceKey) {
    return json({ error: "server misconfigured" }, 500);
  }

  let body: { action?: string; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(body.action || "").toLowerCase();
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: "invalid email" }, 400);

  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);

  try {
    if (action === "check") {
      const result = await rpc(
        "check_otp_send_allowed",
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
        email_limit: data?.email_limit ?? 3,
        email_used: data?.email_used ?? 0,
        email_remaining: data?.email_remaining ?? 0,
        ip_limit: data?.ip_limit ?? 10,
        ip_used: data?.ip_used ?? 0,
        ip_remaining: data?.ip_remaining ?? 0,
        reason: data?.reason ?? null,
        message: allowed ? null : limitMessage(String(data?.reason || "")),
      });
    }

    if (action === "record") {
      const result = await rpc(
        "record_otp_send",
        { p_email: email, p_ip_hash: ipHash },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        const detail = JSON.stringify(result.data || "");
        if (/otp_rate_limit_exceeded/i.test(detail)) {
          let reason = "email_limit";
          try {
            const d = result.data as { details?: string; detail?: string; message?: string };
            const raw = String(d?.details || d?.detail || d?.message || "");
            if (/ip_limit/i.test(raw)) reason = "ip_limit";
          } catch { /* ignore */ }
          return json(
            {
              error: "otp_rate_limit_exceeded",
              reason,
              message: limitMessage(reason),
              detail: result.data,
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

Deno.serve(withEdgeGuard("otp-rate-limit", handler));
