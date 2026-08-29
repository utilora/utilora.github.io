import { describe, expect, it } from "vitest";
import { resolveLocalEntitlement } from "../core/entitlements/service";

const user = { id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" } as any;

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