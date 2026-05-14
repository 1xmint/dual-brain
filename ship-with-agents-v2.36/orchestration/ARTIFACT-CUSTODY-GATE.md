# Artifact Custody Gate

Use this before directly editing a canonical slice, review memo, checkpoint,
launch tail, or other workstream-defining runtime artifact.

This exists because tool capability and strategic approval are not enough by
themselves to justify mutating the canonical artifact of a workstream.

## Core Truth

The lane that operationally owns a workstream normally also owns the canonical
artifact that defines:

- current scope
- current state
- launch readiness
- expected next session
- execution-lane target
- launch tail

Do not let "I can edit the file" silently replace "I am the right lane to edit
the file."

## Four Different Authorities

Name these separately when the work is meaningful:

- `Strategic owner:` approves direction or phase changes
- `Operational owner:` owns the workstream and its child lanes
- `Artifact custodian:` owns mutation of the canonical runtime artifact
- `Execution owner:` performs implementation work

Do not collapse them into one implied actor.

## Default Custody Rule

If custody has not explicitly changed:

- artifact custody stays with the operational owner of the workstream
- higher layers may approve, reject, or annotate without mutating the owned
  canonical artifact
- direct-edit permission for runtime docs only applies after custody is valid

In normal operation:

- head owns head-level logs, roadmap/TODO direction, and its direct runtime
  artifacts
- a manager-like coordination owner owns its workstream slice and child-lane
  launch tail
- super owns its own checkpoints, closeout truth, and child execution artifacts

## Approval Does Not Automatically Grant Mutation

Approval alone does not automatically authorize a higher layer to change:

- `status:`
- `launch_ready:`
- `execution_lane:`
- `expected next session:`
- launch blocks
- child-lane routing notes

inside a workstream artifact still owned by another live coordination lane.

If head approves a manager-owned slice, the normal next move is:

- head states the decision
- artifact custody remains with the operational owner
- the owner updates the canonical slice or emits the launch

not:

- head directly rewrites the slice tail and launches the next super

## What Higher Layers May Still Do

A higher layer may still:

- write a separate review memo
- paste an exact owner-targeted update block
- state approval or rejection
- reclaim ownership and custody explicitly

If you only need to record approval without changing the lower owner's
artifact, prefer a separate review memo or exact routing block.

## Reclaiming Custody

If a higher layer truly needs to mutate the canonical artifact, say it plainly:

- `Ownership change: operational owner <old> -> <new>`
- `Custody change: artifact custodian <old> -> <new>`

If those lines are missing, custody did not move.

After reclaiming custody:

- update the active map if needed
- say who now owns future launch and closeout mutations

## Direct-Edit Rule

Before directly editing a canonical runtime artifact, ask:

1. am I tool-capable?
2. am I the operational owner?
3. if not, am I the explicit artifact custodian?
4. if not, has custody been explicitly reclaimed?

If 2, 3, and 4 are all no, do not directly mutate the canonical artifact.

Route through one of these instead:

- `Paste this into <owner-lane> (<role>):`
- `Update this doc:` with an exact owner-targeted replacement or append block
- a separate review memo

## Launch-Tail Rule

The lane that owns the canonical launch tail should normally also own changes
to:

- `launch_ready`
- execution session ID
- launch stub
- final launch command

Do not let a higher layer silently "finish the launch for them" just because it
noticed a cleaner model or tail.
If a live super owns supervised execution, do not let a review lane mint a
competing child-agent launch packet for that same boundary.
Update approval truth, then wake the launch owner instead.

## Good Pattern

```text
Head decision:
- approved
- operational owner remains the active manager for this workstream
- artifact custodian remains that same live manager lane

Paste this into the active manager chat for this workstream:
[exact routing or doc-update block]
```

## Bad Pattern

```text
Head approves a manager-owned slice, rewrites its launch tail, changes the
execution lane, and emits the launch itself without reclaiming custody.
```

## Final Rule

If the user could reasonably ask:

"Why did this higher lane edit the lower owner's slice instead of routing it
back?"

artifact custody was probably crossed without explicit transfer.
