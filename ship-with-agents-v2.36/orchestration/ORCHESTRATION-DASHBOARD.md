# Orchestration Dashboard

The health registry is the compact machine-checkable layer.

This dashboard is the compact human-readable layer.

Use it to answer the questions that most often slow orchestration down:

- what is active now
- what is blocked now
- what needs pickup now
- what is safe to wait on
- what is at risk of false closeout

## Runtime File

Keep the live dashboard at:

- `health/DASHBOARD.md`

The dashboard should summarize:

- `health/summary.json`
- `health/workstreams.json`
- the active map
- the update bus
- the smallest relevant slice, checkpoint, or closeout truth

## Required Sections

- `Overall Status`
- `Pickup Now`
- `Blocked Or Risky`
- `Parallelism`
- `Closeout Gaps`
- `Recommended Next Move`

## Rules

- keep it short enough to scan in under a minute
- prefer links or file pointers over repeated prose
- if a workstream is routed but not truly moving, put it in `Pickup Now`
- if a workstream is safe to wait on, do not inflate it into false urgency
- if the dashboard and artifacts disagree, refresh the dashboard and trust the
  artifacts

## Best Uses

- super startup sync
- manager control-plane review
- doctor drift checks
- end-of-session sanity check
- restart or resume after a break
