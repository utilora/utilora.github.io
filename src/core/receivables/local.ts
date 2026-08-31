import { fromFen, toFen } from "../banking/local";

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "over90";

export interface AgingBounds {
  bucket1: number;
  bucket2: number;
  bucket3: number;
}

export const DEFAULT_AGING_BOUNDS: AgingBounds = { bucket1: 30, bucket2: 60, bucket3: 90 };

export const normalizeAgingBounds = (raw?: Partial<AgingBounds> | null): AgingBounds => {
  const bucket1 = Number(raw?.bucket1);
  const bucket2 = Number(raw?.bucket2);
  const bucket3 = Number(raw?.bucket3);
  if (
    Number.isInteger(bucket1) &&
    Number.isInteger(bucket2) &&
    Number.isInteger(bucket3) &&
    bucket1 > 0 &&
    bucket1 < bucket2 &&
    bucket2 < bucket3 &&
    bucket3 <= 365
  ) {
    return { bucket1, bucket2, bucket3 };
  }
  return DEFAULT_AGING_BOUNDS;
};

export const agingBucketLabels = (bounds?: Partial<AgingBounds> | null): Record<AgingBucket, string> => {
  const { bucket1, bucket2, bucket3 } = normalizeAgingBounds(bounds);
  return {
    current: "未到期",
    d30: `逾期 1–${bucket1} 天`,
    d60: `逾期 ${bucket1 + 1}–${bucket2} 天`,
    d90: `逾期 ${bucket2 + 1}–${bucket3} 天`,
    over90: `逾期 ${bucket3} 天以上`
  };
};

export const agingBucketShortLabels = (bounds?: Partial<AgingBounds> | null): Record<AgingBucket, string> => {
  const { bucket1, bucket2, bucket3 } = normalizeAgingBounds(bounds);
  return {
    current: "未到期",
    d30: `1–${bucket1} 天`,
    d60: `${bucket1 + 1}–${bucket2} 天`,
    d90: `${bucket2 + 1}–${bucket3} 天`,
    over90: `${bucket3} 天以上`
  };
};

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = agingBucketLabels(DEFAULT_AGING_BOUNDS);

export interface ReceivableInvoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  dueDate?: string;
  status: string;
  total: number;
  paid: number;
}

export interface AgingTotals {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  over90: number;
}

export interface CustomerDebt {
  customerId: string;
  customerName: string;
  openCount: number;
  openAmount: number;
  overdueAmount: number;
  overdueCount: number;
  aging: AgingTotals;
}

export interface CollectionProgress {
  issuedTotal: number;
  collectedTotal: number;
  openTotal: number;
  overdueTotal: number;
  settledCount: number;
  openCount: number;
  overdueCount: number;
  collectedRate: number;
}

const emptyAging = (): AgingTotals => ({ current: 0, d30: 0, d60: 0, d90: 0, over90: 0 });

export const isOpenReceivableStatus = (status: string): boolean =>
  status !== "draft" && status !== "void";

export const remainingOf = (invoice: Pick<ReceivableInvoice, "total" | "paid">): number =>
  fromFen(Math.max(0, toFen(invoice.total) - toFen(invoice.paid)));

