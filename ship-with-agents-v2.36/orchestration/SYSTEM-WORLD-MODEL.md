# System World Model

Use this when the system needs to think like one organism instead of a set of
smart isolated lanes.

## Core Truth

The system should model:

- lanes as actors
- workstreams as cells
- review cells as challenge structures
- change events as signals
- dependencies as relationships
- conflicts and opportunities as first-class coordination truth

## What Must Be Explicit

For every meaningful active workstream, keep explicit:

- mission
- scope
- repo slug and root or worktree
- execution owner
- review owner
- audit owner
- upstream dependencies
- downstream consumers
- sibling neighbors
- shared contracts touched
- current change event
- impact radius

## Relationship Types

Use these relationship labels when useful:

- `upstream`
- `downstream`
- `sibling`
- `shared-surface`
- `review-neighbor`
- `blocked-by`
- `unblocks`
- `candidate-merge`

## Final Rule

If the system knows who exists but not how those things affect one another, it
has continuity, not collective intelligence.
