# Utilora Commercialization Functional Requirements

## Purpose

Testable requirements for moving from permanent free tools to optional Pro trial and paid capabilities. This document defines behavior but does not authorize implementation. COMMERCIALIZATION_STATUS.md controls the single next authorized step.

Priority: MUST before public trial/charging; SHOULD after MUST is stable; LATER requires separate approval.

## Global requirements

### FR-GLOBAL-001 — Permanent free tools (MUST)

All existing tools under tools/ remain anonymous, login-free, unlimited and permanently free.

Acceptance:
- Signed-out visitors can use every existing standalone tool.
- Entitlement failures never block existing calculation, copy or export behavior.
- Analytics never contain values entered into free tools.

### FR-GLOBAL-002 — Data access after downgrade (MUST)

Trial or subscription expiry never blocks viewing or complete export of user-owned data.

Acceptance:
- Existing workspaces open in a clear read-only state.
- Complete backup/export remains enabled.
- No downgrade deletes or silently changes data.
- The UI explains which write/automation capability is unavailable.

### FR-GLOBAL-003 — Local-first truth (MUST)

IndexedDB remains the finance-data source of truth until the user explicitly enables an approved cloud feature.

Acceptance:
- Login never uploads a workspace.
- The UI never claims local data is synchronized.
- Demo data never enters a real workspace.
- Settings always show the current storage location.

## P2A — No-card Pro trial

### FR-TRIAL-001 — Explicit activation (MUST)

A 30-day trial starts only when an authenticated user explicitly confirms it. Registration alone does not start a trial. No payment method is required.

Acceptance:
- Start and expiry are generated server-side.
- Activation is idempotent and cannot reset on refresh/device change.
- The exact expiry is shown before confirmation.
- Only one automatic introductory trial is allowed; later extensions use audited grants.

### FR-TRIAL-002 — Status and reminders (MUST)

Show plan, remaining days and exact expiry on Pro surfaces.

Acceptance:
- Reminders appear at 7, 3 and 1 day before expiry.
- Countdown uses server time and a clear timezone.
- In-product reminders work without email.
- Email requires separate consent and an approved server-side provider.

### FR-TRIAL-003 — Safe expiry (MUST)

Expiry may restrict Pro writes and automation, never read/export access.

Acceptance:
- Mid-session expiry does not silently discard pending edits.
- Backup, restore validation and complete export remain available.
- A valid subscription/grant restores features without data migration.
- Demo remains available during entitlement or auth outages.

### FR-TRIAL-004 — Support grants (SHOULD)

Authorized administrators can issue time-bounded beta/support extensions.

Acceptance:
- Reason, actor, start and expiry are auditable.
- Browser users cannot create grants.
- No service-role key is shipped to the frontend.

## P2B — Feature-level entitlements

### FR-ENT-001 — Central capability matrix (MUST)

One effective entitlement response contains plan, status, expiry, limits and capabilities.

Initial capabilities:
- bank_import
- bank_auto_match
- receivable_collection
- month_end_close
- advanced_reports
- workspace_write
- backup_export
- optional_cloud_backup

Initial limits:
- max_workspaces
- max_bank_rows_per_import
- max_monthly_import_rows

Acceptance:
- UI and write operations use the same capability source.
- Server state overrides cached frontend state.
- backup_export is always allowed for user-owned data.
- Unknown capabilities default to denied; permanent free tools are unaffected.

### FR-ENT-002 — Clear feature gates (MUST)

Blocked features explain value, current plan, required plan and the next action.

Acceptance:
- Gates are dismissible and never look like generic errors.
- Allowed functionality remains usable.
- Deep links return to the original feature after activation.
- Analytics records feature ID only, never business content.

### FR-ENT-003 — Resilient startup (MUST)

Auth/entitlement failures must never leave both the Pro gate and workspace hidden.

Acceptance:
- Requests have bounded timeouts and retry.
- A recent cached entitlement may support limited offline continuity.
- Cached access cannot create permanent false paid status.
- Login gate, recoverable error or demo entry is always rendered.

## P2C — Workspace limits

### FR-WORKSPACE-001 — Workspace allowance (MUST)

