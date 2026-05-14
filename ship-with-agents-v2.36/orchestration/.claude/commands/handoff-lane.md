---
argument-hint: [target-lane] [artifact-or-reason]
description: Route a live handoff through durable runtime artifacts instead of defaulting to a buyer-carried wake
---

Route the handoff described by `$ARGUMENTS` through the current runtime update
bus or inbox system.

Rules:

- keep the canonical artifact current first
- prefer durable internal routing over asking the buyer to carry a wake
- if the next owner still needs a tiny buyer nudge for active pickup now,
  say that explicitly
- verify the live target before naming it
- keep same-workstream packets delta-only when canonical truth already exists
- end with `No user action needed:` only if safe waiting is genuinely
  acceptable
