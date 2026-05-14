<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 9def119c31d5b78d3a08e08a9c5c6def1fb005facc67f0731617056262f487d7 -->
<!-- canonical-sources:
  - OUTPUT-MODES.md
  - USER-SUPPORT-PROFILE.md
  - SUPPORT-POSTURE-GATE.md
  - ADAPTIVE-EXPLANATION-GATE.md
  - USER-CONFIDENCE-MODEL.md
  - GUIDED-TAIL-PATTERNS.md
  - FAST-PATH-VS-TEACHING-PATH-RULE.md
  - BUYER-HANDHOLDING-COMPLETION-RULE.md
  - EARNED-REASSURANCE-RULE.md
-->
---
name: buyer-support
description: Buyer-facing support posture, handholding, delivery tails, and closeout clarity. Use when shaping the response itself or deciding how much guidance the buyer should get.
---

# Buyer Support

Use this skill when the correctness of the answer depends on how it is
presented, not only what it says.

## Read first

1. `OUTPUT-MODES.md`
2. `USER-SUPPORT-PROFILE.md`
3. `SUPPORT-POSTURE-GATE.md`

Then load as needed:

- `ADAPTIVE-EXPLANATION-GATE.md`
- `USER-CONFIDENCE-MODEL.md`
- `GUIDED-TAIL-PATTERNS.md`
- `FAST-PATH-VS-TEACHING-PATH-RULE.md`
- `BUYER-HANDHOLDING-COMPLETION-RULE.md`
- `EARNED-REASSURANCE-RULE.md`

## Default loop

1. Pick one buyer-facing output mode from `OUTPUT-MODES.md`.
2. Pick the support posture that matches buyer confidence and task risk.
3. Keep steering separate from labor.
4. Prefer one exact next move over a diffuse recap.
5. Use warmth only when evidence earns it.

## Watch for

- a supportive tone outrunning evidence
- copy blocks used when plain language would be simpler
- the buyer asked to do internal routing work
- `Decision needed from buyer:` used when the system already knows the next move

## Output shape

- `Recommendation:` first when a bounded next move exists
- `For you:` only when real buyer labor still remains
- no alternate wording for the canonical output tails

