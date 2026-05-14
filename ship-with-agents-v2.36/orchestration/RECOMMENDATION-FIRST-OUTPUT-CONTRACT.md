# Recommendation-First Output Contract

Use this for meaningful review, routing, and launch-boundary turns.

## Core Truth

The system should recommend before it requests.

Do not hand the buyer a raw fork in the road when the lane can already state the
best default path.

## Required Shape

For meaningful non-trivial turns, include:

- `Recommendation:`
- `Why:`
- `Review state:`
- `Next owner:`
- `Bridge mode:`
- `What I already updated or routed:`
- `If you say go:`

When the recommendation involves a launch, handoff, or worker choice, also
include:

- `Why this path instead of the nearest alternative:`
- `Worker model:`
- `Why this worker model:`
- `For you now:`
- `Later:`

For lanes claiming `production`, `production-readiness`, `integration`, or
`live`, also include:

- `Real seam:`
- `Why this move advances the real seam:`

Use concise lines, not a giant ceremony block.
Treat `go`, `ok`, `sounds good`, `continue`, and obvious close variants as the
same lightweight approval token when there is one clear prepared move.
`What I already updated or routed:` should usually be one compressed line, not
the main event of the reply.
Only say `updated` or `routed` for a target lane when the target runtime file
was actually touched. Otherwise use a more honest label such as:

- `What I prepared:`
- `What I drafted:`
- `What I stored for later routing:`

## Tail Rule

After the recommendation block, end with one exact delivery mode.

Usually:

- `Recommended next move:` when the buyer should steer workflow shape
- `No user action needed:` when the lane has already routed or proceeded safely
- a tiny pickup trigger when passive routing is not enough

If the next owner is another lane and the move is not fully internal, include
the exact executable bridge in the same turn.
If the move will not resume until a live lane is nudged, surface that bridge
before attachment chips, file inventories, or admin bookkeeping.
If the lane promised a specific artifact under `If you say go:`, the approval
turn should end with that artifact or the exact blocker that prevented it.

## Steps-For-You Ordering Rule

If you use `Steps for you:` at all:

- the first step must be the easiest recommended action
- if another live lane should act next and the move is not fully internal, that
  first step should usually be the exact bridge:
  - `Paste this into <live lane>:`
  - or `Wake <live lane>:`
- optional review, commit, or closeout chores come after the primary bridge,
  not before it
- do not use `Steps for you:` as a disguised option menu
- if review, commit, or next-slice choice appears there, explain why that
  burden belongs to the buyer and what the default recommended path is
- if one default next slice exists, state it plainly before any alternatives

## What Not To Do

- `Steps for you` with no recommendation
- `Steps for you` where the first step is not the easiest recommended action
- `say the word` before the lane has named its default path
- consuming `go` / `ok` / `sounds good` on a tiny pre-step and then asking for
  another nudge before the real recommended move starts
- consuming `sounds good` on the promise of a launch brief and then only
  confirming the source packet exists
- technical ambiguity surfaced as a buyer-owned fork with no default
- a wake packet that explains transport but not why that lane is the next owner
- naming another lane as next owner without the ready wake, paste, or launch
  bridge
- phrasing another lane as `you (<routing-id>)` when the buyer is not literally
  in that lane
- a higher-cost coordination lane recommending another execution pass without
  saying why the work is not staying in the expensive lane and why the chosen
  worker model is sufficient
- leading with "I wrote it to inbox/mail" when the buyer still needs an exact
  wake trigger to resume work now
- saying `I sent it to the frontend manager` when the note only exists as a
  standalone doc and the manager inbox/mail was never updated
- ending with "when it replies, paste it here" when `done`, `read your inbox`,
  or another tiny return trigger would normally work
- giving three or four plausible next frontiers after the lane already knows
  the default recommendation
- `Steps for you:` that begins with `review and commit` or `pick the next
  slice` after a strong implementation closeout without one recommended default
  and a reason
- presenting sandbox, rehearsal, or local-only test work as the main
  production recommendation without naming the real product seam it is supposed
  to serve

## Example

`Recommendation: treat this as an application-tooling prerequisite first.`

`Why: the display gap changes operator flow before it changes retrieval
correctness.`

`Review state: recommendation_ready`

`Next owner: Manager - Product / Delivery`

`Bridge mode: buyer-paste`

`Why this path instead of the nearest alternative: this is bounded build work,
so it should drop to the execution lane instead of spending more manager
tokens here.`

`Worker model: claude-sonnet-4-6 --effort high`

`Why this worker model: the scope is clear, the file boundary is bounded, and
the risk does not justify a stronger worker.`

`What I already updated or routed: the scoping slice challenge notes`

`If you say go: use the exact manager packet below; I already aligned the slice
truth so the next lane can move immediately.`

`For you now: say go.`

`Later: say done here after the manager reports back.`

`Paste this into <manager-session-id> (manager):`

```text
Read your inbox, then open the first bounded implementation slice using the
current scoping doc as truth.
Re-read:
- updates/inbox/<manager-session-id>.md
- slices/<current-scoping-slice>.md
```

## Final Rule

If a user could ask "what do you actually recommend?", the turn was not ready.
If a user could ask "am I that manager lane, or do you want me to paste this
somewhere?", the lane/bridge boundary was not ready either.
If a user could also ask "why didn't you give me the exact artifact you just
said `go` would produce?", the approval path was not ready.
