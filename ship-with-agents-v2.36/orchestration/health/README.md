# Health Runtime

This directory is the first machine-checkable sidecar for workflow health.

Human-readable source of truth still lives elsewhere:

- slices
- reviews
- checkpoints
- closeouts
- updates

Use the health files here to summarize that truth compactly for commands,
doctor checks, and future automation.

Observability lives in the sibling `observability/` directory:

- structured events
- selective evidence excerpts
- derived behavior metrics

## Files

- `summary.json`: top-level orchestration status snapshot
- `workstreams.json`: per-workstream compact state
- `DASHBOARD.md`: compact human-readable control-plane view

## Rules

- keep values short and structured
- refresh when state changes meaningfully
- do not invent health confidence that the underlying artifacts do not support
- prefer explicit `yellow` or `red` over vague optimism
- keep review topology, context purity, and manager load honest too
