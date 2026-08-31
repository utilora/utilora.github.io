/** S-04: 人机验证。密钥缺失时拒绝，不静默放行。 */

export type TurnstileResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: number };

export async function verifyTurnstile(token: string, ip: string): Promise<TurnstileResult> {
  const t = String(token || "").trim();
  if (!t || t.length < 10 || t.length > 2048) {
    return {
      ok: false,
      error: "captcha_required",
      message: "请完成人机验证后再提交。",
      status: 400,
    };
  }
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) {
    return {
      ok: false,
      error: "captcha_unavailable",
      message: "人机验证暂不可用，请稍后再试。",
      status: 503,
    };
  }
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", t);
  if (ip && ip !== "0.0.0.0") form.set("remoteip", ip);
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await verifyRes.json().catch(() => ({})) as { success?: boolean };
  if (!data || data.success !== true) {
    return {
      ok: false,
      error: "captcha_failed",
      message: "人机验证未通过，请刷新后重试。",
      status: 403,
    };
  }
  return { ok: true };
}
