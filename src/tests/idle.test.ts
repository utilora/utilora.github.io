import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS, idleExceeded } from "../core/auth/idle";

describe("idle session", () => {
  it("keeps the session during 30 minutes of inactivity", () => {
    const start = 1_000_000;
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS)).toBe(false);
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS - 1)).toBe(false);
  });

  it("expires after 30 minutes without clicks", () => {
    const start = 1_000_000;
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS + 1)).toBe(true);
  });

  it("does not expire when no activity timestamp exists", () => {
    expect(idleExceeded(0, Date.now())).toBe(false);
  });
});
