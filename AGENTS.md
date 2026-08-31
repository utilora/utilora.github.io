# AGENTS.md — Codex Efficiency Guidelines

## Primary Goal
Complete requested tasks correctly while minimizing unnecessary context, exploration, tool calls, edits, tests, and compute usage.

## Core Rules

1. **Read the minimum necessary context**
   - Start with files directly related to the user's request.
   - Do not scan the entire repository unless the task genuinely requires it.
   - Do not repeatedly read files whose relevant contents are already known.

2. **Make the smallest effective change**
   - Modify only files necessary to complete the requested task.
   - Prefer small targeted edits over broad rewrites.
   - Preserve existing architecture, patterns, naming, and dependencies whenever possible.

3. **No unsolicited work**
   - Do not refactor, redesign, optimize, rename, reformat, or clean up unrelated code unless explicitly requested.
   - If unrelated issues are discovered, mention them briefly instead of fixing them.

4. **Reuse before creating**
   - Reuse existing components, utilities, styles, functions, and dependencies when practical.
   - Do not add a dependency when the existing project can reasonably solve the task without one.

5. **Limit exploration**
   - Search narrowly using relevant filenames, symbols, routes, components, or error messages.
   - Expand the search scope only when the initial targeted search is insufficient.
   - If a requirement is materially ambiguous and guessing could cause significant rework, ask for clarification instead of performing broad exploratory changes.

6. **Test proportionally**
   - Run only the checks needed to validate the changed behavior.
   - Prefer targeted tests, linting, type checks, or builds relevant to modified files.
   - Do not repeatedly run the same successful checks without a reason.
   - Run a full test/build suite only when the scope or risk of the change warrants it or the user explicitly requests it.

7. **Avoid repeated work**
   - Keep track of conclusions already established during the task.
   - Do not re-investigate resolved questions unless new evidence requires it.
   - Avoid cycles of speculative edit → test → revert when a direct inspection can answer the question first.

8. **Stop when done**
   - Once the requested acceptance criteria are satisfied and necessary validation passes, stop.
   - Do not continue searching for additional improvements.

## Task Execution Pattern

For each task, prefer this sequence:

1. Identify the exact requested outcome.
2. Locate the smallest relevant set of files.
3. Inspect only the context needed to make the change safely.
4. Make the minimal implementation.
5. Run targeted validation.
6. Report the result and stop.

## Final Response
Keep the completion report concise. Include only:

- What changed.
- Which important files were modified.
- What validation was run and whether it passed.
- Any blocker or important caveat the user needs to know.

Do not provide long explanations of routine exploration or unchanged files unless requested.

## Priority
Correctness comes first. These efficiency rules are intended to eliminate unnecessary work, not necessary reasoning, validation, or safety checks.

## Collaboration Workflow

Before product, entitlement, analytics, billing, storage, or Pro workspace changes, read:

1. docs/COLLAB.md

The current code and applied Supabase migrations are the source of truth.

- Do not commit feature work directly to `main`.
- Work on one track branch: `feat/user-workspace`, `feat/admin-ops`, or `fix/security-hardening`.
- Work only on the single current item for that track in COLLAB.md.
- Revalidate the documented state against the current branch before editing.
- Keep the five finance tools under tools/ anonymous, login-free, and permanently free.
- Do not connect payment, force cloud sync, or upload local financial data without explicit approval.
- Do not expand into AP, tax e-filing, collection tickets, ERP-wide refactors, or extra utility tools.
- Never expose Supabase service-role keys, payment secrets, or privileged credentials in frontend code.
- Trial or subscription expiry must never block viewing or complete export of user data.
- After an authorized item, update COLLAB.md progress (status, commit SHA, tests) and keep exactly one current item per track.
- Do not mark work complete until its acceptance criteria and relevant tests pass.
