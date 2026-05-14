# Observability Runtime

This directory holds runtime evidence about what live lanes actually did.

Use it to make doctor stronger without turning the repo into a transcript dump.

## Files

- `turn-events.jsonl`: structured meaningful-turn outcomes
- `impact-events.jsonl`: structured cross-workstream change and impact events
- `evidence.md`: selective quoted evidence for failures and wins
- `metrics.json`: compact derived observability health
- `heartbeats.json`: lane freshness and lifecycle heartbeat state
- `lane-awareness.json`: doctor-friendly lane awareness scorecards
- `unresolved-issues.json`: still-open frustrations and system issues
- `doctor-dashboard.md`: compact doctor-facing control-plane summary

## Rules

- event-first, evidence-selective, metric-driven
- do not log every tiny turn
- do not let quoted evidence become a full transcript archive
- keep event IDs and evidence references aligned
- keep impact events aligned with real dependency or topology changes
- keep unresolved issues and lane-awareness state aligned with real live lanes
