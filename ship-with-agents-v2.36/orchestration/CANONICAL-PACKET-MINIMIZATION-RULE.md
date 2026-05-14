# Canonical Packet Minimization Rule

Use this when handing off same-workstream follow-on work, especially to a live
manager, supervisor, or direct agent.

## Core Truth

The canonical artifact should carry the story.
The handoff packet should carry only the delta and the next ask.

If every follow-on packet re-explains the same workstream from scratch, the
system pays the context tax repeatedly and gets slower and blurrier.

## Packet Layers

### Canonical truth

Lives in:

- the slice
- checkpoint
- closeout
- active workstream state

### Handoff delta

Should only carry:

- what changed
- what still matters now
- the exact next ask
- what not to redo

## Minimal Same-Workstream Packet

For a bounded follow-on inside the same hot workstream, prefer:

- lane identity
- canonical artifact path
- one short current truth delta
- exact task
- exact output expectation

Do not recopy large sections of:

- prior manager continuity
- whole workstream history
- stable already-accepted truths
- long review lists that the canonical slice already contains

## Good Shape

- `Canonical artifact:` path
- `Current delta:` 2-5 bullets
- `Your exact job:` one short list
- `Do not redo:` one short list if needed

## Anti-Patterns

- re-teaching the whole workstream to a lane that already belongs to it
- repeating accepted architectural truths in every new packet
- long continuity blocks for same-workstream follow-ons
- using handoff text as a substitute for updating the canonical doc

## Same-Workstream Rule

If the next move is within the same hot workstream:

- update the canonical artifact first if truth changed
- then reference that artifact
- then add only the new delta

Do not clone the whole story into the next packet unless the lane is truly new
and the canonical artifact is insufficient.

## Final Rule

If a packet could shrink by half without losing correctness because the slice
already holds the truth, it should shrink.