export const daysOverdue = (dueDate: string | undefined, asOf: string): number => {
  if (!dueDate) return 0;
  const due = Date.parse(`${dueDate}T00:00:00`);
  const today = Date.parse(`${asOf}T00:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.floor((today - due) / 86400000);
};

export const agingBucket = (
  dueDate: string | undefined,
  asOf: string,
  bounds?: Partial<AgingBounds> | null
): AgingBucket => {
  const days = daysOverdue(dueDate, asOf);
  const { bucket1, bucket2, bucket3 } = normalizeAgingBounds(bounds);
  if (days <= 0) return "current";
  if (days <= bucket1) return "d30";
  if (days <= bucket2) return "d60";
  if (days <= bucket3) return "d90";
  return "over90";
};

export const openReceivables = (invoices: ReceivableInvoice[]): ReceivableInvoice[] =>
  invoices.filter((invoice) => isOpenReceivableStatus(invoice.status) && remainingOf(invoice) > 0);

const parseDay = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
};

const formatDay = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const mondayOf = (asOf: string): string => {
  const date = parseDay(asOf);
  const weekday = date.getDay();
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return formatDay(date);
};

export const sundayOf = (asOf: string): string => {
  const date = parseDay(mondayOf(asOf));
  date.setDate(date.getDate() + 6);
  return formatDay(date);
};

/** 今日该催：到期日已到或已过，仍未收完 */
export const collectToday = (invoices: ReceivableInvoice[], asOf: string): ReceivableInvoice[] =>
  openReceivables(invoices)
    .filter((invoice) => typeof invoice.dueDate === "string" && invoice.dueDate <= asOf)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

/** 本周到期：今天到本周日（含今天）仍未收完 */
export const dueThisWeek = (invoices: ReceivableInvoice[], asOf: string): ReceivableInvoice[] => {
  const end = sundayOf(asOf);
  return openReceivables(invoices)
    .filter((invoice) => typeof invoice.dueDate === "string" && invoice.dueDate >= asOf && invoice.dueDate <= end)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
};

export const amountOf = (invoices: ReceivableInvoice[]): number =>
  fromFen(invoices.reduce((sum, invoice) => sum + toFen(remainingOf(invoice)), 0));

export const COLLECTION_RESULTS = ["missed", "promised", "paid"] as const;
export type CollectionResult = (typeof COLLECTION_RESULTS)[number];

export const COLLECTION_RESULT_LABEL: Record<CollectionResult, string> = {
  missed: "未接",
  promised: "已答应",
  paid: "已付"
};

export interface CollectionNote {
  id: string;
  customerId: string;
  contactedOn: string;
  promisedOn?: string;
  result: CollectionResult;
  note?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isCollectionResult = (value: string): value is CollectionResult =>
  (COLLECTION_RESULTS as readonly string[]).includes(value);

export const validateCollectionNote = (
  input: {
    id?: string;
    customerId?: string;
    contactedOn?: string;
    promisedOn?: string;
    result?: string;
    note?: string;
  }
): { ok: true; note: CollectionNote } | { ok: false; error: string } => {
  const customerId = String(input.customerId || "").trim();
  if (!customerId) return { ok: false, error: "请选择客户" };
  const contactedOn = String(input.contactedOn || "").trim();
  if (!ISO_DAY.test(contactedOn)) return { ok: false, error: "请填写联系日" };
  const result = String(input.result || "").trim();
  if (!isCollectionResult(result)) return { ok: false, error: "结果须为未接、已答应或已付" };
  const promisedOn = String(input.promisedOn || "").trim();
  if (promisedOn && !ISO_DAY.test(promisedOn)) return { ok: false, error: "承诺还款日格式不正确" };
  if (result === "promised" && !promisedOn) return { ok: false, error: "已答应必须填写承诺还款日" };
  return {
    ok: true,
    note: {
      id: String(input.id || "").trim(),
      customerId,
      contactedOn,
      promisedOn: promisedOn || undefined,
      result,
      note: String(input.note || "").trim() || undefined
    }
  };
};

export const notesForCustomer = (notes: CollectionNote[], customerId: string): CollectionNote[] =>
  notes
    .filter((item) => item.customerId === customerId)
    .sort((a, b) => String(b.contactedOn).localeCompare(String(a.contactedOn)) || String(b.id).localeCompare(String(a.id)));

export const latestNote = (notes: CollectionNote[], customerId: string): CollectionNote | null =>
  notesForCustomer(notes, customerId)[0] || null;

export const promisedOnDay = (notes: CollectionNote[], asOf: string): CollectionNote[] =>
  notes.filter((item) => item.result === "promised" && item.promisedOn === asOf);



export const summarizeAging = (
  invoices: ReceivableInvoice[],
  asOf: string,
  bounds?: Partial<AgingBounds> | null
): AgingTotals => {
  const totals = emptyAging();
  openReceivables(invoices).forEach((invoice) => {
    const bucket = agingBucket(invoice.dueDate, asOf, bounds);
    totals[bucket] = fromFen(toFen(totals[bucket]) + toFen(remainingOf(invoice)));
  });
  return totals;
};

export const customerDebts = (
  invoices: ReceivableInvoice[],
  asOf: string,
  bounds?: Partial<AgingBounds> | null
): CustomerDebt[] => {
  const map = new Map<string, CustomerDebt>();
  openReceivables(invoices).forEach((invoice) => {
    const key = invoice.customerId || invoice.customerName || invoice.id;
    const current = map.get(key) || {
      customerId: invoice.customerId,
      customerName: invoice.customerName || "未选客户",
      openCount: 0,
      openAmount: 0,
      overdueAmount: 0,
      overdueCount: 0,
      aging: emptyAging()
    };
    const remaining = remainingOf(invoice);
    const bucket = agingBucket(invoice.dueDate, asOf, bounds);
    current.openCount += 1;
    current.openAmount = fromFen(toFen(current.openAmount) + toFen(remaining));
    current.aging[bucket] = fromFen(toFen(current.aging[bucket]) + toFen(remaining));
    if (bucket !== "current") {
      current.overdueCount += 1;
      current.overdueAmount = fromFen(toFen(current.overdueAmount) + toFen(remaining));
    }
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => toFen(b.openAmount) - toFen(a.openAmount));
};

export const collectionProgress = (
  invoices: ReceivableInvoice[],
  asOf: string,
  bounds?: Partial<AgingBounds> | null
): CollectionProgress => {
  const relevant = invoices.filter((invoice) => isOpenReceivableStatus(invoice.status));
  const issuedFen = relevant.reduce((sum, invoice) => sum + toFen(invoice.total), 0);
  const collectedFen = relevant.reduce((sum, invoice) => sum + Math.min(toFen(invoice.paid), toFen(invoice.total)), 0);
  const open = openReceivables(relevant);
  const overdue = open.filter((invoice) => agingBucket(invoice.dueDate, asOf, bounds) !== "current");
  const openFen = open.reduce((sum, invoice) => sum + toFen(remainingOf(invoice)), 0);
  const overdueFen = overdue.reduce((sum, invoice) => sum + toFen(remainingOf(invoice)), 0);
  return {
    issuedTotal: fromFen(issuedFen),
    collectedTotal: fromFen(collectedFen),
    openTotal: fromFen(openFen),
    overdueTotal: fromFen(overdueFen),
    settledCount: relevant.filter((invoice) => remainingOf(invoice) <= 0).length,
    openCount: open.length,
    overdueCount: overdue.length,
    collectedRate: issuedFen > 0 ? Math.round((collectedFen / issuedFen) * 100) : 0
  };
};

export const agingTotalsMatchOpen = (
  invoices: ReceivableInvoice[],
  asOf: string,
  bounds?: Partial<AgingBounds> | null
): boolean => {
  const aging = summarizeAging(invoices, asOf, bounds);
  const openFen = openReceivables(invoices).reduce((sum, invoice) => sum + toFen(remainingOf(invoice)), 0);
  const bucketFen = toFen(aging.current) + toFen(aging.d30) + toFen(aging.d60) + toFen(aging.d90) + toFen(aging.over90);
  return openFen === bucketFen;
};
