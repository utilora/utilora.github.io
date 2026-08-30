import { describe, expect, it } from "vitest";
import {
  agingBucket,
  agingTotalsMatchOpen,
  collectionProgress,
  customerDebts,
  remainingOf,
  summarizeAging
} from "../core/receivables/local";

const asOf = "2026-08-30";

const invoices = [
  { id: "draft", number: "AR-D", customerId: "c1", customerName: "星海贸易", dueDate: "2026-07-01", status: "draft", total: 1000, paid: 0 },
  { id: "void", number: "AR-V", customerId: "c1", customerName: "星海贸易", dueDate: "2026-07-01", status: "void", total: 2000, paid: 0 },
  { id: "current", number: "AR-1", customerId: "c1", customerName: "星海贸易", dueDate: "2026-09-15", status: "issued", total: 8480, paid: 3000 },
  { id: "overdue", number: "AR-2", customerId: "c2", customerName: "北岸工作室", dueDate: "2026-08-25", status: "issued", total: 636, paid: 0 },
  { id: "old", number: "AR-3", customerId: "c2", customerName: "北岸工作室", dueDate: "2026-05-01", status: "issued", total: 500, paid: 100 },
  { id: "paid", number: "AR-4", customerId: "c1", customerName: "星海贸易", dueDate: "2026-07-01", status: "issued", total: 200, paid: 200 }
];

describe("receivable aging", () => {
  it("puts remaining balances into aging buckets and skips draft, void and settled invoices", () => {
    expect(agingBucket("2026-09-15", asOf)).toBe("current");
    expect(agingBucket("2026-08-25", asOf)).toBe("d30");
    expect(agingBucket("2026-05-01", asOf)).toBe("over90");
    expect(remainingOf({ total: 8480, paid: 3000 })).toBe(5480);
    const aging = summarizeAging(invoices, asOf);
    expect(aging.current).toBe(5480);
    expect(aging.d30).toBe(636);
    expect(aging.over90).toBe(400);
    expect(agingTotalsMatchOpen(invoices, asOf)).toBe(true);
    expect(aging.current + aging.d30 + aging.d60 + aging.d90 + aging.over90).toBe(6516);
  });
});

describe("customer debt and collection progress", () => {
  it("shows open and overdue amounts by customer", () => {
    const debts = customerDebts(invoices, asOf);
    expect(debts.map((row) => row.customerName)).toEqual(["星海贸易", "北岸工作室"]);
    expect(debts[0]).toMatchObject({ openAmount: 5480, overdueAmount: 0, openCount: 1 });
    expect(debts[1]).toMatchObject({ openAmount: 1036, overdueAmount: 1036, overdueCount: 2 });
  });

  it("computes collection progress without draft or void invoices", () => {
    const progress = collectionProgress(invoices, asOf);
    expect(progress.issuedTotal).toBe(8480 + 636 + 500 + 200);
    expect(progress.collectedTotal).toBe(3000 + 100 + 200);
    expect(progress.openTotal).toBe(6516);
    expect(progress.overdueTotal).toBe(1036);
    expect(progress.openCount).toBe(3);
    expect(progress.settledCount).toBe(1);
    expect(progress.collectedRate).toBe(Math.round((3300 / 9816) * 100));
  });
});
