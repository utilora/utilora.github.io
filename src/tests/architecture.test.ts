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
    expect(read("assets/js/auth.js")).toContain("record_user_activity");
    expect(read("assets/js/analytics.js")).toContain("record_user_activity");
    expect(read("src/core/auth/session.ts")).toContain("record_user_activity");
    expect(read("src/core/analytics/track.ts")).toContain("record_user_activity");
    for (const path of ["admin/admin.js", "admin/admin-ops.js", "assets/js/auth.js", "assets/js/analytics.js"]) {
      expect(read(path)).not.toMatch(/service[_-]?role|sb_secret/i);
    }
  });
});
