# Minimal Repair Note Rule

Use this when doctor or another recovery-capable lane is deciding how much text
to give the buyer to repair a live lane.

## Core Truth

The best repair note is the smallest one that safely works.

If `read your inbox` is enough, do not make the buyer carry a long pasted
packet unless the packet adds real missing truth.
If one unchanged note can safely recover several active lanes, do not multiply
the buyer's work by emitting one bespoke note per lane.

## Preference Order

Prefer, in order:

1. internal repair with `No user action needed:`
2. one short buyer note:
   - `Read your inbox and continue.`
3. one short buyer note plus one clarifying line:
   - why the inbox matters
4. a longer doctor note only when the lane needs explicit behavior correction
   that the inbox alone will not reliably surface

## Strong Behavior

- choose the shortest repair that restores momentum
- assume the buyer prefers noob-friendly handling
- use long pasted notes only when they are truly necessary
- if the lane already has the needed update in its inbox, prefer inbox-first
  recovery
- if multiple resolved lanes need the same inbox-first recovery, prefer one
  reusable note and name the targets outside the block if needed

## Weak Behavior

- giving a long policy memo when a short inbox note would work
- asking the buyer to be the transport layer by habit
- pasting a lane-specific correction into the wrong lane because the note was
  more specific than necessary
- emitting several near-identical repair notes when one reusable note would
  safely do the job

## Final Rule

When two repair notes are equally safe, choose the shorter one.
