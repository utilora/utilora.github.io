import { getSupabase } from "../../core/supabase/client";
import type { UUID } from "../../shared/types/database";

export const postVoucher = async (voucherId: UUID): Promise<void> => {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured");
  const { error } = await client.rpc("post_voucher", { target_voucher_id: voucherId });
  if (error) throw error;
};

export const closeFiscalPeriod = async (periodId: UUID): Promise<void> => {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured");
  const { error } = await client.rpc("close_fiscal_period", { target_period_id: periodId });
  if (error) throw error;
};