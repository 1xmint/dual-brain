# Dead Code Audit — dual-brain npm package

**Date:** 2026-05-15  
**Scope:** `.claude/hooks/*.mjs`, `.claude/hooks/*.sh`, `src/calibration.mjs`, `src/prompt-intel.mjs`, `src/models.mjs`, `src/decompose.mjs`, `src/nextstep.mjs`, `src/observer.mjs`, `src/playbook.mjs`, `src/brief.mjs`

---

## Methodology

For each file, references were checked across:
- `src/`, `bin/`, `package.json`, `README.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, `install.mjs`
- ES `import` statements within the hooks directory itself
- Runtime invocation via `execSync`/`spawn` in src and bin

References found **only** in `package.json` (files array) and `install.mjs` (copy list) are classified as **LISTED** — the file is bundled in the npm package but not called at runtime. That is a separate concern from being dead.

---

## Hook Files Classification

### Active (wired in `.claude/settings.json`)

| File | Hook Event | Status |
|------|-----------|--------|
| `head-guard.mjs` | PreToolUse (Edit, Write, NotebookEdit, Bash) | **ACTIVE** |
| `enforce-tier.mjs` | PreToolUse (Agent) | **ACTIVE** |
| `cost-logger.mjs` | PostToolUse (all) | **ACTIVE** |
| `auto-update-wrapper.mjs` | PostToolUse (all) | **ACTIVE** |

### Dependencies of Active Hooks

`enforce-tier.mjs` directly imports two hooks at the top of its file:

| File | Imported By | Status |
|------|-------------|--------|
| `risk-classifier.mjs` | `enforce-tier.mjs` (ES import), `task-classifier.mjs`, `plan-generator.mjs`, `vibe-router.mjs`, `wave-orchestrator.mjs` | **REFERENCED** — keep |
| `failure-detector.mjs` | `enforce-tier.mjs` (ES import), `test-orchestrator.mjs` | **REFERENCED** — keep |

### Runtime-Callable Tools (invoked via CLI / subprocess by src or bin)

| File | Called By | Status | Recommendation |
|------|-----------|--------|----------------|
| `health-check.mjs` | `bin/dual-brain.mjs` (3 call sites via `spawnSync`) | **REFERENCED** | keep |
| `dual-brain-think.mjs` | `src/nextstep.mjs` (string path in `execSync`), `src/doctor.mjs`, CLAUDE.md docs | **REFERENCED** | keep |
| `dual-brain-review.mjs` | CLAUDE.md docs (user-facing CLI tool), imports `src/redact.mjs` | **REFERENCED** | keep |
| `repo-doctor.mjs` | `package.json` `prepublishOnly` script | **ACTIVE (script)** | keep |
| `test-orchestrator.mjs` | `package.json` `test` script | **ACTIVE (script)** | keep |
| `quality-gate.mjs` | CLAUDE.md docs (user-facing CLI tool) | **REFERENCED** | keep |
| `session-report.mjs` | CLAUDE.md docs (user-facing CLI tool) | **REFERENCED** | keep |
| `budget-balancer.mjs` | `src/decide.mjs` (comment mention, not import), CLAUDE.md docs (user-facing CLI tool), `wave-orchestrator.mjs` (ES import) | **REFERENCED** | keep |
| `wave-orchestrator.mjs` | CLAUDE.md docs, imports `risk-classifier`, `plan-generator`, `gpt-work-dispatcher`, `budget-balancer`, `decision-ledger` | **REFERENCED** | keep |
| `gpt-work-dispatcher.mjs` | `wave-orchestrator.mjs` (ES import), CLAUDE.md docs | **REFERENCED** | keep |
| `vibe-memory.mjs` | CLAUDE.md docs (user-facing CLI tool) | **REFERENCED** | keep |

### Dependency Chain Nodes (imported by other referenced hooks)

| File | Imported By | Status | Recommendation |
|------|-------------|--------|----------------|
| `plan-generator.mjs` | `wave-orchestrator.mjs` (ES import), imports `profiles.mjs` and `risk-classifier.mjs` | **REFERENCED** | keep |
| `profiles.mjs` | `plan-generator.mjs` (ES import) | **REFERENCED** | keep |
| `decision-ledger.mjs` | `wave-orchestrator.mjs` (ES import) | **REFERENCED** | keep |
| `model-registry.mjs` | `task-classifier.mjs` (ES import) | **REFERENCED** | keep |
| `task-classifier.mjs` | imports `risk-classifier.mjs` and `model-registry.mjs` — but **nothing calls task-classifier.mjs** | **WEAKLY REFERENCED** | see note |

### Listed-Only (in npm package files array and install copy list, no runtime callers)

| File | Only Appears In | Status | Recommendation |
|------|----------------|--------|----------------|
| `control-panel.mjs` | `package.json` files, `install.mjs` copy list, `install.mjs` line 1081 (launch at end of install) | **LISTED + install launch** | keep (launched by install) |
| `setup-wizard.mjs` | `package.json` files, `install.mjs` copy list | **LISTED** | investigate — may be dead |
| `summary-checkpoint.mjs` | `package.json` files, `install.mjs` copy list | **LISTED** | **CANDIDATE FOR DELETION** |
| `vibe-router.mjs` | `package.json` files, `install.mjs` copy list, imports `risk-classifier.mjs` | **LISTED** | **CANDIDATE FOR DELETION** |
| `install-git-hooks.mjs` | `package.json` files, `install.mjs` copy list | **LISTED** | investigate — may be used post-install |
| `cost-report.mjs` | `package.json` files, `install.mjs` copy list | **LISTED** | investigate — may be user-facing CLI |
| `auto-update.sh` | `package.json` files, `install.mjs` copy list, referenced by name in `auto-update-wrapper.mjs` logic | **REFERENCED** | keep |

### Runtime Data Files (not code — do not delete)

| File | Purpose |
|------|---------|
| `decision-ledger.jsonl` | Runtime ledger written by `decision-ledger.mjs` |
| `usage-2026-05-14.jsonl` | Daily usage log written by `cost-logger.mjs` |
| `usage-2026-05-15.jsonl` | Daily usage log written by `cost-logger.mjs` |
| `usage-summary-2026-05-14.json` | Daily summary written by `cost-logger.mjs` |
| `usage-summary-2026-05-15.json` | Daily summary written by `cost-logger.mjs` |

---

## src/ Module Classification

| File | Referenced By | Status | Recommendation |
|------|--------------|--------|----------------|
| `src/models.mjs` | `bin/dual-brain.mjs`, `src/test.mjs`, `src/doctor.mjs`, `src/decide.mjs`, `src/dispatch.mjs`, `src/pipeline.mjs`, `src/profile.mjs` | **ACTIVE** | keep |
| `src/brief.mjs` | `src/receipt.mjs`, `src/session.mjs`, `src/index.mjs`, `src/pipeline.mjs`, `src/dispatch.mjs` | **ACTIVE** | keep |
| `src/decompose.mjs` | `src/brief.mjs`, `src/ledger.mjs`, `src/index.mjs`, `src/test.mjs`, `src/detect.mjs` | **ACTIVE** | keep |
| `src/playbook.mjs` | `src/decompose.mjs`, `src/test.mjs`, `src/index.mjs` | **ACTIVE** | keep |
| `src/calibration.mjs` | `src/prompt-intel.mjs`, `src/pipeline.mjs` (dynamic import), `src/observer.mjs` | **ACTIVE** | keep |
| `src/prompt-intel.mjs` | `src/pipeline.mjs` (dynamic import) | **ACTIVE** | keep |
| `src/observer.mjs` | `bin/dual-brain.mjs` (dynamic import), `src/calibration.mjs` | **ACTIVE** | keep |
| `src/nextstep.mjs` | `bin/dual-brain.mjs` (2 dynamic import call sites) | **ACTIVE** | keep |

**All 8 audited src/ modules are alive.** None are dead.

---

## Summary: Recommended Deletions

### Confirmed dead (no runtime callers):

| File | Reason |
|------|--------|
| `.claude/hooks/summary-checkpoint.mjs` | Only in npm files list and install copy list. No imports, no invocations anywhere in src, bin, or other hooks. |
| `.claude/hooks/vibe-router.mjs` | Only in npm files list and install copy list. Imports `risk-classifier.mjs` but nothing calls vibe-router itself. |

### Needs manual verification before deleting:

| File | Question |
|------|----------|
| `.claude/hooks/setup-wizard.mjs` | Is it launched interactively anywhere during `dual-brain init`? If `bin/dual-brain.mjs` init command calls it, it's alive. Quick grep: no hits in bin/ — **likely dead**. |
| `.claude/hooks/install-git-hooks.mjs` | Is it invoked post-install or by `bin/dual-brain.mjs`? No hits found in bin/ or src/. **Likely dead.** |
| `.claude/hooks/cost-report.mjs` | No hits in bin/ or src/, but it's a useful CLI tool documented in README. If it appears in `dual-brain status` output, it's user-facing. Check before deleting. |
| `.claude/hooks/task-classifier.mjs` | Imports risk-classifier and model-registry, but nothing calls task-classifier itself. The functionality was likely absorbed into `src/detect.mjs`. **Likely dead.** |

### Not dead but potentially worth consolidating:

- `profiles.mjs` (hooks) — partial overlap with `src/profile.mjs`. The hook version is only pulled in by `plan-generator.mjs`. If `plan-generator.mjs` were updated to import from `src/profile.mjs` instead, this hook could be deleted.
- `model-registry.mjs` (hooks) — only used by `task-classifier.mjs` (which is likely dead). If task-classifier is deleted, model-registry has no callers either.

---

## Deletion Priority

1. **Delete now** (confirmed dead): `summary-checkpoint.mjs`, `vibe-router.mjs`
2. **Delete after verification** (likely dead): `setup-wizard.mjs`, `install-git-hooks.mjs`, `task-classifier.mjs`
3. **Delete if task-classifier deleted**: `model-registry.mjs`
4. **Keep**: everything else
