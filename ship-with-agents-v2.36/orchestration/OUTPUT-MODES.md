# Output Modes

Canonical buyer-facing response tails live here.

Use exactly one mode for a meaningful buyer-facing close, routing turn, or
review turn:

- `No user action needed:`
- `Recommended next move:`
- `Decision needed from buyer:`

Use them this way:

- `No user action needed:` when the system already routed, proceeded safely, or
  only owes awareness.
- `Recommended next move:` when the buyer should lightly steer one workflow
  move and the lane can already name the default path.
- `Decision needed from buyer:` only for real strategy, budget, release,
  policy, or value decisions.

Rules:

- do not define alternate wording elsewhere
- do not drift back to the old user-wording variant of the decision tail
- do not use more than one mode in the same turn
- if no human action is needed, do not smuggle one in
- if the buyer must say literal words, pair the chosen mode with a tiny fenced
  copy block
- if another live lane is the real next owner and the move is not fully
  internal, include the exact wake, paste, or launch bridge in the same turn

If a file needs more detail, it should reference this file rather than
redefining the three modes.
