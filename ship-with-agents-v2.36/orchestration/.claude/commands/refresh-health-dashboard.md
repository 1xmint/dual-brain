---
description: Refresh the compact human-readable orchestration dashboard from current truth
---

Refresh `health/DASHBOARD.md` using the smallest honest sources:

1. `health/summary.json`
2. `health/workstreams.json`
3. active map and update index
4. the smallest relevant slice, checkpoint, or closeout files

Rules:

- keep the dashboard compact
- include all required sections from `ORCHESTRATION-DASHBOARD.md`
- treat `Pickup Now` as a real urgency queue, not a parking lot
- if nothing needs immediate pickup, say so plainly
- if the dashboard and artifacts disagree, repair the dashboard to match the
  artifacts

Return the refreshed overall status, the pickup-now queue, and the one
recommended next move.
