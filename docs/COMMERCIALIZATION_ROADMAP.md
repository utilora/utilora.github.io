# Utilora Commercialization Roadmap

## Purpose

This is the stable direction for moving Utilora from a fully free product to a Free + Pro model. Current code, migrations, and production configuration remain the source of truth.

## Product principles

1. All existing tools under tools/ remain anonymous, login-free, and permanently free.
2. Pro charges for repeatable workflows and automation, not access to user-owned data.
3. Demo mode remains available and never persists changes.
4. Local-first storage stays the default until optional cloud sync is explicitly approved.
5. Trial or subscription expiry never blocks viewing or complete data export.
6. Entitlements use trusted server state, not frontend hiding alone.
7. No privileged credential is shipped to the browser.
8. Analytics never contain financial business data.

## Product tiers

| Capability | Free | Pro Trial | Pro |
|---|---|---|---|
| Existing standalone tools | Unlimited, anonymous | Unlimited | Unlimited |
| Demo workspace | Full sample, no persistence | Full | Full |
| Real local workspace | Basic or limited | Full | Full |
| Bank import and auto-match | Demo or limited preview | Full | Full |
| Receivables and collection | Basic viewing | Full | Full |
| Month-end checks | Basic preview | Full | Full |
| Advanced reports and batch work | Limited | Full | Full |
| Complete local export | Always | Always | Always |
| Multiple workspaces | One | Trial allowance | Plan allowance |
| Optional cloud sync | Off | Only when approved | Optional |

## Entitlement lifecycle

guest -> free
authenticated user -> free
trial started/active -> pro_trial
trial expired -> free with read/export
payment confirmed -> pro
canceled but paid period active -> pro
subscription expired -> free with read/export

Extend the existing plans, subscriptions, promotions, entitlement_grants, and get_my_effective_entitlement architecture. Add feature-level capabilities later instead of replacing it.

## P0 — Commercial intent validation

- Value-led homepage, free tools, complete demo and expected pricing.
- Protected purchase-intent collection.
- Lightweight first-party funnel analytics.
- Pro remains free during promotion; no payment.

Exit: intent collection, P0 events, funnel measurement, production migrations and UI are verified.

## P1 — Workflow reliability

Implement in order:

1. Bank import: preview, stable duplicate fingerprint, explicit states, progress, confidence, batch confirmation and reversible decisions.
2. Receivables: aging, customer debt overview, collection progress and explainable matching suggestions.
3. Month-end: unresolved receivables, unmatched transactions, anomalies, expenses, completion score and exportable result.
4. Data safety: storage explanation, backup time, reminders, complete export and restore compatibility tests.

Exit: bank import -> matching -> payment -> month-end works reliably; duplicates and destructive mistakes are prevented or reversible; demo never persists; backup/restore tests pass.

## P2 — Trial and optional cloud foundations

- Introduce a no-card trial, initially 30 days.
- Add feature-level entitlements and organization limits.
- Add trial start, expiry, reminder and downgrade behavior.
- Improve multi-workspace experience.
- Design optional encrypted cloud backup; disabled by default.

Exit: server-authoritative trial, safe expiry, local-only support and explicit cloud consent.

## P3 — Paid conversion

- Start with an invite-only purchase-intent cohort and one simple Pro plan.
- Consider ¥19 monthly and ¥199 annually only after validation.
- Add provider-neutral orders, signed webhooks, idempotency, cancellation, refunds and reconciliation.
- Add team/enterprise features only after individual Pro retention is proven.

Payment requires server-side secrets, webhook verification, replay safety, clear renewal/cancellation/refund policies, monitoring and manual recovery.

## Analytics privacy

Track product funnel and lifecycle events only. Never include customer names, bank descriptions, amounts, invoices, tax identifiers, payroll or other financial content.

## Change control

- Work on one authorized item at a time.
- General optimization does not authorize payment, cloud sync, P2 or P3.
- Default to synchronized `main` for reading and authorized changes; use another branch only when the user explicitly requests it.
- Add new migrations; never edit an applied migration.
- Update COMMERCIALIZATION_STATUS.md after completed commercialization work.
