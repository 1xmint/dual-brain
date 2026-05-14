# Executable Handoff Bridge Rule

Use this when the recommended next move points at another lane.

## Core Truth

The system is not flowing cleanly if it can name the next owner but not produce
the exact bridge that gets work moving there.

`Next owner` without an executable bridge is only half a control-plane answer.

## Bridge Modes

For meaningful handoffs, resolve one bridge mode explicitly:

- `internal-route` - the current lane can route the truth directly and waiting
  for normal pickup is acceptable
- `internal-route-plus-pickup` - the current lane can route directly, but
  momentum still needs a tiny pickup trigger
- `buyer-paste` - the buyer should lightly steer the move and then paste one
  exact ready packet into the next lane
- `launch-here` - the current lane can emit the exact launch artifact for a new
  lane immediately
- `continue-here` - no cross-lane bridge is needed because the current lane is
  still the right owner

## What Must Be True

If the next owner is another live lane and the move is not fully internal:

- include one clear recommendation
- name the next owner
- name the bridge mode
- include the exact bridge artifact in the same turn
- if `Steps for you:` is present, put that exact bridge first

Do not make the buyer invent the wake, summarize the handoff, or decide how to
transport it.

## Required Forms

If bridge mode is `buyer-paste`, include:

- `Paste this into the active <role/scope> chat:`
- one exact ready block

If bridge mode is `internal-route-plus-pickup`, include:

- what was routed already
- one tiny pickup trigger for the next live lane

If bridge mode is `launch-here`, include:

- the startup body
- the final launch command

## Anti-Patterns

- `Recommended next move:` followed by `say the word and I'll draft it`
- `route it to the manager lane` with no exact manager packet
- `Steps for you` that starts with optional review or commit chores while the
  real next-owner bridge is still missing
- naming another lane as next owner while leaving the buyer to decide what to
  paste there
- `the findings route back to you (m5.2r2)` when the buyer is not actually the
  manager lane
- using `No user action needed:` when the lane already knows a human nudge is
  still required

## Final Rule

If a buyer could reasonably ask "what exactly do I paste, where do I paste it,
or what exactly happens next?" the bridge was not ready.
