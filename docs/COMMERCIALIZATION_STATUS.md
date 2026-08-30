# Utilora Commercialization Status

Last reviewed branch: main
Last reviewed commit: ebfee448e1bd4f9e2fb2ef35d1ce33eec0bb27fa
Last reviewed date: 2026-08-30

## Current phase

P1.1 is implemented on main. Later P1 items require an explicit user request.

## Current production model

- Free tools: anonymous, login-free and permanently free.
- Pro: login-gated and free during the promotion.
- Demo: pro/?demo=1; changes are not persisted.
- Payment: not connected.
- Finance data: local IndexedDB in pro/app.js.
- Legacy localStorage data: migrated when detected.
- Supabase: auth, schema foundations, entitlements, purchase intent and analytics.
- Cloud sync: inactive and not enabled by default.
- PWA install and service worker: present.

## Completed

- [x] Homepage value, demo, pricing and purchase-intent entry points.
- [x] Pro commercialization messaging and core shortcuts.
- [x] purchase_intents with RLS and submit_purchase_intent RPC.
- [x] P0 analytics while preserving page_view and tool_use.
- [x] Migrations 202608300001 and 202608300002 applied to nkxgnqzdswugbjjquxfj.
- [x] P0 merged to main at 5b2f8d603251be8a65dedf6db2f7bd7bde5191f3.
- [x] P1.1 local bank import preview, duplicate fingerprints, match states and reversible exact-amount suggestions.
- [x] Production build and 25 automated tests passed.

## Reusable capabilities

- src/core/entitlements/service.ts: Free / Pro Trial / Pro resolution.
- src/core/auth/session.ts: Supabase session.
- src/core/organizations/context.ts: organization context.
- src/core/analytics/: typed event tracking.
- src/core/purchase-intent/ and src/app/purchase-intent.ts: purchase intent.
- src/core/banking/local.ts: fingerprints, import preview, remaining amounts and non-overallocating match plans.
- pro/app.js: IndexedDB workspaces, demo, bank matching, receivables, month-end, backup and restore.
- Supabase migrations: finance schema, RLS, entitlements, promotions and grants.

## Known gaps

- pro/app.js is monolithic; avoid unrelated refactoring.
- Local finance data and Supabase finance tables are not synchronized; never imply that they are.
- Aging exists but is not a complete collection workflow.
- Month-end lacks completion scoring and exportable results.
- Backup reminders and restore regression coverage need strengthening.
- Entitlements do not yet expose feature-level limits.
- Payment and billing operations are intentionally absent.

## Next Authorized Step

- [ ] P1.2: receivables aging, customer debt overview and explainable collection progress.

Implementation requires an explicit request to begin P1.2.

### Scope

- Inspect invoices, payments, aging and bank matching first.
- Show customer outstanding totals and aging buckets.
- Track collection progress against due dates.
- Keep matching suggestions explainable.
- Do not change bank import behavior from P1.1 except where receivables display depends on it.

### Acceptance criteria

- Open receivables and overdue amounts are visible by customer.
- Aging buckets match remaining invoice balances.
- Collection progress does not include draft or void invoices.
- Demo changes are not persisted.
- Existing workspaces and backups remain readable.
- Targeted tests and production build pass.

## Requires Explicit Approval

- Any P1 work beyond the requested item.
- Real trial countdown.
- Payment, checkout, monthly or annual billing.
- Payment secrets or webhook infrastructure.
- Uploading local finance data to Supabase.
- Cloud backup/sync.
- Team or enterprise features.
- Switching away from main or creating a feature branch.

## Status update protocol

1. Recheck current architecture.
2. Complete only validated criteria.
3. Record tests, build and migration status.
4. Keep exactly one recommended next step.
5. Keep risky/later work under explicit approval.
6. Update reviewed commit/date after merge to main.
