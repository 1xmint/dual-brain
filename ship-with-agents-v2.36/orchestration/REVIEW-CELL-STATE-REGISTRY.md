# Review Cell State Registry

Use this as the extended runtime shape for meaningful workstreams.

## Core Truth

`WORKSTREAM-CELL-REGISTRY.md` defines the durable cell skeleton.
This file adds the active state fields needed for runtime automation.

## Minimum Extended Shape

For meaningful work, track:

- `review state`
- `recommendation state`
- `approval state`
- `next owner`
- `bridge mode`
- `pickup required`
- `buyer steer required`
- `provider roles`

Keep these alongside:

- `workstream id`
- `review cell id`
- `review topology`
- `execution owner`
- `review owner`
- `approval owner`
- `phase`
- `chunk`
- `slice`
- `checkpoint`

## Example

- `workstream id`: `product-day0`
- `review cell id`: `cell-product-day0`
- `review topology`: `T3`
- `review state`: `challenge_active`
- `recommendation state`: `ready`
- `approval state`: `buyer_steer`
- `next owner`: `manager-product-delivery`
- `bridge mode`: `buyer-paste`
- `pickup required`: `true`
- `buyer steer required`: `true`
- `provider roles`: `review=desktop-gpt; coordination=claude-terminal`

## Final Rule

If the system tracks who exists but not what state their shared cell is in, the
control plane is still too weak.
