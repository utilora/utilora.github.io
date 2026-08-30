/**
 * S-01: 每 IP 每天成功注册限额
 * - action=check：注册/发码前查询是否还可注册
 * - action=record：验证成功后记账（需用户 access_token）
 * IP 从请求头读取，不信任客户端传入。
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

async function userIdFromToken(
  token: string,
  apiUrl: string,
  anonOrService: string,
): Promise<string | null> {
  const response = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: {
      apikey: anonOrService,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
  if (!apiUrl || !serviceKey) {
    return json({ error: "server misconfigured" }, 500);
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(body.action || "").toLowerCase();
  const ip = clientIp(req);
  const ipHash = await sha256Hex(ip);

  try {
    if (action === "check") {
      const result = await rpc("check_registration_ip_allowed", { p_ip_hash: ipHash }, serviceKey, apiUrl);
      if (!result.ok) {
        return json({ error: "check failed", detail: result.data }, result.status >= 400 ? result.status : 500);
      }
      const data = result.data as Record<string, unknown>;
      return json({
        allowed: Boolean(data?.allowed),
        limit: data?.limit ?? 3,
        used: data?.used ?? 0,
        remaining: data?.remaining ?? 0,
        day: data?.day ?? null,
      });
    }

    if (action === "record") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token || token === serviceKey || token === anonKey) {
        return json({ error: "authentication required" }, 401);
      }
      const uid = await userIdFromToken(token, apiUrl, anonKey);
      if (!uid) return json({ error: "invalid session" }, 401);

      const result = await rpc(
        "record_registration_ip",
        { p_ip_hash: ipHash, p_user_id: uid },
        serviceKey,
        apiUrl,
      );
      if (!result.ok) {
        const detail = JSON.stringify(result.data || "");
        if (/registration_ip_limit_exceeded/i.test(detail)) {
          return json(
            {
              error: "registration_ip_limit_exceeded",
              message: "今日该网络注册次数已达上限，请明日再试或更换网络。",
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
});
