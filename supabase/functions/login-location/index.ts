/**
 * S-14：登录成功后登记网络哈希；新地点时尝试通知注册邮箱。
 */
import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { clientIp, hashIp, rpc } from "../_shared/request.ts";

async function sendNewLocationEmail(email: string, when: string): Promise<boolean> {
  const resend = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("NOTIFY_FROM_EMAIL") || "";
  if (!resend || !from || !email) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resend}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Utilora 新地点登录",
      html: `<p>你的 Utilora 账号刚刚在一个新的网络登录。</p><p>时间：${when}</p><p>如果不是你本人操作，请立即修改密码，并在账号页点「登出其他设备」。</p>`,
    }),
  });
  return res.ok;
}

async function insertActivity(
  apiUrl: string,
  serviceKey: string,
  user: { id: string; email?: string },
  emailed: boolean,
): Promise<void> {
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
      event_type: "login_new_location",
      category: "auth",
      path: "/login/",
      detail: { emailed },
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
    return json({ error: "auth_required" }, 401);
  }
  const userRes = await fetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
  });
  const user = userRes.ok ? await userRes.json().catch(() => null) : null;
  if (!user?.id) return json({ error: "auth_required" }, 401);

  const recorded = await rpc("record_login_location", {
    p_user_id: user.id,
    p_ip_hash: await hashIp(clientIp(req)),
  }, serviceKey, apiUrl);
  if (!recorded.ok) {
    return json({ error: "record_failed", detail: recorded.data }, recorded.status >= 400 ? recorded.status : 500);
  }
  const payload = recorded.data && typeof recorded.data === "object" ? recorded.data as { new_location?: boolean } : {};
  const isNew = payload.new_location === true;
  let emailed = false;
  if (isNew && user.email) {
    const when = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    emailed = await sendNewLocationEmail(String(user.email), when).catch(() => false);
    await insertActivity(apiUrl, serviceKey, user, emailed);
  }
  return json({ ok: true, new_location: isNew, emailed });
}

Deno.serve(withEdgeGuard("login-location", handler));
