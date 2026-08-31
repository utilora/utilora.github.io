/**
 * S-03 纯逻辑单元测试：连续失败与冷却判定、文案（不依赖 Supabase）
 * 运行：node tests/login-cooldown.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function isLocked(failureCount, maxAttempts, lockedUntilMs, nowMs) {
  if (lockedUntilMs != null && lockedUntilMs > nowMs) return true;
  return false;
}

function afterFailure(failureCount, maxAttempts, cooldownMinutes, nowMs) {
  const next = (failureCount | 0) + 1;
  const max = Math.max(maxAttempts | 0, 1);
  if (next >= max) {
    return {
      failureCount: next,
      lockedUntilMs: nowMs + Math.max(cooldownMinutes | 0, 1) * 60 * 1000,
      locked: true,
    };
  }
  return { failureCount: next, lockedUntilMs: null, locked: false };
}

function remainingMinutes(lockedUntilMs, nowMs) {
  if (lockedUntilMs == null || lockedUntilMs <= nowMs) return 0;
  return Math.max(Math.ceil((lockedUntilMs - nowMs) / 60000), 1);
}

function lockMessage(remainingMins) {
  const mins = Math.max(remainingMins | 0, 1);
  return `登录失败次数过多，请约 ${mins} 分钟后再试。`;
}

const now = Date.UTC(2026, 7, 31, 3, 0, 0);

// 默认：5 次失败、15 分钟冷却
assert(isLocked(0, 5, null, now) === false, "fresh allowed");
assert(isLocked(4, 5, null, now) === false, "4 failures not locked yet");

let state = { failureCount: 0, lockedUntilMs: null };
for (let i = 0; i < 4; i += 1) {
  state = afterFailure(state.failureCount, 5, 15, now);
  assert(state.locked === false, `attempt ${i + 1} not locked`);
}
state = afterFailure(state.failureCount, 5, 15, now);
assert(state.locked === true, "5th failure locks");
assert(state.failureCount === 5, "count is 5");
assert(remainingMinutes(state.lockedUntilMs, now) === 15, "15 min remaining");

assert(isLocked(5, 5, state.lockedUntilMs, now) === true, "locked now");
assert(isLocked(5, 5, state.lockedUntilMs, now + 16 * 60 * 1000) === false, "unlocked after cooldown");

// 配置可变：3 次 / 30 分钟
state = afterFailure(2, 3, 30, now);
assert(state.locked === true, "3rd failure locks with max=3");
assert(remainingMinutes(state.lockedUntilMs, now) === 30, "30 min remaining");

// 邮箱或 IP 任一锁定即拦截（取 max remaining）
const emailLockedUntil = now + 10 * 60 * 1000;
const ipLockedUntil = now + 20 * 60 * 1000;
const eitherLocked = isLocked(0, 5, emailLockedUntil, now) || isLocked(0, 5, ipLockedUntil, now);
assert(eitherLocked === true, "either subject lock blocks");
assert(remainingMinutes(Math.max(emailLockedUntil, ipLockedUntil), now) === 20, "longer window wins");

// 文案不硬编码「5 次」「15 分钟」为唯一文案；可含动态分钟数
const msg = lockMessage(15);
assert(/失败|过多|分钟|再试/.test(msg), "message guides user");
assert(!/连续\s*5\s*次/.test(msg), "message must not hardcode consecutive 5");

console.log("login-cooldown.test.js: ok");
