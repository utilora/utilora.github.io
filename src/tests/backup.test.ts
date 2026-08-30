import { describe, expect, it } from "vitest";
import {
  BACKUP_TYPE,
  backupStatus,
  buildBackup,
  parseBackup
} from "../core/backup/local";

const workspace = {
  company: { name: "星海贸易" },
  customers: [{ id: "c1", name: "北岸" }],
  invoices: [{ id: "v1", number: "AR-1" }],
  payments: [{ id: "p1", amount: 100 }],
  bankTransactions: [{ id: "b1", amount: 100 }],
  expenses: [{ id: "x1", amount: 20 }],
  accounts: [{ id: "a1", code: "1002" }],
  closedMonths: ["2026-07"]
};

describe("finance backup export", () => {
  it("exports customers, invoices, payments, bank, expenses and accounts", () => {
    const backup = buildBackup(workspace, "2026-08-30T00:00:00.000Z");
    expect(backup.type).toBe(BACKUP_TYPE);
    expect(backup.version).toBe(3);
    expect(backup.summary).toMatchObject({
      company: "星海贸易",
      customers: 1,
      invoices: 1,
      payments: 1,
      bankTransactions: 1,
      expenses: 1,
      accounts: 1
    });
    expect(backup.data.bankTransactions).toHaveLength(1);
    expect(backup.data.accounts).toHaveLength(1);
    expect(backup.data.expenses).toHaveLength(1);
  });
});

describe("finance backup restore", () => {
  it("restores a v2 backup that omitted later collections", () => {
    const parsed = parseBackup({
      type: BACKUP_TYPE,
      version: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      data: {
        company: { name: "旧账套" },
        customers: [{ id: "c1" }],
        invoices: [{ id: "v1" }],
        payments: []
      }
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.backup?.data.company).toMatchObject({ name: "旧账套" });
    expect(parsed.backup?.data.customers).toHaveLength(1);
    expect(parsed.backup?.data.bankTransactions).toEqual([]);
    expect(parsed.backup?.data.expenses).toEqual([]);
    expect(parsed.backup?.data.accounts).toEqual([]);
  });

  it("rejects incomplete or invalid backups", () => {
    expect(parseBackup({ type: "other", version: 3, data: { company: {} } }).ok).toBe(false);
    expect(parseBackup({ type: BACKUP_TYPE, version: 1, data: { company: {} } }).ok).toBe(false);
    expect(parseBackup({ type: BACKUP_TYPE, version: 3, data: { company: { name: "x" }, invoices: {} } }).ok).toBe(false);
  });
});

describe("backup reminders", () => {
  const now = Date.parse("2026-08-30T00:00:00.000Z");

  it("marks missing and stale backups", () => {
    expect(backupStatus(null, now).stale).toBe(true);
    expect(backupStatus(null, now).reminder).toContain("尚未导出备份");
    const stale = backupStatus("2026-08-01T00:00:00.000Z", now);
    expect(stale.stale).toBe(true);
    expect(stale.ageDays).toBe(29);
    expect(stale.reminder).toContain("已 29 天未备份");
  });

  it("keeps a recent backup off the reminder", () => {
    const fresh = backupStatus("2026-08-28T00:00:00.000Z", now);
    expect(fresh.stale).toBe(false);
    expect(fresh.label).toContain("最近备份");
  });
});
