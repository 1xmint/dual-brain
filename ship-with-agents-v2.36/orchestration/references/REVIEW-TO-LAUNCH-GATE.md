# Review-To-Launch Gate

Use this when a slice is crossing from review into supervised execution.

This exists because one of the easiest ways to create awkward workflow is to
let several smart lanes all half-own the same launch boundary.

## Core Truth

At the review-to-launch boundary, exactly one live lane should own the final
action artifact.

For supervised execution, the default is:

- head = strategic approval only
- manager or review brain = challenge, approve, or revise
- super = launch owner and execution-routing owner
- agent = execution owner

Do not let review approval silently turn into launch ownership.

## Default Boundary

Once a live super owns the workstream:

1. the review lane challenges the slice
2. the canonical slice or linked review memo is updated
3. the slice records the approved launch truth
4. the super is woken or continues directly
5. the super emits the final launch artifact or direct spawn

The review lane should normally stop after step 3 unless ownership is
explicitly reclaimed.

## Single Launch Owner Rule

For supervised execution:

- the super owns the final child-agent launch artifact
- the manager/review lane does not produce a competing child launch packet
- head does not jump into the same launch unless ownership was reclaimed

If a review lane wants a different launch, it should change the approval truth
or challenge the slice, not mint a second launch body for the user to relay.

## Mode Decision Rule

Do not ask the user to choose between direct spawn, manual terminal launch, or
other launch modes unless there is a real unresolved tradeoff.

Choose automatically when local truth already makes the honest answer clear:

- exact runtime control matters -> manual terminal launch
- durable child lineage/checkpointing matters -> super-owned agent path
- tiny bounded task with no live super owner -> direct-agent exception

If there is no real decision left, do not manufacture one as "Mode A or B?"

## State Rule

Do not invent pseudo-states such as `execution_ready` unless the slice system
explicitly defines them.

Use the existing vocabulary:

- `status: approved`
- `launch_ready: yes`

and let the launch owner carry the actual transition into execution.

## Preferred Handoff Shape

If the review lane is not the launch owner, prefer:

1. `Update this doc:` if the review lane can validly tighten the slice or
   linked review memo
2. `Wake <live lane>:` if the launch owner already exists and the doc
   truth is current

Prefer full `Paste this into ...` only when the launch owner cannot reasonably
reconstruct the next step from the canonical artifacts.

If the launch owner is already live, the doc truth is current, and the current
lane can route the handoff internally, do that first.
But if supervised execution is expected to continue now and the launch owner is
unlikely to read the routed handoff without a buyer nudge, also surface one
tiny pickup trigger instead of ending with `No user action needed:`.

If the review/launch boundary itself is still a workflow-shape choice the operator
would reasonably want to steer, use `Recommended next move:` with one clear
path and say you will execute the routing or launch after `go`.

## Anti-Patterns

- manager approves the slice and also writes the final child-agent launch body
- manager or super asks the user to confirm "launch-ready" or confirm the
  first technical seam before the lane will draft the exact bounded slice it
  already knows how to produce
- manager or super treats user approval for writing the implementation slice
  doc itself as the blocking decision, even though the slice content is the
  next owned artifact and no real user-owned boundary is being crossed
- super asks the user to choose launch mode even though the correct launch mode
  is already clear from the slice and local truth
- head, manager, and super all emit different launch-ish instructions for the
  same child lane
- the user becomes the glue between review approval and the final launch owner
- the system silently chooses the next launch owner when the operator would reasonably
  expect to guide that handoff

## Final Rule

If the user could reasonably ask:

"Why didn't the real launch owner just read the approved slice and own the
launch?"

the review-to-launch boundary was probably crossed.

