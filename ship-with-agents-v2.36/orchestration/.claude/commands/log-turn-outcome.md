---
description: Log one meaningful user-facing turn outcome into the observability runtime
---

When a meaningful user-facing turn just happened, update:

1. `observability/turn-events.jsonl`
2. `observability/evidence.md` only if the turn is a high-signal failure or win
3. `observability/metrics.json` if the pattern or coverage status changed

Use:

- `TURN-OUTCOME-EVENT-SCHEMA.md`
- `EVIDENCE-RETENTION-RULE.md`
- `OBSERVABILITY-METRICS-MODEL.md`

Log only meaningful turns that changed routing, review, ownership, pickup,
closeout, or buyer-labor truth.

When relevant, also capture:

- whether user frustration was raised
- whether the frustration was resolved in the same turn or left open
- whether a required bridge was actually provided
- whether the turn cleanly moved from execution-complete into closeout truth

Return:

1. `Event logged:` yes / no
2. `Event ID:`
3. `Why it mattered:`
4. `Metrics changed:` yes / no
