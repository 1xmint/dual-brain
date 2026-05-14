# Attention Routing Engine

Use this when deciding who should care about a meaningful change.

## Core Truth

Not every update deserves a broadcast.
Not every meaningful change should stay local.

## Routing Levels

- `local only`
- `same workstream`
- `same repo neighbors`
- `review owner plus execution owner`
- `doctor plus affected lanes`
- `top-chain attention`

## Inputs That Matter

- impact radius
- shared contracts touched
- dependency shifts
- buyer-facing risk
- conflict risk
- whether a replan is needed

## Output Shape

- `Attention level:`
- `Who should care now:`
- `Who only needs awareness:`
- `Who can ignore this:`

## Final Rule

Attention should follow impact, not habit.

If the buyer surfaced one concrete failing live lane, that observed lane should
normally be inside `Who should care now:` unless it is already closed or proven
not to own the behavior anymore.
