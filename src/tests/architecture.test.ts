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
});