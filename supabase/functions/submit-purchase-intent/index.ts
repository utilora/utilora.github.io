/**
 * S-04: 购买意向提交前先做人机验证，再调用 submit_purchase_intent RPC
 * 前端应改调本函数，而不是直接 RPC（直接 RPC 仍可用，但无验票）
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

async function verifyTurnstile(
  token: string,
  ip: string,
  secret: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string; message?: string; status?: number }> {
  const t = String(token || "").trim();
  if (!t || t.length < 10 || t.length > 2048) {
    return { ok: false, error: "captcha_required", message: "请完成人机验证后再提交。", status: 400 };
  }
  if (!secret) return { ok: true, skipped: true };
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", t);
  if (ip && ip !== "0.0.0.0") form.set("remoteip", ip);
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await verifyRes.json().catch(() => ({}));
  if (!data || data.success !== true) {
    return { ok: false, error: "captcha_failed", message: "人机验证未通过，请刷新后重试。", status: 403 };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !anonKey) return json({ error: "server misconfigured" }, 500);

  let body: {
    captcha_token?: string;
    email?: string;
    use_case?: string;
    company_size?: string;
    intended_plan?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  const captcha = await verifyTurnstile(String(body.captcha_token || ""), clientIp(req), secret);
  if (!captcha.ok) {
    return json(
      { error: captcha.error, allowed: false, message: captcha.message },
      captcha.status || 403,
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const bearer = userToken && userToken !== anonKey && userToken !== serviceKey ? userToken : anonKey;

  const rpcRes = await fetch(`${apiUrl}/rest/v1/rpc/submit_purchase_intent`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      p_email: body.email,
      p_use_case: body.use_case ?? null,
      p_company_size: body.company_size ?? null,
      p_intended_plan: body.intended_plan ?? "pro",
    }),
  });
  const text = await rpcRes.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!rpcRes.ok) {
    return json({ error: "submit_failed", detail: data }, rpcRes.status >= 400 ? rpcRes.status : 500);
  }
  return json({ id: data, captcha_skipped: Boolean(captcha.skipped) });
});
