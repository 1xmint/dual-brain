---
description: Compare the routing index, health registry, and dashboard for orchestration drift
---

Audit state consistency across:

1. `ACTIVE-WORKSTREAMS.md`
2. `health/workstreams.json`
3. `health/DASHBOARD.md`

Check for:

- workstream names or ids that no longer line up
- owner mismatches
- pickup urgency mismatches
- dashboard claims that contradict the machine-checkable state
- active routing entries that still point at placeholder or stale health rows

Return:

1. any consistency failures
2. the smallest repair order
3. whether orchestration is safe to trust right now

If the views disagree, trust the canonical work artifacts first, then repair
the three state views in this order:

1. `ACTIVE-WORKSTREAMS.md`
2. `health/workstreams.json`
3. `health/DASHBOARD.md`
