# Neighbor Awareness Capsule

Use this when a lane needs more shared awareness without becoming omniscient.

## Core Truth

Every meaningful lane should know its neighborhood, not the whole world.

## Minimum Neighbor Briefing

For meaningful active lanes, keep a compact capsule of:

- `upstreams`
- `downstreams`
- `siblings`
- `shared contracts`
- `current conflict risk`
- `latest relevant change event`

## Good Output

- `Upstreams:` Manager - App / Release Readiness
- `Downstreams:` Agent - App / CLI Delivery
- `Siblings:` Supervisor - App / Test Hardening
- `Shared contracts:` `auth route`, `release checklist`
- `Current conflict risk:` low
- `Latest relevant change event:` `evt-20260504-auth-contract-settled`

## Final Rule

Neighbor awareness should reduce surprise and duplication without forcing every
lane to load the entire control plane.
