/**
 * S-04 / S-21: 人机验证（Cloudflare Turnstile）服务端验票
 * - action=verify：校验客户端 token
 * - secret 仅存 TURNSTILE_SECRET_KEY；缺失时拒绝，不跳过
 * S-06: 经 withEdgeGuard
 */

import { withEdgeGuard, jsonResponse as json } from "../_shared/edge_guard.ts";
import { clientIp } from "../_shared/request.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";

const ALLOWED_PURPOSES = new Set(["register", "feedback", "purchase_intent", "login", "reset"]);

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
      { error: "invalid purpose", message: "purpose 必须是 register、feedback、purchase_intent、login 或 reset" },
      400,
    );
  }

  const captcha = await verifyTurnstile(String(body.token || ""), clientIp(req));
  if (!captcha.ok) {
    return json(
      { error: captcha.error, allowed: false, message: captcha.message },
      captcha.status || 403,
    );
  }

  return json({
    allowed: true,
    skipped: false,
    purpose,
    message: null,
  });
}

Deno.serve(withEdgeGuard("verify-captcha", handler));
