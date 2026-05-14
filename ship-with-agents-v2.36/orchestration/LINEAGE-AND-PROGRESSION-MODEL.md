# Lineage And Progression Model

Use this when naming, rotating, resuming, or explaining workstream progress.

## Core Truth

Do not overload one visible lane name with four different meanings.

Keep these separate:

- lineage
- workstream identity
- progress
- continuation

If those meanings blur together, users start guessing system state from the
chat name instead of reading the actual control plane.

## The Four Layers

### 1. Lineage

Lineage answers:

- which root owner family does this belong to?
- is this the same enduring lane family or a new one?

Lineage should stay stable unless ownership meaningfully changes.

### 2. Workstream Identity

Workstream identity answers:

- what job is this lane really about?
- which repo/customer/track does it serve?

This belongs in:

- stable lane key
- workstream id
- review cell id
- repo scope metadata

### 3. Progress

Progress answers:

- how far along is the work?
- which phase or chunk is current?
- what is the next move?

Progress belongs in:

- `phase`
- `milestone`
- `chunk`
- `state`
- slices
- checkpoints
- closeouts
- live workstream and health files

Never rely on visible lane numbering as the primary progress signal.

### 4. Continuation

Continuation answers:

- is this the same lane after a planned rotation?
- is this the same lane after a recovery event?

Use:

- `--run<N>` for planned rotation
- `--recover<N>` for crash recovery

Do not use continuation tokens as progress markers.

## Final Rule

If the user must ask whether a lane name means:

- more work completed
- a new chunk
- a real rotation
- or a totally new workstream

then progression truth is still too implicit.