Creation checks max_workspaces; downgrade never hides existing workspaces.

Acceptance:
- Selector shows usage and allowance.
- Limit blocks only new workspace creation.
- Backup import cannot silently exceed the limit.
- Destructive deletion recommends a recent backup and requires confirmation.

### FR-WORKSPACE-002 — Safe switching (MUST)

Switching companies cannot merge, leak or overwrite workspace data.

Acceptance:
- Active company identity is always visible.
- Unsaved work is resolved before switching.
- Backup filename/summary contains company identity.
- Demo is never listed as a persistent workspace.

### FR-WORKSPACE-003 — Local/cloud clarity (SHOULD)

Local workspaces and Supabase organizations are distinct until explicitly linked.

Acceptance:
- Local-only, backup-enabled and synced states have distinct labels.
- Linking/uploading requires a separate explicit action.

## P2D — Optional cloud backup foundation

### FR-CLOUD-001 — Explicit opt-in (MUST before cloud launch)

Cloud backup is disabled by default and requires dedicated consent.

Acceptance:
- Login alone never enables upload.
- Consent states data categories, location, retention and deletion behavior.
- Declining leaves local features usable.
- Withdrawal never deletes the local workspace.

### FR-CLOUD-002 — Backup before sync (MUST)

Launch versioned backup before any real-time multi-device synchronization.

Acceptance:
- Each upload has workspace ID, timestamp and checksum.
- Restore previews metadata before replacement.
- Conflicts never choose a version silently.
- Local complete export remains independent.

### FR-CLOUD-003 — Security (MUST)

HTTPS and server-side privileged credentials are mandatory. Encryption/key-recovery design must be reviewed before implementation.

Acceptance:
- No service-role/payment secret appears in source maps or browser storage.
- Logs and analytics never contain backup payloads.
- Failed upload/restore is recoverable without corrupting local data.

### FR-CLOUD-004 — Retention and deletion (SHOULD)

Users can inspect backup history, retention and deletion status.

Acceptance:
- Account deletion and backup deletion are separate explicit operations.
- Failed deletion is retryable and auditable.

## Upgrade experience

### FR-UPGRADE-001 — Honest pricing (MUST)

Until payment is live, pricing remains “expected”, and no control claims purchase/subscription success.

### FR-UPGRADE-002 — Contextual prompts (SHOULD)

Show upgrade prompts only at high-value actions: automatic matching, exceeding limits, advanced close/report output, and optional cloud backup.

Acceptance:
- Prompts are dismissible and frequency-limited.
- Free tools never show blocking upgrade prompts.
- Conversion events contain feature ID, not finance data.

### FR-UPGRADE-003 — Notification preferences (SHOULD)

Product, trial and future billing notifications are separately controlled. Required service notices are distinct from marketing.

## P3 payment requirements (LATER, not authorized)

- FR-PAY-001: server-side orders with pending, paid, failed, refunded and canceled states.
- FR-PAY-002: signed idempotent webhooks with stored provider event IDs.
- FR-PAY-003: monthly/annual renewal, period-end cancellation, payment failure and entitlement reconciliation.
- FR-PAY-004: audited refund and manual support recovery.

Detailed P3 acceptance criteria wait for explicit provider and legal-policy approval.

## Required future analytics

When corresponding functionality is authorized:
- trial_offer_view, trial_started, trial_reminder_view, trial_expired
- entitlement_gate_view, upgrade_cta_click, workspace_limit_reached
- cloud_backup_opt_in, cloud_backup_created, cloud_backup_restored
- checkout_started, payment_succeeded, subscription_canceled

Never attach customer names, bank text, amounts, invoices, payroll, tax IDs or backup content.

## Recommended sequence

1. FR-TRIAL-001 plus FR-ENT-001 data/API design.
2. FR-ENT-003 resilient startup.
3. FR-TRIAL-002 and FR-TRIAL-003 lifecycle UI.
4. FR-ENT-002 feature gates.
5. FR-WORKSPACE-001 and FR-WORKSPACE-002.
6. Cloud design review, then FR-CLOUD-001 through FR-CLOUD-003.
7. P3 only after explicit approval and validated demand.
