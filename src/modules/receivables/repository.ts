import { getSupabase } from "../../core/supabase/client";
import type { UUID } from "../../shared/types/database";

export interface ReceivableSummary {
  id: UUID;
  document_number: string;
  customer_id: UUID | null;
  status: string;
  due_date: string | null;
  grand_total: string;
  paid_total: string;
}

export const listOpenReceivables = async (organizationId: UUID): Promise<ReceivableSummary[]> => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("invoices")
    .select("id,document_number,customer_id,status,due_date,grand_total,paid_total")
    .eq("organization_id", organizationId)
    .in("status", ["issued", "partial"])
    .is("deleted_at", null)
    .order("due_date");
  if (error) throw error;
  return (data ?? []) as ReceivableSummary[];
};