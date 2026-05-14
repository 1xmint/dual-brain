# Copy Block Decision Rule

Use this before emitting any buyer-facing wake, paste, return trigger, or
manual launch artifact.

## Core Truth

Do not make the buyer infer:

- whether a copy block is needed
- which words belong inside it
- whether the block should be tiny or full-packet
- whether no block is needed at all

Resolve that explicitly.

## Decision Ladder

### 1. Is a human expected to say literal words?

If yes:

- a copy block is mandatory by default
- keep only the exact words inside the block
- put explanation outside the block

Typical examples:

- `Read your inbox and continue.`
- `done`
- `Read your inbox and stay on Home only.`

### 2. Is another live lane the next owner but durable truth is already current?

If yes:

- prefer one tiny wake block over a larger packet
- do not restate docs, inbox paths, or history inside the block unless the
  target truly cannot reconstruct from durable truth

### 3. Does the next owner need more than a tiny wake to act safely?

If yes:

- use one full paste block
- make it self-contained
- include the exact bounded instruction, not surrounding commentary

Use a full block when the target lane cannot safely reconstruct the next move
from current doc/inbox truth alone.

### 4. Is the next move fully internal or awareness-only?

If yes:

- no copy block
- use `No user action needed:` or a compact progress tail instead

### 5. Is the flow a manual launch?

If yes:

- follow the resolved launch sequence
- each user action artifact should get its own block only when that action is
  truly separate
- do not add decorative extra blocks

## What Goes Inside The Block

Inside a buyer-facing copy block, include only what the buyer needs to copy.

Good:

```text
Read your inbox and continue.
```

Also good:

```text
Read your inbox, then open the current launch brief and emit the backend
launch packet now.
```

Bad:

```text
Read your inbox and continue. This works because I already routed the note and
updated the doc and the active map is current.
```

## Tiny Vs Full

Use a tiny block when:

- one short sentence is enough
- durable truth already exists
- the target lane only needs a wake or return trigger

Use a full block when:

- the target lane needs fresh bounded instructions
- the user is manually launching a lane
- the target cannot safely infer the next move from current runtime truth

## Placement Rule

- one primary human action -> one primary copy block
- put the primary block near the end
- put it before bookkeeping if the block is the real next action
- if there are now/later triggers, label them separately and keep both tiny

## Anti-Patterns

- prose says what to type but no block appears
- block contains explanation, apology, or admin history
- full packet emitted when a one-line wake would do
- tiny wake emitted when the target actually needs a full self-contained packet
- multiple competing blocks for the same human action
- action block appears after low-signal bookkeeping

## Final Rule

If the buyer could still ask:

`Do I need a block here?`

or:

`What exactly am I supposed to copy?`

or:

`Why is this a giant packet instead of one line?`

the copy-block decision is incomplete.
