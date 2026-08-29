export type UUID = string;
export type MembershipRole = "owner" | "admin" | "accountant" | "viewer";
export type PlanCode = "free" | "pro_trial" | "pro";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";

export interface Profile {
  id: UUID;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: UUID;
  name: string;
  tax_identifier: string | null;
  base_currency: string;
  timezone: string;
  created_by: UUID;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  organization_id: UUID;
  user_id: UUID;
  role: MembershipRole;
  joined_at: string;
}

export interface EffectiveEntitlement {
  authenticated: boolean;
  plan: PlanCode;
  proAccess: boolean;
  source: "none" | "promotion" | "subscription" | "grant";
  expiresAt: string | null;
}

export interface Customer {
  id: UUID;
  organization_id: UUID;
  name: string;
  tax_identifier: string | null;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}