# Self-Registration Gate

Use this before a lane registers itself or a neighboring lane in the active
map, lane capsules, inboxes, or lifecycle log.

## Core Truth

Control-plane registration is only trustworthy when the runtime identity and
the container truth are also trustworthy.

Self-registration is allowed, but only when it is honest.

## Required Checks

Before registering a lane as live, verify:

1. what container actually exists
2. whether this is the same thread continuing or a separate lane
3. whether thread adoption is explicit
4. whether the launch state is `active` yet
5. whether the buyer would understand the same story if they looked at the
   current chat and the active map side by side

## Allowed Outcomes

- `planned`
- `packet_ready`
- `launched_unverified`
- `attention-needed`
- `active`

Prefer the weakest honest state over a prettier one.

## Final Rule

If the lane registration depends on the lane simply believing its own story,
the state is not ready to be `active`.
