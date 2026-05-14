# Unresolved Issues Register

Use this to track frustrations and high-signal system issues that are still
open across live lanes.

## What Belongs Here

- user frustrations not yet resolved
- repeated bridge or routing failures
- delivery-mode regressions
- known stale-state or orphan-lane defects
- fixes that were claimed but not yet proven

## Required Fields

- `issueId`
- `openedAt`
- `openedBy`
- `workstreamId`
- `ownerLane`
- `issueType`
- `severity`
- `status`
- `lastTouchedAt`
- `resolutionTarget`
- `notes`

## Status Values

- `open`
- `watch`
- `repairing`
- `blocked`
- `resolved`

## Final Rule

If a user frustration is visible in live turns but not in the unresolved issue
register, doctor awareness is incomplete.
