# Review Cell Model

Use this when the system needs to describe one meaningful workstream cleanly.

## Core Truth

The right unit of orchestration is often not "a chat."
It is a review/execution cell with explicit functions.

## Cell Functions

Each meaningful workstream may have:

- `strategic owner`
- `execution coordinator`
- `execution owner`
- `review owner`
- `audit owner`
- `approval owner`

Not every cell needs all six functions as separate lanes.

## Minimum Honest Recording

For cells above trivial size, record:

- `review cell id`
- `review topology`
- `assurance level`
- `execution owner`
- `review owner`
- `audit owner` or `none`
- `approval owner`
- `execution provider`
- `review provider`
- `approval provider`
- `audit provider`
- `diversity type`
- `topology verified`
- `provider binding verified`

Use the smallest honest artifact:

- slice
- active workstreams index
- health/workstreams row
- review memo

For active state, pair this model with `REVIEW-STATE-MACHINE.md` and the
workstream health row rather than inventing a second empty registry surface.

## Example

- `reviewCellId`: `cell-search-cli`
- `reviewTopology`: `T3`
- `assuranceLevel`: `A2`
- `executionOwner`: `super-1-search-cli`
- `reviewOwner`: `manager-2-search-cli`
- `auditOwner`: `none`
- `approvalOwner`: `manager-2-search-cli`
- `executionProvider`: `claude-terminal`
- `reviewProvider`: `desktop-gpt`
- `approvalProvider`: `desktop-gpt`
- `auditProvider`: `none`
- `diversityType`: `provider-diverse`
- `topologyVerified`: `declared-only`
- `providerBindingVerified`: `declared-only`

## Final Rule

If the system cannot clearly name who is executing, who is reviewing, who is
approving, and what kind of diversity is actually present, the cell is not
routed cleanly enough yet.
