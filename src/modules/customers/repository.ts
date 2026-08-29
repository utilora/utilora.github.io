import { getSupabase } from "../../core/supabase/client";
import type { Customer, UUID } from "../../shared/types/database";

export const listCustomers = async (organizationId: UUID): Promise<Customer[]> => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Customer[];
};