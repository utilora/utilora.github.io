/**
 * S-02 纯逻辑单元测试：邮箱/IP 小时限额判定与文案（不依赖 Supabase）
 * 运行：node tests/otp-rate-limit.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function remaining(limit, used) {
  return Math.max((limit | 0) - (used | 0), 0);
}

function isAllowed(emailLimit, emailUsed, ipLimit, ipUsed) {
  return (emailUsed | 0) < Math.max(emailLimit | 0, 0) &&
    (ipUsed | 0) < Math.max(ipLimit | 0, 0);
}

function limitReason(emailLimit, emailUsed, ipLimit, ipUsed) {
  if ((emailUsed | 0) >= Math.max(emailLimit | 0, 0)) return "email_limit";
  if ((ipUsed | 0) >= Math.max(ipLimit | 0, 0)) return "ip_limit";
  return null;
}

function limitMessage(reason) {
  if (reason === "ip_limit") {
    return "当前网络发送验证码次数已达上限，请稍后再试或更换网络。";
  }
  return "该邮箱发送验证码次数已达上限，请稍后再试。";
}

// 默认：邮箱 3 / IP 10
assert(isAllowed(3, 0, 10, 0) === true, "fresh allowed");
assert(isAllowed(3, 2, 10, 9) === true, "near limit allowed");
assert(isAllowed(3, 3, 10, 0) === false, "email blocked");
assert(isAllowed(3, 0, 10, 10) === false, "ip blocked");
assert(isAllowed(3, 3, 10, 10) === false, "both blocked");
assert(remaining(3, 1) === 2, "email remaining");
assert(remaining(10, 10) === 0, "ip remaining zero");

assert(limitReason(3, 3, 10, 0) === "email_limit", "reason email");
assert(limitReason(3, 0, 10, 10) === "ip_limit", "reason ip");
assert(limitReason(3, 1, 10, 1) === null, "reason none");

// 配置可变
assert(isAllowed(5, 3, 20, 10) === true, "raised limits allow");
assert(isAllowed(5, 5, 20, 0) === false, "raised email still blocks at 5");

// 文案不硬编码具体次数
const msgEmail = limitMessage("email_limit");
const msgIp = limitMessage("ip_limit");
assert(!/每小时\s*3/.test(msgEmail), "email message must not hardcode 3");
assert(!/每小时\s*10/.test(msgIp), "ip message must not hardcode 10");
assert(/上限|稍后再试/.test(msgEmail), "email message guides user");
assert(/网络|稍后再试/.test(msgIp), "ip message guides user");

console.log("otp-rate-limit.test.js: ok");
