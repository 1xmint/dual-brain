# Review State Machine

Use this when a meaningful workstream is moving through review, steering,
approval, and execution.

## Core Truth

Review topology is not enough.

The system also needs a runtime state model for the current review cell.

Without that, a lane can know who exists but still fail to say:

- what state the work is in
- what the default recommendation is
- who should act next
- whether the buyer is steering or doing labor

## Required States

For meaningful work, keep these states explicit:

- `review state`
- `recommendation state`
- `approval state`
- `next owner`
- `pickup required`
- `buyer steer required`

## Default State Vocabulary

### Review State

- `scoping`
- `challenge_pending`
- `challenge_active`
- `recommendation_ready`
- `awaiting_buyer_steer`
- `approved_for_launch`
- `launch_owned`
- `execution_active`
- `audit_pending`
- `closed`

### Recommendation State

- `not_needed`
- `drafting`
- `ready`
- `routed`
- `accepted`
- `superseded`

### Approval State

- `not_needed`
- `internal`
- `buyer_steer`
- `approved`
- `blocked`

## Transition Logic

Normal `T3` dual-brain flow:

1. `scoping`
2. `challenge_pending`
3. `challenge_active`
4. `recommendation_ready`
5. either:
- `awaiting_buyer_steer` when workflow shape is the buyer's call
   - `approved_for_launch` when no real buyer steer is needed
6. `launch_owned`
7. `execution_active`
8. `audit_pending` when needed
9. `closed`

## Output Rule

Before ending a meaningful review or routing turn, the lane should be able to
state:

- `Review state:`
- `Recommendation state:`
- `Approval state:`
- `Next owner:`
- `Pickup required:`
- `Buyer steer required:`

If that cannot be stated honestly, the lane is still too vague to hand the turn
back cleanly.

## Anti-Patterns

- using delivery-tail choice as a substitute for state
- saying `Steps for you` before the lane has resolved recommendation state
- asking the buyer to decide bounded classification ambiguity before the review cell
  has formed a default recommendation
- saying `No user action needed:` while `next owner` and `pickup required` are
  still unclear

## Final Rule

If a lane cannot say what state the review cell is in, it should not treat the
turn as finished just because it found a plausible response tail.
