import type { Organization, OrganizationMembership, UUID } from "../../shared/types/database";
import { getSupabase } from "../supabase/client";

const ACTIVE_ORG_KEY = "utilora.activeOrganization";

export interface OrganizationContext {
  organization: Organization;
  membership: OrganizationMembership;
}

export const listOrganizations = async (): Promise<OrganizationContext[]> => {
  const client = getSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("organization_members")
    .select("organization_id,user_id,role,joined_at,organizations(*)")
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    organization: row.organizations as Organization,
    membership: {
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at
    }
  }));
};

export const getActiveOrganizationId = (): UUID | null => localStorage.getItem(ACTIVE_ORG_KEY);
export const setActiveOrganizationId = (id: UUID): void => localStorage.setItem(ACTIVE_ORG_KEY, id);