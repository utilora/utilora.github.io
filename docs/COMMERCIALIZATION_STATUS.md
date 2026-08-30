# Utilora Commercialization Status

Last reviewed branch: main
Last reviewed commit: 5b2f8d603251be8a65dedf6db2f7bd7bde5191f3
Last reviewed date: 2026-08-30

## Current phase

P0 is deployed. P1 requires an explicit user request before implementation.

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
- [x] Production build and 18 automated tests passed.
- [x] Live homepage and Pro page returned HTTP 200 with P0 content.

## Reusable capabilities

- src/core/entitlements/service.ts: Free / Pro Trial / Pro resolution.
- src/core/auth/session.ts: Supabase session.
- src/core/organizations/context.ts: organization context.
- src/core/analytics/: typed event tracking.
- src/core/purchase-intent/ and src/app/purchase-intent.ts: purchase intent.
- pro/app.js: IndexedDB workspaces, demo, bank matching, receivables, month-end, backup and restore.
- Supabase migrations: finance schema, RLS, entitlements, promotions and grants.

## Known gaps

- pro/app.js is monolithic; avoid unrelated refactoring.
- Local finance data and Supabase finance tables are not synchronized; never imply that they are.
- Bank import needs stronger duplicate detection, states, progress, confidence and reversible batches.
- Aging exists but is not a complete collection workflow.
- Month-end lacks completion scoring and exportable results.
- Backup reminders and restore regression coverage need strengthening.
- Entitlements do not yet expose feature-level limits.
- Payment and billing operations are intentionally absent.

## Next Authorized Step

- [ ] P1.1: improve local bank import and matching reliability.

Implementation requires an explicit request to begin P1.1.

### Scope

- Inspect renderBank, parsing, IndexedDB and tests first.
- Add stable duplicate fingerprints.
- Preview new, duplicate and invalid rows before commit.
- Show matched, partially matched and unmatched states.
- Show import/matching progress.
- Keep suggestions explainable and reversible.
- Preserve workspace and backup compatibility.

### Acceptance criteria

- Importing the same file twice creates no duplicate.
- Duplicate and invalid rows appear before confirmation.
- Match states and remaining amounts are unambiguous.
- Batch actions cannot over-allocate.
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
- Merging a feature branch into main.

## Status update protocol

1. Recheck current architecture.
2. Complete only validated criteria.
3. Record tests, build and migration status.
4. Keep exactly one recommended next step.
5. Keep risky/later work under explicit approval.
6. Update reviewed commit/date after merge to main.
