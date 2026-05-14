# Execution Routing Gate

Use this before:

- keeping head inside detailed slice iteration
- deciding whether a super or agent should execute next
- deciding whether a direct agent exception is justified

This exists because the system needs a sharper answer to two questions:

- who should be collaborating on the slice right now?
- who should actually do the work?

## Core Truth

Supers supervise work.
Agents do work.
Head sets direction and approval boundaries.

If you add an extra review layer, its default collaboration partner on a live
execution slice is the current supervisory owner, not head.

## Slice Collaboration Boundary

Use this default:

- head = phase direction, approval, retarget, escalation
- review brain = pressure-test slice quality and launch readiness
- super = operational slice owner, execution routing owner
- agent = execution owner

Once a live coordination owner exists, detailed slice shaping should usually
happen between:

- the review brain
- and the current supervisory owner

not:

- head
- and the review brain

Head should re-enter mainly for:

- phase approval
- strategic retargeting
- explicit ownership reclaim
- unresolved disagreement that cannot be settled below

If the work is larger than one honest execution packet, the default next move
is usually not "head keeps iterating."
It is:

- review brain + super decide whether the work becomes a parent slice
- super owns child-slice fanout
- agents execute the child slices

When the slice becomes approved for supervised execution, the super is also the
default launch owner for the final child-agent artifact.
The review lane should challenge and approve, not generate a competing child
launch packet for the buyer to relay.

## Execution Boundary

Default rule:

- super owns supervision and execution routing
- agent owns implementation
- one super may own multiple active child execution slices when safe

Do not let the super drift into doing agent work just because the packet is
interesting or the buyer is waiting.

## Direct Agent Exception

A direct agent exception is allowed when all are true:

1. the task is small, bounded, and execution-shaped
2. the verification path is clear
3. the work does not need ongoing supervision, multiple child lanes, or
   repeated relaunches
4. the blast radius is low enough that a super-owned execution lane would be
   overhead rather than protection
5. there is no live super that should obviously own the execution routing
   instead, or the exception is being made explicitly
6. if the move uses a directly spawned helper, that helper runtime is verified
   at or below the configured execution default, or the buyer explicitly
   approved the stronger helper spend

If a live super already owns the workstream and the packet is tiny, prefer that
super launching the direct agent over opening a sibling supervisor.

In that case, head or a review brain may launch a direct agent instead of a
super-owned execution path.

## When Super-Owned Execution Is Mandatory

Prefer super-owned agent execution when any are true:

- the work will likely need follow-ups
- the work will likely need checkpoint tracking or relaunches
- multiple execution slices may branch from the same workstream
- the work is cross-repo, infra-dependent, or high-assurance
- the packet may need ongoing routing or supervision
- the work is part of a live supervised workstream already
- the work wants multiple child slices under one parent slice
- the next seam is still inside the same hot coordination boundary

## Decision Order

Before launching execution, ask:

1. is this still strategic/approval work for head?
2. is this detailed slice shaping between review brain and super?
3. is this actual implementation work for an agent?
4. should one super own several child slices instead of one giant slice?
5. does the direct agent exception truly apply?
6. if not, should a super own the execution lane?

## Fanout Rule

If one super already owns the workstream, do not spawn a second super only
because more throughput sounds attractive.

First ask whether the current super can safely own:

- a parent slice
- multiple child slices
- and several agent lanes with explicit collision boundaries
- the next dev-sized follow-on packet without losing context purity

Only escalate to multiple supers when the workstreams are strategically or
operationally independent enough that one super should not own the fanout.

## Good Patterns

```text
Head approves the phase.
Review brain and super refine the slice.
Super launches or spawns the execution agent.
```

```text
Head or review brain launches one direct agent only because the packet is tiny,
bounded, and not worth a fresh super lane.
```

## Bad Patterns

```text
Head and a review layer keep iterating the slice while the real super owner is
idle.
```

```text
Super starts doing implementation work instead of routing an agent.
```

```text
Review lane approves the slice and also emits the final child-agent launch body
for the super-owned workstream instead of waking the super.
```

```text
A direct agent is launched for work that obviously needs supervision,
follow-ups, and checkpoint ownership.
```

## Final Rule

If the buyer could reasonably ask:

"Why are these two review lanes still talking to each other instead of the
super?"

or:

"Why is the super doing work the agent should do?"

the execution routing boundary is probably being crossed.
