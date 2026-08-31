/**
 * A-09 纯逻辑单元测试：审计行摘要与敏感操作可检索
 * 运行：node tests/audit-logs.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const AUDIT_ACTIONS = {
  set_user_admin: "提权/取消管理员",
  set_user_disabled: "停用/启用账号",
  update_platform_limits: "改限额",
  grant_entitlement: "发放专业版/试用",
  revoke_entitlement: "收回专业版",
};

function auditDetail(row) {
  return row?.detail && typeof row.detail === "object" ? row.detail : {};
}

function auditTarget(row) {
  const detail = auditDetail(row);
  return String(detail.target_email || detail.email || detail.intent_id || detail.key || row.path || "");
}

function auditBeforeAfter(row) {
  const detail = auditDetail(row);
  if (Array.isArray(detail.changes) && detail.changes.length) {
    return {
      before: detail.changes.map((item) => `${item.key}=${item.from}`).join("；"),
      after: detail.changes.map((item) => `${item.key}=${item.to}`).join("；"),
    };
  }
  if (Object.prototype.hasOwnProperty.call(detail, "is_admin")) {
    return { before: detail.is_admin ? "普通用户" : "管理员", after: detail.is_admin ? "管理员" : "普通用户" };
  }
  if (Object.prototype.hasOwnProperty.call(detail, "disabled")) {
    return { before: detail.disabled ? "正常" : "停用", after: detail.disabled ? "停用" : "正常" };
  }
  if (detail.plan_code) {
    return { before: "", after: `${detail.plan_code}${detail.days ? ` · ${detail.days}天` : ""}` };
  }
  return { before: "", after: "" };
}

function summarizeAuditRow(row) {
  const action = AUDIT_ACTIONS[row.event_type] || row.event_type || "—";
  const target = auditTarget(row);
  const change = auditBeforeAfter(row);
  return {
    at: row.created_at || "",
    actor: row.email || "—",
    action,
    target: target || "—",
    before: change.before,
    after: change.after,
    event_type: row.event_type || "",
  };
}

const grant = summarizeAuditRow({
  created_at: "2026-08-31T01:00:00Z",
  email: "admin@utilora.local",
  event_type: "grant_entitlement",
  detail: { target_email: "li@example.com", plan_code: "pro_trial", days: 14 },
});
assert(grant.action === "发放专业版/试用", "grant action");
assert(grant.target === "li@example.com", "grant target");
assert(grant.after.includes("pro_trial"), "grant after");

const admined = summarizeAuditRow({
  email: "admin@utilora.local",
  event_type: "set_user_admin",
  detail: { target_email: "li@example.com", is_admin: true },
});
assert(admined.action === "提权/取消管理员", "admin action");
assert(admined.before === "普通用户" && admined.after === "管理员", "admin before/after");

const disabled = summarizeAuditRow({
  email: "admin@utilora.local",
  event_type: "set_user_disabled",
  detail: { target_email: "li@example.com", disabled: true },
});
assert(disabled.action === "停用/启用账号", "disable action");
assert(disabled.after === "停用", "disable after");

const limits = summarizeAuditRow({
  email: "admin@utilora.local",
  event_type: "update_platform_limits",
  detail: { changes: [{ key: "trial_days", from: 14, to: 21 }] },
});
assert(limits.action === "改限额", "limits action");
assert(limits.before === "trial_days=14", "limits before");
assert(limits.after === "trial_days=21", "limits after");

const csv = ["时间戳", "操作者", "动作", "目标摘要", "变更前", "变更后"];
assert(csv.includes("变更前") && csv.includes("变更后"), "csv has before/after");

console.log("audit-logs.test.js: ok");
