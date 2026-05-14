---
description: Assess orchestration health and refresh the compact health registry
---

Assess current orchestration health using the smallest honest truth sources:

1. `health/summary.json`
2. `health/workstreams.json`
3. active map, update index, and relevant inbox items
4. the smallest relevant slice, checkpoint, or closeout files

Then:

- refresh `health/summary.json` if the current summary is stale or inaccurate
- refresh `health/workstreams.json` if owner, pickup, readiness, or risk truth
  changed
- score at least:
  - strategic foundation
  - momentum
  - fanout
  - continuity
  - closeout discipline
  - observability
  - review topology
  - manager load
  - context purity

Return:

1. current overall status
2. top risks
3. the one next move that most improves system health

Do not fake precision. If artifacts disagree, say so and mark health conservatively.
