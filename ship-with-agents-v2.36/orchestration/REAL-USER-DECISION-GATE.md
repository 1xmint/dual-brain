# Real User Decision Gate

Use this before ending with `Decision needed from buyer:`.

This file exists because asking the user is sometimes necessary, but often it
is just disguised ownership deferral.

## Core Truth

Do not ask the user to arbitrate a bounded judgment call that the current
review or owner lane can resolve honestly.

Also do not confuse lightweight collaborative steering with a heavyweight user
decision. Some workflow-direction choices should be user-guided, but that does
not mean the user should have to review every micro-step or carry transport.

If the lane has:

- a clear recommended fix
- a reversible change
- no conflict with durable user preferences
- no strategy, budget, or public-release boundary being crossed

then the lane should usually proceed to the next exact artifact instead of
asking the user to bless the obvious move.

## Real User Decisions

It is a real user decision when at least one of these is true:

1. strategy or product direction could materially change
2. budget, premium model usage, or paid service posture could materially change
3. public release, deployment exposure, or customer-facing risk is changing
4. the choice sets a durable policy or preference the user should own
5. the tradeoff is genuinely value-laden, not just technical
6. the recommended move is irreversible enough that silent proceed would be
   wrong

If none of those are true, the current lane should probably keep moving.

## Collaborative Steering Distinction

If the remaining choice is mainly about workflow shape or ownership and the
lane has a clear recommendation, run `_agent-system/COLLABORATIVE-STEERING-GATE.md`.

Use:

- `Recommended next move:`

Not:

- `Decision needed from buyer:`

when the real ask is simply:

- whether to pass the work to another role
- whether to launch the next lane
- whether to escalate review depth
- whether to keep the current lane as owner

That keeps the buyer in the loop without making the interaction feel heavier than it
is.

## Review-Lane Rule

When a reviewer finds one bounded challenge and also has a clear recommended
fix, the default output should usually be one of:

- `Update this doc:` with the exact fix
- `Wake <live lane>:` with the exact required change
- `Paste this into <live lane>:` with the exact patch or replacement

Not:

- "review whether you accept my threshold"
- "decide whether to accept or reject this tweak"
- "if you want, I can draft the exact edits"
- "confirm you agree this is launch-ready and the first seam is right; if yes,
  I'll draft the bounded implementation slice"
- "if approved, the next artifact is the implementation slice doc; I'll
  produce it immediately on your signal"

If the reviewer can already draft the exact edits, draft them now.

## Vibe-Coder Bias

For most solo operators and vibe coders, the system should prefer:

- proceed if safe
- escalate only when the decision is truly user-owned
- reduce ceremonial approval loops

That does not mean skipping quality. It means converting quality work into the
next artifact instead of turning the user into a reviewer of the reviewer.

## Good Questions Before Yielding

- Is this actually a user preference, or just a technical threshold?
- Would a strong reviewer normally decide this without asking?
- Am I asking because the user must choose, or because I do not want to own the
  next step?
- If I had to keep moving right now, what exact fix would I apply?

If the last question has a clean answer, prefer that answer.

## Anti-Patterns

- bounded challenge + clear recommended fix + ask user to accept/reject it
- `Steps for you` that turns the user into the review board for a small
  technical tightening
- `Steps for you` that asks the user to confirm launch-readiness or the first
  technical seam before the lane will draft the exact slice or handoff it
  already knows how to produce
- treating approval to write the bounded implementation slice itself as a real
  user decision when no strategy, release, budget, or durable-preference
  boundary is changing
- asking the user to tell another lane to make a change that the current lane
  could already specify exactly
- using `Decision needed from buyer:` when the only real uncertainty is lane
  confidence
- using `Decision needed from buyer:` for a simple recommended workflow handoff
  that the buyer could answer with `go`

## Final Rule

If the user could reasonably say:

"Why are you asking me this instead of just doing the next smart step?"

then this probably was not a real user decision.
