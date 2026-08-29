export type DecimalString = string;

const SCALE = 100n;

export const toCents = (value: DecimalString | number): bigint => {
  const normalized = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Invalid monetary value");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole ?? "0") * SCALE + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
};

export const fromCents = (cents: bigint): DecimalString => {
  const negative = cents < 0n;
  const value = negative ? -cents : cents;
  const formatted = `${value / SCALE}.${String(value % SCALE).padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
};

export const addMoney = (...values: Array<DecimalString | number>): DecimalString =>
  fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));