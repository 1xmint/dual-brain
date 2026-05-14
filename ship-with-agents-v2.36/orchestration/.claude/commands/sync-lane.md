---
description: Re-sync a lane to current truth before acting
---

Re-sync the current lane using the smallest honest truth sources:

1. identity resolution
2. runtime inbox and update index
3. active map if lane ownership matters
4. lane brain capsule if present
5. current slice or work doc
6. latest checkpoint or closeout if execution state matters

Return a short lane-state summary:

- display name
- stable lane
- routing id
- owner
- current state
- next move
- known truth
- inference
- missing truth
- whether the buyer actually needs to do anything now

If the lane cannot be resolved, return:

- `Lane identity unresolved:`
- attempted identities
- missing runtime surfaces
- smallest repair step

Do not report a clean lane sync if the lane record itself was not resolved.
