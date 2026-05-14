# Operator Action Ownership Gate

Use this when a response is about to produce a human-facing copy block,
launch sequence, or next-step instruction.

This file exists because docs can already be correct while the wrong lane still
acts like the UI layer.

## Core Truth

Keep these responsibilities separate:

- docs are truth
- execution lanes produce state
- coordination lanes surface operator actions

The lane that knows the latest execution truth is not always the lane that
should emit the final human-facing copy block.

## Default Ownership Rule

When a good app-lane coordination owner is already active, that lane should
usually own the final human-facing operator action.

Examples:

- head app lane surfaces strategic user actions
- manager or review app lane surfaces supervised launch or routing actions
- terminal super updates slice/checkpoint truth and reports execution state
- terminal agent updates checkpoint truth and reports completion or blockers

## Preferred Flow

Use this order by default:

1. update canonical doc truth
2. report execution truth or launch judgment to the active coordination owner
3. let that higher-quality control plane surface the final operator action
   only if a real user action is needed

If no real user action is needed, prefer a short state report or
`No user action needed:` tail over inventing a decorative operator step.

If a real user action does remain because another passive live lane still needs
to be nudged now, the best control-plane lane should own that tiny pickup
trigger explicitly.

This means terminal lanes usually prefer:

- checkpoint updates
- slice updates
- review memo updates
- update-bus entries
- targeted runtime inbox routing
- wakes
- execution reports

over directly acting as the user-facing copy surface.

If a terminal lane knows the buyer may still see the report directly, it must
run `TERMINAL-REPORT-CONVERSION-RULE.md` so the report is converted into a
buyer-ready closeout shape instead of stopping at machine truth.

## When Terminal Lanes May Still Own The Action

A terminal lane may emit the final human-facing operator action when one of
these is true:

- no better app-lane coordination owner is active
- the terminal lane is the only live owner with enough context
- the user explicitly asked that lane for the launch artifact
- the action is urgent and routing upward would add pointless delay
- the terminal lane itself is the cleanest control plane for the moment

Even then:

- keep the action tail small
- prefer one exact artifact
- do not restate the whole slice if the doc is already current

## Collaboration Rule

Before emitting a copy block, ask:

- who owns the canonical truth?
- who owns execution?
- who is the highest active lane with good UX for the human?
- does the user actually need an action now, or only state awareness?
- could I or another live lane retrieve the missing artifact directly instead
  of telling the buyer to go get it?
- would `No user action needed:` be cleaner than a visible operator step?
- would a wake or execution report be cleaner than a fresh copy block?
- could I route this to the active owner through the runtime inbox instead of
  asking the user to carry it?

If an active coordination lane can surface the action more cleanly, prefer that.

## Good Pattern

- super updates the slice and checkpoint
- super reports:
  - approved for child launch
  - blocked by infra X
  - child completed; checkpoint updated
- manager or head turns that into the one final user-facing action block

## Anti-Patterns

- terminal lane acts like the UI by default even though a live app-lane
  coordinator exists
- manager and super both emit competing human-facing launch blocks
- review lane updates approval truth but terminal lane also re-explains the
  whole review context to the user
- no real user action is needed, but the lane still emits a decorative copy
  block
- a lane asks the user to carry a wake to an already-live owner even though it
  could have written that owner's runtime inbox directly
- a terminal lane writes for the manager as intended recipient but leaves the
  buyer holding an untranslated completion report

## Final Rule

Prefer the best control plane for the human, not just the lane closest to the
machine action.
