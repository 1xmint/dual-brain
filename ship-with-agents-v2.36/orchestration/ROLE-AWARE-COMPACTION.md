# Role-Aware Compaction

How to use `/compact` as a clarity tool, not only as an emergency memory tool.

## Big Idea

Large context changes when you compact, not whether you compact.

Even with a large-context model, a chat can still degrade because:

- too many workstreams are mixed together
- old decisions are technically present but not salient
- the role has drifted
- completed work still dominates the session

Compact when clarity pressure is high, not only when token pressure is high.

## General Rule

Use `/compact` when:

- the next phase wants a tighter summary than the current history
- more than one substantial unresolved thread is active
- the chat is re-deriving decisions already made
- the next action is narrower than the session history

Use live telemetry when you have it. In Claude Code, that usually means the
statusline or `/status`, not pure intuition.

If the current chat is no longer the right container at all, rotate or migrate
instead of compacting.

## Surface Rule

Compaction policy is not role-only. It is role plus surface.

- Claude Code terminal: strongest documented compact/resume automation surface
- Codex terminal: strong documented compact/resume surface with configurable
  auto-compact thresholds
- Codex app: thread-centric first; rotate by thread when the lane changes
  meaningfully
- Claude desktop/app: preserve coherent app threads, but rely more on clean
  migration packets when the thread becomes mixed

If you are unsure which surface rules apply, read
`../SURFACE-COMPACTION-AND-RESUME.md`.
Use `COMPACTION-CADENCE-LOOP.md` for the canonical timing loop and
`CONTEXT-TAX-HEURISTIC.md` when the lane feels costly before it looks broken.

## Role Guidance

### Head

Compact when:

- several substantial workstreams have accumulated
- the session is carrying both strategy and operational cleanup
- a new planning phase has started

Usually do not compact in the middle of one still-coherent strategic thread.

### Review lane

Compact when:

- bounded audits are finished and a new review problem is starting
- one review thread is now carrying multiple unrelated failure classes
- the session is holding too much stale critique context

### Super

Compact when:

- multiple launches, reviews, and checkpoint discussions are buried in one
  session
- one lane is complete and a new lane is being selected
- the next coordination move does not need all prior packet drafting detail

If the super is carrying too many unrelated active lanes, prefer rotation over
repeated compacting.

### Agent

Compact when:

- one bounded slice is done and the next slice is related but narrower
- large exploration output has buried the actual implementation thread
- the chat is still the right durable owner, but the history is now mostly
  completed work

### Worker

Compact when:

- context is getting large and the current task is still worth keeping in the
  same session
- verbose logs or broad reads have polluted the thread

If the worker is above the hard threshold or losing continuity, rotate instead.

### Brainstorm

Compact when:

- the exploration has converged
- many candidate ideas have been ruled out
- the next step is synthesis or handoff, not more open-ended ideation

## Big-Context Rule

For very large context windows:

- compact later than you would on a small model
- but compact just as deliberately

Think of huge context as buying you more room for one coherent problem, not
permission to mix every problem together forever.

On desktop/app surfaces with strong thread continuity, large context often buys
you a longer coherent thread. It does not remove the need for a fresh thread
when the workstream or phase has clearly changed.

## Telemetry Rule

If Claude Code telemetry is visible:

- use the live context percentage as one input
- do not use the percentage alone
- combine it with role, workstream count, and clarity drift

Good default review zones:

- coordination lanes: start reviewing compaction around 35% to 45%
- execution lanes: start reviewing compaction around 45% to 60%

If you want Claude Code to compact earlier automatically, use
`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and, when needed,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW`.

## Focus Instructions

Use focus instructions so compaction preserves the right truth.

Examples:

```text
/compact "focus on the active auth migration plan and drop completed package release work"
```

```text
/compact "focus on the current workstream, preserve open blockers, drop resolved exploration branches"
```

## After Compact

After a meaningful compact:

- re-run `STARTUP-SYNTHESIS-GATE.md` at the appropriate level
- confirm the active goal and next action
- do not assume the compacted summary preserved every subtle detail
- checkpoint if the compact happened at a real stop or evidence boundary
