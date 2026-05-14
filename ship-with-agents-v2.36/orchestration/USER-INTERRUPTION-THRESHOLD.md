# User Interruption Threshold

Use this before ending any meaningful response that changes what should happen
next.

This exists because a response can be explicit and still interrupt the buyer
for the wrong reasons.

## Core Truth

Interrupt the buyer only for one of these:

1. a real decision only the buyer should make
2. a real blocker the current system cannot clear on its own
3. a meaningful outcome the buyer actually needs surfaced now

If none of those are true, prefer internal progression and end with
`No user action needed:`.

If another passive live lane still needs a buyer nudge before work resumes and
that pickup matters now, that counts as a real buyer-owned action.

If the buyer prefers to steer workflow-direction choices such as routing,
escalation, or lane ownership, one lightweight `Recommended next move:` ask can
be a valid interruption. It should still be short and happen only once per
meaningful transition.

## Steps-For-You Rule

`Steps for you` is conditional, not mandatory.

Use it only when the buyer genuinely has one or more actions to take now.

Do not emit `Steps for you` when:

- the next transition is still internal
- another live lane should pick up the work through durable routing
- the lane only owes awareness or status
- the system is waiting on no real buyer-owned action

If another live lane is only passively routed and still needs a buyer nudge to
resume now, do not treat that as "no real buyer-owned action."

In those cases, prefer:

- `No user action needed:`
- `Recommended next move:`
- or `Stop here:`

## Meaningful Outcome Rule

A meaningful outcome is something the buyer benefits from seeing now, such as:

- a release is ready
- a bounded slice is complete
- an important risk was found
- a blocker materially changes the plan
- a verification result changes whether launch is safe

Routine internal progression is not a meaningful outcome by itself.

Collaborative steering can be meaningful when the next move changes who owns
the work, what lane gets launched, or how much review/assurance is added.

## Questions To Ask

Before ending the response, ask:

- am I interrupting the buyer because progress actually requires them?
- or because a visible tail feels tidy?
- is this a real decision, blocker, or meaningful outcome?
- is this a lightweight workflow-steering moment the buyer prefers to guide?
- if not, what can advance internally instead?

## Anti-Patterns

- `Steps for you` with no real buyer-owned action
- a wake, paste, or approval tail that exists only to show movement
- using the buyer as the transport layer for internal lane-to-lane routing
- surfacing a tiny internal state transition as if it were a meaningful outcome
- treating every workflow-direction move as either fully internal or a
  heavyweight buyer decision, with no collaborative middle path

## Final Rule

The cleanest response is not the one with the most obvious action tail.
It is the one that interrupts the buyer only when their attention is truly the
next required resource.
