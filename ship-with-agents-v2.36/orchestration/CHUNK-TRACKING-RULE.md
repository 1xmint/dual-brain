# Chunk Tracking Rule

Use this when the work has multiple meaningful parts and the user could
otherwise mistake lane names for progress markers.

## Core Truth

Chunk progress belongs in metadata, not in visible lane numbering.

## Where Chunk Lives

Record chunk truth in:

- slices
- checkpoints
- `ACTIVE-WORKSTREAMS.md`
- `health/workstreams.json`
- dashboard notes when relevant

## Final Rule

If the user has to decode chunk progress from the chat title, chunk truth is in
the wrong layer.
