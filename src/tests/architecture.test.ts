import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string): string => readFileSync(resolve(root, path), "utf8");

describe("product architecture", () => {
  it("separates free acquisition tools from the professional workspace", () => {
    const home = read("index.html");
    const document = new DOMParser().parseFromString(home, "text/html");
    expect(document.querySelector("#compare")).not.toBeNull();
    expect(document.querySelectorAll(".plan-badge.free")).toHaveLength(5);
    expect(document.querySelectorAll(".plan-badge.pro")).toHaveLength(3);
    expect(home).toContain("财务专业版内测限时免费");
    expect(home).toContain("pro/?demo=1#/dashboard");
    expect(home).toContain("pro/?demo=1#/invoices");
    expect(home).toContain("pro/?demo=1#/reports");
    expect(home).not.toContain("#/receivables");
    expect(home).toContain("做成可交付的结果");
    expect(home).not.toContain("减少重复录入");
  });

  it("gates the professional workspace behind the TypeScript bootstrap", () => {
    const pro = read("pro/index.html");
    expect(pro).toContain('id="pro-gate"');
    expect(pro).toContain('id="pro-shell" hidden');
    expect(pro).toContain('src="/src/pro.ts"');
    expect(pro).not.toContain("access.js");
    const vite = read("vite.config.ts");
    expect(vite).not.toContain('{ src: "pro", dest: "." }');
    expect(vite).toContain('{ src: "pro/app.js", dest: "." }');
    expect(vite).toContain('{ src: "pro/pro.css", dest: "." }');
    expect(vite).toContain('{ src: "pro/u01.js", dest: "." }');
    expect(read("src/pro.ts")).toContain('loadScript("u01.js?v=1").catch');
  });

  it("requires an email OTP before registration completes", () => {
    const login = read("login/index.html");
    const logic = read("login/login.js");
    expect(login).toContain('id="otp-field" hidden');
    expect(login).toContain('autocomplete="one-time-code"');
    expect(logic).toContain('await auth.verifyOtp');
    expect(logic).toContain('await auth.sendOtp');
    expect(logic).toContain('await auth.setPassword');
    expect(read("assets/js/auth.js")).toContain("/auth/v1/otp");
    expect(read("assets/js/auth.js")).toContain("/auth/v1/recover");
    expect(logic).toContain('mode === "reset"');
    expect(logic).toContain('goLoggedInHome');
    expect(logic).toContain('captured.type === "recovery"');
    expect(read("account/account.js")).toContain('../login/?reset=1');
    expect(read("supabase/templates/confirmation.html")).toContain("{{ .Token }}");
    expect(read("supabase/templates/magic_link.html")).toContain("{{ .Token }}");
  });

  it("enables RLS for every organization-owned finance table", () => {
    const migration = read("supabase/migrations/202608290001_platform_core.sql");
    const tables = [
      "fiscal_periods", "customers", "catalog_items", "quotations",
      "quotation_items", "invoices", "invoice_items", "payments",
      "expenses", "bank_accounts", "bank_transactions",
      "chart_of_accounts", "vouchers", "voucher_entries"
    ];
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
      expect(migration).toMatch(new RegExp(`create policy [^\\n]+ on public\\.${table}`));
    }
  });

  it("keeps launch access server-configurable without payment", () => {
    const migration = read("supabase/migrations/202608290001_platform_core.sql");
    expect(migration).toContain("get_my_effective_entitlement");
    expect(migration).toContain("'pro-launch-free'");
    expect(migration).toContain('"payment_required":false');
  });

  it("keeps demo mode from writing local company or recovery data", () => {
    const workbench = read("pro/app.js");
    expect(workbench).toContain('get("demo") === "1"');
    expect(workbench).toContain("if (demoMode) { setSaveState(\"演示模式 · 改动不保存\"); return; }");
    expect(workbench).toContain("if (demoMode || !db || !workspaceId) return");
    expect(workbench).toContain("if (!demoMode) setSetting(backupKey(), exportedAt)");
  });

  it("previews bank imports and blocks duplicate commits", () => {
    const workbench = read("pro/app.js");
    expect(workbench).toContain("previewBankImport");
    expect(workbench).toContain("suggestMatches");
    expect(workbench).toContain("确认导入新增");
    expect(workbench).toContain("撤销匹配");
    expect(read("src/pro.ts")).toContain("window.UtiloraBank");
  });

  it("shows receivable aging and customer debt from a shared summary", () => {
    expect(read("src/pro.ts")).toContain("window.UtiloraReceivables");
    expect(read("pro/app.js")).toContain("customerDebts");
    expect(read("pro/app.js")).toContain("应收回款概览");
    expect(read("pro/app.js")).toContain("collectionProgress");
  });

  it("builds a month-end pack with a score and exportable result", () => {
    expect(read("src/pro.ts")).toContain("window.UtiloraMonthEnd");
    expect(read("pro/app.js")).toContain("monthEndPack");
    expect(read("pro/app.js")).toContain("导出月结 Excel");
    expect(read("pro/app.js")).toContain("未匹配银行流水");
  });

  it("exports a complete finance backup and reminds when it is stale", () => {
    expect(read("src/pro.ts")).toContain("window.UtiloraBackup");
    expect(read("pro/app.js")).toContain("buildBackup");
    expect(read("pro/app.js")).toContain("parseBackup");
    expect(read("pro/app.js")).toContain("backupStatus");
    expect(read("pro/app.js")).toContain("完整备份包含客户、应收、收款、银行流水、费用和科目");
  });

  it("captures purchase intent without payment or service-role keys", () => {

    const migration = read("supabase/migrations/202608300001_purchase_intents.sql");
    expect(migration).toContain("create table public.purchase_intents");
    expect(migration).toContain("user_id");
    expect(migration).toContain("email");
    expect(migration).toContain("use_case");
    expect(migration).toContain("company_size");
    expect(migration).toContain("intended_plan");
    expect(migration).toContain("created_at");
    expect(migration).toContain("alter table public.purchase_intents enable row level security");
    expect(migration).toContain("submit_purchase_intent");
    expect(migration).toContain("revoke all on public.purchase_intents");
    expect(migration).toContain("purchase_intents_email_unique");
    expect(migration).toContain("purchase_intents_user_id_uidx");
    expect(migration).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.purchase_intents/i);


    const home = read("index.html");
    expect(home).toContain("我愿意购买");
    expect(home).toContain("正式版上线通知我");
    expect(home).toContain("Pro 预计 ¥19/月");
    expect(home).toContain("当前内测免费");
    expect(read("pro/index.html")).toContain("我愿意购买");
    expect(read("pro/index.html")).toContain("正式版上线通知我");
    expect(home).not.toMatch(/stripe|wechatpay|js\.stripe/i);


    const browserFiles = [
      "src/app/config/env.ts",
      "src/core/supabase/client.ts",
      "src/app/purchase-intent.ts",
      "src/core/purchase-intent/service.ts",
      "src/core/analytics/track.ts",
      "index.html",
      "pro/index.html",
      "assets/js/app.js",
      "assets/js/analytics.js"

    ];
    for (const path of browserFiles) {
      expect(read(path)).not.toMatch(/service[_-]?role|sb_secret/i);
    }
  });

  it("lets admins list purchase intents through RPC without table grants", () => {
    const sql = read("supabase/admin-purchase-intents.sql");
    expect(sql).toContain("admin_list_purchase_intents");
    expect(sql).toContain("is_admin()");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.purchase_intents/i);
    expect(read("admin/admin.js")).toContain("rpc/admin_list_purchase_intents");
    expect(read("admin/index.html")).toContain('data-page="intents"');
    expect(read("admin/admin.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("keeps admin ops behind RPCs including production-controlled discounts and activity logs", () => {
    const sql = read("supabase/admin-ops.sql");
    expect(sql).toContain("record_user_activity");
    expect(sql).toContain("admin_list_activity_logs");
    expect(sql).toContain("admin_upsert_promotion");
    expect(sql).toContain("'control', 'production'");
    expect(sql).toContain("'payment_required', false");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.(purchase_intents|user_activity_logs|promotions)/i);
    expect(read("admin/index.html")).toContain('data-page="logs"');
    expect(read("admin/index.html")).toContain('data-page="promotions"');
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_list_activity_logs");
    expect(read("admin/admin-ops.js")).toContain("openDossier");
    expect(read("admin/index.html")).toContain('id="dossier"');
    expect(read("admin/index.html")).toContain('id="export-logs"');
    expect(sql).toContain("admin_overview_stats");
    expect(read("admin/index.html")).not.toContain("不要现在上生产");
    expect(read("admin/admin.js")).toContain("增值税价税分离");
    expect(read("admin/index.html")).toContain("财务工具");
    expect(read("admin/index.html")).toContain("其它工具");
    expect(read("admin/index.html")).toContain("sidebar-collapse");
    expect(read("admin/admin.js")).toContain("utilora_admin_sidebar");
    expect(read("admin/index.html")).toContain("sidebar-resizer");
    expect(read("admin/admin-ops.js")).toContain("refreshAll()");
    expect(read("assets/js/auth.js")).toContain("record_user_activity");
    expect(read("assets/js/analytics.js")).toContain("record_user_activity");
    expect(read("src/core/auth/session.ts")).toContain("record_user_activity");
    expect(read("src/core/analytics/track.ts")).toContain("record_user_activity");
    for (const path of ["admin/admin.js", "admin/admin-ops.js", "admin/risk-console.js", "assets/js/auth.js", "assets/js/analytics.js"]) {
      expect(read(path)).not.toMatch(/service[_-]?role|sb_secret/i);
    }
  });

  it("wires the admin risk console behind an admin-only RPC", () => {
    const sql = read("supabase/migrations/202608310002_admin_risk_console.sql");
    expect(sql).toContain("admin_risk_console");
    expect(sql).toContain("is_admin()");
    expect(sql).toContain("admin_set_user_disabled");
    expect(sql).toContain("registration_ip_log");
    expect(sql).toContain("otp_send_log");
    expect(read("admin/index.html")).toContain('data-page="risk"');
    expect(read("admin/index.html")).toContain('id="risk-section"');
    expect(read("admin/index.html")).toContain('src="risk-console.js"');
    expect(read("admin/admin.js")).toContain("risk: '风控台'");
    expect(read("admin/admin.js")).toContain("AdminRisk?.loadRiskConsole");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_risk_console");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_set_user_disabled");
    expect(read("admin/risk-console.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("lets admins grant and revoke entitlements from the user dossier", () => {
    const sql = read("supabase/migrations/202608310001_admin_grant_entitlement.sql");
    expect(sql).toContain("admin_grant_entitlement");
    expect(sql).toContain("admin_revoke_entitlements");
    expect(sql).toContain("is_admin()");
    expect(sql).toContain("entitlement_grants");
    expect(sql).toContain("grant_entitlement");
    expect(sql).toContain("revoke_entitlement");
    expect(read("admin/index.html")).toContain('id="dossier-grant-form"');
    expect(read("admin/index.html")).toContain('id="dossier-grant-days"');
    expect(read("admin/index.html")).toContain('id="dossier-revoke"');
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_grant_entitlement");
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_revoke_entitlements");
    expect(read("admin/admin-ops.js")).toContain("TRIAL_DAYS_DEFAULT");
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("lets admins record intent follow-up date, result, and trial grant", () => {
    const sql = read("supabase/migrations/202608310003_admin_intent_followup.sql");
    expect(sql).toContain("next_follow_on");
    expect(sql).toContain("trial_granted");
    expect(sql).toContain("admin_set_purchase_intent_followup");
    expect(sql).toContain("p_trial_granted");
    expect(sql).toContain("is_admin()");
    expect(read("admin/index.html")).toContain(">下次跟进<");
    expect(read("admin/index.html")).toContain('value="due"');
    expect(read("admin/admin.js")).toContain("trial_granted");
    expect(read("admin/admin.js")).toContain("next_follow_on");
    expect(read("admin/admin-ops.js")).toContain("p_next_follow_on");
    expect(read("admin/admin-ops.js")).toContain("p_trial_granted");
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("lets admins close the all-user launch promotion without enabling payment", () => {
    expect(read("admin/index.html")).toContain('id="launch-promo-off"');
    expect(read("admin/index.html")).toContain('id="launch-promo-on"');
    expect(read("admin/admin-ops.js")).toContain("setLaunchPromo");
    expect(read("admin/admin-ops.js")).toContain("pro-launch-free");
    expect(read("supabase/admin-ops.sql")).toContain("'payment_required', false");
    expect(read("src/core/entitlements/service.ts")).toContain("resolveLocalEntitlement(user, false)");
    expect(read("assets/js/pro.js")).toContain("refreshLaunchPromo");
  });

  it("rate-limits password recovery without leaking whether the email exists", () => {
    const sql = read("supabase/migrations/202608310007_password_reset_limit.sql");
    expect(sql).toContain("password_reset_per_email_per_hour");
    expect(sql).toContain("password_reset_per_ip_per_hour");
    expect(sql).toContain("record_password_reset");
    expect(read("assets/js/auth.js")).toContain("password-reset-limit");
    expect(read("assets/js/auth.js")).toContain("consumePasswordResetLimit");
    expect(read("assets/js/auth.js")).toContain("重置次数已达上限，请稍后再试。");
    expect(read("login/login.js")).toContain('consumePasswordResetLimit');
    expect(read("supabase/functions/password-reset-limit/index.ts")).toContain("withEdgeGuard");
    expect(read("supabase/functions/password-reset-limit/index.ts")).not.toMatch(/sb_secret/i);
  });
});
