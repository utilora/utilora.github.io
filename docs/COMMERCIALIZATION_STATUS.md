# Utilora Commercialization Status

Last reviewed branch: main
Last reviewed commit: pending-p1.4
Last reviewed date: 2026-08-30

## Current phase

P1.4 is implemented on main. P1 workflow reliability is complete. Later phases require an explicit user request.

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
- [x] P1.2 receivable aging, customer debt overview and collection progress excluding draft/void.
- [x] P1.3 month-end completion score, unresolved close lists and exportable Excel/CSV result.
- [x] P1.4 complete local backup, stale reminders, v2/v3 restore compatibility and demo non-persistence.
- [x] Production build and 39 automated tests passed.
- [x] GitHub Pages uses workflow-only publishing; compiled artifact guards reject raw TypeScript entrypoints.

## Reusable capabilities

- src/core/entitlements/service.ts: Free / Pro Trial / Pro resolution.
- src/core/auth/session.ts: Supabase session.
- src/core/organizations/context.ts: organization context.
- src/core/analytics/: typed event tracking.
- src/core/purchase-intent/ and src/app/purchase-intent.ts: purchase intent.
- src/core/banking/local.ts: fingerprints, import preview, remaining amounts and non-overallocating match plans.
- src/core/receivables/local.ts: aging buckets, customer debt and collection progress.
- src/core/month-end/local.ts: close steps, completion score and export sheets.
- src/core/backup/local.ts: complete export payload, restore parsing and stale backup reminders.
- pro/app.js: IndexedDB workspaces, demo, bank matching, receivables, month-end, backup and restore.
- Supabase migrations: finance schema, RLS, entitlements, promotions and grants.

## Known gaps

- pro/app.js is monolithic; avoid unrelated refactoring.
- Local finance data and Supabase finance tables are not synchronized; never imply that they are.
- Entitlements do not yet expose feature-level limits.
- Payment and billing operations are intentionally absent.

## Next Authorized Step

- [ ] P2: no-card trial and optional cloud foundations.

Implementation requires an explicit request to begin P2. Do not start P2, payment or cloud sync without that request.

### Scope when authorized

- Introduce a no-card trial, initially 30 days.
- Add feature-level entitlements and organization limits.
- Add trial start, expiry, reminder and downgrade behavior.
- Improve multi-workspace experience.
- Design optional encrypted cloud backup; keep it disabled by default.

## Requires Explicit Approval

- Any work beyond the requested item.
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
