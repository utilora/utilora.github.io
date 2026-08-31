/**
 * S-06: Edge Function 公共护栏
 * - 拒绝客户端携带 service-role
 * - 请求超时（默认 15s）
 * - 日调用上限读 platform_config（默认 10000，按 function 计）
 */

export const DEFAULT_TIMEOUT_MS = 15000;

export type GuardResult =
  | { ok: true; skippedLimit?: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

export function corsHeaders(extra?: string[]): Record<string, string> {
  const allow = [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
    ...(extra || []),
  ];
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": allow.join(", "),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  cors: Record<string, string> = corsHeaders(),
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** 拒绝 Authorization 等于 service-role 的请求（前端不得持有该密钥） */
export function rejectServiceRoleFromClient(req: Request): GuardResult {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) return { ok: true };
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const apikey = (req.headers.get("apikey") || "").trim();
  if (token === serviceKey || apikey === serviceKey) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "service_role_forbidden",
        message: "service-role 不得出现在客户端请求中。",
      },
    };
  }
  return { ok: true };
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const apiUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!apiUrl || !serviceKey) {
    return { ok: false, status: 500, data: { error: "server misconfigured" } };
  }
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

/**
 * 日调用上限：先 record（原子增），超限返回 429。
 * 配置缺失或 RPC 失败时放行并标记 skipped，避免误伤。
 */
export async function enforceDailyCallLimit(
  functionName: string,
): Promise<GuardResult> {
  try {
    const result = await rpc("record_edge_function_call", {
      p_function_name: functionName,
    });
    if (!result.ok) {
      const detail = JSON.stringify(result.data || "");
      if (/edge_function_daily_limit_exceeded/i.test(detail)) {
        const data = (result.data || {}) as Record<string, unknown>;
        return {
          ok: false,
          status: 429,
          body: {
            error: "edge_function_daily_limit_exceeded",
            message: "该服务今日调用次数已达上限，请明日再试。",
            detail: result.data,
            limit: data?.limit ?? null,
          },
        };
      }
      return { ok: true, skippedLimit: true };
    }
    return { ok: true };
  } catch {
    return { ok: true, skippedLimit: true };
  }
}

/** 带超时的 handler 包装 */
export function withTimeout(
  handler: (req: Request) => Promise<Response>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await Promise.race([
        handler(req),
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error("timeout"));
          });
        }),
      ]);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "timeout") {
        return jsonResponse(
          { error: "timeout", message: "请求处理超时，请稍后重试。" },
          504,
        );
      }
      return jsonResponse(
        { error: error instanceof Error ? error.message : "internal error" },
        500,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * 入口护栏：OPTIONS 放行；拒绝 service-role；日限额；再交由业务 handler。
 */
export function withEdgeGuard(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
  options?: { timeoutMs?: number },
): (req: Request) => Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const guarded = async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    const sr = rejectServiceRoleFromClient(req);
    if (!sr.ok) return jsonResponse(sr.body, sr.status);
    const lim = await enforceDailyCallLimit(functionName);
    if (!lim.ok) return jsonResponse(lim.body, lim.status);
    return handler(req);
  };
  return withTimeout(guarded, timeoutMs);
}
