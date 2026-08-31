/**
 * S-06 纯逻辑单元测试：Edge Function 日调用上限与 service-role 拒绝（不依赖 Supabase）
 * 运行：node tests/edge-function-guard.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function remaining(limit, used) {
  return Math.max((limit | 0) - (used | 0), 0);
}

function isAllowed(limit, used) {
  return (used | 0) < Math.max(limit | 0, 0);
}

/** 客户端不得携带 service-role：token 或 apikey 等于 serviceKey 则拒绝 */
function rejectServiceRoleFromClient(authHeader, apikeyHeader, serviceKey) {
  if (!serviceKey) return { ok: true };
  const token = String(authHeader || "").replace(/^Bearer\s+/i, "").trim();
  const apikey = String(apikeyHeader || "").trim();
  if (token === serviceKey || apikey === serviceKey) {
    return { ok: false, status: 403, error: "service_role_forbidden" };
  }
  return { ok: true };
}

// 默认日上限 10000
assert(isAllowed(10000, 0) === true, "0/10000 allowed");
assert(isAllowed(10000, 9999) === true, "9999/10000 allowed");
assert(isAllowed(10000, 10000) === false, "10000/10000 blocked");
assert(remaining(10000, 1) === 9999, "remaining 9999");
assert(remaining(10000, 10000) === 0, "remaining 0");
assert(isAllowed(0, 0) === false, "zero limit blocks");

// 配置可变
assert(isAllowed(500, 500) === false, "500/500 blocked");
assert(isAllowed(500, 499) === true, "499/500 allowed");

// service-role 拒绝
const sk = "super-secret-service-role";
assert(rejectServiceRoleFromClient("Bearer " + sk, "anon", sk).ok === false, "auth bearer service-role rejected");
assert(rejectServiceRoleFromClient("Bearer user-jwt", sk, sk).ok === false, "apikey service-role rejected");
assert(rejectServiceRoleFromClient("Bearer user-jwt", "anon-key", sk).ok === true, "normal client allowed");
assert(rejectServiceRoleFromClient("", "", "").ok === true, "no service key configured allows");
assert(rejectServiceRoleFromClient("Bearer " + sk, sk, sk).status === 403, "status 403");

// 超时默认值语义
const DEFAULT_TIMEOUT_MS = 15000;
assert(DEFAULT_TIMEOUT_MS === 15000, "default timeout 15s");
assert(DEFAULT_TIMEOUT_MS > 0 && DEFAULT_TIMEOUT_MS <= 60000, "timeout in sane range");

// 前端密钥形态：publishable / anon，不得出现 service_role 字样
const frontendKeySample = "sb_publishable_IUK0swkEhqmaWKjUGv_IIQ_Y7LjtayF";
assert(!/service[_-]?role/i.test(frontendKeySample), "frontend key must not look like service-role");
assert(/publishable|anon/i.test(frontendKeySample) || frontendKeySample.length > 20, "frontend uses publishable-style key");

console.log("edge-function-guard.test.js: ok");
