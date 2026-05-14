# Workstream Cell Registry

Use this as the compact shape for one meaningful active workstream.

## Core Truth

The system should track workstreams as cells, not just as chats.

One cell should clearly say:

- what the work is
- who owns execution
- who owns review
- what repo it belongs to
- what phase and chunk are current
- what should happen next
- what review state the cell is currently in
- what it depends on
- what it unlocks
- what nearby cells it should stay aware of

## Minimum Row Shape

- `workstream id`
- `stable lane key`
- `review cell id`
- `repo slug`
- `repo root or worktree`
- `phase`
- `chunk`
- `state`
- `review topology`
- `execution owner`
- `review owner`
- `audit owner`
- `upstream dependencies`
- `downstream consumers`
- `sibling neighbors`
- `shared contracts`
- `latest change event`
- `impact radius`
- `pickup confidence`
- `next action`
- `slice`
- `checkpoint`

For active automation state, pair this with `REVIEW-STATE-MACHINE.md`,
`REVIEW-CELL-MODEL.md`, and the structured `health/workstreams.json` row.
