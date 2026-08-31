import type { User } from "@supabase/supabase-js";
import { environment } from "../../app/config/env";
import type { EffectiveEntitlement, PlanCode } from "../../shared/types/database";
import { getSupabase } from "../supabase/client";

const empty: EffectiveEntitlement = {
  authenticated: false,
  plan: "free",
  proAccess: false,
  source: "none",
  expiresAt: null
};

export const PLAN_LABEL: Record<PlanCode, string> = {
  free: "免费账户",
  pro_trial: "专业版试用",
  pro: "专业版"
};

export const ACCOUNT_BACKUP_HREF = "../pro/#/settings";
export const ACCOUNT_WORKSPACE_HREF = "../pro/";
export const ACCOUNT_BACKUP_LABEL = "导出完整备份";

export interface EntitlementView {
  planLabel: string;
  expiryLabel: string;
  accessLabel: string;
  summary: string;
  badge: string;
  backupHref: string;
  backupLabel: string;
  workspaceHref: string;
  expired: boolean;
  proAccess: boolean;
}

const emptyView = (): EntitlementView => ({
  planLabel: "未登录",
  expiryLabel: "—",
  accessLabel: "登录后查看",
  summary: "登录后可查看方案、到期日，并进入备份入口。",
  badge: "未登录",
  backupHref: ACCOUNT_BACKUP_HREF,
  backupLabel: ACCOUNT_BACKUP_LABEL,
  workspaceHref: ACCOUNT_WORKSPACE_HREF,
  expired: false,
  proAccess: false
});

export const formatExpiryDay = (iso: string | null | undefined): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "").trim());
  if (!match) return null;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
};

export const resolveLocalEntitlement = (user: User | null, openAccess = environment.proOpenAccess): EffectiveEntitlement => {
  if (!user) return empty;
  if (openAccess) return { authenticated: true, plan: "pro_trial", proAccess: true, source: "promotion", expiresAt: null };

  const metadata = user.app_metadata ?? {};
  const plan = (metadata.plan as PlanCode | undefined) ?? "free";
  const expiresAt = typeof metadata.pro_until === "string" ? metadata.pro_until : null;
  const active = plan === "pro" || plan === "pro_trial" || Boolean(expiresAt && Date.parse(expiresAt) > Date.now());
  return {
    authenticated: true,
    plan: active ? plan : "free",
    proAccess: active,
    source: active ? "subscription" : "none",
    expiresAt
  };
};

export const getEffectiveEntitlement = async (user: User | null): Promise<EffectiveEntitlement> => {
  if (!user) return empty;
  const client = getSupabase();
  if (!client) return resolveLocalEntitlement(user);

  const { data, error } = await client.rpc("get_my_effective_entitlement");
  if (error || !data) return resolveLocalEntitlement(user, false);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    authenticated: true,
    plan: (row?.plan_code ?? "free") as PlanCode,
    proAccess: Boolean(row?.pro_access),
    source: (row?.source ?? "none") as EffectiveEntitlement["source"],
    expiresAt: row?.expires_at ?? null
  };
};

export const describeEntitlement = (entitlement: EffectiveEntitlement, now = Date.now()): EntitlementView => {
  if (!entitlement.authenticated) return emptyView();

  const day = formatExpiryDay(entitlement.expiresAt);
  const expiresAtMs = entitlement.expiresAt ? Date.parse(entitlement.expiresAt) : Number.NaN;
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= now;
  const planBase = PLAN_LABEL[entitlement.plan] || PLAN_LABEL.free;
  const planLabel = entitlement.source === "promotion"
    ? "专业版（限时免费）"
    : entitlement.source === "grant"
      ? `${entitlement.plan === "free" ? PLAN_LABEL.pro : planBase}（人工开通）`
      : planBase;
  const expiryLabel = expired && day
    ? `${day}已过期`
    : day
      ? `${day}到期`
      : entitlement.source === "promotion"
        ? "促销期内不过期"
        : "无到期日";
  const live = Boolean(entitlement.proAccess) && !expired;

  let summary: string;
  if (expired) {
    summary = "专业版已到期。本地财务数据仍可查看和完整导出，不会被锁住。";
  } else if (!live) {
    summary = "五个财税工具永久免费。专业财务台需开通后使用。本地数据仍可查看和导出。";
  } else if (entitlement.source === "promotion") {
    summary = day
      ? `限免至${day}。正式收费前会提前通知，不会自动扣费。到期后仍可查看和导出本地数据。`
      : "内测限免期间可使用本地财务台。正式收费前会提前通知，不会自动扣费。";
  } else if (day) {
    summary = `专业版可用至${day}。到期后仍可查看和导出本地数据。`;
  } else {
    summary = "专业版已开通。数据保存在当前浏览器，请定期导出备份。";
  }

  return {
    planLabel,
    expiryLabel,
    accessLabel: live ? "可使用工作台" : "可查看与导出",
    summary,
    badge: planLabel,
    backupHref: ACCOUNT_BACKUP_HREF,
    backupLabel: ACCOUNT_BACKUP_LABEL,
    workspaceHref: ACCOUNT_WORKSPACE_HREF,
    expired,
    proAccess: live
  };
};
