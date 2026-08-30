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
  });

  it("gates the professional workspace behind the TypeScript bootstrap", () => {
    const pro = read("pro/index.html");
    expect(pro).toContain('id="pro-gate"');
    expect(pro).toContain('id="pro-shell" hidden');
    expect(pro).toContain('src="/src/pro.ts"');
    expect(pro).not.toContain("access.js");
    const vite = read("vite.config.ts");
    expect(vite).not.toContain('{ src: "pro", dest: "." }');
  });

  it("requires an email OTP before registration completes", () => {
    const login = read("login/index.html");
    const logic = read("login/login.js");
    expect(login).toContain('id="otp-field" hidden');
    expect(login).toContain('autocomplete="one-time-code"');
    expect(logic).toContain('await auth.verifyOtp');
    expect(logic).toContain('await auth.resend(pendingEmail)');
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
});
