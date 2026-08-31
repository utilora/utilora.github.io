import { describe, expect, it } from "vitest";
import { pendingBankTransactions } from "../core/banking/queue";
import { backupStatus } from "../core/backup/local";
import { amountOf, collectToday, dueThisWeek, mondayOf, sundayOf } from "../core/receivables/local";

const asOf = "2026-08-31"; // Monday

const invoices = [
  { id: "today", number: "AR-T", customerId: "c1", customerName: "星海贸易", dueDate: "2026-08-31", status: "issued", total: 1000, paid: 200 },
  { id: "overdue", number: "AR-O", customerId: "c2", customerName: "北岸工作室", dueDate: "2026-08-20", status: "issued", total: 500, paid: 0 },
  { id: "wed", number: "AR-W", customerId: "c1", customerName: "星海贸易", dueDate: "2026-09-02", status: "issued", total: 300, paid: 0 },
  { id: "next", number: "AR-N", customerId: "c1", customerName: "星海贸易", dueDate: "2026-09-10", status: "issued", total: 900, paid: 0 },
  { id: "paid", number: "AR-P", customerId: "c1", customerName: "星海贸易", dueDate: "2026-08-31", status: "issued", total: 100, paid: 100 },
  { id: "draft", number: "AR-D", customerId: "c1", customerName: "星海贸易", dueDate: "2026-08-31", status: "draft", total: 100, paid: 0 }
];

describe("today dashboard", () => {
  it("uses Monday–Sunday for the current week", () => {
    expect(mondayOf("2026-08-31")).toBe("2026-08-31");
    expect(sundayOf("2026-08-31")).toBe("2026-09-06");
    expect(mondayOf("2026-09-02")).toBe("2026-08-31");
  });

  it("lists overdue and due-today invoices as 今日该催", () => {
    const rows = collectToday(invoices, asOf);
    expect(rows.map((row) => row.id)).toEqual(["overdue", "today"]);
    expect(amountOf(rows)).toBe(1300);
  });

  it("lists remaining invoices due through Sunday as 本周到期", () => {
    const rows = dueThisWeek(invoices, asOf);
    expect(rows.map((row) => row.id)).toEqual(["today", "wed"]);
    expect(amountOf(rows)).toBe(1100);
  });

  it("counts unmatched bank rows and stale backups", () => {
    const unmatched = pendingBankTransactions([
      { id: "a", amount: 80, allocations: [] },
      { id: "b", amount: 50, ignored: true },
      { id: "c", amount: 100, paymentId: "p1" }
    ]);
    expect(unmatched.map((row) => row.id)).toEqual(["a"]);
    expect(backupStatus(null, Date.parse("2026-08-31T00:00:00")).stale).toBe(true);
    expect(backupStatus("2026-08-30T00:00:00.000Z", Date.parse("2026-08-31T00:00:00")).stale).toBe(false);
  });

  it("shows zeros on an empty book", () => {
    expect(collectToday([], asOf)).toEqual([]);
    expect(dueThisWeek([], asOf)).toEqual([]);
    expect(pendingBankTransactions([])).toEqual([]);
  });
});
