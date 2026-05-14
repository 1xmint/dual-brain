# State Freshness SLA

Use this to decide when control-plane truth is too stale to trust casually.

## Freshness Targets

For meaningful active work:

- active-map verification: same working day
- workstream verification: same working day
- heartbeat refresh: after meaningful turns
- unresolved issue refresh: when status changes
- doctor dashboard refresh: after doctor sweeps or major fixes

## Freshness States

- `fresh`
- `aging`
- `stale`

## Final Rule

If multiple truth surfaces are stale at once, doctor should degrade trust and
say so explicitly instead of acting as if the control plane is fully current.
