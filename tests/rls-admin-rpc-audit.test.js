/**
 * S-05 纯逻辑单元测试：敏感表与 admin RPC 对 anon 的访问清单（不依赖 Supabase）
 * 运行：node tests/rls-admin-rpc-audit.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/** 禁止 anon 直接 SELECT/拖取的表（用户、分析、管理、限流状态） */
const TABLES_DENY_ANON = [
  "admin_users",
  "user_flags",
  "user_activity_logs",
  "analytics_events",
  "analytics_daily_visitors",
  "purchase_intents",
  "purchase_intent_followups",
  "platform_config",
  "registration_ip_log",
  "otp_send_log",
  "login_attempt_state",
  "audit_logs",
  "entitlement_grants",
  "subscriptions",
  "profiles",
  "feedback",
];

/** 禁止 anon EXECUTE 的 admin / 内部 RPC */
const RPC_DENY_ANON = [
  "is_admin",
  "admin_list_users",
  "admin_set_user_admin",
  "admin_set_user_disabled",
  "admin_list_purchase_intents",
  "admin_set_purchase_intent_followup",
  "admin_list_promotions",
  "admin_upsert_promotion",
  "admin_list_entitlements",
  "admin_product_funnel",
  "admin_list_activity_logs",
  "admin_overview_stats",
  "admin_write_activity",
  "get_analytics_summary",
  "get_platform_config_int",
  "check_registration_ip_allowed",
  "record_registration_ip",
  "check_otp_send_allowed",
  "record_otp_send",
  "check_login_allowed",
  "record_login_failure",
  "clear_login_failures",
  "account_is_disabled",
];

/** 允许 anon 的写入口（不返回列表/敏感行） */
const RPC_ALLOW_ANON = ["track_analytics_event", "submit_purchase_intent"];

/** 允许 anon 只读的公开表 */
const TABLES_ALLOW_ANON_SELECT = ["plans"];

function roleMaySelectTable(role, table) {
  if (role === "anon") {
    if (TABLES_DENY_ANON.includes(table)) return false;
    if (TABLES_ALLOW_ANON_SELECT.includes(table)) return true;
    return false;
  }
  return true;
}

function roleMayExecuteRpc(role, fn) {
  if (role === "anon") {
    if (RPC_DENY_ANON.includes(fn)) return false;
    if (RPC_ALLOW_ANON.includes(fn)) return true;
    return false;
  }
  return true;
}

// 表：anon 不可拖用户与分析
for (const t of TABLES_DENY_ANON) {
  assert(roleMaySelectTable("anon", t) === false, `anon must not select ${t}`);
}
assert(roleMaySelectTable("anon", "plans") === true, "anon may select plans");
assert(roleMaySelectTable("authenticated", "profiles") === true, "authenticated may select profiles under RLS");

// RPC：anon 不可调 admin / 内部限流
for (const fn of RPC_DENY_ANON) {
  assert(roleMayExecuteRpc("anon", fn) === false, `anon must not execute ${fn}`);
}
assert(roleMayExecuteRpc("anon", "track_analytics_event") === true, "anon may track analytics");
assert(roleMayExecuteRpc("anon", "submit_purchase_intent") === true, "anon may submit intent");
assert(roleMayExecuteRpc("authenticated", "admin_list_users") === true, "authenticated may call admin rpc (is_admin gated)");

// 清单非空且无交叉
assert(TABLES_DENY_ANON.length >= 10, "deny table list coverage");
assert(RPC_DENY_ANON.length >= 15, "deny rpc list coverage");
for (const fn of RPC_ALLOW_ANON) {
  assert(!RPC_DENY_ANON.includes(fn), `${fn} must not be in deny list`);
}

console.log("rls-admin-rpc-audit.test.js: ok");
