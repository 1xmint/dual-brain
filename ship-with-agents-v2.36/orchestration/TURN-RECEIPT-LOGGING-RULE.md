# Turn Receipt Logging Rule

Use this for meaningful final replies, closeouts, handoffs, summaries, and
completion absorptions.

## Core Truth

A lane should not only sound coherent.
It should leave a compact receipt that doctor and later lanes can inspect.

If a meaningful turn changes ownership truth, absorbs a child result, rejects a
foreign result, emits a launch bridge, or says `No user action needed:`, that
turn should leave a compact observability trace.

## Receipt Surfaces

Prefer:

- `observability/turn-events.jsonl` for compact structured turn receipts
- runtime mail or update inbox when another live lane needs the truth next

Use both when both are relevant.

## When A Receipt Is Required

Write or refresh a compact turn receipt when the turn does any of these:

- absorbs a child completion
- rejects or reroutes a foreign pasted completion report
- changes `next owner`
- changes workstream status or pickup state
- emits a launch packet or wake bridge
- says `No user action needed:`
- says `Decision needed from buyer:`
- closes or pauses a lane
- claims a package or doctor fix is delivered

## Minimum Receipt Truth

The receipt should make it easy to answer:

1. what this lane thought happened
2. whether ownership was verified
3. whether a foreign report was rejected, accepted, or rerouted
4. what bridge was actually provided
5. what the next owner or next buyer action became

Keep it short and factual.

## Strong Behavior

- meaningful reply leaves a compact receipt
- doctor can inspect the receipt later without trusting memory
- wrong-lane or foreign-report incidents become visible evidence, not folklore
- summary quality can be audited against what the lane actually did

## Weak Behavior

- polished closeout with no structured trace
- foreign completion absorbed with no receipt of how custody was verified
- `No user action needed:` with no observable delivery trail
- doctor trying to reconstruct the turn from prose alone

## Final Rule

If another lane or doctor could reasonably ask "what exactly did this turn do?"
and no compact receipt exists, observability is underpowered.
