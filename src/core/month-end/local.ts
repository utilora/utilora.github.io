import { fromFen, toFen } from "../banking/local";

export interface MonthEndBankRow {
  id: string;
  date: string;
  summary: string;
  remaining: number;
}

export interface MonthEndReceivableRow {
  id: string;
  number: string;
  customerName: string;
  dueDate: string;
  remaining: number;
}

export interface MonthEndAnomalyRow {
  where: string;
  issue: string;
  fix: string;
}

export interface MonthEndExpenseRow {
  id: string;
  date: string;
  kind: "费用" | "报销";
  party: string;
  amount: number;
}

export interface MonthEndInput {
  month: string;
  closed: boolean;
  bankImported: boolean;
  bankCount: number;
  unmatchedBank: MonthEndBankRow[];
  openReceivables: MonthEndReceivableRow[];
  anomalies: MonthEndAnomalyRow[];
  expenses: MonthEndExpenseRow[];
}

export interface CloseStep {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface MonthEndResult {
  month: string;
  closed: boolean;
  steps: CloseStep[];
  done: number;
  total: number;
  percent: number;
  openReceivableTotal: number;
  unmatchedTotal: number;
  expenseTotal: number;
}

const sumAmount = (rows: Array<{ remaining?: number; amount?: number }>, key: "remaining" | "amount"): number =>
  fromFen(rows.reduce((sum, row) => sum + toFen(Number(row[key] || 0)), 0));

export const buildMonthEnd = (input: MonthEndInput): MonthEndResult => {
  const openReceivableTotal = sumAmount(input.openReceivables, "remaining");
  const unmatchedTotal = sumAmount(input.unmatchedBank, "remaining");
  const expenseTotal = sumAmount(input.expenses, "amount");
  const invalidExpenses = input.expenses.filter((row) => !(toFen(row.amount) > 0));
  const steps: CloseStep[] = [
    {
      id: "bank-imported",
      label: "已导入银行流水",
      ok: input.bankImported,
      detail: input.bankImported ? `共 ${input.bankCount} 笔` : "尚未导入银行流水"
    },
    {
      id: "bank-matched",
      label: "流水已全部匹配",
      ok: input.unmatchedBank.length === 0,
      detail: input.unmatchedBank.length ? `${input.unmatchedBank.length} 笔未匹配 · ${unmatchedTotal.toFixed(2)}` : "无未匹配流水"
    },
    {
      id: "receivables-open",
      label: "未收应收已列入底稿",
      ok: true,
      detail: input.openReceivables.length ? `${input.openReceivables.length} 张未收 · ${openReceivableTotal.toFixed(2)}` : "没有未收应收"
    },
    {
      id: "expenses-listed",
      label: "当月费用已列入底稿",
      ok: invalidExpenses.length === 0,
      detail: invalidExpenses.length
        ? `${invalidExpenses.length} 笔金额无效`
        : (input.expenses.length ? `${input.expenses.length} 笔 · ${expenseTotal.toFixed(2)}` : "当月暂无费用或报销")
    },
    {
      id: "anomalies-clear",
      label: "无校验异常",
      ok: input.anomalies.length === 0,
      detail: input.anomalies.length ? `${input.anomalies.length} 项待处理` : "未发现明显异常"
    },
    {
      id: "month-closed",
      label: "本月已月结",
      ok: input.closed,
      detail: input.closed ? `${input.month} 已关闭` : `${input.month} 尚未月结`
    }
  ];
  const done = steps.filter((step) => step.ok).length;
  return {
    month: input.month,
    closed: input.closed,
    steps,
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
    openReceivableTotal,
    unmatchedTotal,
    expenseTotal
  };
};

export const monthEndExportSheets = (
  input: MonthEndInput,
  result: MonthEndResult
): Array<{ name: string; rows: Array<Array<string | number>> }> => [
  {
    name: "月结摘要",
    rows: [
      ["月份", "完成度%", "已完成步骤", "步骤总数", "已月结", "未收金额", "未匹配金额", "异常数", "当月费用"],
      [
        result.month,
        result.percent,
        result.done,
        result.total,
        result.closed ? "是" : "否",
        result.openReceivableTotal,
        result.unmatchedTotal,
        input.anomalies.length,
        result.expenseTotal
      ]
    ]
  },
  {
    name: "完成步骤",
    rows: [
      ["步骤", "完成", "说明"],
      ...result.steps.map((step) => [step.label, step.ok ? "是" : "否", step.detail])
    ]
  },
  {
    name: "未收应收",
    rows: [
      ["客户", "应收单号", "到期日", "未收金额"],
      ...input.openReceivables.map((row) => [row.customerName, row.number, row.dueDate || "", row.remaining])
    ]
  },
  {
    name: "未匹配流水",
    rows: [
      ["日期", "摘要", "待匹配金额"],
      ...input.unmatchedBank.map((row) => [row.date, row.summary, row.remaining])
    ]
  },
  {
    name: "异常",
    rows: [
      ["位置", "问题", "修复建议"],
      ...input.anomalies.map((row) => [row.where, row.issue, row.fix])
    ]
  },
  {
    name: "当月费用",
    rows: [
      ["日期", "类型", "对象", "金额"],
      ...input.expenses.map((row) => [row.date, row.kind, row.party, row.amount])
    ]
  }
];
