# Buyer Steering Vs Buyer Labor Gate

Use this before asking the buyer to do anything.

## Core Truth

The buyer should be able to steer meaningful workflow direction without becoming
the unpaid control plane.

Always separate:

- `buyer steering`
- `buyer labor`

## Buyer Steering

Use buyer steering when the buyer is deciding:

- workflow shape
- ownership transfer
- whether to add review density
- whether to escalate into strategy, audit, or release review
- whether your default recommendation should be overridden

Good shape:

- `Recommended next move:`
- one clear recommendation
- one short reason
- what happens if the buyer says `go`

Do not silently upgrade buyer steering into buyer planning labor. If the lane
already knows the default next slice, review order, or commit path, it should
name that default instead of asking the buyer to choose from a small frontier
list.

If the recommendation would launch or wake execution work, also say:

- which lane or worker acts next
- which worker model and effort should be used
- why that cheaper/default worker is sufficient, or why a stronger worker is
  justified
- what the buyer should say now
- what the buyer should say later, if a return trigger will be needed

Once the buyer gives that lightweight approval, execute the bounded transition.
Do not turn the approval into one more summary-plus-wait loop.

## Buyer Labor

Use buyer labor only when the system cannot honestly avoid it.

Examples:

- manual launch on a surface without direct spawn
- pasting into another lane when durable internal routing is unavailable
- a true manual external step outside the system

Before classifying something as buyer labor, also run:

- `_agent-system/CAPABILITY-FIRST-EXECUTION-RULE.md`
- `_agent-system/SMALLEST-USER-EFFORT-RULE.md`

## Anti-Patterns

- asking the buyer to say the word before the lane updates a bounded slice it already
  owns
- asking for or silently requiring a second `continue` after the buyer already
  approved the prepared move
- asking the buyer to classify bounded ambiguity before the review cell has made a
  default recommendation
- asking the buyer to paste a wake when runtime routing is available
- hiding a labor ask inside `No user action needed:`
- recommending a launch while hiding which worker model will do the work or why
  the work is not staying on the current lane
- ending a strong implementation closeout with "review and commit" or "pick the
  next slice" when the lane has not explained why that burden belongs to the
  buyer or which path it recommends by default

## Decision Rule

Before asking the buyer for anything, state internally:

1. is this steering or labor?
2. if labor, why can the system not do it directly?
3. if steering, what is my recommendation?
4. if the system might be able to do it directly, what capability did I verify?

If those answers are weak, the lane should usually proceed or route directly.

## Buyer Vs Lane Identity

The buyer is not the same thing as the next-owner lane.

Bad:

- `the findings route back to you (m5.2r2)` when the buyer is not literally the
  manager lane
- naming a manager or super lane as next owner and then speaking as if the
  buyer already is that lane

Better:

- if the buyer should steer, say `Recommended next move:` and provide the exact
  wake/paste/launch bridge
- if the system can route internally, route it and say what happens next

Only collapse buyer and lane identity when the current chat really is that
lane.
