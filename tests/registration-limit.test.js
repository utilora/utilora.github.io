/**
 * S-01 纯逻辑单元测试：限额判定与文案（不依赖 Supabase）
 * 运行：node tests/registration-limit.test.js
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

function limitMessage(limit) {
  const n = Math.max(limit | 0, 0);
  if (n <= 0) return "今日该网络注册次数已达上限，请明日再试或更换网络。";
  return "今日该网络注册次数已达上限，请明日再试或更换网络。";
}

// 默认 3 次
assert(isAllowed(3, 0) === true, "0/3 allowed");
assert(isAllowed(3, 2) === true, "2/3 allowed");
assert(isAllowed(3, 3) === false, "3/3 blocked");
assert(isAllowed(3, 4) === false, "4/3 blocked");
assert(remaining(3, 1) === 2, "remaining 2");
assert(remaining(3, 3) === 0, "remaining 0");
assert(remaining(0, 0) === 0, "zero limit remaining");
assert(isAllowed(0, 0) === false, "zero limit blocks");

// 配置可变：管理端改为 5
assert(isAllowed(5, 3) === true, "3/5 allowed");
assert(isAllowed(5, 5) === false, "5/5 blocked");

// 文案不硬编码具体次数（与产品要求一致：超限文案读配置/通用）
const msg = limitMessage(3);
assert(!/每天\s*3\s*次/.test(msg), "message must not hardcode daily 3");
assert(/上限|明日|网络/.test(msg), "message should guide user");

console.log("registration-limit.test.js: ok");
