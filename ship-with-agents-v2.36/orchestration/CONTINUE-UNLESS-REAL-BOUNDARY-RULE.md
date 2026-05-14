# Continue Unless Real Boundary Rule

Use this before ending a turn that is tempted to stop at:

- `continue`
- `if you want, I can keep going`
- `say the word`
- `I can do the next part if you want`

This exists because a lane can be correct about the next step and still fail
the buyer by making obvious progress depend on another tiny approval loop.

## Core Truth

If the next step is:

- already inside the approved direction
- in scope for the current lane
- safe and reversible enough
- not a real user-owned decision
- not blocked on external truth or another lane

then the lane should usually just do it.

The buyer should not have to say `continue` for obvious internal progress.
If the lane already surfaced one prepared bounded recommendation, lightweight
buyer approval such as `go`, `ok`, `sounds good`, `continue`, or an obvious
casual typo variant should usually be treated as authorization to execute that
prepared move, not as a cue to restate it and pause again.

## Good Reasons To Stop

Stopping is appropriate when at least one of these is true:

1. a real buyer decision is required
2. another lane must act next and the move cannot be routed internally
3. the current lane is waiting on external execution, repo change, or runtime
   result
4. the lane lacks the tool, surface, or permission needed for the next step
5. the lane is intentionally pausing, closing, rotating, or handing off

If none of those are true, prefer continuing.

## Obvious Next Step Rule

Examples of steps that should usually proceed without another buyer nudge:

- write the next bounded slice or review memo after direction is already clear
- tighten the canonical doc you just reviewed
- absorb child completion mail and synthesize the result
- route to the resolved next owner internally when safe
- convert an execution report into a closeout artifact
- move a slice from draft to in-review when the lane already has the evidence
- produce the exact bridge packet after already deciding that another lane
  should act next
- produce the promised downstream artifact after already preparing the upstream
  packet or synthesis it depends on
- run the next iteration of the same bounded execution loop after the buyer
  already approved continuing that loop

Do not stop between these steps just to narrate that they could happen.

## Anti-Patterns

- the steering tail from `OUTPUT-MODES.md` followed by waiting for `continue`
  on a move the lane already owns
- getting `go`, `ok`, `sounds good`, or `continue` and then replying with
  another small status summary instead of carrying the prepared move through
- `if you want, I can write the packet now` when the packet is the obvious next
  artifact
- `say the word and I'll draft it` when no real boundary exists
- a progress update that explains the next exact step but leaves it undone for
  no real reason
- making the buyer re-trigger the same lane after one bounded artifact when the
  same lane still owns the next bounded artifact
- getting approval to "turn this packet into a launch brief" and then replying
  with another summary of the packet instead of the launch brief itself
- completing one loop iteration, hearing `sounds good`, and then replying
  `next slice is clear` instead of running the already-recommended next
  iteration

## Output Rule

If the lane continues internally, prefer:

- the no-action tail mode from `OUTPUT-MODES.md` when the continuation is
  already complete or safely routed
- a concise progress update after the next substantive step is taken

If a buyer-visible pause is still correct, name the exact boundary:

- the real-decision tail mode from `OUTPUT-MODES.md`
- `Next owner:`
- `Blocked on:`

Do not hide a premature stop inside friendly phrasing.

## Approval Resolution Rule

When the lane has exactly one live recommended bounded move and the buyer
answers with a lightweight affirmative, default to:

1. resolve the reply as approval
2. execute the full prepared bounded transition
3. report the new state only after that transition

Do not spend the approval on a tiny pre-step and then ask again before the real
work begins.
Do not spend the approval on a doc-presence acknowledgment when the promised
artifact was a derived downstream artifact.

## Final Rule

If the buyer could reasonably ask:

"Why did you stop there instead of just doing the next obvious thing?"

then the lane probably stopped too early.
