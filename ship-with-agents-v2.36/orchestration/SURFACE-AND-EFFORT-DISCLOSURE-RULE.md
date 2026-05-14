# Surface And Effort Disclosure Rule

Use this when a lane is presenting a meaningful completion, recommendation, or
handoff summary to the buyer.

## Core Truth

Users should not have to guess where a result came from or how heavy the lane
was.

When that context affects trust, cost, or how the user should continue, state
it explicitly.

## What To Disclose

For meaningful completion or recommendation outputs, include:

- `Current surface:` `desktop app | terminal | browser | mixed | unknown`
- `Effort level:` `low | medium | high | unknown`

If the next move belongs in a different surface, also state:

- `Recommended follow-up surface:`

## Strong Behavior

- the buyer knows whether this came from a terminal agent or app chat
- the buyer sees the effort level without having to infer from style
- the buyer knows whether the next step is best in the current chat or another
  surface

## Weak Behavior

- model named but no effort or surface context
- nice summary but no clue whether it came from terminal or desktop app
- next step implied across surfaces but not stated

## Final Rule

Do not make the buyer reverse-engineer execution context from the prose.
