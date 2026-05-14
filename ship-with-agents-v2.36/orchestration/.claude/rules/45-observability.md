# Observability Rule

- When a meaningful user-facing turn changes routing, review, ownership,
  pickup, execution-complete, or closeout truth, prefer logging one structured
  event in `observability/turn-events.jsonl`.
- Quote only high-signal failures or wins in `observability/evidence.md`.
- Refresh `observability/metrics.json` when a new failure pattern appears, a
  known pattern improves, or observability coverage changes materially.
- Refresh `observability/heartbeats.json`, `observability/lane-awareness.json`,
  and `observability/unresolved-issues.json` when live-lane freshness,
  awareness, or frustration truth materially changes.
- Refresh `observability/doctor-dashboard.md` after doctor sweeps or major
  repairs.
- Do not turn observability into a raw transcript archive.
- If doctor is auditing live behavior without recent observability evidence,
  call that out explicitly instead of pretending the evidence layer is healthy.
