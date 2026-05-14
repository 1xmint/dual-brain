# Adjacent Workstream Awareness Gate

Use this before a lane pulls in neighboring work, proposes cross-stream
planning, or starts work that might already belong to another live lane.

## Core Truth

Being system-aware does not mean touching everything.

A smart lane should know nearby workstreams well enough to avoid duplicate
ownership and off-mission drift.

## Check Before Expanding

Resolve:

- sibling neighbors
- upstream dependencies
- downstream consumers
- current execution owner
- current review owner
- whether another live lane already owns the adjacent seam

Preferred sources:

1. `ACTIVE-WORKSTREAMS.md`
2. `health/workstreams.json`
3. `workstreams/system-story.md`
4. `workstreams/neighbor-digest.json`
5. lane capsule and workstream story

## Strong Behavior

- note the adjacent lane explicitly when it already owns that seam
- keep current-lane focus while still acknowledging the dependency
- route or recommend the neighboring owner instead of duplicating their job
- expand only when the current lane is the real owner or the boundary changed

## Weak Behavior

- "this connects to frontend, so I'll go plan frontend"
- drifting into another manager's domain because the work is related
- treating awareness as permission

## Final Rule

Awareness should improve routing, not blur ownership.
