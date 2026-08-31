export const BACKUP_TYPE = "utilora-finance-backup";
export const BACKUP_VERSION = 3;
export const SUPPORTED_BACKUP_VERSIONS = [2, 3];
export const STALE_BACKUP_DAYS = 7;

export const BACKUP_COLLECTIONS = [
  "customers",
  "items",
  "estimates",
  "invoices",
  "payments",
  "expenses",
  "reimbursements",
  "assets",
  "bankTransactions",
  "payrollRows",
  "accounts",
  "vouchers",
  "voucherTemplates",
  "collectionNotes"
] as const;

export const REQUIRED_BACKUP_COLLECTIONS = [
  "customers",
  "invoices",
  "payments",
  "bankTransactions",
  "expenses",
  "accounts"
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

export interface FinanceBackupData {
  company: Record<string, unknown>;
  closedMonths: string[];
  [key: string]: unknown;
}

export interface FinanceBackup {
  type: typeof BACKUP_TYPE;
  version: number;
  exportedAt: string;
  summary: Record<string, string | number>;
  data: FinanceBackupData;
}

export interface BackupStatus {
  lastBackupAt: string | null;
  ageDays: number;
  stale: boolean;
  label: string;
  reminder: string;
}

export interface ParseBackupResult {
  ok: boolean;
  error?: string;
  backup?: FinanceBackup;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const collectionCount = (data: Record<string, unknown> | undefined, key: string): number =>
  Array.isArray(data?.[key]) ? data[key].length : 0;

export const backupSummary = (data: Record<string, unknown>): Record<string, string | number> => {
  const company = isRecord(data.company) ? String(data.company.name || "未命名公司") : "未命名公司";
  const summary: Record<string, string | number> = { company };
  REQUIRED_BACKUP_COLLECTIONS.forEach((key) => {
    summary[key] = collectionCount(data, key);
  });
  summary.closedMonths = Array.isArray(data.closedMonths) ? data.closedMonths.length : 0;
  return summary;
};

export const buildBackup = (data: Record<string, unknown>, exportedAt: string): FinanceBackup => ({
  type: BACKUP_TYPE,
  version: BACKUP_VERSION,
  exportedAt,
  summary: backupSummary(data),
  data: {
    company: isRecord(data.company) ? data.company : { name: "未命名公司" },
    closedMonths: Array.isArray(data.closedMonths) ? data.closedMonths : [],
    ...Object.fromEntries(BACKUP_COLLECTIONS.map((key) => [key, Array.isArray(data[key]) ? data[key] : []]))
  }
});

export const parseBackup = (payload: unknown): ParseBackupResult => {
  if (!isRecord(payload)) return { ok: false, error: "备份不是有效的 JSON 对象" };
  if (payload.type !== BACKUP_TYPE) return { ok: false, error: "备份格式不正确" };
  if (!SUPPORTED_BACKUP_VERSIONS.includes(Number(payload.version))) return { ok: false, error: "备份版本不受支持" };
  if (!isRecord(payload.data) || !isRecord(payload.data.company)) return { ok: false, error: "备份缺少公司信息" };
  for (const key of BACKUP_COLLECTIONS) {
    if (payload.data[key] != null && !Array.isArray(payload.data[key])) {
      return { ok: false, error: `备份中的 ${key} 不是列表` };
    }
  }
  if (payload.data.closedMonths != null && !Array.isArray(payload.data.closedMonths)) {
    return { ok: false, error: "备份中的 closedMonths 不是列表" };
  }
  const backup = buildBackup(payload.data, String(payload.exportedAt || ""));
  backup.version = Number(payload.version);
  return { ok: true, backup };
};

export const backupStatus = (lastBackupAt: string | null | undefined, now = Date.now(), staleAfterDays = STALE_BACKUP_DAYS): BackupStatus => {
  if (!lastBackupAt) {
    return {
      lastBackupAt: null,
      ageDays: Number.POSITIVE_INFINITY,
      stale: true,
      label: "尚未导出备份",
      reminder: "尚未导出备份 · 建议立即备份"
    };
  }
  const timestamp = Date.parse(lastBackupAt);
  if (!Number.isFinite(timestamp)) {
    return backupStatus(null, now, staleAfterDays);
  }
  const ageDays = Math.floor((now - timestamp) / 86400000);
  const stale = ageDays > staleAfterDays;
  const formatted = new Date(timestamp).toLocaleString("zh-CN");
  return {
    lastBackupAt,
    ageDays,
    stale,
    label: `最近备份：${formatted}`,
    reminder: stale ? `最近备份：${formatted} · 已 ${ageDays} 天未备份` : `最近备份：${formatted} · 状态正常`
  };
};
