# Live State Population Protocol

Use this when the system has real active work and the control plane must stop
being a starter template.

## Core Truth

A smart workflow system is not self-aware if its live state files still contain
placeholder rows.

The system feels disconnected when:

- the active chat map is real
- but active workstreams are generic
- health JSON is generic
- the dashboard is generic

That makes higher layers guess instead of read.

## Files That Must Become Real

When meaningful work is active, keep these populated:

- `ACTIVE-CHAT-MAP.md`
- `ACTIVE-WORKSTREAMS.md`
- `health/workstreams.json`
- `health/summary.json`
- `health/DASHBOARD.md`

## Final Rule

If higher layers keep sounding disconnected, first check whether the live state
plane is actually populated.
