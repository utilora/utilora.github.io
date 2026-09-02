/**
 * S-05 纯逻辑单元测试：敏感表与 admin RPC 对 anon 的访问清单（不依赖 Supabase）
 * 运行：node tests/rls-admin-rpc-audit.test.js
 */

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

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
  "edge_function_call_log",
  "public_submit_log",
  "password_reset_log",
  "login_locations",
  "mfa_recovery_codes",
  "mfa_recovery_attempts",
];

const RPC_DENY_ANON = [
  "is_admin",
  "admin_list_users",
  "admin_set_user_admin",
  "admin_set_user_disabled",
  "admin_list_purchase_intents",
  "admin_set_purchase_intent_followup",
  "admin_list_promotions",
  "admin_upsert_promotion",
  "admin_list_announcements",
  "admin_upsert_announcement",
  "admin_expire_announcement",
  "admin_list_entitlements",
  "admin_product_funnel",
  "admin_list_activity_logs",
  "admin_overview_stats",
  "admin_write_activity",
  "get_analytics_summary",
  "get_platform_config_int",
  "admin_list_platform_limits",
  "admin_set_platform_limits",
  "check_registration_ip_allowed",
  "record_registration_ip",
  "check_otp_send_allowed",
  "record_otp_send",
  "check_login_allowed",
  "record_login_failure",
  "clear_login_failures",
  "account_is_disabled",
  "check_edge_function_call_allowed",
  "record_edge_function_call",
  "check_password_reset_allowed",
  "record_password_reset",
  "check_public_submit_allowed",
  "record_public_submit",
  "submit_purchase_intent",
  "record_login_location",
  "list_my_login_locations",
  "replace_mfa_recovery_codes",
  "consume_mfa_recovery_code",
  "peek_mfa_recovery_code",
  "mark_mfa_recovery_code_used",
  "mfa_recovery_remaining",
  "clear_mfa_recovery_codes",
  "list_my_sessions",
];

const RPC_ALLOW_ANON = ["track_analytics_event", "get_aging_bucket_bounds"];
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

for (const t of TABLES_DENY_ANON) {
  assert(roleMaySelectTable("anon", t) === false, `anon must not select ${t}`);
}
assert(roleMaySelectTable("anon", "plans") === true, "anon may select plans");
assert(roleMaySelectTable("authenticated", "profiles") === true, "authenticated may select profiles under RLS");
for (const fn of RPC_DENY_ANON) {
  assert(roleMayExecuteRpc("anon", fn) === false, `anon must not execute ${fn}`);
}
assert(roleMayExecuteRpc("anon", "track_analytics_event") === true, "anon may track analytics");
assert(roleMayExecuteRpc("anon", "submit_purchase_intent") === false, "anon must not submit intent via rpc");
assert(roleMayExecuteRpc("anon", "get_aging_bucket_bounds") === true, "anon may read aging bounds");
assert(roleMayExecuteRpc("authenticated", "admin_list_users") === true, "authenticated may call admin rpc (is_admin gated)");
assert(TABLES_DENY_ANON.length >= 10, "deny table list coverage");
assert(RPC_DENY_ANON.length >= 15, "deny rpc list coverage");
for (const fn of RPC_ALLOW_ANON) {
  assert(!RPC_DENY_ANON.includes(fn), `${fn} must not be in deny list`);
}
console.log("rls-admin-rpc-audit.test.js: ok");
