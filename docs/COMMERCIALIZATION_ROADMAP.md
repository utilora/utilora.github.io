# Utilora Commercialization Roadmap

## Purpose

Stable direction from a fully free toolbox to Free + Pro. Current code, applied migrations and production configuration remain the source of truth.

## Who this is for

Small-business and bookkeeping finance staff. They are not replacing a full ERP.

Daily work: bank matching and collection follow-up.  
Monthly peak: payroll/tax tools, then a close pack the owner or accountant can take.  
Anytime: backup and complete export. Data loss is unacceptable.

## Product principles

1. All existing tools under tools/ remain anonymous, login-free, and permanently free.
2. Pro charges for repeatable workflows and automation, not access to user-owned data.
3. Demo mode remains available and never persists changes.
4. Local-first storage stays the default until optional cloud sync is explicitly approved.
5. Trial or subscription expiry never blocks viewing or complete data export.
6. Entitlements use trusted server state, not frontend hiding alone.
7. No privileged credential is shipped to the browser.
8. Analytics never contain financial business data.

## Usage priority

| Frequency | Work | Product surface |
|---|---|---|
| Daily | Bank import, match receipts, see who still owes | Pro bank + receivables |
| During billing | VAT split, amount in Chinese, quotes | Free tools |
| Monthly | Payroll/tax estimates | Free tools |
| Month-end | Unresolved AR, unmatched bank, anomalies, expenses, close score, export | Pro month-end |
| Anytime | Backup, restore, complete export | Pro settings |

Do not add AP, tax e-filing, collection tickets, cloud sync or payment until the table above is reliable.

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

Done on main. Homepage, demo, expected pricing, purchase intent and funnel analytics. No payment.

## P1 — Workflow reliability

Implement in order. One authorized item at a time.

1. Bank import: preview, stable duplicate fingerprint, explicit states, progress, confidence, batch confirmation and reversible decisions.
2. Receivables: aging, customer debt overview, collection progress and explainable matching suggestions.
3. Month-end: unresolved receivables, unmatched transactions, anomalies, expenses, completion score and exportable result.
4. Data safety: storage explanation, backup time, reminders, complete export and restore compatibility tests.

Exit: bank import -> matching -> payment -> month-end works reliably; duplicates and destructive mistakes are prevented or reversible; demo never persists; backup/restore tests pass.

## After P1 — 3-month product optimization

P1 is done on main. Before P2 trial or cloud work, follow docs/PRODUCT_OPTIMIZATION.md:

1. Month 1: explainable matching, partial allocation, collection notes, today-only dashboard.
2. Month 2: stricter month-end, reconciling close export, safer backup/restore, real-use fixes.
3. Month 3: 5-10 real workspaces, then decide whether to request P2.

Other AIs must read that file, work only the current item, and update its progress after each completed change.

## P2 — Trial and optional cloud foundations

Requires explicit approval.

- Introduce a no-card trial, initially 30 days.
- Add feature-level entitlements and organization limits.
- Add trial start, expiry, reminder and downgrade behavior.
- Improve multi-workspace experience.
- Design optional encrypted cloud backup; disabled by default.

## P3 — Paid conversion

Requires explicit approval.

- Start with an invite-only purchase-intent cohort and one simple Pro plan.
- Consider ¥19 monthly and ¥199 annually only after validation.
- Add provider-neutral orders, signed webhooks, idempotency, cancellation, refunds and reconciliation.
- Add team/enterprise features only after individual Pro retention is proven.

## Deferred until P1 exit

- Accounts payable / inbound invoices
- Multi-wallet auto-reconciliation
- Tax filing connections
- Collection task systems
- Cloud sync and billing

## Analytics privacy

Track product funnel and lifecycle events only. Never include customer names, bank descriptions, amounts, invoices, tax identifiers, payroll or other financial content.

## Functional requirements

Detailed, testable requirements and acceptance criteria are maintained in COMMERCIALIZATION_REQUIREMENTS.md. That document does not authorize implementation.

Near-term product work is listed in PRODUCT_OPTIMIZATION.md. COMMERCIALIZATION_STATUS.md and that file must name the same current item.

## Change control

- Work on one authorized item at a time.
- General optimization does not authorize payment, cloud sync, P2 or P3.
- Default to synchronized `main` for reading and authorized changes; use another branch only when the user explicitly requests it.
- Add new migrations; never edit an applied migration.
- Update PRODUCT_OPTIMIZATION.md progress and COMMERCIALIZATION_STATUS.md after completed work.
- Keep exactly one recommended next step in the status file.
