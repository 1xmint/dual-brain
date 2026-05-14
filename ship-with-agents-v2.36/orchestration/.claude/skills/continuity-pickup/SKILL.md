<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 52eac8f87fa91932827ad9055d13beedcaa732fa49078b31a68c887ea93e638a -->
<!-- canonical-sources:
  - RUNTIME-MAIL-PROTOCOL.md
  - DONE-ABSORPTION-RULE.md
  - FAN-IN-SYNTHESIS-RULE.md
  - MAILBOX-STATE-MODEL.md
  - RESULT-RETURN-SIMPLIFICATION-RULE.md
  - PARENT-PICKUP-HANDHOLDING-RULE.md
-->
---
name: continuity-pickup
description: Runtime pickup, done absorption, and child-result fan-in. Use when a live owner should stay hot, absorb unread completions, or tell the buyer the smallest honest pickup trigger.
---

# Continuity Pickup

Use this skill when the real question is not what happened, but who should pick
it up next and how little buyer labor is needed.

## Read first

1. `RUNTIME-MAIL-PROTOCOL.md`
2. `DONE-ABSORPTION-RULE.md`
3. `RESULT-RETURN-SIMPLIFICATION-RULE.md`

Then load as needed:

- `FAN-IN-SYNTHESIS-RULE.md`
- `MAILBOX-STATE-MODEL.md`
- `PARENT-PICKUP-HANDHOLDING-RULE.md`

## Default loop

1. Confirm whether a live owner already exists.
2. Read unread runtime mail before asking what happened.
3. Prefer inbox absorption over raw buyer relay when the system can carry the
   result itself.
4. If the buyer still needs a step, give the smallest exact pickup trigger.
5. Say when no terminal copy is needed.

Durably routed is not the same as actively picked up.

If the current lane would otherwise describe itself as idle, verify unread
runtime mail and pickup state first.

## Watch for

- child result visible but parent never absorbs it
- buyer forced to paste raw output into a lane that already has mail
- multiple siblings finishing without fan-in synthesis
- “no action needed” claimed before pickup state is verified

## Output shape

- `Current owner:`
- `Unread completion status:`
- `Absorption path:`
- `For you:` only if a human bridge is truly still needed

