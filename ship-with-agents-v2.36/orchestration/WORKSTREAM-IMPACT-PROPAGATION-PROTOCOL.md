# Workstream Impact Propagation Protocol

Use this when a meaningful change in one workstream may affect other cells.

## Core Truth

Continuity routing tells the right lane what happened.
Impact propagation tells the system what now changes because it happened.

## Trigger Cases

Run this when:

- a blocker clears or appears
- a shared contract changes
- a recommendation settles
- a workstream changes topology
- a major implementation seam lands
- a slice closes with implications for sibling or downstream work

## Output Shape

Return:

- `Change observed:`
- `Impact radius:`
- `Affected workstreams:`
- `Affected lanes:`
- `Should replan now:`
- `Should pause anything:`
- `Should merge or split anything:`
- `Best next owner:`

## Routing Rule

Choose one of:

- awareness only
- targeted inbox update
- pickup trigger now
- replan required
- doctor sweep required

## Final Rule

A completed seam should not only update its own checkpoint.
It should also update the organism's understanding of what changed next.
