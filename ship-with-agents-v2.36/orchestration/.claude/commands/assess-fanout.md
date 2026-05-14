---
description: Assess whether current work should stay single-threaded or fan out safely
---

Assess the current workstream for safe fanout.

Read:

1. the relevant slice or plan doc
2. the current checkpoint if execution already started
3. the relevant workstream row in `health/workstreams.json`

Decide whether the work is:

- `single`
- `parallel-safe`
- `parallel-risk`

Use these questions:

- are file or responsibility boundaries disjoint
- is there one canonical parent slice
- do child lanes have explicit ownership
- would parallelism increase throughput without hiding collisions

Refresh the `fanout` and `risk` fields in `health/workstreams.json` if the
answer changed, then return the recommendation and why.
