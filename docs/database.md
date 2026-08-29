# Database Operations

The canonical schema is versioned under supabase/migrations/. Never edit production tables manually without adding a migration.

## Initial deployment

1. Link the intended Supabase project.
2. Review environment and backup policy.
3. Run supabase db push.
4. Verify RLS using two users in different organizations.
5. Confirm get_my_effective_entitlement() returns pro_trial for authenticated users during the launch promotion.

## Security invariants

- Every business row carries organization_id.
- RLS must be enabled before a business table is exposed.
- Viewers are read-only; accountants can write finance data; owners/admins manage members.
- Service-role keys never appear in browser code.
- Posted vouchers and closed fiscal periods will be changed only through audited RPCs in the bookkeeping migration.
- Payment provider webhooks will update subscriptions through Edge Functions, not the browser.

## Promotion switch

The current open-access campaign is the pro-launch-free row in promotions. To end the campaign, set is_active to false. Existing explicit grants and active subscriptions continue to work without a frontend release.