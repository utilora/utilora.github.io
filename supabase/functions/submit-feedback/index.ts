/**
 * S-09: 功能建议提交（登录 + 人机验证 + 用户/IP 限额）
 */
import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";

function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  const first = xf.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || "0.0.0.0";
}

async function sha256Hex(value: string): Promise<string> {
  const salt = Deno.env.get("REGISTRATION_IP_SALT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "utilora";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + "|" + value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clip(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

async function rpc(name: string, args: Record<string, unknown>, serviceKey: string, apiUrl: string) {
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
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: response.ok, status: response.status, data };
}

async function verifyTurnstile(token: string, ip: string, secret: string) {
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
  const captcha = await verifyTurnstile(String(body.captcha_token || ""), ip, Deno.env.get("TURNSTILE_SECRET_KEY") || "");
  if (!captcha.ok) return json({ error: captcha.error, allowed: false, message: captcha.message }, captcha.status || 403);

  const recorded = await rpc("record_public_submit", {
    p_kind: "feedback",
    p_subject: String(user.id),
    p_ip_hash: await sha256Hex(ip),
  }, serviceKey, apiUrl);
  if (!recorded.ok && /public_submit_limit_exceeded/i.test(JSON.stringify(recorded.data || ""))) {
    return json({ error: "feedback_submit_limit_exceeded", message: "提交次数已达上限，请稍后再试。" }, 429);
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
  return json({ ok: true, captcha_skipped: Boolean(captcha.skipped) });
}

Deno.serve(withEdgeGuard("submit-feedback", handler));
