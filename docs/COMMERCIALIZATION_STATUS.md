# Utilora Commercialization Status

Last reviewed branch: main
Last reviewed commit: 05facb9a3c0cdd4aecfc876d9ce68b0d29b417f6
Last reviewed date: 2026-08-30

## Current phase

P1 is complete. Near-term work follows docs/PRODUCT_OPTIMIZATION.md, currently M1-W3. P2 trial and cloud remain unauthorized.

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
- [x] M1-W1 explainable matching: unique amount, customer name in summary, near due date.
- [x] M1-W2 atomic partial matching across multiple invoices with reversible payments.
- [x] Production build and 46 automated tests passed.
- [x] GitHub Pages uses workflow-only publishing; compiled artifact guards reject raw TypeScript entrypoints.

## Reusable capabilities

- src/core/entitlements/service.ts: Free / Pro Trial / Pro resolution.
- src/core/auth/session.ts: Supabase session.
- src/core/organizations/context.ts: organization context.
- src/core/analytics/: typed event tracking.
- src/core/purchase-intent/ and src/app/purchase-intent.ts: purchase intent.
- src/core/banking/local.ts: fingerprints, import preview, remaining amounts and atomic non-overallocating match plans.
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
- Service worker cache is utilora-v20; old v11/v12 query-string precache entries were removed.
- Registration UI sends /auth/v1/otp. Supabase Confirm signup / Magic Link templates must use supabase/templates/*.html (`{{ .Token }}`) or the inbox still receives a confirmation link instead of a 6-digit code.

## Next Authorized Step

- [ ] M1-W3: customer collection notes — contact date, promise date, result and next follow-up sorting.

See docs/PRODUCT_OPTIMIZATION.md. Implementation requires an explicit request to begin M1-W3.

Do not start M1-W4 or later weeks, P2, payment or cloud sync.

### Scope

- Inspect current customer and invoice local data and renderers first.
- Store contact date, next follow-up date, promised payment date and result (unanswered / promised / paid) locally.
- Show collection history on the customer surface and allow overdue items to sort by next follow-up.
- Keep demo changes non-persistent and real workspace data local-only.
- Do not expand into tickets, SMS or multi-user collaboration.

### Acceptance criteria

- A collection note can be created and edited with the required dates and result.
- Customer details show follow-up context instead of amount only.
- Overdue receivables can be ordered by next follow-up date.
- Demo changes are not persisted.
- Targeted tests and production build pass.

## Requires Explicit Approval

- P2 trial, cloud backup and P3 payment.
- Any optimization week beyond the current item in PRODUCT_OPTIMIZATION.md.
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
