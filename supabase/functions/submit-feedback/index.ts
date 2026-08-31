/**
 * S-09: 功能建议提交（登录 + 人机验证 + 用户/IP 限额）
 * 人机验证密钥缺失时拒绝。
 */
import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { clientIp, hashIp, rpc } from "../_shared/request.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

function clip(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!apiUrl || !serviceKey || !anonKey) return json({ error: "server misconfigured" }, 500);

  const userToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!userToken || userToken === anonKey || userToken === serviceKey) {
    return json({ error: "auth_required", message: "请先登录后再提交建议。" }, 401);
  }
  const userRes = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
  });
  const user = userRes.ok ? await userRes.json().catch(() => null) : null;
  if (!user?.id) return json({ error: "auth_required", message: "登录已失效，请重新登录后再提交。" }, 401);

  let body: { captcha_token?: string; name?: string; title?: string; message?: string; contact?: string } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const name = clip(body.name, 50);
  const title = clip(body.title, 100);
  const message = clip(body.message, 2000);
  const contact = clip(body.contact, 100);
  if (name.length < 1 || title.length < 2 || message.length < 5) {
    return json({ error: "invalid_payload", message: "请完整填写称呼、功能名称和说明。" }, 400);
  }

  const ip = clientIp(req);
  const captcha = await verifyTurnstile(String(body.captcha_token || ""), ip);
  if (!captcha.ok) {
    return json({ error: captcha.error, allowed: false, message: captcha.message }, captcha.status || 403);
  }

  const recorded = await rpc("record_public_submit", {
    p_kind: "feedback",
    p_subject: String(user.id),
    p_ip_hash: await hashIp(ip),
  }, serviceKey, apiUrl);
  if (!recorded.ok && /public_submit_limit_exceeded/i.test(JSON.stringify(recorded.data || ""))) {
    return json({ error: "feedback_submit_limit_exceeded", message: "提交次数已达上限，请稍后再试。" }, 429);
  }
  if (!recorded.ok) {
    return json({ error: "submit_failed", detail: recorded.data }, recorded.status >= 400 ? recorded.status : 500);
  }

  const insertRes = await fetch(`${apiUrl}/rest/v1/feedback`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ name, title, message, contact: contact || null, status: "new" }),
  });
  if (!insertRes.ok) {
    return json({ error: "submit_failed", detail: await insertRes.text() }, insertRes.status >= 400 ? insertRes.status : 500);
  }
  return json({ ok: true });
}

Deno.serve(withEdgeGuard("submit-feedback", handler));
