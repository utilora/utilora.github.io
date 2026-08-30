import { describe, expect, it } from "vitest";
import { pendingBankTransactions } from "./queue";
import { suggestMatches } from "./local";

describe("U-01 银行流水待处理队列", () => {
  it("只保留仍有待匹配金额且未忽略的流水", () => {
    const rows = pendingBankTransactions([
      { id: "matched", amount: 100, paymentId: "p1" },
      { id: "partial", amount: 100, allocations: [{ amount: 40 }] },
      { id: "unmatched", amount: 80, allocations: [] },
      { id: "ignored", amount: 50, ignored: true }
    ]);

    expect(rows.map((row) => row.id)).toEqual(["partial", "unmatched"]);
  });

  it("金额唯一的建议会明确写出金额相等原因", () => {
    const [suggestion] = suggestMatches(
      [{ id: "tx1", date: "2026-08-30", summary: "回款", amount: 600 }],
      [{ id: "inv1", number: "AR-001", balance: 600, customerName: "星海贸易", dueDate: "2026-08-30" }]
    );

    expect(suggestion?.reason).toContain("金额 600.00");
    expect(suggestion?.reason).toContain("余额完全相等");
  });

  it("摘要命中客户名时会把客户名写入建议原因", () => {
    const suggestions = suggestMatches(
      [{ id: "tx1", date: "2026-08-30", summary: "星海贸易货款", amount: 600 }],
      [
        { id: "inv1", number: "AR-001", balance: 600, customerName: "星海贸易", dueDate: "2026-08-30" },
        { id: "inv2", number: "AR-002", balance: 600, customerName: "北岸工作室", dueDate: "2026-08-30" }
      ]
    );

    expect(suggestions[0]?.reason).toContain("摘要含客户「星海贸易」");
  });
});
