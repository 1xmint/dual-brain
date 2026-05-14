# Doctor Sweep Protocol

Use this when doctor needs a whole-system survey instead of a narrow one-off
audit.

## Goal

Turn doctor from a reactive reviewer into a reliable system surveyor.

## Sweep Inputs

Read in this order:

1. `ACTIVE-CHAT-MAP.md`
2. `ACTIVE-WORKSTREAMS.md`
3. `health/summary.json`
4. `health/workstreams.json`
5. `health/DASHBOARD.md`
6. `observability/metrics.json`
7. `observability/heartbeats.json`
8. `observability/lane-awareness.json`
9. `observability/unresolved-issues.json`
10. `observability/turn-events.jsonl`
11. `observability/evidence.md`
12. `observability/doctor-deletions.jsonl`
13. `observability/stop-decisions.jsonl` when stop-gate behavior is the
    question

Then read only the smallest slices, checkpoints, closeouts, logs, or inbox
files needed to confirm the top risks.

## Sweep Steps

1. enumerate live lanes
2. enumerate active workstreams
3. compare map, workstream, dashboard, and observability truth
4. detect stale, orphaned, half-born, or ghost lanes
5. score lane awareness for meaningful active lanes
6. inspect unresolved frustrations and open doctor-attention items
7. compare recent doctor additions versus deletions when doctrine churn is the
   concern
8. identify the top 3 current system risks
9. repair what doctor can repair safely
10. route the rest with exact ownership

## Primary Outputs

Return:

1. `Doctor sweep status:`
2. `Top current risks:`
3. `Broken or orphaned lanes:`
4. `Unresolved user frustrations:`
5. `Repairs applied now:`
6. `Exact next owner for remaining items:`
7. `Doctor churn signal:`

## Final Rule

A sweep is incomplete if it names system risk but leaves obvious recoverable
runtime defects untouched.
