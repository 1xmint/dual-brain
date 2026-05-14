# Workstreams Runtime

This directory holds compact narrative truth for active meaningful workstreams.

Use one subdirectory per workstream:

- `workstreams/<workstream-id>/STORY.md`

This directory also holds shared organism-level digests:

- `system-story.md`
- `neighbor-digest.json`

The story file should explain:

- mission
- current decision point
- default recommendation
- execution owner
- review owner
- current risk
- next intended move

Use `system-story.md` for one compact story of the whole active organism and
`neighbor-digest.json` for upstream, downstream, sibling, and shared-contract
truth that should not stay implicit.

This keeps head, manager, super, and doctor aligned without re-reading long
history each time.
