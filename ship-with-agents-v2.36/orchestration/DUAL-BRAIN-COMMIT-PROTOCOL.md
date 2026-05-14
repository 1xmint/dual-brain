# Dual-Brain Commit Protocol

Use this for standard `T3` manager/super collaboration.

## Core Truth

Dual-brain quality comes from a clean handshake, not just two chats existing.

## Standard Handshake

1. `super` frames the execution-shaped slice or routing proposal
2. `manager` challenges the slice, seam, assumptions, and quality bar
3. canonical truth is updated:
   - slice
   - linked review memo
   - workstream cell state when needed
   - provider / diversity / assurance fields when the work is above `T1`
4. `manager` records approval truth or blocked truth
5. `super` owns launch or next coordination action
6. `agent` owns implementation

When steps 2-5 happen for `T3+` work, emit one structured `dual-brain-handoff`
turn event with:

- `reviewCellId`
- `reviewTopology`
- `assuranceLevel`
- `executionOwner`
- `reviewOwner`
- `approvalOwner`
- provider bindings
- `topologyVerified`
- `providerBindingVerified`
- approval state outcome

## Manager Responsibilities

- challenge scope quality
- challenge seam choice
- challenge whether the work deserves more or less review density
- record approval state clearly
- avoid silently turning approval into launch ownership

## Super Responsibilities

- keep execution shape honest
- convert approved truth into launch or routing action
- avoid bouncing bounded ambiguity back to the buyer by habit
- keep momentum real after review

## Final Rule

If manager and super cannot point to one canonical artifact and one explicit
next owner, and the control plane cannot show whether that handshake is only
declared or actually observed, the dual-brain loop is not complete yet.
