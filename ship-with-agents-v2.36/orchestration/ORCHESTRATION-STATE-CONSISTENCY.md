# Orchestration State Consistency

One workstream should not become three different stories.

Use this rule to keep the main orchestration state views aligned:

- `ACTIVE-WORKSTREAMS.md`
- `health/workstreams.json`
- `health/DASHBOARD.md`

## One Workstream, Three Views

Each active workstream has three distinct views:

1. routing view
2. machine-checkable view
3. fast human-readable view

Those views exist for different reasons, but they should still describe the
same current truth.

## What Each View Owns

### `ACTIVE-WORKSTREAMS.md`

Owns the compact routing index:

- what workstreams are active
- who owns them
- what phase they are in
- what slice and checkpoint matter

### `health/workstreams.json`

Owns the compact machine-checkable state:

- workstream id
- owner
- status
- pickup state
- readiness
- fanout
- risk

### `health/DASHBOARD.md`

Owns the fast human-readable status snapshot:

- what needs pickup now
- what is blocked or risky
- what is safe to parallelize
- what closeout gaps still exist
- what next move most improves health

## Alignment Rules

- the workstream id or name should map clearly across all three views
- owner changes should be reflected in all three views
- if pickup urgency changes, update JSON and dashboard, not just one
- if a workstream closes, remove or move it from active views consistently
- if the dashboard says a workstream needs pickup now, the JSON should not say
  `closed`
- if `ACTIVE-WORKSTREAMS.md` says a workstream is active, the JSON should not
  still be an unrelated placeholder row

## Update Order

When current truth changes meaningfully:

1. update the canonical work artifact if needed
2. update `ACTIVE-WORKSTREAMS.md`
3. update `health/workstreams.json`
4. refresh `health/DASHBOARD.md`

Do not reverse this order unless you are explicitly diagnosing drift.

## When To Audit Consistency

- after new workstream launch
- after owner handoff
- after a meaningful checkpoint
- after a closeout
- after a doctor audit
- when orchestration feels fuzzy or contradictory

## Command

Use:

- `/audit-state-consistency`

That command should compare the three views and call out any drift before the
system acts too confidently.
