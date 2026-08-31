export interface PendingBankTransaction {
  id: string;
  amount?: number;
  paymentId?: string;
  allocations?: Array<{ amount?: number }>;
  ignored?: boolean;
}

const toFen = (value: number | undefined): number => Math.round((Number(value) || 0) * 100);

export const allocatedFen = (tx: PendingBankTransaction): number => {
  if (tx.paymentId) return toFen(tx.amount);
  return (tx.allocations || []).reduce((sum, item) => sum + toFen(item.amount), 0);
};

export const remainingFen = (tx: PendingBankTransaction): number =>
  Math.max(0, toFen(tx.amount) - allocatedFen(tx));

export const isPendingBankTransaction = (tx: PendingBankTransaction): boolean =>
  !tx.ignored && remainingFen(tx) > 0;

export const pendingBankTransactions = <T extends PendingBankTransaction>(transactions: T[]): T[] =>
  transactions.filter(isPendingBankTransaction);
