/**
 * S-04 纯逻辑单元测试：人机验证 token / purpose 判定与文案（不依赖 Cloudflare）
 * 运行：node tests/verify-captcha.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const ALLOWED_PURPOSES = new Set(["register", "feedback", "purchase_intent", "login", "reset"]);

function normalizePurpose(purpose) {
  return String(purpose || "").toLowerCase().trim();
}

function isValidPurpose(purpose) {
  return ALLOWED_PURPOSES.has(normalizePurpose(purpose));
}

function isValidTokenShape(token) {
  const t = String(token || "").trim();
  return t.length >= 10 && t.length <= 2048;
}

function decideVerify({ token, purpose, secretConfigured, providerSuccess }) {
  if (!isValidPurpose(purpose)) {
    return { allowed: false, status: 400, error: "invalid purpose" };
  }
  if (!isValidTokenShape(token)) {
    return {
      allowed: false,
      status: 400,
      error: "captcha_required",
      message: "请完成人机验证后再提交。",
    };
  }
  if (!secretConfigured) {
    return {
      allowed: false,
      skipped: false,
      status: 503,
      error: "captcha_unavailable",
      message: "人机验证暂不可用，请稍后再试。",
    };
  }
  if (!providerSuccess) {
    return {
      allowed: false,
      status: 403,
      error: "captcha_failed",
      message: "人机验证未通过，请刷新后重试。",
    };
  }
  return { allowed: true, skipped: false, status: 200 };
}

assert(isValidPurpose("register") === true, "register ok");
assert(isValidPurpose("feedback") === true, "feedback ok");
assert(isValidPurpose("purchase_intent") === true, "purchase_intent ok");
assert(isValidPurpose("login") === true, "login ok");
assert(isValidPurpose("reset") === true, "reset ok");
assert(isValidPurpose("signin") === false, "signin not a captcha purpose");
assert(isValidPurpose("") === false, "empty purpose");

assert(isValidTokenShape("") === false, "empty token");
assert(isValidTokenShape("short") === false, "short token");
assert(isValidTokenShape("x".repeat(10)) === true, "min length");
assert(isValidTokenShape("x".repeat(2049)) === false, "too long");

let r = decideVerify({ token: "", purpose: "register", secretConfigured: true, providerSuccess: true });
assert(r.allowed === false && r.error === "captcha_required", "missing token");

r = decideVerify({
  token: "a".repeat(20),
  purpose: "register",
  secretConfigured: false,
  providerSuccess: false,
});
assert(r.allowed === false && r.error === "captcha_unavailable", "no secret fails closed");

r = decideVerify({
  token: "a".repeat(20),
  purpose: "feedback",
  secretConfigured: true,
  providerSuccess: false,
});
assert(r.allowed === false && r.error === "captcha_failed", "provider fail");

r = decideVerify({
  token: "a".repeat(20),
  purpose: "purchase_intent",
  secretConfigured: true,
  providerSuccess: true,
});
assert(r.allowed === true && r.skipped === false, "success path");

assert(
  /人机验证/.test(
    decideVerify({ token: "", purpose: "register", secretConfigured: true, providerSuccess: true }).message,
  ),
  "message present",
);

console.log("verify-captcha.test.js: ok");
