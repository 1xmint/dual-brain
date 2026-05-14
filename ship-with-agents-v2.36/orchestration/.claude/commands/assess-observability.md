---
description: Assess doctor observability quality and refresh the runtime evidence layer
---

Assess current observability quality using:

1. `observability/metrics.json`
2. `observability/turn-events.jsonl`
3. `observability/evidence.md`
4. the smallest current slices, checkpoints, closeouts, or update-bus items
   needed to verify whether observability matches reality

Then:

- refresh `observability/metrics.json` if coverage or top patterns changed
- backfill one event when a meaningful recent turn is missing
- quote only the smallest needed excerpt if a failure or win deserves durable
  evidence

Return:

1. `Observability status:`
2. `Coverage gap:`
3. `Top failure pattern:`
4. `Best next move:`
