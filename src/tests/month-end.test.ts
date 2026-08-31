import { describe, expect, it } from "vitest";
import {
  applyMonthClose,
  buildMonthEnd,
  canCloseMonth,
  closeBlockers,
  latestCloseForMonth,
  monthEndExportSheets,
  validateForceCloseReason
} from "../core/month-end/local";

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

  it("blocks a normal close while unmatched work or anomalies remain", () => {
    const result = buildMonthEnd(base);
    expect(canCloseMonth(result)).toBe(false);
    expect(closeBlockers(result).map((step) => step.id)).toEqual(["bank-matched", "anomalies-clear"]);
    const denied = applyMonthClose({
      input: base,
      result,
      closedAt: "2026-08-31T12:00:00.000Z"
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toContain("不能关账");
  });

  it("requires a reason for a forced close and writes matching working-paper numbers", () => {
    const result = buildMonthEnd(base);
    expect(validateForceCloseReason(" ").ok).toBe(false);
    const forced = applyMonthClose({
      input: base,
      result,
      forced: true,
      reason: " 老板要求先关，未匹配下周补 ",
      closedAt: "2026-08-31T12:00:00.000Z"
    });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.record.forced).toBe(true);
    expect(forced.record.reason).toBe("老板要求先关，未匹配下周补");
    expect(forced.record.snapshot).toMatchObject({
      percent: result.percent,
      done: result.done,
      total: result.total,
      openReceivableTotal: result.openReceivableTotal,
      unmatchedTotal: result.unmatchedTotal,
      expenseTotal: result.expenseTotal,
      anomalyCount: 1,
      unmatchedCount: 1,
      openReceivableCount: 1
    });
  });

  it("closes normally without a reason when blockers are clear", () => {
    const input = { ...base, unmatchedBank: [], anomalies: [] };
    const result = buildMonthEnd(input);
    expect(canCloseMonth(result)).toBe(true);
    const closed = applyMonthClose({
      input,
      result,
      forced: true,
      reason: "",
      closedAt: "2026-08-31T12:00:00.000Z"
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    expect(closed.record.forced).toBe(false);
    expect(closed.record.reason).toBe("");
  });

  it("exports summary, close record, steps, receivables, bank, anomalies and expenses", () => {
    const open = buildMonthEnd(base);
    const close = applyMonthClose({
      input: base,
      result: open,
      forced: true,
      reason: "先关账",
      closedAt: "2026-08-31T12:00:00.000Z"
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    const closedInput = { ...base, closed: true };
    const result = buildMonthEnd(closedInput);
    const sheets = monthEndExportSheets(closedInput, result, close.record);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "月结摘要",
      "关账记录",
      "完成步骤",
      "未收应收",
      "未匹配流水",
      "异常",
      "当月费用"
    ]);
    const summary = sheets[0]?.rows[1] || [];
    const record = sheets[1]?.rows[1] || [];
    expect(summary[1]).toBe(result.percent);
    expect(summary[4]).toBe("是");
    expect(summary[5]).toBe(result.openReceivableTotal);
    expect(summary[6]).toBe(result.unmatchedTotal);
    expect(summary[8]).toBe(result.expenseTotal);
    expect(record[1]).toBe("强制关账");
    expect(record[2]).toBe("先关账");
    expect(record[3]).toBe(result.percent);
    expect(record[6]).toBe(result.openReceivableTotal);
    expect(record[7]).toBe(result.unmatchedTotal);
    expect(record[8]).toBe(result.expenseTotal);
    expect(record[9]).toBe(base.anomalies.length);
    expect(sheets[3]?.rows[1]?.[1]).toBe("AR-00001");
    expect(sheets[4]?.rows[1]?.[2]).toBe(600);
    expect(latestCloseForMonth([close.record], "2026-08")?.reason).toBe("先关账");
    expect(close.record.snapshot.openReceivableTotal).toBe(result.openReceivableTotal);
    expect(close.record.snapshot.unmatchedTotal).toBe(result.unmatchedTotal);
    expect(close.record.snapshot.expenseTotal).toBe(result.expenseTotal);
  });
});
