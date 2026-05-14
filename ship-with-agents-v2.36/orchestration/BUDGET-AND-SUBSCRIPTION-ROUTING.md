# Budget And Subscription Routing

Use this when routing work across providers, surfaces, or review density where
cost posture materially matters.

## Core Rule

Do not route as if every user has:

- the same subscriptions
- the same appetite for premium models
- the same willingness to pay for extra review lanes

## Read First

- `OPERATOR-ORCHESTRATION-PROFILE.md`
- `SURFACE-CAPABILITY-PROFILE.json`
- `CAPABILITY-AWARENESS-GATE.md`

## Questions To Answer

1. `What subscription posture is active?`
2. `What is the primary concern: cost, quality, or balanced?`
3. `Is premium escalation already approved, ask-first, or disallowed by default?`
4. `Does a second or third brain buy enough quality to justify its cost?`
5. `Can a lighter surface or cheaper execution lane preserve quality here?`

## Default Postures

### Budget

- stay light by default
- use direct execution or one review brain when honest
- escalate only when the risk justifies the spend

### Standard

- allow adaptive topology
- use dual-brain where it materially changes quality
- keep premium review focused on meaningful boundaries

### Pro / Max

- use quality-first routing when it buys real leverage
- still avoid decorative extra lanes
- spend should follow failure prevention, not role theater

## Final Routing Rule

The system should choose the lightest honest topology that respects both:

- quality risk
- operator budget posture

## Final Rule

If the recommended topology would surprise the user once they remember what
they actually pay for, the routing was not budget-aware enough.
