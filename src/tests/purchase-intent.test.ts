import { describe, expect, it } from "vitest";
import { validatePurchaseIntent } from "../core/purchase-intent/service";

describe("validatePurchaseIntent", () => {
  it("normalizes a valid Pro waitlist payload", () => {
    expect(validatePurchaseIntent({
      email: "  Owner@Example.COM ",
      use_case: "应收回款",
      company_size: "1-10",
      intended_plan: "pro"
    })).toEqual({
      email: "owner@example.com",
      use_case: "应收回款",
      company_size: "1-10",
      intended_plan: "pro"
    });
  });

  it("rejects invalid emails and unknown plans", () => {
    expect(() => validatePurchaseIntent({ email: "not-an-email" })).toThrow("请填写有效邮箱");
    expect(() => validatePurchaseIntent({ email: "a@b.com", intended_plan: "enterprise" })).toThrow("当前仅开放 Pro 意向");
  });
});
