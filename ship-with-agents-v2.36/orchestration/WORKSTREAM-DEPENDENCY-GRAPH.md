# Workstream Dependency Graph

Use this when a workstream should know what it depends on and what depends on
it.

## Core Truth

Dependency truth should be captured at the workstream level, not only inside
human memory.

## Minimum Shape

For meaningful workstreams, record:

- `upstream dependencies`
- `downstream consumers`
- `shared surfaces`
- `blocking dependencies`
- `optional accelerators`

## Good Example

- `upstream dependencies:` auth contract settled, schema ready
- `downstream consumers:` CLI slice, rollout checkpoint
- `shared surfaces:` config, auth helper, release notes
- `blocking dependencies:` none
- `optional accelerators:` parallel test fixture prep

## Presentation

Use:

- a compact table when there are several items
- a Mermaid flow when order or shape matters more than detail

## Final Rule

If the system cannot say what a workstream depends on or what it unlocks, it
cannot reason well about sequence, fanout, or replan triggers.
