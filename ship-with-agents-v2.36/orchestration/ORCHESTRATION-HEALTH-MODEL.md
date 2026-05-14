# Orchestration Health Model

The system needs a small machine-checkable health layer so it can be more
self-aware than a pile of smart markdown.

Use this model as the first structured sidecar for orchestration truth.

## Why This Exists

Canonical docs remain the human source of truth:

- slices
- reviews
- checkpoints
- closeouts
- update bus

The health layer does not replace them. It summarizes them into a compact state
that can be checked quickly by commands, hooks, doctors, and future tooling.

## Runtime Files

Keep the runtime health layer under `health/`:

- `health/summary.json`
- `health/workstreams.json`
- `health/DASHBOARD.md`

Keep the doctor observability layer under `observability/`:

- `observability/turn-events.jsonl`
- `observability/evidence.md`
- `observability/metrics.json`

Optional future additions:

- `health/lanes.json`
- `health/events.json`

## What `summary.json` Carries

`summary.json` is the top-level orchestration status snapshot.

Recommended fields:

- `lastUpdated`
- `updatedBy`
- `overallStatus`
- `strategicFoundation`
- `momentum`
- `fanout`
- `continuity`
- `closeoutDiscipline`
- `observability`
- `reviewTopology`
- `reviewStateDiscipline`
- `recommendationClarity`
- `managerLoad`
- `contextPurity`
- `topRisks`
- `recommendedNextMove`

Use `green`, `yellow`, or `red` for status fields.

## What `workstreams.json` Carries

`workstreams.json` is the compact per-workstream state list.

Recommended fields per row:

- `id`
- `routingName`
- `repoSlug`
- `repoRootOrWorktree`
- `owner`
- `reviewCellId`
- `reviewTopology`
- `assuranceLevel`
- `executionOwner`
- `reviewOwner`
- `auditOwner`
- `approvalOwner`
- `executionProvider`
- `reviewProvider`
- `auditProvider`
- `approvalProvider`
- `diversityType`
- `topologyVerified`
- `providerBindingVerified`
- `handoffEvidenceStatus`
- `coverageStatementStatus`
- `reviewState`
- `recommendationState`
- `approvalState`
- `nextOwner`
- `pickupRequired`
- `buyerSteerRequired`
- `providerRoles`
- `slice`
- `phase`
- `status`
- `pickupStatus`
- `readiness`
- `fanout`
- `checkpoint`
- `lastVerified`
- `contextPurity`
- `managerLoad`
- `providerDiversity`
- `nextAction`
- `risk`
- `dashboardBucket`

Repo rule:

- if more than one repo or worktree is active, `repoSlug` and
  `repoRootOrWorktree` should not stay implicit
- if the work is clearly single-repo, those fields may still be present with
  short values instead of being omitted

Recommended values:

- `status`: `active`, `waiting`, `blocked`, `closing`, `done`
- `pickupStatus`: `active`, `pending`, `nudge-now`, `stale`, `closed`
- `readiness`: `green`, `yellow`, `red`
- `fanout`: `single`, `parallel-safe`, `parallel-risk`
- `reviewState`: `scoping`, `challenge_pending`, `challenge_active`,
  `recommendation_ready`, `awaiting_buyer_steer`, `approved_for_launch`,
  `launch_owned`, `execution_active`, `audit_pending`, `closed`
- `topologyVerified`: `missing`, `declared-only`, `observed`
- `providerBindingVerified`: `missing`, `declared-only`, `observed`
- `handoffEvidenceStatus`: `missing`, `declared-only`, `observed`
- `coverageStatementStatus`: `missing`, `partial`, `complete`
- `diversityType`: `single-lane`, `prompt-diverse`, `provider-diverse`,
  `unknown`

For workstreams above `T1`, `reviewCellId`, `reviewTopology`,
`executionOwner`, `reviewOwner`, `approvalOwner`, `assuranceLevel`,
`executionProvider`, `reviewProvider`, `approvalProvider`,
`topologyVerified`, and `providerBindingVerified` should not stay implicit.
If exact truth is not yet known, record `unknown` or `declared-only` instead of
pretending the topology is verified.

## Updating Rules

- Update the health layer when the real state changes, not on every turn.
- Prefer refreshing an existing row over creating duplicates.
- Keep the slice doc and checkpoint as the detailed truth.
- Keep health notes short and machine-friendly.
- Do not mark a workstream `done` here if the closeout truth is not done.
- Do not mark pickup as healthy if the next live owner has not actually picked
  it up and waiting is not acceptable.

## When To Refresh

Refresh the health layer when any of these happen:

- a workstream is launched
- ownership changes
- a checkpoint meaningfully changes
- a lane becomes blocked or idle
- active pickup matters now
- review topology changes
- review state or recommendation state changes materially
- a manager becomes stretched or overloaded
- a closeout is written
- a doctor audit finds orchestration drift

## Commands That Should Use It

- `/assess-health`
- `/assess-momentum`
- `/assess-fanout`
- `/refresh-health-dashboard`
- `/audit-state-consistency`
- `/assess-review-topology`
- `/assess-review-state`
- `/assess-context-purity`
- `/assess-provider-mix`
- `/draft-recommendation`
- `/form-review-cell`
- `/resolve-next-owner`
- `/score-cell-health`
- `/score-dual-brain-health`
- `/choose-brain-topology`
- `/log-turn-outcome`
- `/assess-observability`
- future: `/score-launch-readiness`
- future: `/assess-closeout`

## Doctor Use

Doctor should treat the health layer as a fast signal, not the only truth.

Doctor should treat the observability layer as the compact evidence sidecar for
how live turns actually behaved.

- If health says `green` but the artifacts disagree, trust the artifacts.
- If the artifacts are current but health is stale, refresh health.
- If the artifacts are unclear, doctor should call that out instead of faking
  confidence.
- If a meaningful turn changed state but no compact turn receipt exists, treat
  observability as stale even if the prose summary sounds confident.
