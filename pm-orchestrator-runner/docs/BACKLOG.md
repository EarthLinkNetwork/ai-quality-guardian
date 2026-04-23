# Backlog

This file tracks deferred tasks and technical debt that are intentionally
not addressed in the current development cycle. Each entry MUST be
scanned by `test/unit/legacy-backlog.test.ts` (for the Legacy Model
Cleanup entry) so that it cannot be silently deleted without a failing
test alerting the maintainer.

---

## Legacy Model Cleanup (Task E follow-up)

- **Status**: Open (P2 — technical debt)
- **Created by**: Task E (additive-only model registry refresh)
- **Created at**: 2026-04-24
- **Parent commit**: 196c6f071d5f478cb50996d986ce9ad6c9fe1e52
- **Forget-proof test**: `test/unit/legacy-backlog.test.ts`
- **Spec reference**: `spec/12_LLM_PROVIDER_AND_MODELS.md` ("TODO: Legacy Cleanup" section)

### Scope

Remove the following legacy OpenAI model IDs from the model registry
and every dependent file. These were marked `@deprecated` in Task E
(via JSDoc in `src/models/repl/model-registry.ts`) but **not deleted**
to avoid breaking existing references.

- `gpt-3.5-turbo`
- `o1-preview`
- `gpt-4-turbo`
- `o1`
- `o1-mini`

### Dependencies (files that must be updated before the entries can be removed)

1. **`src/model-policy/model-policy-manager.ts`** (lines 277-293)
   The `MODEL_CONFIGS` array contains hard-coded `OPENAI_MODELS.find((m) => m.id === 'gpt-4-turbo')!` style lookups.
   Remove or replace the `gpt-4-turbo` entry with a supported successor (e.g. `gpt-4.1` or `gpt-4o`).

2. **`test/unit/web/ai-cost-service.test.ts`** (around line 52)
   Test fixtures reference `gpt-3.5-turbo`. Update fixtures to use a
   supported model before the ID is removed from the registry.

3. **`test/integration/project-settings-isolation.test.ts`** (lines ~160, ~175)
   Integration-test fixtures reference `gpt-3.5-turbo`. Same fixture
   update is required.

4. **`spec/10_REPL_UX.md`** and **`spec/31_PROVIDER_MODEL_POLICY.md`**
   Both specs enumerate the full historical model list. Once the three
   legacy IDs are removed from the registry, prune their rows from the
   spec tables in the same commit to keep spec ↔ implementation aligned.

5. **`src/web/public/index.html`** Model dropdowns
   Task E did **not** add the legacy IDs to the dropdowns, but did not
   remove them either (additive-only rule). The cleanup task MAY remove
   the legacy `<option>` entries at the same time, but this is
   optional — dropdown cleanup can be done in a separate UX pass.

### Why this is deferred

Task E's scope was explicitly additive-only to minimize blast radius.
Removing legacy IDs requires updating fixtures, policy configs, and
spec documents in lockstep, which is a separate, reviewable unit of work.

### Acceptance criteria for closing this entry

- [ ] All five legacy IDs (`gpt-3.5-turbo`, `o1-preview`, `gpt-4-turbo`, `o1`, `o1-mini`) are removed from `OPENAI_MODELS` in `src/models/repl/model-registry.ts`.
- [ ] All five dependency locations above are updated to use supported models.
- [ ] `npm run lint` / `npm test` / `npm run typecheck` / `npm run build` all pass.
- [ ] `test/unit/legacy-backlog.test.ts` is updated (the "Legacy Model Cleanup" entry can be removed from this file, and the test can be updated/removed correspondingly — removal is fine once the cleanup is done).
- [ ] `spec/12_LLM_PROVIDER_AND_MODELS.md` "TODO: Legacy Cleanup" section is removed or marked DONE.

---

## How this backlog is protected

`test/unit/legacy-backlog.test.ts` asserts that the "Legacy Model
Cleanup" entry in this file mentions each deprecated ID
(`gpt-3.5-turbo`, `o1-preview`, `gpt-4-turbo`, `o1`, `o1-mini`) and each dependent
file (`model-policy-manager.ts`, `ai-cost-service.test.ts`,
`project-settings-isolation.test.ts`). Deleting this entry without
finishing the cleanup work breaks that test — on purpose.
