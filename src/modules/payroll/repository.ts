import { getSupabase } from "../../core/supabase/client";
import type { UUID } from "../../shared/types/database";

export const listPayrollRuns = async (organizationId: UUID) => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("payroll_runs")
    .select("id,fiscal_period_id,name,status,gross_total,individual_tax_total,net_total,version")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};