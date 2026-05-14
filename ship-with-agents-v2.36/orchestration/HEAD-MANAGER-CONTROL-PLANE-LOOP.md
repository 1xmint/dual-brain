# Head Manager Control Plane Loop

Use this before major routing, lane-shape, review-topology, or escalation
decisions.

## Core Truth

Head and manager should not act like smart isolated chats.
They should read the same living control plane.

## Read Order

Before a major routing move, read in this order:

1. `ACTIVE-CHAT-MAP.md`
2. `ACTIVE-WORKSTREAMS.md`
3. `health/workstreams.json`
4. `health/DASHBOARD.md`
5. `workstreams/system-story.md`
6. `workstreams/neighbor-digest.json`
7. `observability/impact-events.jsonl`
8. the smallest relevant slice, checkpoint, or closeout

## What To Check

- whether the active map shows a clear display name before any routing id
- which workstreams are actually active
- which repo each one belongs to
- who owns execution
- who owns review
- which review topology each cell has
- which review state each cell is in
- whether a default recommendation already exists
- whether the buyer is expected to steer or only be informed
- whether one manager is stretched or overloaded
- what changed recently that should reshape another cell
- whether dependencies, conflicts, or opportunities changed
- what should move now

## Failure Signal

If a head or manager recommendation ignores current live workstream truth and
sounds like it came from memory alone, refresh the control plane first.

If a top-layer lane can technically route correctly but still leaves the user
guessing what `m5.2r2` or `s5.2-w5-r2` means, the control plane is carrying too
much backend naming debt on its human surface.

## Final Rule

The higher the role, the less acceptable it is to route from stale mental
context when live system files should carry the truth.
