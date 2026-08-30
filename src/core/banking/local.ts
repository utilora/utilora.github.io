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
  customerName?: string;
  dueDate?: string;
  date?: string;
}

export type MatchConfidence = "high" | "medium";

export interface MatchSuggestion {
  txId: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  reason: string;
  confidence: MatchConfidence;
}

const FEN_EPS = 1;
export const DATE_NEAR_DAYS = 3;

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

export const daysApart = (left?: string, right?: string): number | null => {
  if (!left || !right) return null;
  const start = Date.parse(`${left}T00:00:00`);
  const end = Date.parse(`${right}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.abs(Math.floor((start - end) / 86400000));
};

const compactText = (value: string): string => normalizeSummary(value).replace(/\s+/g, "");

export const customerNamesInSummary = (summary: string, names: string[]): string[] => {
  const haystack = compactText(summary);
  const cleaned = [...new Set(names.map((name) => normalizeSummary(name)).filter((name) => compactText(name).length >= 2))];
  const hits = cleaned.filter((name) => haystack.includes(compactText(name)));
  return hits.filter((name) => !hits.some((other) => other !== name && compactText(other).includes(compactText(name))));
};

type WorkingInvoice = CollectableInvoice & { balanceFen: number };

const sameAmount = (invoice: WorkingInvoice, remainingFen: number): boolean =>
  invoice.balanceFen > 0 && Math.abs(invoice.balanceFen - remainingFen) <= FEN_EPS;

const invoiceAnchorDate = (invoice: CollectableInvoice): string | undefined => invoice.dueDate || invoice.date;

export const suggestMatches = (
  transactions: Array<BankTransactionLike & { id: string }>,
  invoices: CollectableInvoice[]
): MatchSuggestion[] => {
  const working: WorkingInvoice[] = invoices
    .filter((invoice) => toFen(invoice.balance) > 0)
    .map((invoice) => ({ ...invoice, balanceFen: toFen(invoice.balance) }));
  const suggestions: MatchSuggestion[] = [];
  const usedTx = new Set<string>();

  const consume = (tx: BankTransactionLike & { id: string }, invoice: WorkingInvoice, reason: string, confidence: MatchConfidence) => {
    suggestions.push({
      txId: tx.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: fromFen(bankRemainingFen(tx)),
      reason,
      confidence
    });
    invoice.balanceFen = 0;
    usedTx.add(tx.id);
  };

  transactions.forEach((tx) => {
    const remaining = bankRemainingFen(tx);
    if (remaining <= 0) return;
    const candidates = working.filter((invoice) => sameAmount(invoice, remaining));
    if (candidates.length !== 1 || !candidates[0]) return;
    const invoice = candidates[0];
    consume(
      tx,
      invoice,
      `金额 ${fromFen(remaining).toFixed(2)} 与应收单 ${invoice.number} 余额完全相等，且该余额唯一`,
      "high"
    );
  });

  transactions.forEach((tx) => {
    if (usedTx.has(tx.id)) return;
    const remaining = bankRemainingFen(tx);
    if (remaining <= 0) return;
    const names = customerNamesInSummary(
      String(tx.summary || ""),
      working.filter((invoice) => invoice.balanceFen > 0).map((invoice) => invoice.customerName || "")
    );
    if (names.length !== 1 || !names[0]) return;
    const customerName = names[0];
    const candidates = working.filter((invoice) =>
      sameAmount(invoice, remaining) && normalizeSummary(invoice.customerName || "") === customerName
    );
    if (candidates.length !== 1 || !candidates[0]) return;
    const invoice = candidates[0];
    consume(
      tx,
      invoice,
      `摘要含客户「${customerName}」，金额 ${fromFen(remaining).toFixed(2)} 与应收单 ${invoice.number} 余额相等`,
      "high"
    );
  });

  transactions.forEach((tx) => {
    if (usedTx.has(tx.id)) return;
    const remaining = bankRemainingFen(tx);
    if (remaining <= 0) return;
    const dated = working
      .filter((invoice) => sameAmount(invoice, remaining))
      .map((invoice) => ({ invoice, days: daysApart(String(tx.date || ""), invoiceAnchorDate(invoice)) }))
      .filter((item) => item.days !== null && item.days <= DATE_NEAR_DAYS);
    if (dated.length !== 1 || !dated[0]) return;
    const { invoice, days } = dated[0];
    consume(
      tx,
      invoice,
      `金额 ${fromFen(remaining).toFixed(2)} 与应收单 ${invoice.number} 余额相等，且流水日期与到期日相差 ${days} 天`,
      "medium"
    );
  });

  return suggestions;
};

export const suggestExactMatches = (
  transactions: Array<BankTransactionLike & { id: string }>,
  invoices: CollectableInvoice[]
): MatchSuggestion[] =>
  suggestMatches(transactions, invoices).filter((item) => item.reason.includes("该余额唯一"));

