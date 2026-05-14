# Collaborative Steering Gate

Use this before deciding whether to fully proceed internally or surface a
lightweight user-guided recommendation.

This exists because the system can fail in two opposite ways:

- closed-loop routing that sidelines the user from meaningful workflow shape
- user-burdening ceremony that makes the user carry transport or repeated
  approvals

## Core Truth

The buyer should not have to micromanage small internal execution details.
But the buyer should be able to steer meaningful workflow direction without the
system turning that into slowdown.

The right pattern is:

1. prepare the recommendation and underlying artifact first
2. recommend one clear next move
3. let the buyer answer with a lightweight `go`, `ok`, `sounds good`, `continue`,
   or an obvious casual typo variant when the intent is clear
4. execute the approved transition directly without another approval loop
5. if the approved transition promised a specific next artifact, emit that
   artifact in the approval turn instead of restating the source material

The buyer should steer the move, not assemble it.

## Use This Gate For

Use `Recommended next move:` when the remaining choice is mainly about workflow
shape or ownership, not technical uncertainty.

Common cases:

1. passing the work to head, manager, super, doctor, brainstorm, agent, or
   worker
2. choosing whether to launch a new durable lane
3. choosing whether to escalate from execution into strategy, audit, or review
4. choosing whether to split work, add a second brain, or increase assurance
5. choosing whether to keep the current lane as owner or transfer control

## Do Not Use This Gate For

Do not stop for collaborative steering when the remaining move is already
inside the approved execution path.

Examples:

- writing the next slice, checkpoint, review memo, or handoff artifact
- tightening a bounded runtime doc after the user already approved direction
- routing internally after the user already said `go`
- small reversible technical judgments that do not change workflow ownership
- repeating the same bounded execution loop after the buyer already approved
  continuing that loop

Those should usually proceed directly.

## Tail Shape

When this gate applies, end with:

- `Recommended next move:`

Then include:

1. one clear recommendation
2. one short reason
3. what the current lane will do if the buyer says `go`
4. the bridge mode: `internal-route` / `internal-route-plus-pickup` /
   `buyer-paste` / `launch-here` / `continue-here`
5. no requirement for the buyer to manually relay the packet if the lane can route
   it itself
6. if the lane cannot route it itself, one exact ready bridge artifact in the
   same turn

Example:

`Recommended next move: pass this to Manager1 for review-brain challenge
before launch. Bridge mode: buyer-paste. If you say "go", use the ready
manager packet below.`

## Speed Rule

Collaborative steering should not become a multi-turn tax.

To keep speed high:

- do the prep before asking
- ask once
- make the user response lightweight
- after approval, execute the full bounded transition without asking again

The user should steer the move, not assemble it.

## Approval Normalization Rule

If there is one clear active recommendation and the buyer responds with a short
affirmative such as:

- `go`
- `ok`
- `sounds good`
- `continue`
- obvious close variants like `sounsd good` or `continu`

treat that as approval unless conflicting context makes the intent ambiguous.

Do not consume that approval by:

- restating the same recommendation
- only describing the next internal step
- parking at a pre-step and waiting for one more nudge
- re-summarizing the already-prepared packet when the approved move was to turn
  that packet into a launch brief, bridge, note, or supervisor artifact
- spending approval on a fresh narration of the next loop iteration instead of
  executing that iteration

The approved move should advance materially in that same turn.

## Preference Override

If local truth says the buyer prefers collaboration on workflow-direction choices,
that overrides a generic silent-proceed instinct for those choices.

If local truth says the lane already has delegated authority for this exact
kind of transition, proceed and report.

## Anti-Patterns

- silently routing work to another role when the user would reasonably expect
  to steer that move
- asking the buyer to approve writing the next artifact instead of the
  workflow move
- asking the buyer to carry the transport packet after they already approved
  the move
- naming another lane as next owner while still making the buyer invent the
  packet
- turning a simple recommendation into a long option tree
- requiring a second approval after the buyer already said `go`

## Final Rule

If the user could reasonably say:

"I wanted to guide that move, but I did not want to become the courier."

then collaborative steering was not handled cleanly.
