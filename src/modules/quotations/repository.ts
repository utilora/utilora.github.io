import { getSupabase } from "../../core/supabase/client";
import type { UUID } from "../../shared/types/database";

export interface QuotationSummary {
  id: UUID;
  document_number: string;
  customer_id: UUID | null;
  status: string;
  issue_date: string;
  grand_total: string;
  version: number;
}

export const listQuotations = async (organizationId: UUID): Promise<QuotationSummary[]> => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("quotations")
    .select("id,document_number,customer_id,status,issue_date,grand_total,version")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuotationSummary[];
};