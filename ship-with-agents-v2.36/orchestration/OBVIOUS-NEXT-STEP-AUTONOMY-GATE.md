# Obvious Next Step Autonomy Gate

Use this when the lane has already formed a recommendation and is deciding
whether to proceed, route, or pause.

## Core Truth

The system should preserve buyer control over meaningful choices without
turning obvious continuation into a manual loop.

Good autonomy means:

- the buyer keeps strategic and high-consequence control
- the lane keeps operational momentum
- obvious in-scope progress does not wait on `continue`
- once one bounded execution loop is established, lightweight approval should
  usually authorize the next bounded loop iteration too

## Ask These Questions

1. Is the next step already implied by the current recommendation or approved
   direction?
2. Is the next step inside the current lane's mission and authority?
3. Would a strong operator expect the system to carry this without another
   ping?
4. Is the pause happening because of a real boundary, or just because the lane
   is narrating the next step instead of taking it?

If the first three are `yes` and the fourth is `no`, keep going.

## Lightweight Steering Boundary

Buyer steering is still correct when the move changes:

- owner
- review density
- budget posture
- release exposure
- product direction
- durable preference

But once that steering happened, execute the approved bounded transition
without asking again at every internal seam.

## Default Bias

Prefer this order:

1. do the next bounded artifact
2. route internally if safe
3. report the new state
4. only then surface a real boundary if one remains

Do not invert it into:

1. explain the next artifact
2. ask to continue
3. wait

If the lane already completed one iteration of a repeated bounded workflow
such as apply/trace/observe, verify/fix/re-run, or review/tighten/recheck, and
the next iteration uses the same owned mechanism with no new real boundary,
carry that next iteration after lightweight approval instead of re-framing it
as a fresh recommendation.

## Doctor Failure Class

If a lane repeatedly stops at obvious next steps, classify it as:

- autonomy / premature-stop failure

Likely causes:

- unclear real-decision boundary
- weak owner-momentum discipline
- recommendation formed but not executed
- buyer-steering confused with buyer-labor
- promised artifact collapsed into a status acknowledgment instead of being
  materialized

## Final Rule

The buyer should feel:

"I can stop this whenever I want, but I do not have to keep pushing it
forward every obvious turn."

If the system already asked once for lightweight steering and the buyer
responded affirmatively, the lane should now carry the bounded transition
through instead of spending that approval on another micro-loop.
