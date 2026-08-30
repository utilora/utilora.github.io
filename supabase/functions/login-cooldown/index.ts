/**
 * S-03: 登录失败冷却
 * - action=check：登录前查询邮箱/IP 是否在冷却期
 * - action=record_failure：密码错误后记账（达上限则锁定）
 * - action=clear_success：登录成功后清零
 * IP 从请求头读取；邮箱由客户端传入并在服务端规范化。
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

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

function lockMessage(data: Record<string, unknown>): string {
  const mins = Number(data?.remaining_minutes || data?.cooldown_minutes || 15) || 15;
  return `登录失败次数过多，请约 ${mins} 分钟后再试。`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
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
        "check_login_allowed",
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
        max_attempts: data?.max_attempts ?? 5,
        cooldown_minutes: data?.cooldown_minutes ?? 15,
        email_failures: data?.email_failures ?? 0,
        ip_failures: data?.ip_failures ?? 0,
        locked_until: data?.locked_until ?? null,
        remaining_minutes: data?.remaining_minutes ?? 0,
        reason: data?.reason ?? null,
        message: allowed ? null : lockMessage(data),
      });
    }

    if (action === "record_failure") {
      const result = await rpc(
        "record_login_failure",
        { p_email: email, p_ip_hash: ipHash },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        return json({ error: "record failed", detail: result.data }, result.status >= 400 ? result.status : 500);
      }
      const data = result.data as Record<string, unknown>;
      const locked = Boolean(data?.locked) || data?.reason === "email_lock" || data?.reason === "ip_lock";
      if (locked) {
        return json(
          {
            error: "login_cooldown",
            reason: data?.reason ?? null,
            message: lockMessage(data),
            locked_until: data?.locked_until ?? null,
            remaining_minutes: data?.remaining_minutes ?? 0,
            max_attempts: data?.max_attempts ?? 5,
            cooldown_minutes: data?.cooldown_minutes ?? 15,
            email_failures: data?.email_failures ?? null,
            ip_failures: data?.ip_failures ?? null,
          },
          429,
        );
      }
      return json(data);
    }

    if (action === "clear_success") {
      const result = await rpc(
        "clear_login_failures",
        { p_email: email, p_ip_hash: ipHash },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        return json({ error: "clear failed", detail: result.data }, result.status >= 400 ? result.status : 500);
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
});
