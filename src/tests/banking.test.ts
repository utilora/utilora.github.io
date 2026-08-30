import { describe, expect, it } from "vitest";
import {
  bankFingerprint,
  bankMatchState,
  parseBankTable,
  planAllocation,
  previewBankImport,
  suggestExactMatches,
  suggestMatches
} from "../core/banking/local";

const headers = ["交易日期", "摘要", "贷方发生额"];

describe("bank import fingerprints", () => {
  it("treats the same date, amount and summary as one fingerprint", () => {
    expect(bankFingerprint("2026/8/1", "  星海贸易  转账 ", "3,000.00"))
      .toBe(bankFingerprint("2026-08-01", "星海贸易 转账", 3000));
  });
});

describe("bank import preview", () => {
  it("classifies new, duplicate and invalid rows before commit", () => {
    const parsed = parseBankTable(headers, [
      ["2026-08-01", "星海贸易转账", "3000"],
      ["2026-08-01", "星海贸易转账", "3000"],
      ["", "空日期", "100"],
      ["2026-08-02", "无效金额", "abc"]
    ]);
    const preview = previewBankImport(parsed, [
      { date: "2026-08-01", summary: "星海贸易转账", amount: 3000 }
    ]);
    expect(preview.map((row) => row.status)).toEqual(["duplicate", "new", "invalid", "invalid"]);
  });

  it("does not create extra rows when the same file is previewed twice", () => {
    const rows = [
      ["2026-08-03", "客户回款", "600"],
      ["2026-08-04", "客户回款", "800"]
    ];
    const first = previewBankImport(parseBankTable(headers, rows), []);
    expect(first.every((row) => row.status === "new")).toBe(true);
    const existing = first.map((row) => ({ date: row.date, summary: row.summary, amount: row.amount, fingerprint: row.fingerprint }));
    const second = previewBankImport(parseBankTable(headers, rows), existing);
    expect(second.every((row) => row.status === "duplicate")).toBe(true);
  });
});

describe("bank matching", () => {
  it("exposes matched, partial and unmatched remaining amounts", () => {
    expect(bankMatchState({ amount: 1000, allocations: [{ amount: 1000 }] })).toBe("matched");
    expect(bankMatchState({ amount: 1000, allocations: [{ amount: 400 }] })).toBe("partial");
    expect(bankMatchState({ amount: 1000, allocations: [] })).toBe("unmatched");
  });

  it("rejects allocations that would over-assign a transaction or invoice", () => {
    expect(planAllocation(100, 80, 90).ok).toBe(false);
    expect(planAllocation(50, 80, 60).ok).toBe(false);
    expect(planAllocation(80, 80, 80)).toEqual({ ok: true, amount: 80 });
  });

  it("only auto-suggests a unique exact remaining balance and consumes it", () => {
    const suggestions = suggestExactMatches(
      [
        { id: "b1", amount: 8480, allocations: [] },
        { id: "b2", amount: 8480, allocations: [] },
        { id: "b3", amount: 600, allocations: [] }
      ],
      [
        { id: "v1", number: "AR-00001", balance: 8480 },
        { id: "v2", number: "AR-00002", balance: 600 }
      ]
    );
    expect(suggestions.map((item) => item.txId)).toEqual(["b1", "b3"]);
    expect(suggestions[0]?.invoiceNumber).toBe("AR-00001");
    expect(suggestions[1]?.invoiceNumber).toBe("AR-00002");
  });

  it("uses a customer name in the summary when two invoices share the same amount", () => {
    const suggestions = suggestMatches(
      [
        { id: "b1", date: "2026-08-20", summary: "星海贸易货款", amount: 8480, allocations: [] },
        { id: "b2", date: "2026-08-20", summary: "转账", amount: 8480, allocations: [] }
      ],
      [
        { id: "v1", number: "AR-00001", balance: 8480, customerName: "星海贸易", dueDate: "2026-09-01" },
        { id: "v2", number: "AR-00002", balance: 8480, customerName: "北岸工作室", dueDate: "2026-09-01" }
      ]
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ txId: "b1", invoiceId: "v1", confidence: "high" });
    expect(suggestions[0]?.reason).toContain("摘要含客户「星海贸易」");
  });

  it("uses a near due date when the amount is not unique and no customer name matches", () => {
    const suggestions = suggestMatches(
      [{ id: "b1", date: "2026-08-30", summary: "客户回款", amount: 600, allocations: [] }],
      [
        { id: "v1", number: "AR-00001", balance: 600, customerName: "星海贸易", dueDate: "2026-08-29" },
        { id: "v2", number: "AR-00002", balance: 600, customerName: "北岸工作室", dueDate: "2026-07-01" }
      ]
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ txId: "b1", invoiceId: "v1", confidence: "medium" });
    expect(suggestions[0]?.reason).toContain("相差 1 天");
  });

  it("does not guess when two invoices remain equally plausible", () => {
    const suggestions = suggestMatches(
      [{ id: "b1", date: "2026-08-30", summary: "转账", amount: 600, allocations: [] }],
      [
        { id: "v1", number: "AR-00001", balance: 600, customerName: "星海贸易", dueDate: "2026-08-29" },
        { id: "v2", number: "AR-00002", balance: 600, customerName: "北岸工作室", dueDate: "2026-08-28" }
      ]
    );
    expect(suggestions).toEqual([]);
  });
});
