# Startup Synthesis Gate

Use this gate at the start of meaningful work so the chat actually loads its
role, ownership, and constraints instead of only reading files passively.

This is not a giant ritual. It is a short synthesis pass scaled to the work.

## Why This Exists

Reading startup files is necessary, but not always sufficient.

The common failure modes are:

- the chat reads the files but does not operationalize them
- the chat forgets what role it is supposed to play
- the chat mixes old work with new work
- the chat chooses a launch, compact, or spawn path without first checking
  scope, runtime shape, and assurance needs
- the chat narrows too early without reading the nearest existing slice, plan,
  review memo, checkpoint, inbox update, or repo resource

This gate makes the first output carry the most important operating truth.

## When To Run It

Run startup synthesis:

- at a fresh session start
- after a resume or rotation
- after a major compact
- after a migration packet
- when the workstream or risk profile changes materially

For already-running live lanes, also do a lighter version every turn:

- refresh runtime mail/update inbox truth
- preserve approved momentum unless new inbox truth changes it
- do not treat terse buyer return signals like `done`, `continue`, `what's
  next`, or `read your inbox` as exceptions to that refresh

## Synthesis Levels

### S0 - tiny

Use for trivial or highly bounded work.

Confirm:

- role
- current goal
- no-touch areas
- done criteria

### S1 - normal

Use for most meaningful head, manager, super, agent, and worker sessions.

Confirm:

- role
- current ownership
- current goal
- chat state
- quality lane
- assurance level
- runtime shape
- next action

### S2 - deep

Use for ambiguous, high-stakes, or cross-repo work.

Confirm:

- role
- current ownership
- current goal
- chat state
- quality lane
- assurance level
- runtime shape
- active lineage / adjacent chats
- what must be preserved
- what triggers compact, spawn, preflight, or escalation
- why this workflow shape is better than the obvious alternatives

## Required Questions

Use the smallest level that fits, but answer these categories honestly.

### Role

- What role am I?
- What do I own?
- What do I explicitly not own?

### Work

- What is the actual goal right now?
- Is this continuation, migration, recovery, or a fresh start?

### Routing

- What quality lane is this?
- What assurance level is this?
- Is this a lightweight task, supervised build, or audited lane?

### Runtime

- What runtime shape am I in: desktop/app, terminal, IDE agent, or web/manual?
- What model/effort is known versus only assumed?
- What live telemetry is actually visible right now?
- What durable optional capabilities or subscriptions are active and relevant?

### Continuity

- What lineage or workstream must be preserved?
- What durable artifact should I rely on first?
- If this is a fresh continuation chat, what checkpoint, closeout, or
  migration artifact am I adopting from?
- Am I listed correctly in `ACTIVE-CHAT-MAP.md` if this lane should be active?
- If a canonical slice, checkpoint, or wake target names a different current
  session than the active map, which source is newer and has the map been
  reconciled yet?
- Are there unread updates for this lane, role, or lineage?
- Is `orchestration/updates/UPDATE-WATERMARKS.md` current enough to trust?
- Does `orchestration/OPERATOR-CAPABILITIES.md` change which surfaces I should
  consider?

### Next move

- What is the lightest honest next action?
- What existing artifact or repo resource should I read before I answer with
  confidence?

## Output Shape

Do not produce a giant monologue.

For S1 or S2, a compact form is enough:

```text
Startup synthesis:
- Role:
- Ownership:
- Goal:
- Continuation source:
- Chat state:
- Quality lane:
- Assurance level:
- Runtime shape:
- Preserve:
- Next action:
```

If a field is unknown, say it is unknown. Do not invent it.

## Relationship To Other Gates

- use this before deep action
- use `orchestration/CHAT-STATE-GATE.md` to classify the session state
- use `orchestration/ASSURANCE-GATE.md` to choose review intensity
- use `orchestration/references/SPAWN-DECISION-GATE.md` before adding new chats
- use `orchestration/ROLE-AWARE-COMPACTION.md` when deciding whether the current chat
  should keep carrying the work
- use `orchestration/UPDATE-BUS.md` when the lane may be running under older workflow
  truth
- use `orchestration/ACTIVE-MAP-FRESHNESS-GATE.md` before trusting session-ID routing
  when live-lane truth looks stale or conflicting
- use `orchestration/CAPABILITY-AWARENESS-GATE.md` when optional paid or hosted
  capabilities may materially change the best path

## Anti-Pattern

Bad:

- read ten files
- say "ready"
- immediately recommend a launch or edit path

Better:

- read the right files
- synthesize the operating truth briefly
- then act from that synthesis

Best:

- read the right files
- identify the nearest existing artifact truth before inventing new framing
- synthesize the operating truth briefly
- then act from that synthesis


