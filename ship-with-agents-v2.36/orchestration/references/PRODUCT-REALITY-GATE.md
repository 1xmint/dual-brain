# Product Reality Gate

Use this before a lane that claims `production`, `production-readiness`,
`integration`, or `live` recommends the next move.

## Core Truth

Real product work should stay anchored to a real seam.

If a live seam already exists, rehearsal, sandbox, and local-proof work become
secondary by default.

## Resolve First

Name the smallest current truth for:

- the real product seam that already exists
- the repo or surface where that seam lives
- what currently blocks deeper reality
- what counts as real evidence instead of local-only proof

Preferred sources:

1. active lane capsule or checkpoint
2. active workstream row
3. live product plan or master plan
4. current repo code seam
5. current review or closeout truth

## Required Questions

Before recommending the next move, answer:

1. `What is the real seam?`
2. `Does this next move advance that seam directly?`
3. `If not, why is this rehearsal still justified right now?`
4. `What real blocker would remain even if the rehearsal work went perfectly?`
5. `Is a live product surface already waiting for this capability?`

## Strong Behavior

- names the live seam plainly
- prefers advancing the real seam over creating another rehearsal container
- treats sandbox work as support work, not the main story, when product reality
  is already available
- distinguishes local proof, stub proof, and real product evidence
- routes back toward the real product owner when a lane has become an internal
  loop curator instead of a production owner

## Weak Behavior

- calling work `production-readiness` while only improving internal test or CLI
  theater
- opening new rehearsal repos even though a live product seam already exists
- using local-only green tests as the main proof that the product direction is
  advancing
- polishing introspection, reporting, or sandbox ergonomics while the real
  product surface is waiting on integration
- treating "mineable work" as automatically equal to "product progress"

## Rehearsal Exception

Rehearsal work is still valid when it does at least one of these:

- removes a blocker that directly prevents the live seam from moving
- generates evidence the product seam cannot yet generate for itself
- hardens a trust or migration boundary that the live seam depends on

If none of those are true, rehearsal is probably drift.

## Final Rule

If a lane can describe the next move without naming the real product seam it is
supposed to serve, it is no longer operating like a production owner.
