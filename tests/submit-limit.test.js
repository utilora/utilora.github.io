/**
 * S-09 纯逻辑单元测试：留言 / 购买意向 邮箱或用户与 IP 小时限额
 * 运行：node tests/submit-limit.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function configFor(kind) {
  if (kind === "feedback") {
    return { subjectDefault: 5, ipDefault: 10 };
  }
  return { subjectDefault: 3, ipDefault: 10 };
}

function isAllowed(subjectLimit, subjectUsed, ipLimit, ipUsed) {
  return (subjectUsed | 0) < Math.max(subjectLimit | 0, 0) &&
    (ipUsed | 0) < Math.max(ipLimit | 0, 0);
}

function limitReason(subjectLimit, subjectUsed, ipLimit, ipUsed) {
  if ((subjectUsed | 0) >= Math.max(subjectLimit | 0, 0)) return "subject_limit";
  if ((ipUsed | 0) >= Math.max(ipLimit | 0, 0)) return "ip_limit";
  return null;
}

function limitMessage() {
  return "提交次数已达上限，请稍后再试。";
}

const feedback = configFor("feedback");
assert(feedback.subjectDefault === 5, "feedback user default");
assert(isAllowed(5, 0, 10, 0) === true, "feedback fresh allowed");
assert(isAllowed(5, 4, 10, 9) === true, "feedback near limit allowed");
assert(isAllowed(5, 5, 10, 0) === false, "feedback user blocked");
assert(isAllowed(5, 0, 10, 10) === false, "feedback ip blocked");
assert(isAllowed(8, 5, 20, 10) === true, "raised feedback limits allow");

const intent = configFor("purchase_intent");
assert(intent.subjectDefault === 3, "intent email default");
assert(isAllowed(3, 2, 10, 9) === true, "intent near limit allowed");
assert(isAllowed(3, 3, 10, 0) === false, "intent email blocked");
assert(isAllowed(3, 0, 10, 10) === false, "intent ip blocked");

assert(limitReason(5, 5, 10, 0) === "subject_limit", "reason subject");
assert(limitReason(5, 0, 10, 10) === "ip_limit", "reason ip");
assert(limitReason(5, 1, 10, 1) === null, "reason none");

const msg = limitMessage();
assert(!/每小时\s*3/.test(msg), "must not hardcode 3");
assert(!/每小时\s*5/.test(msg), "must not hardcode 5");
assert(!/每小时\s*10/.test(msg), "must not hardcode 10");
assert(/上限|稍后再试/.test(msg), "guides user");

console.log("submit-limit.test.js: ok");
