/**
 * S-04 / S-09: 购买意向只走本函数。
 * 人机验证（密钥缺失拒绝）→ 邮箱/IP 小时限额 → 仅服务端调用 submit_purchase_intent。
 */

import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { clientIp, hashIp, rpc } from "../_shared/request.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !anonKey || !serviceKey) return json({ error: "server misconfigured" }, 500);

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

  const email = String(body.email || "").trim().toLowerCase();
  if (!email || email.length < 3 || email.length > 254 || !email.includes("@")) {
    return json({ error: "invalid_payload", message: "请填写有效邮箱。" }, 400);
  }

  const ip = clientIp(req);
  const captcha = await verifyTurnstile(String(body.captcha_token || ""), ip);
  if (!captcha.ok) {
    return json(
      { error: captcha.error, allowed: false, message: captcha.message },
      captcha.status || 403,
    );
  }

  const recorded = await rpc("record_public_submit", {
    p_kind: "purchase_intent",
    p_subject: email,
    p_ip_hash: await hashIp(ip),
  }, serviceKey, apiUrl);
  if (!recorded.ok && /public_submit_limit_exceeded/i.test(JSON.stringify(recorded.data || ""))) {
    return json(
      { error: "purchase_intent_submit_limit_exceeded", message: "提交次数已达上限，请稍后再试。" },
      429,
    );
  }
  if (!recorded.ok) {
    return json({ error: "submit_failed", detail: recorded.data }, recorded.status >= 400 ? recorded.status : 500);
  }

  let userId: string | null = null;
  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (userToken && userToken !== anonKey && userToken !== serviceKey) {
    const userRes = await fetch(`${apiUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
    });
    const user = userRes.ok ? await userRes.json().catch(() => null) : null;
    if (user?.id) userId = String(user.id);
  }

  const rpcRes = await rpc("submit_purchase_intent", {
    p_email: email,
    p_use_case: body.use_case ?? null,
    p_company_size: body.company_size ?? null,
    p_intended_plan: body.intended_plan ?? "pro",
    p_user_id: userId,
  }, serviceKey, apiUrl);
  if (!rpcRes.ok) {
    return json({ error: "submit_failed", detail: rpcRes.data }, rpcRes.status >= 400 ? rpcRes.status : 500);
  }
  return json({ id: rpcRes.data });
}

Deno.serve(withEdgeGuard("submit-purchase-intent", handler));
