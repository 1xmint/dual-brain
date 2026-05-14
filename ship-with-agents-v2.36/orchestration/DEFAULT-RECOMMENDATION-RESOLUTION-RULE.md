# Default Recommendation Resolution Rule

Use this when a lane finds bounded ambiguity inside an active workstream.

## Core Truth

Bounded ambiguity is not automatically a buyer decision.

Inside a healthy review cell, the system should usually form a default
recommendation first.

## Use Default Recommendation When

- the ambiguity is still inside the approved workstream
- no strategy, budget, release, or policy boundary is changing
- the difference is about sequence, seam choice, or classification
- one path is clearly the safer or smaller first move

## Output Shape

State:

- the recommended path
- the short reason
- what the lane will update or route next
- whether the buyer can override with lightweight steering

If several technically possible follow-on slices exist but one is the safest,
smallest, or clearest continuation, present that one as the default. Do not
turn the default recommendation into a flat menu of equal-weight options unless
the lane truly cannot justify a first choice.

If the lane then receives lightweight approval of that recommendation, execute
the prepared bounded move directly instead of re-explaining the recommendation
or stopping at the first tiny pre-step.
If the lane later performs inbox review before finishing that move, preserve the
approved move unless the newly absorbed truth materially changes it.

## Escalate Instead When

- the choice changes durable product direction
- the choice changes release risk materially
- the choice changes cost or provider posture materially
- the choice is still under-specified enough that no honest default exists

## Anti-Patterns

- "Decide whether A or B" with no recommendation
- "If you want me to update the slice, say the word"
- blocking normal review-cell motion on the act of writing the next bounded
  artifact
- losing an already-approved prepared move just because the lane reread its
  inbox and re-summarized the plan
- "Next slice options:" with several equal-weight paths after the lane already
  knows which one it would do first

## Final Rule

If the lane already knows which path it would take by default, it should say so
before asking anything of the buyer.
