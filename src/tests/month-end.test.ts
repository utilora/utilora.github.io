import { describe, expect, it } from "vitest";
import { buildMonthEnd, monthEndExportSheets } from "../core/month-end/local";

const base = {
  month: "2026-08",
  closed: false,
  bankImported: true,
  bankCount: 2,
  unmatchedBank: [{ id: "b2", date: "2026-08-28", summary: "待匹配", remaining: 600 }],
  openReceivables: [{ id: "v1", number: "AR-00001", customerName: "星海贸易", dueDate: "2026-08-31", remaining: 5480 }],
  anomalies: [{ where: "应收单 AR-00002", issue: "未关联客户", fix: "选择客户" }],
  expenses: [{ id: "x1", date: "2026-08-12", kind: "费用" as const, party: "办公", amount: 200 }]
};

describe("month-end close pack", () => {
  it("scores remaining close steps and keeps unresolved work in the result", () => {
    const open = buildMonthEnd(base);
    expect(open.total).toBe(6);
    expect(open.done).toBe(3);
    expect(open.percent).toBe(50);
    expect(open.steps.find((step) => step.id === "bank-matched")?.ok).toBe(false);
    expect(open.steps.find((step) => step.id === "anomalies-clear")?.ok).toBe(false);
    expect(open.steps.find((step) => step.id === "month-closed")?.ok).toBe(false);
    expect(open.openReceivableTotal).toBe(5480);
    expect(open.unmatchedTotal).toBe(600);
    expect(open.expenseTotal).toBe(200);
  });

  it("reaches 100% when unmatched, anomalies and close are resolved", () => {
    const closed = buildMonthEnd({
      ...base,
      closed: true,
      unmatchedBank: [],
      anomalies: []
    });
    expect(closed.percent).toBe(100);
    expect(closed.done).toBe(closed.total);
  });

  it("exports summary, steps, receivables, bank, anomalies and expenses", () => {
    const result = buildMonthEnd(base);
    const sheets = monthEndExportSheets(base, result);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "月结摘要",
      "完成步骤",
      "未收应收",
      "未匹配流水",
      "异常",
      "当月费用"
    ]);
    expect(sheets[0]?.rows[1]?.[1]).toBe(50);
    expect(sheets[2]?.rows[1]?.[1]).toBe("AR-00001");
    expect(sheets[3]?.rows[1]?.[2]).toBe(600);
  });
});
