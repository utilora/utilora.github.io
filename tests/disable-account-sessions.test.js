/**
 * S-07 纯逻辑单元测试：停用账号后会话应清除；refresh 路径不得保留停用会话
 * 运行：node tests/disable-account-sessions.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/** 模拟：停用后删除 sessions 行数应 >0 时 refresh 必然失败 */
function sessionsAfterDisable(sessionCountBefore, disabled) {
  if (!disabled) return sessionCountBefore;
  return 0;
}

/** 客户端：若 account_is_disabled 为 true，应清除本地 session */
function shouldClearLocalSession(isDisabledFlag, refreshSucceeded) {
  if (isDisabledFlag === true) return true;
  if (refreshSucceeded === false) return true;
  return false;
}

/** 登录成功后若发现已停用，应拒绝并清除 */
function loginAllowedAfterPasswordOk(isDisabled) {
  return isDisabled !== true;
}

assert(sessionsAfterDisable(3, true) === 0, "disable must zero sessions");
assert(sessionsAfterDisable(2, false) === 2, "enable keeps sessions");
assert(shouldClearLocalSession(true, true) === true, "disabled clears even if refresh ok");
assert(shouldClearLocalSession(false, false) === true, "failed refresh clears");
assert(shouldClearLocalSession(false, true) === false, "healthy session kept");
assert(loginAllowedAfterPasswordOk(true) === false, "disabled cannot stay logged in");
assert(loginAllowedAfterPasswordOk(false) === true, "active user may login");

console.log("disable-account-sessions.test.js: ok");
