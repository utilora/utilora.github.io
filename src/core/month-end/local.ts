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

export interface MonthEndCloseSnapshot {
  percent: number;
  done: number;
  total: number;
  openReceivableTotal: number;
  unmatchedTotal: number;
  expenseTotal: number;
  anomalyCount: number;
  unmatchedCount: number;
  openReceivableCount: number;
}

export interface MonthEndCloseRecord {
  month: string;
  closedAt: string;
  forced: boolean;
  reason: string;
  snapshot: MonthEndCloseSnapshot;
}

export type CloseDecision =
  | { ok: true; record: MonthEndCloseRecord }
  | { ok: false; error: string };

export const CLOSE_REASON_MIN = 2;

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

export const closeBlockers = (result: MonthEndResult): CloseStep[] =>
  result.steps.filter((step) => step.id !== "month-closed" && !step.ok);

export const canCloseMonth = (result: MonthEndResult): boolean => closeBlockers(result).length === 0;

export const validateForceCloseReason = (reason: string): { ok: true; reason: string } | { ok: false; error: string } => {
  const text = String(reason || "").trim();
  if (!text) return { ok: false, error: "强制关账必须填写原因" };
  if (text.length < CLOSE_REASON_MIN) return { ok: false, error: "原因至少两个字" };
  return { ok: true, reason: text };
};

export const closeSnapshot = (input: MonthEndInput, result: MonthEndResult): MonthEndCloseSnapshot => ({
  percent: result.percent,
  done: result.done,
  total: result.total,
  openReceivableTotal: result.openReceivableTotal,
  unmatchedTotal: result.unmatchedTotal,
  expenseTotal: result.expenseTotal,
  anomalyCount: input.anomalies.length,
  unmatchedCount: input.unmatchedBank.length,
  openReceivableCount: input.openReceivables.length
});

export const buildCloseRecord = (params: {
  month: string;
  forced: boolean;
  reason: string;
  closedAt: string;
  input: MonthEndInput;
  result: MonthEndResult;
}): MonthEndCloseRecord => ({
  month: params.month,
  closedAt: params.closedAt,
  forced: params.forced,
  reason: params.forced ? String(params.reason || "").trim() : "",
  snapshot: closeSnapshot(params.input, params.result)
});

export const applyMonthClose = (params: {
  input: MonthEndInput;
  result: MonthEndResult;
  forced?: boolean;
  reason?: string;
  closedAt: string;
}): CloseDecision => {
  if (params.result.closed) return { ok: false, error: "该月已月结" };
  const blockers = closeBlockers(params.result);
  if (blockers.length === 0) {
    return {
      ok: true,
      record: buildCloseRecord({
        month: params.result.month,
        forced: false,
        reason: "",
        closedAt: params.closedAt,
        input: params.input,
        result: params.result
      })
    };
  }
  if (!params.forced) {
    return { ok: false, error: "未完成项未处理完，不能关账" };
  }
  const check = validateForceCloseReason(params.reason || "");
  if (!check.ok) return check;
  return {
    ok: true,
    record: buildCloseRecord({
      month: params.result.month,
      forced: true,
      reason: check.reason,
      closedAt: params.closedAt,
      input: params.input,
      result: params.result
    })
  };
};

export const latestCloseForMonth = (
  records: MonthEndCloseRecord[] | undefined,
  month: string
): MonthEndCloseRecord | null => {
  const rows = Array.isArray(records) ? records.filter((row) => row.month === month) : [];
  const last = rows[rows.length - 1];
  return last ?? null;
};

const closeModeLabel = (result: MonthEndResult, closeRecord?: MonthEndCloseRecord | null): string => {
  if (!result.closed) return "尚未月结";
  if (closeRecord?.forced) return "强制关账";
  return "正常关账";
};

export const monthEndExportSheets = (
  input: MonthEndInput,
  result: MonthEndResult,
  closeRecord?: MonthEndCloseRecord | null
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
    name: "关账记录",
    rows: [
      ["月份", "关账方式", "原因", "完成度%", "已完成步骤", "步骤总数", "未收金额", "未匹配金额", "当月费用", "异常数", "关账时间"],
      [
        result.month,
        closeModeLabel(result, closeRecord),
        closeRecord?.reason || "",
        result.percent,
        result.done,
        result.total,
        result.openReceivableTotal,
        result.unmatchedTotal,
        result.expenseTotal,
        input.anomalies.length,
        closeRecord?.closedAt || ""
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
