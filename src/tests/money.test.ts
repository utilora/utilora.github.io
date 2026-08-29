import { describe, expect, it } from "vitest";
import { addMoney, fromCents, toCents } from "../shared/money/decimal";

describe("decimal money", () => {
  it("avoids floating point errors", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
  });

  it("round-trips negative amounts", () => {
    expect(fromCents(toCents("-1234.56"))).toBe("-1234.56");
  });

  it("rejects excess decimal places", () => {
    expect(() => toCents("1.001")).toThrow();
  });
});