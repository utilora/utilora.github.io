import { getSupabase } from "../../core/supabase/client";
import type { UUID } from "../../shared/types/database";

export const listUnmatchedTransactions = async (organizationId: UUID) => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("bank_transactions")
    .select("id,bank_account_id,transaction_date,amount,counterparty,reference")
    .eq("organization_id", organizationId)
    .is("matched_payment_id", null)
    .order("transaction_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
};