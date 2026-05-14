# Slice State Rules

Use this to keep live work docs legible and launch-safe.

## Core Truth

If a slice does not have an explicit state, people will guess.

Guessed state creates:

- accidental launches
- fake approvals
- ghost workstreams
- review drift

## States

### `draft`

The slice exists but is still being shaped.

Use when:

- scope is still moving
- verification is incomplete
- ownership is not yet settled

### `in_review`

The slice is stable enough for challenge and approval work.

Use when:

- the scope is written
- the verification path is defined
- the next question is "is this ready?" rather than "what is this?"

### `approved`

The slice is launchable.

This should mean:

- ownership is clear
- review requirements were satisfied
- launch target is named
- checkpoint path is set

### `in_progress`

Execution has started.

The canonical slice should now point to:

- active execution lane
- checkpoint path
- known blockers if any

### `blocked`

Execution or review cannot continue honestly.

Name:

- blocker
- owner of unblock
- next expected move

### `paused`

The slice is intentionally inactive but still expected to return.

Use when:

- another priority jumped ahead
- the work is waiting on external input
- the lane is being parked cleanly

### `done`

Execution and closeout both completed.

This should mean:

- evidence exists
- review is complete
- lane-state cleanup is complete

### `abandoned`

The slice will not continue.

Use this instead of leaving a stale `draft` forever.

## Launch Rule

Only `approved` slices should launch new execution lanes.

If the slice is `draft` or `in_review`, keep reviewing instead of pretending
the worker should sort it out live.

## Closeout Rule

`done` is stronger than "work appears complete."

To mark `done`, also verify:

- checkpoint or completion evidence exists
- any required review completed
- active-lane state was cleaned up
- closeout packet exists when the lane required it

## Minimal Fields

At minimum, every live slice should carry:

- `status`
- `owner_lane`
- `assurance_level`
- `launch_ready`
- `checkpoint`
- `last_updated_by`

If those are missing, the slice is too vague to be the canonical artifact.
