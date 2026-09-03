import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS, idleExceeded, setIdleTimeoutMs, currentIdleTimeoutMs } from "../core/auth/idle";

describe("idle session", () => {
  it("keeps the session during 30 minutes of inactivity", () => {
    const start = 1_000_000;
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS, IDLE_TIMEOUT_MS)).toBe(false);
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS - 1, IDLE_TIMEOUT_MS)).toBe(false);
  });

  it("expires after 30 minutes without clicks", () => {
    const start = 1_000_000;
    expect(idleExceeded(start, start + IDLE_TIMEOUT_MS + 1, IDLE_TIMEOUT_MS)).toBe(true);
  });

  it("does not expire when no activity timestamp exists", () => {
    expect(idleExceeded(0, Date.now(), IDLE_TIMEOUT_MS)).toBe(false);
  });

  it("uses a configured timeout instead of the 30 minute default", () => {
    setIdleTimeoutMs(5 * 60 * 1000);
    expect(currentIdleTimeoutMs()).toBe(5 * 60 * 1000);
    const start = 1_000_000;
    expect(idleExceeded(start, start + 5 * 60 * 1000)).toBe(false);
    expect(idleExceeded(start, start + 5 * 60 * 1000 + 1)).toBe(true);
    setIdleTimeoutMs(IDLE_TIMEOUT_MS);
  });
});
