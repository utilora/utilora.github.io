import { describe, expect, it } from "vitest";
import {
  ACCOUNT_BACKUP_HREF,
  ACCOUNT_BACKUP_LABEL,
  describeEntitlement,
  formatExpiryDay,
  resolveLocalEntitlement
} from "../core/entitlements/service";

const user = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" } as any;
const now = Date.parse("2026-08-31T00:00:00.000Z");

describe("resolveLocalEntitlement", () => {
  it("does not grant professional access to guests", () => {
    expect(resolveLocalEntitlement(null, true).proAccess).toBe(false);
  });

  it("grants authenticated users access during open promotion", () => {
    expect(resolveLocalEntitlement(user, true)).toMatchObject({
      authenticated: true,
      plan: "pro_trial",
      proAccess: true,
      source: "promotion"
    });
  });

  it("uses account plan after the promotion closes", () => {
    const proUser = { ...user, app_metadata: { plan: "pro" } };
    expect(resolveLocalEntitlement(proUser, false).proAccess).toBe(true);
    expect(resolveLocalEntitlement(user, false).proAccess).toBe(false);
  });
});

describe("account entitlement view", () => {
  it("shows plan, open-ended promo expiry, and a backup entry", () => {
    const view = describeEntitlement({
      authenticated: true,
      plan: "pro_trial",
      proAccess: true,
      source: "promotion",
      expiresAt: null
    }, now);
    expect(view.planLabel).toBe("专业版（限时免费）");
    expect(view.expiryLabel).toBe("促销期内不过期");
    expect(view.accessLabel).toBe("可使用工作台");
    expect(view.backupHref).toBe(ACCOUNT_BACKUP_HREF);
    expect(view.backupLabel).toBe(ACCOUNT_BACKUP_LABEL);
    expect(view.summary).toContain("内测限免");
    expect(view.summary).not.toMatch(/一律免费|目前免费使用|邀请/);
  });

  it("shows a dated trial and keeps backup after expiry", () => {
    const live = describeEntitlement({
      authenticated: true,
      plan: "pro_trial",
      proAccess: true,
      source: "grant",
      expiresAt: "2026-09-14T16:00:00.000Z"
    }, now);
    expect(live.planLabel).toBe("专业版试用（人工开通）");
    expect(live.expiryLabel).toBe("2026年9月14日到期");
    expect(live.summary).toContain("2026年9月14日");
    expect(formatExpiryDay("2026-09-14T16:00:00.000Z")).toBe("2026年9月14日");

    const ended = describeEntitlement({
      authenticated: true,
      plan: "free",
      proAccess: false,
      source: "none",
      expiresAt: "2026-08-01T00:00:00.000Z"
    }, now);
    expect(ended.expired).toBe(true);
    expect(ended.proAccess).toBe(false);
    expect(ended.expiryLabel).toBe("2026年8月1日已过期");
    expect(ended.accessLabel).toBe("可查看与导出");
    expect(ended.backupHref).toBe(ACCOUNT_BACKUP_HREF);
    expect(ended.summary).toContain("仍可查看和完整导出");
    expect(ended.summary).not.toMatch(/一律免费|目前免费使用|邀请/);
  });

  it("labels a free account without promising unlimited pro access", () => {
    const view = describeEntitlement({
      authenticated: true,
      plan: "free",
      proAccess: false,
      source: "none",
      expiresAt: null
    }, now);
    expect(view.planLabel).toBe("免费账户");
    expect(view.expiryLabel).toBe("无到期日");
    expect(view.summary).toContain("五个财税工具永久免费");
    expect(view.summary).not.toMatch(/一律免费|目前免费使用|邀请/);
    expect(view.backupLabel).toBe("导出完整备份");
  });
});
