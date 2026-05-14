# Review State Rule

- Do not choose a delivery tail before you can state review state,
  recommendation state, approval state, next owner, pickup required, and buyer
  steer required.
- Prefer recommendation-first output over raw ambiguity forks.
- Keep buyer steering separate from buyer labor.
- Treat passive routing as continuity, not proof of active pickup.
- If another lane is the next owner and the move is not fully internal, state
  bridge mode and include the exact ready bridge artifact in the same turn.
- If a live execution owner already owns the hot workstream, default to `reuse
  live super` or `direct agent` before suggesting a fresh supervisor.
