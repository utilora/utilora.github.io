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
    expect(vite).toContain('{ src: "account/account.js", dest: "." }');
    expect(vite).toContain("account/index.html");
    expect(vite).not.toContain('{ src: "account", dest: "." }');
    expect(read("src/pro.ts")).toContain('loadScript("u01.js?v=1").catch');
  });

  it("shows account plan, expiry and a backup entry without dead free copy", () => {
    const page = read("account/index.html");
    expect(page).toContain("当前权益");
    expect(page).toContain('id="plan-name"');
    expect(page).toContain('id="plan-expiry"');
    expect(page).toContain('id="plan-backup"');
    expect(page).toContain("导出完整备份");
    expect(page).toContain('src="/src/account.ts"');
    expect(page).not.toContain("最近使用");
    expect(page).toContain('id="avatar-file"');
    expect(page).toContain("公司 / 工作室");
    expect(page).toContain("简介");
    expect(page).not.toContain("目前免费使用");
    expect(page).not.toContain("一律免费");
    expect(page).not.toContain("旧账号页面已暂停");
    expect(page).not.toContain("邀请");
    expect(read("account/account.js")).not.toContain("目前免费使用");
    expect(read("account/account.js")).not.toContain("邀请");
    expect(read("account/account.js")).toContain("toSquareJpeg");
    expect(read("account/account.js")).toContain("saveMyProfile");
    expect(read("account/account.js")).not.toContain("chips(\"recents\"");
    expect(read("assets/js/auth.js")).toContain("getMyProfile");
    expect(read("assets/js/auth.js")).toContain("saveMyProfile");
    expect(read("supabase/migrations/202609020021_profile_fields.sql")).toContain("profiles_self_insert");
    expect(read("src/account.ts")).toContain("describeEntitlement");
    expect(read("src/account.ts")).toContain("paintEntitlement");
    expect(read("src/account.ts")).toContain("get_my_effective_entitlement");
    expect(read("src/core/entitlements/service.ts")).toContain("describeEntitlement");
    expect(read("src/core/entitlements/service.ts")).toContain("ACCOUNT_BACKUP_HREF");
    expect(read("assets/js/pro.js")).toContain("专业版（限时免费）");
    expect(read("assets/js/pro.js")).not.toContain("目前免费使用");
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
    expect(logic).toContain("goAfterAuth");
    expect(logic).toContain("safeNextPath");
    expect(logic).toContain("parseInviteCode");
    expect(logic).toContain("consumeDisabledFlag");
    expect(logic).toContain("不必重新注册");
    expect(logic).toContain("readCaptchaToken()");
    expect(login).toContain('id="invite-code"');
    expect(login).not.toContain("邀请朋友");
    expect(read("assets/js/auth.js")).toContain("const safeNextPath");
    expect(read("assets/js/auth.js")).toContain("registrationLimitMessage");
    expect(read("assets/js/auth.js")).not.toContain("每天 3 次");
    expect(read("login/login.js")).not.toContain("每天 3 次");
    expect(read("account/account.js")).toContain('../login/?reset=1');
    expect(read("assets/js/auth.js")).toContain("IDLE_TIMEOUT_MS = 30 * 60 * 1000");
    expect(read("src/core/auth/idle.ts")).toContain("IDLE_TIMEOUT_MS = 30 * 60 * 1000");
    expect(read("src/pro.ts")).toContain("utilora:idle-expired");
    expect(read("account/account.js")).toContain("utilora:idle-expired");
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
    expect(workbench).toContain("shouldRecordBackupTime");
    expect(workbench).toContain("文件已保存好了吗");
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
    expect(read("pro/app.js")).toContain("催收备忘");
    expect(read("pro/app.js")).toContain("validateCollectionNote");
    expect(read("src/core/receivables/local.ts")).toContain("promisedOnDay");
    expect(read("src/core/backup/local.ts")).toContain("collectionNotes");
  });

  it("builds a month-end pack with a score and exportable result", () => {
    expect(read("src/pro.ts")).toContain("window.UtiloraMonthEnd");
    expect(read("pro/app.js")).toContain("monthEndPack");
    expect(read("pro/app.js")).toContain("导出月结 Excel");
    expect(read("pro/app.js")).toContain("未匹配银行流水");
    expect(read("pro/app.js")).toContain("applyMonthClose");
    expect(read("pro/app.js")).toContain("强制关账");
    expect(read("pro/app.js")).toContain("未完成项未处理完");
    expect(read("pro/app.js")).not.toContain("仍可月结");
    expect(read("src/core/month-end/local.ts")).toContain("applyMonthClose");
    expect(read("src/core/month-end/local.ts")).toContain("关账记录");
    expect(read("src/core/backup/local.ts")).toContain("monthEndCloses");
  });

  it("exports a complete finance backup and reminds when it is stale", () => {
    expect(read("src/pro.ts")).toContain("window.UtiloraBackup");
    expect(read("pro/app.js")).toContain("buildBackup");
    expect(read("pro/app.js")).toContain("parseBackup");
    expect(read("pro/app.js")).toContain("backupStatus");
    expect(read("pro/app.js")).toContain("今日该催");
    expect(read("pro/app.js")).toContain("本周到期");
    expect(read("pro/app.js")).toContain("待匹配流水");
    expect(read("pro/app.js")).toContain("dashboard-backup-card");
    expect(read("src/core/receivables/local.ts")).toContain("collectToday");
    expect(read("src/core/receivables/local.ts")).toContain("dueThisWeek");
    expect(read("pro/app.js")).toContain("完整备份包含客户、应收、收款、银行流水、费用和科目");
    expect(read("pro/app.js")).toContain("closeBackupWarning");
    expect(read("pro/app.js")).toContain("previewBackup");
    expect(read("pro/app.js")).toContain("id=\"backup-preview\"");
    expect(read("pro/app.js")).toContain("关账前");
    expect(read("src/core/backup/local.ts")).toContain("shouldRecordBackupTime");
    expect(read("src/core/backup/local.ts")).toContain("companyMismatch");
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


    const service = read("src/core/purchase-intent/service.ts");
    expect(service).toContain("functions/v1/submit-purchase-intent");
    expect(service).not.toContain('rpc("submit_purchase_intent"');
    expect(read("supabase/migrations/202608310016_submit_path_lockdown.sql")).toContain(
      "grant execute on function public.submit_purchase_intent(text, text, text, text, uuid) to service_role",
    );
    expect(read("supabase/functions/_shared/request.ts")).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(read("supabase/functions/_shared/turnstile.ts")).toContain("captcha_unavailable");

    const home = read("index.html");
    expect(home).toContain("我愿意购买");
    expect(home).toContain("正式版上线通知我");
    expect(home).toContain("Pro 预计 ¥19/月");
    expect(home).toContain("当前内测免费");
    expect(read("pro/index.html")).toContain("我愿意购买");
    expect(read("pro/index.html")).toContain("正式版上线通知我");
    expect(read("pro/index.html")).toContain('data-route="intent"');
    expect(read("pro/index.html")).toContain('id="intent-modal"');
    expect(read("pro/index.html")).not.toContain('class="intent-panel"');
    expect(read("feedback/index.html")).toContain("登录后提交");
    expect(read("feedback/index.html")).toContain("assets/js/auth.js");
    expect(read("feedback/feedback.js")).toContain("../login/?next=");
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

  it("ships a content security policy without executable inline scripts", () => {
    const home = read("index.html");
    expect(home).toContain('http-equiv="Content-Security-Policy"');
    expect(home).toContain("object-src 'none'");
    expect(home).toContain("base-uri 'none'");
    expect(home).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(home).not.toMatch(/style-src[^;]*'unsafe-inline'/);
    expect(home).toContain("style-src 'self'");
    expect(read("account/index.html")).not.toContain("<style>");
    expect(read("pro/app.js")).not.toMatch(/\sstyle="/);
    expect(home).toContain("assets/js/home-hero.js");
    expect(read("login/index.html")).toContain("assets/js/turnstile-boot.js");
    expect(read("feedback/index.html")).toContain("assets/js/turnstile-boot.js");
    expect(read("vite.config.ts")).toMatch(/modulePreload:\s*\{\s*polyfill:\s*false\s*\}/);
    expect(home).toContain("assets/js/frame-guard.js");
    expect(read("assets/js/frame-guard.js")).toContain("top.location.replace");
    expect(read("sw.js")).toContain("frame-ancestors 'none'");
    expect(read("sw.js")).toContain("X-Frame-Options");
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

  it("keeps admin sessions when an authorized endpoint returns 403", () => {
    const admin = read("admin/admin.js");
    expect(admin).toMatch(/if \(response\.status === 401\)[\s\S]{0,120}logout\(\)/);
    const forbiddenBlock = admin.match(/if \(response\.status === 403\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(forbiddenBlock).toContain("throw new Error");
    expect(forbiddenBlock).not.toContain("logout()");
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
    expect(read("admin/index.html")).toContain("后台待办");
    expect(read("admin/index.html")).toContain('id="todo-feedback"');
    expect(read("admin/admin-ops.js")).toContain("abnormal_registrations_today");
    expect(read("supabase/migrations/202608310011_admin_ops_todos.sql")).toContain("abnormal_registrations_today");
    expect(read("supabase/admin-ops.sql")).toContain("abnormal_registrations_today");
    expect(read("admin/admin.js")).toContain("confirmSensitive");
    expect(read("admin/admin.js")).toContain("confirmLimitChange");
    expect(read("admin/index.html")).toContain("sensitive-confirm");
    expect(read("admin/index.html")).toContain("请输入「确认」");
    expect(read("admin/admin-ops.js")).toContain("askConfirm");
    expect(read("admin/risk-console.js")).toContain("confirmSensitive");
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

  it("lets admins publish announcements that logged-in users can dismiss", () => {
    const sql = read("supabase/migrations/202608310010_announcements.sql");
    expect(sql).toContain("create table if not exists public.announcements");
    expect(sql).toContain("announcement_dismissals");
    expect(sql).toContain("get_active_announcement");
    expect(sql).toContain("dismiss_announcement");
    expect(sql).toContain("admin_upsert_announcement");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.announcements/i);
    expect(read("admin/index.html")).toContain('data-page="announcements"');
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_list_announcements");
    expect(read("assets/js/announcement.js")).toContain("不再弹出");
    expect(read("index.html")).toContain("assets/js/announcement.js");
    expect(read("admin/index.html")).not.toContain("assets/js/announcement.js");
    expect(read("assets/js/announcement.js")).not.toMatch(/sb_secret/i);
  });

  it("lets admins expire an announcement so the popup stops", () => {
    const sql = read("supabase/migrations/202608310014_admin_expire_announcement.sql");
    expect(sql).toContain("admin_expire_announcement");
    expect(sql).toContain("announcement_expire");
    expect(sql).toContain("is_active = false");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.announcements/i);
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_expire_announcement");
    expect(read("admin/admin-ops.js")).toContain("停止弹出");
    expect(read("admin/index.html")).toContain("停止弹出");
  });

  it("lets admins change every quantity limit from a config page", () => {
    const sql = read("supabase/migrations/202608310012_admin_platform_limits.sql");
    expect(sql).toContain("admin_list_platform_limits");
    expect(sql).toContain("admin_set_platform_limits");
    expect(sql).toContain("invite_reward_months");
    expect(sql).toContain("trial_days");
    expect(sql).toContain("update_platform_limits");
    expect(sql).toContain("is_admin()");
    expect(sql).toContain("get_platform_config_int('trial_days', 14)");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.platform_config/i);
    expect(read("admin/index.html")).toContain('data-page="limits"');
    expect(read("admin/index.html")).toContain('id="limits-section"');
    expect(read("admin/index.html")).toContain('src="limits.js"');
    expect(read("admin/admin.js")).toContain("limits: '限额配置'");
    expect(read("admin/admin.js")).toContain("AdminLimits?.loadLimits");
    expect(read("admin/admin.js")).toContain("confirmLimitChange");
    expect(read("admin/limits.js")).toContain("rpc/admin_list_platform_limits");
    expect(read("admin/limits.js")).toContain("rpc/admin_set_platform_limits");
    expect(read("admin/limits.js")).toContain("invite_reward_months");
    expect(read("admin/limits.js")).toContain("feedback_per_user_per_hour");
    expect(read("admin/limits.js")).toContain("purchase_intent_per_email_per_hour");
    expect(read("admin/limits.js")).toContain("validateLimits");
    expect(read("admin/limits.js")).toContain("confirmLimitChange");
    expect(read("admin/limits.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("supabase/admin-ops.sql")).toContain("202608310012_admin_platform_limits.sql");
  });

  it("lets admins search and export audit logs with before/after summaries", () => {
    expect(read("admin/index.html")).toContain('id="export-logs"');
    expect(read("admin/index.html")).toContain(">提权/取消管理员<");
    expect(read("admin/index.html")).toContain('value="grant_entitlement"');
    expect(read("admin/index.html")).toContain('value="update_platform_limits"');
    expect(read("admin/index.html")).toContain(">目标摘要<");
    expect(read("admin/index.html")).toContain(">变更前<");
    expect(read("admin/admin-ops.js")).toContain("summarizeAuditRow");
    expect(read("admin/admin-ops.js")).toContain("仅管理员可导出审计日志");
    expect(read("admin/admin-ops.js")).toContain("时间戳");
    expect(read("admin/admin-ops.js")).toContain("变更后");
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("lets admins configure receivable aging bucket bounds", () => {
    const sql = read("supabase/migrations/202608310015_aging_bucket_bounds.sql");
    expect(sql).toContain("get_aging_bucket_bounds");
    expect(sql).toContain("aging_bucket_1_days");
    expect(sql).toContain("grant execute on function public.get_aging_bucket_bounds()");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.platform_config/i);
    expect(read("supabase/migrations/202608310012_admin_platform_limits.sql")).toContain("账龄分桶须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365");
    expect(read("supabase/admin-ops.sql")).toContain("202608310015_aging_bucket_bounds.sql");
    expect(read("admin/limits.js")).toContain("aging: '账龄分桶'");
    expect(read("admin/limits.js")).toContain("agingPreviewLabels");
    expect(read("admin/limits.js")).toContain('id="aging-preview"');
    expect(read("admin/index.html")).toContain("账龄分桶单独成组");
    expect(read("src/core/receivables/local.ts")).toContain("normalizeAgingBounds");
    expect(read("src/core/receivables/local.ts")).toContain("DEFAULT_AGING_BOUNDS");
    expect(read("src/core/receivables/bounds.ts")).toContain("get_aging_bucket_bounds");
    expect(read("src/core/receivables/bounds.ts")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("src/pro.ts")).toContain("fetchAgingBounds");
    expect(read("src/pro.ts")).toContain("UtiloraAgingBounds");
    expect(read("pro/app.js")).toContain("agingBucketLabels");
    expect(read("pro/app.js")).toContain("agingConfig()");
  });

  it("protects login with totp, other-device logout, encrypted backup and clickjacking guard", () => {
    const sql = read("supabase/migrations/202608310017_login_security.sql");
    expect(sql).toContain("login_locations");
    expect(sql).toContain("record_login_location");
    expect(sql).toContain("list_my_login_locations");
    expect(sql).toContain("feedback_per_user_per_hour");
    expect(sql).toContain("purchase_intent_per_ip_per_hour");
    expect(sql).toContain("grant execute on function public.record_login_location(uuid, text) to service_role");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.login_locations\s+to\s+(public|anon|authenticated)/i);
    expect(read("assets/js/auth.js")).toContain("mfa_required");
    expect(read("assets/js/auth.js")).toContain("logout?scope=others");
    expect(read("assets/js/auth.js")).toContain("functions/v1/login-location");
    expect(read("login/login.js")).toContain('mode === "mfa"');
    expect(read("account/index.html")).toContain("登录安全");
    expect(read("account/index.html")).toContain("登出其他设备");
    expect(read("src/core/backup/local.ts")).toContain("encryptBackup");
    expect(read("src/core/backup/local.ts")).toContain("decryptBackup");
    expect(read("pro/app.js")).toContain("encryptBackup");
    expect(read("pro/app.js")).toContain("isEncryptedBackup");
    expect(read("admin/limits.js")).toContain("feedback_per_user_per_hour");
    expect(read("supabase/functions/login-location/index.ts")).toContain("user_activity_logs");
    expect(read("supabase/functions/login-location/index.ts")).not.toMatch(/sb_secret/i);
    expect(read("assets/js/auth.js")).not.toMatch(/service[_-]?role|sb_secret/i);
  });

  it("issues hashed recovery codes, lists sessions, and requires admin totp", () => {
    const sql = read("supabase/migrations/202609020018_mfa_recovery_sessions.sql");
    expect(sql).toContain("mfa_recovery_codes");
    expect(sql).toContain("replace_mfa_recovery_codes");
    expect(sql).toContain("peek_mfa_recovery_code");
    expect(sql).toContain("list_my_sessions");
    expect(sql).toContain("grant execute on function public.replace_mfa_recovery_codes(uuid, text[]) to service_role");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\s+on\s+public\.mfa_recovery_codes\s+to\s+(public|anon|authenticated)/i);
    expect(sql).not.toMatch(/grant execute on function public.peek_mfa_recovery_code\(uuid, text\) to (public|anon|authenticated)/i);
    expect(read("assets/js/auth.js")).toContain("functions/v1/mfa-recovery");
    expect(read("assets/js/auth.js")).toContain("redeemRecoveryCode");
    expect(read("assets/js/auth.js")).toContain("listMySessions");
    expect(read("assets/js/auth.js")).toContain('request("/auth/v1/user"');
    expect(read("assets/js/auth.js")).toContain("totpQrSrc");
    expect(read("admin/admin.js")).toContain("/auth/v1/user");
    expect(read("supabase/functions/mfa-recovery/index.ts")).toContain("/auth/v1/user");
    expect(read("login/login.js")).toContain('mode === "recovery"');
    expect(read("login/index.html")).toContain("toggle-recovery-code");
    expect(read("account/index.html")).toContain("recovery-once");
    expect(read("account/index.html")).toContain("login-sessions");
    expect(read("account/account.js")).toContain("rotateRecoveryCodes");
    expect(read("admin/index.html")).toContain("admin-mfa-field");
    expect(read("admin/admin.js")).toContain("ensureAdminMfaSession");
    expect(read("admin/admin.js")).toContain("管理员须先在账号页开启二次验证");
    expect(read("admin/admin-ops.js")).toContain("ensureAdminMfaSession");
    expect(read("supabase/functions/mfa-recovery/index.ts")).toContain("totp_removed");
    expect(read("supabase/functions/mfa-recovery/index.ts")).not.toMatch(/sb_secret/i);
    expect(read("supabase/admin-ops.sql")).toContain("202609020018_mfa_recovery_sessions.sql");
  });

  it("lets admins inspect online sessions and force logout", () => {
    const sql = read("supabase/migrations/202609020019_admin_online_sessions.sql");
    expect(sql).toContain("admin_list_sessions");
    expect(sql).toContain("admin_force_logout");
    expect(sql).toContain("不能下线当前这一处后台会话");
    expect(sql).toContain("delete from auth.sessions");
    expect(sql).toContain("grant execute on function public.admin_list_sessions() to authenticated");
    expect(sql).toContain("grant execute on function public.admin_force_logout(uuid, uuid) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public.admin_list_sessions\(\) to (public|anon)/i);
    expect(read("admin/index.html")).toContain('data-page="sessions"');
    expect(read("admin/index.html")).toContain('id="sessions-section"');
    expect(read("admin/index.html")).toContain("src=\"sessions.js\"");
    expect(read("admin/index.html")).toContain('value="force_logout"');
    expect(read("admin/admin.js")).toContain("sessions: '在线账号'");
    expect(read("admin/admin.js")).toContain("AdminSessions?.loadSessions");
    expect(read("admin/admin.js")).toContain("rpc/admin_list_feedback");
    expect(read("admin/admin.js")).toContain("rpc/admin_set_feedback_status");
    expect(read("admin/admin.js")).toContain("rpc/admin_delete_feedback");
    expect(read("admin/admin.js")).not.toContain("`feedback?");
    expect(read("supabase/migrations/202609020022_admin_feedback_rpc.sql")).toContain("admin_list_feedback");
    expect(read("supabase/migrations/202609020022_admin_feedback_rpc.sql")).not.toMatch(/grant execute on function public.admin_list_feedback\([^\)]*\) to (public|anon)/i);
    expect(read("admin/sessions.js")).toContain("rpc/admin_list_sessions");
    expect(read("admin/sessions.js")).toContain("rpc/admin_force_logout");
    expect(read("admin/sessions.js")).toContain("confirmSensitive");
    expect(read("admin/sessions.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/admin-ops.js")).toContain("force_logout: '强制下线'");
    expect(read("supabase/admin-ops.sql")).toContain("202609020019_admin_online_sessions.sql");
  });

  it("warns admins about expiring trials and fills the user dossier", () => {
    const sql = read("supabase/migrations/202609020020_admin_dossier_expiry.sql");
    expect(sql).toContain("trial_expiry_warn_days");
    expect(sql).toContain("expiring_trials");
    expect(sql).toContain("admin_user_dossier");
    expect(sql).toContain("mfa_enabled");
    expect(sql).toContain("login_locations");
    expect(sql).toContain("grant execute on function public.admin_user_dossier(uuid, text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public.admin_user_dossier\(uuid, text\) to (public|anon)/i);
    expect(read("admin/index.html")).toContain('id="todo-expiring"');
    expect(read("admin/index.html")).toContain('id="dossier-sessions"');
    expect(read("admin/index.html")).toContain('id="dossier-locations"');
    expect(read("admin/index.html")).toContain('id="grant-filter"');
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_user_dossier");
    expect(read("admin/admin-ops.js")).toContain("expiring_items");
    expect(read("admin/admin-ops.js")).toContain("二次验证");
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/limits.js")).toContain("trial_expiry_warn_days");
    expect(read("supabase/admin-ops.sql")).toContain("202609020020_admin_dossier_expiry.sql");
  });

  it("binds feedback accounts, issues intent trials, and completes admin ops follow-through", () => {
    const sql = read("supabase/migrations/202609020023_admin_ops_followthrough.sql");
    expect(sql).toContain("alter table public.feedback");
    expect(sql).toContain("admin_issue_intent_trial");
    expect(sql).toContain("admin_grant_entitlement");
    expect(sql).toContain("due_intents");
    expect(sql).toContain("admin_promotion_impact");
    expect(sql).toContain("lose_access");
    expect(sql).toContain("admin_unlock_login");
    expect(sql).toContain("unlock_login");
    expect(sql).toContain("dismiss_count");
    expect(sql).toContain("login_locked");
    expect(sql).toContain("password_reset_last_hour");
    expect(sql).toContain("login_failure_max_attempts");
    expect(sql).toContain("'company'");
    expect(sql).not.toContain("avatar_url");
    expect(sql).toContain("grant execute on function public.admin_issue_intent_trial(uuid) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public.admin_issue_intent_trial\(uuid\) to (public|anon)/i);
    expect(sql).not.toMatch(/grant execute on function public.admin_promotion_impact\(\) to (public|anon)/i);
    expect(sql).not.toMatch(/grant execute on function public.admin_unlock_login\(text, text\) to (public|anon)/i);
    expect(read("admin/index.html")).toContain('id="todo-due"');
    expect(read("admin/index.html")).toContain("提交账号");
    expect(read("admin/index.html")).toContain('id="promo-impact"');
    expect(read("admin/index.html")).toContain('id="announcement-start"');
    expect(read("admin/index.html")).toContain('id="dossier-profile"');
    expect(read("admin/index.html")).toContain('id="risk-locked"');
    expect(read("admin/index.html")).toContain('value="intent_trial_grant"');
    expect(read("admin/admin.js")).toContain("issueIntentTrial");
    expect(read("admin/admin.js")).toContain("user_email");
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_issue_intent_trial");
    expect(read("admin/admin-ops.js")).toContain("rpc/admin_promotion_impact");
    expect(read("admin/admin-ops.js")).toContain("due_intents");
    expect(read("admin/admin-ops.js")).toContain("announcement-start");
    expect(read("admin/admin-ops.js")).toContain("paintDossierProfile");
    expect(read("admin/admin-ops.js")).not.toContain("avatar_url");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_unlock_login");
    expect(read("admin/risk-console.js")).toContain("login_locked");
    expect(read("supabase/functions/submit-feedback/index.ts")).toContain("user_id: user.id");
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/risk-console.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("supabase/admin-ops.sql")).toContain("202609020023_admin_ops_followthrough.sql");
  });

  it("lets admins manage dossier access, feedback notes, account binding and invite records without payment", () => {
    const sql = read("supabase/migrations/202609020024_admin_ops_crm_invite.sql");
    expect(sql).toContain("不能取消最后一位管理员");
    expect(sql).toContain("不能停用最后一位可用的管理员");
    expect(sql).toContain("admin_set_feedback_followup");
    expect(sql).toContain("admin_note");
    expect(sql).toContain("bind_accounts_by_email");
    expect(sql).toContain("bind_accounts_on_auth_user");
    expect(sql).toContain("admin_list_new_login_locations");
    expect(sql).toContain("create table if not exists public.invites");
    expect(sql).toContain("invite_ui_enabled");
    expect(sql).toContain("payment_not_connected");
    expect(sql).toContain("invite_ui_disabled");
    expect(sql).not.toMatch(/grant execute on function public.apply_invite_credit\(uuid\) to (public|anon|authenticated)/i);
    expect(sql).not.toMatch(/grant execute on function public.bind_invite_code\(text, uuid\) to (public|anon|authenticated)/i);
    expect(sql).toContain("grant execute on function public.admin_list_invites() to authenticated");
    expect(sql).not.toMatch(/grant execute on function public.admin_list_invites\(\) to (public|anon)/i);
    expect(read("admin/index.html")).toContain('id="dossier-toggle-admin"');
    expect(read("admin/index.html")).toContain('id="overview-email"');
    expect(read("admin/index.html")).toContain('id="risk-new-locations"');
    expect(read("admin/index.html")).toContain('data-page="invites"');
    expect(read("admin/index.html")).toContain("内部备注");
    expect(read("admin/admin.js")).toContain("rpc/admin_set_feedback_followup");
    expect(read("admin/admin.js")).toContain("overview-find");
    expect(read("admin/admin.js")).toContain("adminCount <= 1");
    expect(read("admin/admin-ops.js")).toContain("paintDossierAccountActions");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_list_new_login_locations");
    expect(read("admin/invites.js")).toContain("rpc/admin_list_invites");
    expect(read("admin/invites.js")).toContain("payment_connected");
    expect(read("admin/invites.js")).not.toContain("admin_grant_entitlement");
    expect(read("index.html")).not.toContain("邀请朋友");
    expect(read("account/index.html")).not.toContain("邀请朋友");
    expect(read("admin/invites.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/admin.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("supabase/admin-ops.sql")).toContain("202609020024_admin_ops_crm_invite.sql");
  });

  it("lets admins claim intents, search lists, and review unverified or MFA-less accounts", () => {
    const sql = read("supabase/migrations/202609020025_admin_ops_search_mfa_usage.sql");
    expect(sql).toContain("handler_id");
    expect(sql).toContain("handler_email");
    expect(sql).toContain("p_claim");
    expect(sql).toContain("admin_list_unverified_users");
    expect(sql).toContain("admin_list_admins_mfa");
    expect(sql).toContain("admin_list_edge_function_usage");
    expect(sql).toContain("auth.mfa_factors");
    expect(sql).toContain("edge_function_call_log");
    expect(sql).toContain("email_confirmed_at is null");
    expect(sql).toContain("grant execute on function public.admin_list_unverified_users() to authenticated");
    expect(sql).not.toMatch(/grant execute on function public.admin_list_unverified_users\(\) to (public|anon)/i);
    expect(sql).not.toMatch(/grant execute on function public.admin_list_admins_mfa\(\) to (public|anon)/i);
    expect(sql).not.toMatch(/grant execute on function public.admin_list_edge_function_usage\(\) to (public|anon)/i);
    expect(sql).not.toMatch(/grant execute on function public.admin_set_purchase_intent_followup\([^)]+\) to (public|anon)/i);
    expect(sql).not.toContain("avatar_url");
    expect(read("admin/index.html")).toContain('id="feedback-search"');
    expect(read("admin/index.html")).toContain("处理人");
    expect(read("admin/index.html")).toContain('id="risk-unverified"');
    expect(read("admin/index.html")).toContain('id="risk-admins-mfa"');
    expect(read("admin/index.html")).toContain('id="risk-edge-usage"');
    expect(read("admin/index.html")).toContain('id="overview-unverified"');
    expect(read("admin/admin.js")).toContain("p_claim");
    expect(read("admin/admin.js")).toContain("AdminJump");
    expect(read("admin/admin.js")).toContain("filteredFeedback");
    expect(read("admin/admin.js")).toContain("userStatus");
    expect(read("admin/admin-ops.js")).toContain("p_claim");
    expect(read("admin/admin-ops.js")).toContain("AdminJump");
    expect(read("admin/admin-ops.js")).toContain("paintJumpList");
    expect(read("admin/admin-ops.js")).not.toContain("avatar_url");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_list_unverified_users");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_list_admins_mfa");
    expect(read("admin/risk-console.js")).toContain("rpc/admin_list_edge_function_usage");
    expect(read("admin/admin.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/admin-ops.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("admin/risk-console.js")).not.toMatch(/service[_-]?role|sb_secret/i);
    expect(read("supabase/admin-ops.sql")).toContain("202609020025_admin_ops_search_mfa_usage.sql");
  });
});
