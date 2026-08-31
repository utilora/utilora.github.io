/**
 * S-08 纯逻辑单元测试：找回密码邮箱/IP 小时限额
 * 运行：node tests/password-reset-limit.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function isAllowed(emailLimit, emailUsed, ipLimit, ipUsed) {
  return (emailUsed | 0) < Math.max(emailLimit | 0, 0) &&
    (ipUsed | 0) < Math.max(ipLimit | 0, 0);
}

function limitMessage() {
  return "重置次数已达上限，请稍后再试。";
}

assert(isAllowed(3, 0, 10, 0) === true, "fresh allowed");
assert(isAllowed(3, 2, 10, 9) === true, "near limit allowed");
assert(isAllowed(3, 3, 10, 0) === false, "email blocked");
assert(isAllowed(3, 0, 10, 10) === false, "ip blocked");
assert(isAllowed(5, 3, 20, 10) === true, "raised limits allow");
assert(isAllowed(5, 5, 20, 0) === false, "raised email still blocks at 5");

const msg = limitMessage();
assert(!/每小时\s*3/.test(msg), "must not hardcode 3");
assert(!/每小时\s*10/.test(msg), "must not hardcode 10");
assert(!/不存在|未注册|没有这个邮箱/.test(msg), "must not leak existence");
assert(/上限|稍后再试/.test(msg), "guides user");

console.log("password-reset-limit.test.js: ok");
