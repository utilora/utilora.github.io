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