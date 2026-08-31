export const BACKUP_TYPE = "utilora-finance-backup";
export const BACKUP_VERSION = 3;
export const ENCRYPTED_BACKUP_VERSION = 4;
export const SUPPORTED_BACKUP_VERSIONS = [2, 3];
export const STALE_BACKUP_DAYS = 7;
export const BACKUP_PASSPHRASE_MIN = 8;
export const BACKUP_KDF_ITERATIONS = 210000;

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
  "collectionNotes",
  "monthEndCloses"
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

export interface EncryptedBackup {
  type: typeof BACKUP_TYPE;
  version: number;
  enc: true;
  kdf: "PBKDF2-SHA-256";
  iter: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface ParseBackupResult {
  ok: boolean;
  error?: string;
  backup?: FinanceBackup;
}

export interface BackupPreview {
  company: string;
  customers: number;
  invoices: number;
  payments: number;
  bankTransactions: number;
  expenses: number;
  accounts: number;
  closedMonths: number;
  exportedAt: string;
  label: string;
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
  if (payload.enc === true) return { ok: false, error: "这是加密备份，请先输入口令" };
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

const countOf = (summary: Record<string, string | number>, key: string): number => {
  const value = Number(summary[key] || 0);
  return Number.isFinite(value) ? value : 0;
};

export const previewFromSummary = (
  summary: Record<string, string | number>,
  exportedAt = ""
): BackupPreview => {
  const company = String(summary.company || "未命名公司");
  const customers = countOf(summary, "customers");
  const invoices = countOf(summary, "invoices");
  const payments = countOf(summary, "payments");
  const bankTransactions = countOf(summary, "bankTransactions");
  const expenses = countOf(summary, "expenses");
  const accounts = countOf(summary, "accounts");
  const closedMonths = countOf(summary, "closedMonths");
  return {
    company,
    customers,
    invoices,
    payments,
    bankTransactions,
    expenses,
    accounts,
    closedMonths,
    exportedAt,
    label: `公司：${company} · 客户 ${customers} · 应收 ${invoices} · 收款 ${payments} · 流水 ${bankTransactions} · 费用 ${expenses} · 科目 ${accounts}`
  };
};

export const previewBackup = (backup: FinanceBackup): BackupPreview =>
  previewFromSummary(backup.summary, backup.exportedAt);

export const previewWorkspace = (data: Record<string, unknown>, exportedAt = ""): BackupPreview =>
  previewFromSummary(backupSummary(data), exportedAt);

export const companyMismatch = (currentName: string, previewCompany: string): boolean => {
  const current = String(currentName || "").trim();
  const next = String(previewCompany || "").trim();
  return Boolean(current && next && current !== next);
};

export const closeBackupWarning = (status: BackupStatus): string | null => {
  if (!status.stale) return null;
  return status.lastBackupAt
    ? `关账前建议先导出备份。${status.reminder}`
    : "关账前尚未导出备份，建议先到设置页导出完整备份。";
};

export const shouldRecordBackupTime = (confirmed: boolean, demoMode: boolean): boolean =>
  Boolean(confirmed) && !demoMode;

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
};

const base64ToBytes = (value: string): Uint8Array => {
  if (typeof atob === "function") {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 255;
    return out;
  }
  return new Uint8Array(Buffer.from(value, "base64"));
};

export const isEncryptedBackup = (payload: unknown): payload is EncryptedBackup =>
  isRecord(payload) && payload.type === BACKUP_TYPE && payload.enc === true && Boolean(payload.ciphertext);

const deriveBackupKey = async (passphrase: string, salt: Uint8Array, usages: KeyUsage[], iterations: number) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
};

export const encryptBackup = async (backup: FinanceBackup, passphrase: string): Promise<EncryptedBackup> => {
  const pass = String(passphrase || "");
  if (pass.length < BACKUP_PASSPHRASE_MIN) throw new Error("口令至少 8 位");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(pass, salt, ["encrypt"], BACKUP_KDF_ITERATIONS);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(JSON.stringify(backup)));
  return {
    type: BACKUP_TYPE,
    version: ENCRYPTED_BACKUP_VERSION,
    enc: true,
    kdf: "PBKDF2-SHA-256",
    iter: BACKUP_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipher))
  };
};

export const decryptBackup = async (payload: unknown, passphrase: string): Promise<ParseBackupResult> => {
  if (!isEncryptedBackup(payload)) return { ok: false, error: "不是加密备份" };
  const pass = String(passphrase || "");
  if (!pass) return { ok: false, error: "请输入备份口令" };
  try {
    const salt = base64ToBytes(String(payload.salt || ""));
    const iv = base64ToBytes(String(payload.iv || ""));
    const ciphertext = base64ToBytes(String(payload.ciphertext || ""));
    if (salt.length < 16 || iv.length < 12 || ciphertext.length < 16) {
      return { ok: false, error: "加密备份损坏" };
    }
    const iterations = Number(payload.iter) > 10000 ? Number(payload.iter) : BACKUP_KDF_ITERATIONS;
    const key = await deriveBackupKey(pass, salt, ["decrypt"], iterations);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
    return parseBackup(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    return { ok: false, error: "口令不对，无法预览备份内容" };
  }
};
