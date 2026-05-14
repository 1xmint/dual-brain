# AGENTS.md

Compact control panel for the orchestration system.

## What This Tree Is

- This subtree is the workflow operating system, not product code.
- Canonical doctrine still lives in root docs like `LANE.md`, `LAUNCH.md`,
  `TRUTH-BEFORE-ASSUMPTION.md`, `REVIEW-TOPOLOGY-LADDER.md`, and
  `OUTPUT-MODES.md`.
- Claude Code lanes should prefer the skill layer in `.claude/skills/` so the
  whole doctrine library does not eager-load on every spawn.
- Non-Claude surfaces may still need to read the canonical doctrine docs
  directly. Do not pretend cross-surface parity that does not exist.

## Always Load

1. this file
2. `CLAUDE.md`
3. the current role card in `.claude/agents/`
4. the smallest current truth artifact for the work

## Hot Path

- `HOT-PATH-CONTROL-PANEL.md` is the compact always-loaded kernel.
- `TURN-RECEIPT-LOGGING-RULE.md` is the compact observability rule for
  meaningful final, summary, and handoff turns.
- `OUTPUT-MODES.md` is the canonical buyer-facing tail contract.
- `LANE.md`, `LAUNCH.md`, `TRUTH-BEFORE-ASSUMPTION.md`, and
  `REVIEW-TOPOLOGY-LADDER.md` remain the top-level canon for the biggest
  failure surfaces.

## Claude Skills

Use the smallest relevant skill instead of loading long fan-out branches:

- lane identity, revive/startup, ownership, closeout:
  `.claude/skills/lane-discipline/SKILL.md`
- unread completions, parent pickup, `done` absorption:
  `.claude/skills/continuity-pickup/SKILL.md`
- packet vs spawn vs injection, launch wording:
  `.claude/skills/launch-and-transport/SKILL.md`
- guesses, weak evidence, routing inference:
  `.claude/skills/truth-and-verification/SKILL.md`
- review density, second-brain shape, assurance:
  `.claude/skills/review-topology/SKILL.md`
- buyer posture, output modes, delivery clarity:
  `.claude/skills/buyer-support/SKILL.md`
- reuse vs rotate vs new container:
  `.claude/skills/execution-routing/SKILL.md`
- doctor audits, evidence quality, retirement pressure:
  `.claude/skills/doctor-audit/SKILL.md`
- state plane, health truth, control-plane coherence:
  `.claude/skills/state-plane/SKILL.md`
- cross-workstream impact, conflict, neighbor awareness:
  `.claude/skills/system-impact/SKILL.md`
- stale docs, security, external reality:
  `.claude/skills/external-research/SKILL.md`
- plugin fit, capability-first execution:
  `.claude/skills/plugins-and-capability/SKILL.md`
- surface/runtime truth, compaction, operator setup:
  `.claude/skills/surface-runtime/SKILL.md`
- provider/model/budget routing:
  `.claude/skills/model-and-budget/SKILL.md`
- which provider (Claude vs. Codex), cross-provider diversity, quota advisory:
  `.claude/skills/provider-routing/SKILL.md`
- changed-code review, bug patterns, missing validation, weak proof:
  `.claude/skills/code-review/SKILL.md`
- edge-case selection, test level, mocks, and assertion strength:
  `.claude/skills/test-design/SKILL.md`
- safe refactor sequencing and blast-radius discipline:
  `.claude/skills/refactoring-patterns/SKILL.md`
- input validation, retries, graceful failure, and boundary handling:
  `.claude/skills/error-handling/SKILL.md`
- public surface shape, caller contract, and compatibility:
  `.claude/skills/api-design/SKILL.md`
- staging scope, commit truth, and revert-friendly boundaries:
  `.claude/skills/commit-hygiene/SKILL.md`
- repo-specific craft conventions and reusable local patterns:
  `.claude/skills/patterns/SKILL.md`
- model defaults per role, Sonnet-vs-Opus escalation triggers:
  `decisions/MODEL-DEFAULTS-PATTERN.md`
- package mirror, release flow, shipping hygiene:
  `.claude/skills/package-maintenance/SKILL.md`
- repo-scoped memory recall and durable lesson capture:
  `.claude/skills/personal-memory/SKILL.md`

## Continuity Truth

- inbox and update-bus truth beat stale recall
- checkpoints beat vague execution memory
- closeouts beat “done” summaries
- `health/` is compact machine-checkable truth, not a substitute for artifacts
- `observability/` is evidence, not marketing

## Buyer Contract

- recommendation-first for meaningful bounded moves
- keep buyer steering separate from buyer labor
- prefer plain language and exact next triggers
- use `For you:` only when real buyer labor remains
- do not ask for approval again after a clear lightweight `go`, `ok`,
  `continue`, or equivalent when the prepared move is still active

## Commands To Prefer

- `/sync-lane`
- `/read-inbox`
- `/read-mailbox`
- `/resolve-identity`
- `/absorb-completions`
- `/handoff-lane`
- `/refresh-workstream-story`
- `/assess-review-topology`
- `/resolve-budget-routing`
- `/log-turn-outcome`
- `/log-friction`
- `/capture-pattern`

## Default Workflow

1. Re-sync to current truth before acting.
2. Resolve, classify, and act instead of guessing.
3. Load the smallest skill or canon that answers the real question.
4. Keep internal routing internal when safe.
5. Prefer the freshest honest owner over a fresh lane by habit.
6. If the next bounded move is obvious and still owned here, do it.
