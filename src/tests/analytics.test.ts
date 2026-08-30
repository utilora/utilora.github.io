import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENT_LIST, ANALYTICS_EVENTS, isAnalyticsEvent } from "../core/analytics/events";
import { trackEvent } from "../core/analytics/track";

const read = (path: string): string => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

describe("commercialization analytics", () => {
  it("centralizes the exact P0 event catalog", () => {
    expect(ANALYTICS_EVENT_LIST).toEqual([
      "homepage_view",
      "free_tool_use",
      "pro_click",
      "demo_enter",
      "login_success",
      "workspace_enter",
      "bank_use",
      "receivable_use",
      "month_end_use",
      "pricing_view",
      "purchase_intent"
    ]);
    expect(isAnalyticsEvent("homepage_view")).toBe(true);
    expect(isAnalyticsEvent("page_view")).toBe(false);
  });

  it("reuses the same event names in the existing tracker and SQL", () => {
    const js = read("assets/js/analytics.js");
    const migration = read("supabase/migrations/202608300002_commercialization_analytics.sql");
    for (const event of ANALYTICS_EVENT_LIST) {
      expect(js).toContain(`${event}: "${event}"`);
      expect(migration).toContain(`'${event}'`);
    }
    expect(js).toContain("window.UtiloraAnalytics");
    expect(read("login/login.js")).toContain("EVENTS.login_success");
    expect(read("src/pro.ts")).toContain("ANALYTICS_EVENTS.demo_enter");
    expect(read("src/pro.ts")).toContain("ANALYTICS_EVENTS.workspace_enter");
    expect(read("src/app/purchase-intent.ts")).toContain("ANALYTICS_EVENTS.purchase_intent");
    expect(read("pro/app.js")).toContain("EVENTS.bank_use");
    expect(read("pro/app.js")).toContain("EVENTS.receivable_use");
    expect(read("pro/app.js")).toContain("EVENTS.month_end_use");
  });

  it("does not send sensitive finance payloads and cannot throw", () => {
    const tracker = read("src/core/analytics/track.ts") + read("assets/js/analytics.js");
    expect(tracker).not.toMatch(/customerName|invoiceBalance|bankAccount|grand_total/);
    expect(() => trackEvent(ANALYTICS_EVENTS.homepage_view)).not.toThrow();
    expect(() => trackEvent("not_an_event" as typeof ANALYTICS_EVENTS.homepage_view)).not.toThrow();
  });
});
