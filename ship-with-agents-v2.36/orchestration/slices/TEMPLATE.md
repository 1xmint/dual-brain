---
id: slice-YYYYMMDD-slug
title: Replace me
slice_kind: standalone
status: draft
launch_ready: no
assurance_level: A1
owner_lane: unassigned
supervisory_lane: unassigned
execution_lane: unassigned
launch_owner: unassigned
operator_action_owner: unassigned
launch_mode: undecided
parent_slice: none
depends_on: []
parallel_safe: no
child_execution_lanes: []
target_surface: claude_terminal
budget_posture: default
checkpoint: checkpoints/replace-me.md
review_memo: none
last_updated_by: replace-me
---

# Slice: Replace Me

## Goal

One sentence outcome.

## Why This Exists

- what this unblocks
- why now

## Scope

- what this slice is allowed to do

## Non-Goals

- what this slice must not do

## Prerequisites

- live facts that must be true before launch

## Current State

- repo or product truth already verified
- assumptions not yet verified

## Slice Shape And Fanout

- `slice_kind:` `standalone` / `parent` / `child`
- `supervisory_lane:` who owns launch and child routing
- `parent_slice:` path or `none`
- `depends_on:` slice IDs, checkpoints, or `[]`
- `parallel_safe:` `yes` / `no` / `after-<dependency>`
- `child_execution_lanes:` active children or `[]`
- `owned surface:` exact repo/files this slice may move

## Inputs

- repo docs, ADRs, specs, issues, or prior checkpoints to read first

## Verification Path

- checks, tests, queries, or review evidence required before closeout

## Review And Approval

- supervisory owner:
- second-brain reviewer:
- approval owner:
- launch owner:
- operator action owner:
- launch mode:
- review status:
- open concerns:

## Execution Plan

- smallest honest next action
- stop conditions
- escalation conditions

## Parallelism And Fanout

- launch now:
- hold for dependency:
- cannot overlap with:
- merge / collision risks:
- current WIP target:

## Next Action Delivery

- delivery mode:
- target session or user:
- wake target:
- target doc or artifact:
- exact user action:

## Launch Stub

Use this when the slice is approved.

The lane named in `launch_owner:` owns the final user-facing launch artifact
when this slice moves into execution.

If this is a `parent` slice, launch from child slices instead of sending the
parent slice straight to implementation.

```text
Read `orchestration/references/START-AGENT.md`.

This is agent chat <session-id>.
Canonical slice doc: slices/<this-file>.md
```

Launch command goes in a separate code block after the startup body.

## Checkpoint And Closeout

- checkpoint path:
- expected lane-state action at closeout:
- expected next session if rotating:

## Review Notes

### Supervisory proposal

- replace me

### Review-brain challenge

- replace me

### Resolution

- replace me

