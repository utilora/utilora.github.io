import { environment } from "./app/config/env";
import { getUser } from "./core/auth/session";
import {
  describeEntitlement,
  getEffectiveEntitlement,
  resolveLocalEntitlement,
  type EntitlementView
} from "./core/entitlements/service";
import type { EffectiveEntitlement, PlanCode } from "./shared/types/database";

type AuthUser = { id?: string; email?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> };

declare global {
  interface Window {
    UtiloraEntitlements: {
      describeEntitlement: typeof describeEntitlement;
    };
    UtiloraAuth?: {
      readSession?: () => { user?: AuthUser; access_token?: string } | null;
    };
  }
}

window.UtiloraEntitlements = { describeEntitlement };

const setText = (id: string, text: string): void => {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
};

export const paintEntitlement = (view: EntitlementView): void => {
  setText("plan-badge", view.badge);
  setText("plan-name", view.planLabel);
  setText("plan-expiry", view.expiryLabel);
  setText("plan-access", view.accessLabel);
  setText("plan-copy", view.summary);
  const badge = document.getElementById("plan-badge");
  if (badge) badge.className = `plan-pill${view.proAccess ? " on" : ""}`;
  const backup = document.getElementById("plan-backup") as HTMLAnchorElement | null;
  if (backup) {
    backup.href = view.backupHref;
    backup.textContent = view.backupLabel;
  }
  const workspace = document.getElementById("plan-workspace") as HTMLAnchorElement | null;
  if (workspace) workspace.href = view.workspaceHref;
};

const sessionUser = (): AuthUser | null => window.UtiloraAuth?.readSession?.()?.user ?? null;

const asUser = (user: AuthUser) => user as never;

const fromRpcRow = (row: Record<string, unknown> | null | undefined): EffectiveEntitlement | null => {
  if (!row || typeof row !== "object") return null;
  return {
    authenticated: true,
    plan: ((row.plan_code as PlanCode | undefined) ?? "free") as PlanCode,
    proAccess: Boolean(row.pro_access),
    source: ((row.source as EffectiveEntitlement["source"] | undefined) ?? "none"),
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null
  };
};

const loadEntitlement = async (user: AuthUser): Promise<EffectiveEntitlement> => {
  const token = window.UtiloraAuth?.readSession?.()?.access_token;
  if (token) {
    try {
      const response = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/get_my_effective_entitlement`, {
        method: "POST",
        headers: {
          apikey: environment.supabaseAnonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      if (response.ok) {
        const data: unknown = await response.json();
        const row = Array.isArray(data) ? data[0] : data;
        const parsed = fromRpcRow(row as Record<string, unknown>);
        if (parsed) return parsed;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    return await getEffectiveEntitlement(asUser(user));
  } catch {
    return resolveLocalEntitlement(asUser(user));
  }
};

const start = async (): Promise<void> => {
  const user = (await getUser().catch(() => null)) || sessionUser();
  if (!user) return;
  paintEntitlement(describeEntitlement(await loadEntitlement(user)));
};

void start().catch(() => {
  const user = sessionUser();
  if (!user) return;
  paintEntitlement(describeEntitlement(resolveLocalEntitlement(asUser(user))));
});
