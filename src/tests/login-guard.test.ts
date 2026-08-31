import { describe, expect, it } from "vitest";
import {
  DISABLED_ACCOUNT_MESSAGE,
  loginCooldownMessage,
  otpLimitMessage,
  parseInviteCode,
  registrationLimitMessage,
  safeNextPath
} from "../core/auth/login-guard";

describe("login guard", () => {
  it("only allows in-site relative next paths", () => {
    expect(safeNextPath("../account/")).toBe("../account/");
    expect(safeNextPath("../pro/")).toBe("../pro/");
    expect(safeNextPath("../pro/?demo=1#/dashboard")).toBe("../pro/?demo=1#/dashboard");
    expect(safeNextPath("/account/")).toBe("/account/");
    expect(safeNextPath("https://evil.example/phish")).toBe("../account/");
    expect(safeNextPath("//evil.example/phish")).toBe("../account/");
    expect(safeNextPath("javascript:alert(1)")).toBe("../account/");
    expect(safeNextPath("data:text/html,x")).toBe("../account/");
    expect(safeNextPath("")).toBe("../account/");
    expect(safeNextPath("../login/?next=https://evil.example")).toBe("../account/");
  });

  it("does not hard-code daily registration copy as 3", () => {
    expect(registrationLimitMessage({ limit: 3 })).toContain("每天 3 次");
    expect(registrationLimitMessage({ limit: 8 })).toContain("每天 8 次");
    expect(registrationLimitMessage({ limit: 8 })).not.toContain("每天 3 次");
    expect(registrationLimitMessage({ message: "服务端文案" })).toBe("服务端文案");
    expect(registrationLimitMessage({})).not.toContain("3");
  });

  it("reads otp and cooldown limits from the server payload", () => {
    expect(otpLimitMessage({ reason: "email_limit", email_limit: 4 })).toContain("每小时 4 次");
    expect(otpLimitMessage({ reason: "ip_limit", ip_limit: 12 })).toContain("每小时 12 次");
    expect(loginCooldownMessage({ remaining_minutes: 20 })).toContain("20 分钟");
    expect(loginCooldownMessage({ message: "请约 9 分钟后再试。" })).toBe("请约 9 分钟后再试。");
  });

  it("embeds invite codes from the query without advertising them", () => {
    expect(parseInviteCode("?invite=Ab12_x")).toBe("Ab12_x");
    expect(parseInviteCode("next=../pro/&code=hello")).toBe("hello");
    expect(parseInviteCode("invite=<script>")).toBe("");
    expect(DISABLED_ACCOUNT_MESSAGE).toContain("停用");
  });
});
