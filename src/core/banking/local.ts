export type BankMatchState = "matched" | "partial" | "unmatched";
export type BankPreviewStatus = "new" | "duplicate" | "invalid";

export interface BankParsedRow {
  row: number;
  date: string;
  summary: string;
  amount: number;
  fingerprint: string;
  error?: string;
}

export interface BankPreviewRow extends BankParsedRow {
  status: BankPreviewStatus;
}

export interface BankTransactionLike {
  id?: string;
  date?: string;
  summary?: string;
  amount?: number;
  fingerprint?: string;
  paymentId?: string;
  allocations?: Array<{ paymentId?: string; invoiceId?: string; amount?: number }>;
}

export interface CollectableInvoice {
  id: string;
  number: string;
  balance: number;
}

export interface MatchSuggestion {
  txId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  reason: string;
  confidence: "high";
}

const FEN_EPS = 1;

export const toFen = (value: number | string): number => {
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100 + Number.EPSILON);
};

export const fromFen = (fen: number): number => Math.round(fen) / 100;

export const normalizeSummary = (summary: string): string =>
  String(summary || "").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();

export const normalizeImportedDate = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }
  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match?.[1] || !match[2] || !match[3]) return text;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
};

export const bankFingerprint = (date: string, summary: string, amount: number | string): string =>
  `${normalizeImportedDate(date)}|${toFen(amount)}|${normalizeSummary(summary)}`;

export const transactionFingerprint = (tx: BankTransactionLike): string =>
  tx.fingerprint || bankFingerprint(String(tx.date || ""), String(tx.summary || ""), Number(tx.amount || 0));

export const parseAmountCell = (raw: unknown): { amount?: number; error?: string } => {
  const text = String(raw ?? "").trim().replace(/,/g, "").replace(/[￥¥元]/g, "");
  if (!text) return { error: "金额为空" };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { error: "金额无效" };
  const amount = fromFen(toFen(Number(text)));
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e12) return { error: "金额超出范围" };
  return { amount };
};

const headerIndex = (headers: string[], names: string[]): number =>
  headers.findIndex((header) => names.some((name) => header.includes(name)));

export const parseBankTable = (headers: unknown[], rows: unknown[][]): BankParsedRow[] => {
  const labels = headers.map((header) => String(header || "").trim());
  const dateIndex = headerIndex(labels, ["日期", "交易日", "记账日"]);
  const summaryIndex = headerIndex(labels, ["摘要", "用途", "对方", "备注"]);
  const amountIndex = headerIndex(labels, ["收入", "贷方发生额", "贷方", "交易金额", "入账金额", "金额"]);
  if (dateIndex < 0 || summaryIndex < 0 || amountIndex < 0) {
    throw new Error("未找到日期、摘要或金额列");
  }

  const parsed: BankParsedRow[] = [];
  rows.forEach((row, index) => {
    const cells = Array.isArray(row) ? row : [];
    const empty = cells.every((cell) => String(cell ?? "").trim() === "");
    if (empty) return;
    const date = normalizeImportedDate(cells[dateIndex]);
    const summary = normalizeSummary(String(cells[summaryIndex] ?? ""));
    const parsedAmount = parseAmountCell(cells[amountIndex]);
    const rowNumber = index + 2;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      parsed.push({ row: rowNumber, date, summary, amount: 0, fingerprint: "", error: "日期无效" });
      return;
    }
    if (parsedAmount.error || parsedAmount.amount === undefined) {
      parsed.push({ row: rowNumber, date, summary, amount: 0, fingerprint: "", error: parsedAmount.error || "金额无效" });
      return;
    }
    parsed.push({
      row: rowNumber,
      date,
      summary,
      amount: parsedAmount.amount,
      fingerprint: bankFingerprint(date, summary, parsedAmount.amount)
    });
  });
  return parsed;
};

export const previewBankImport = (
  parsed: BankParsedRow[],
  existing: BankTransactionLike[]
): BankPreviewRow[] => {
  const remaining = new Map<string, number>();
  existing.forEach((tx) => {
    const fingerprint = transactionFingerprint(tx);
    remaining.set(fingerprint, (remaining.get(fingerprint) || 0) + 1);
  });

  return parsed.map((row) => {
    if (row.error) return { ...row, status: "invalid" as const };
    const left = remaining.get(row.fingerprint) || 0;
    if (left > 0) {
      remaining.set(row.fingerprint, left - 1);
      return { ...row, status: "duplicate" as const };
    }
    return { ...row, status: "new" as const };
  });
};

export const countPreview = (rows: BankPreviewRow[]): Record<BankPreviewStatus, number> =>
  rows.reduce(
    (counts, row) => {
      counts[row.status] += 1;
      return counts;
    },
    { new: 0, duplicate: 0, invalid: 0 }
  );

export const bankAllocatedFen = (tx: BankTransactionLike): number => {
  if (tx.paymentId) return toFen(Number(tx.amount || 0));
  return (tx.allocations || []).reduce((sum, item) => sum + toFen(Number(item.amount || 0)), 0);
};

export const bankRemainingFen = (tx: BankTransactionLike): number =>
  Math.max(0, toFen(Number(tx.amount || 0)) - bankAllocatedFen(tx));

export const bankMatchState = (tx: BankTransactionLike): BankMatchState => {
  const amount = toFen(Number(tx.amount || 0));
  const remaining = bankRemainingFen(tx);
  if (remaining <= 0 && amount > 0) return "matched";
  if (remaining < amount) return "partial";
  return "unmatched";
};

export const MATCH_STATE_LABEL: Record<BankMatchState, string> = {
  matched: "已匹配",
  partial: "部分匹配",
  unmatched: "未匹配"
};

export const planAllocation = (
  txRemaining: number,
  invoiceBalance: number,
  amount: number
): { ok: true; amount: number } | { ok: false; error: string } => {
  const value = toFen(amount);
  if (!(value > 0)) return { ok: false, error: "匹配金额必须大于 0" };
  if (value > toFen(txRemaining)) return { ok: false, error: "匹配金额不能超过流水待匹配金额" };
  if (value > toFen(invoiceBalance)) return { ok: false, error: "匹配金额不能超过应收余额" };
  return { ok: true, amount: fromFen(value) };
};

export const suggestExactMatches = (
  transactions: Array<BankTransactionLike & { id: string }>,
  invoices: CollectableInvoice[]
): MatchSuggestion[] => {
  const working = invoices
    .filter((invoice) => toFen(invoice.balance) > 0)
    .map((invoice) => ({ ...invoice, balanceFen: toFen(invoice.balance) }));
  const suggestions: MatchSuggestion[] = [];

  transactions.forEach((tx) => {
    const remaining = bankRemainingFen(tx);
    if (remaining <= 0) return;
    const candidates = working.filter((invoice) => Math.abs(invoice.balanceFen - remaining) <= FEN_EPS);
    if (candidates.length !== 1) return;
    const invoice = candidates[0];
    if (!invoice) return;
    suggestions.push({
      txId: tx.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: fromFen(remaining),
      reason: `金额 ${fromFen(remaining).toFixed(2)} 与应收单 ${invoice.number} 余额完全相等，且该余额唯一`,
      confidence: "high"
    });
    invoice.balanceFen = 0;
  });

  return suggestions;
};
