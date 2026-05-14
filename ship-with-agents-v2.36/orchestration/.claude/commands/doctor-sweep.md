---
description: Run a whole-system doctor sweep across active lanes, workstreams, and observability state
---

Run `DOCTOR-SWEEP-PROTOCOL.md` using:

1. `ACTIVE-CHAT-MAP.md`
2. `ACTIVE-WORKSTREAMS.md`
3. `health/summary.json`
4. `health/workstreams.json`
5. `health/DASHBOARD.md`
6. `observability/metrics.json`
7. `observability/heartbeats.json`
8. `observability/lane-awareness.json`
9. `observability/unresolved-issues.json`
10. `observability/turn-events.jsonl`
11. `observability/evidence.md`
12. `observability/friction.jsonl` when present
13. `patterns/README.md`

Repair recoverable runtime/control-plane defects when ownership is clear.

Return:

1. `Doctor sweep status:`
2. `Top current risks:`
3. `Recurring friction:`
4. `Skill trigger or pattern gaps:`
5. `Repairs applied now:`
6. `Remaining exact owners:`
