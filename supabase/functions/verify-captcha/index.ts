/**
 * S-04: 人机验证（Cloudflare Turnstile）服务端验票
 * - action=verify：校验客户端 token，成功才允许注册发码 / 留言 / 购买意向
 * - secret 仅存 Edge Function 环境变量 TURNSTILE_SECRET_KEY，不得进前端
 * - 未配置 secret 时返回 skipped（便于本地联调）；生产须配置密钥
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

const ALLOWED_PURPOSES = new Set(["register", "feedback", "purchase_intent"]);

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { action?: string; token?: string; purpose?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const action = String(body.action || "verify").toLowerCase();
  if (action !== "verify") return json({ error: "unknown action" }, 400);

  const purpose = String(body.purpose || "").toLowerCase().trim();
  if (!ALLOWED_PURPOSES.has(purpose)) {
    return json(
      { error: "invalid purpose", message: "purpose 必须是 register、feedback 或 purchase_intent" },
      400,
    );
  }

  const token = String(body.token || "").trim();
  if (!token || token.length < 10 || token.length > 2048) {
    return json(
      {
        error: "captcha_required",
        allowed: false,
        message: "请完成人机验证后再提交。",
      },
      400,
    );
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) {
    return json({
      allowed: true,
      skipped: true,
      purpose,
      message: null,
    });
  }

  const ip = clientIp(req);
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip && ip !== "0.0.0.0") form.set("remoteip", ip);

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const data = (await verifyRes.json().catch(() => ({}))) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (!data || data.success !== true) {
      return json(
        {
          error: "captcha_failed",
          allowed: false,
          message: "人机验证未通过，请刷新后重试。",
          codes: data?.["error-codes"] || [],
        },
        403,
      );
    }

    return json({
      allowed: true,
      skipped: false,
      purpose,
      message: null,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "internal error",
        allowed: false,
        message: "人机验证服务暂时不可用，请稍后再试。",
      },
      502,
    );
  }
}

Deno.serve(withEdgeGuard("verify-captcha", handler));
