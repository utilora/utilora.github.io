import { fromFen, toFen } from "../banking/local";

export type AgingBucket = "current" | "d30" | "d60" | "d90" | "over90";

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "未到期",
  d30: "逾期 1–30 天",
  d60: "逾期 31–60 天",
  d90: "逾期 61–90 天",
  over90: "逾期 90 天以上"
};

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

export const agingBucket = (dueDate: string | undefined, asOf: string): AgingBucket => {
  const days = daysOverdue(dueDate, asOf);
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "over90";
};

export const openReceivables = (invoices: ReceivableInvoice[]): ReceivableInvoice[] =>
  invoices.filter((invoice) => isOpenReceivableStatus(invoice.status) && remainingOf(invoice) > 0);

export const summarizeAging = (invoices: ReceivableInvoice[], asOf: string): AgingTotals => {
  const totals = emptyAging();
  openReceivables(invoices).forEach((invoice) => {
    const bucket = agingBucket(invoice.dueDate, asOf);
    totals[bucket] = fromFen(toFen(totals[bucket]) + toFen(remainingOf(invoice)));
  });
  return totals;
};

export const customerDebts = (invoices: ReceivableInvoice[], asOf: string): CustomerDebt[] => {
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
    const bucket = agingBucket(invoice.dueDate, asOf);
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

export const collectionProgress = (invoices: ReceivableInvoice[], asOf: string): CollectionProgress => {
  const relevant = invoices.filter((invoice) => isOpenReceivableStatus(invoice.status));
  const issuedFen = relevant.reduce((sum, invoice) => sum + toFen(invoice.total), 0);
  const collectedFen = relevant.reduce((sum, invoice) => sum + Math.min(toFen(invoice.paid), toFen(invoice.total)), 0);
  const open = openReceivables(relevant);
  const overdue = open.filter((invoice) => agingBucket(invoice.dueDate, asOf) !== "current");
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

export const agingTotalsMatchOpen = (invoices: ReceivableInvoice[], asOf: string): boolean => {
  const aging = summarizeAging(invoices, asOf);
  const openFen = openReceivables(invoices).reduce((sum, invoice) => sum + toFen(remainingOf(invoice)), 0);
  const bucketFen = toFen(aging.current) + toFen(aging.d30) + toFen(aging.d60) + toFen(aging.d90) + toFen(aging.over90);
  return openFen === bucketFen;
};
