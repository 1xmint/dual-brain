# Wrong-Chat Recovery

Use this when a startup prompt, task packet, or handoff was pasted into the
wrong chat.

This includes cases like:

- a super receives an agent packet
- an agent receives a manager note
- a brainstorm receives execution instructions
- the right role gets the wrong workstream
- the right workstream gets the wrong session lineage

## Core Truth

The correct response is not "do the work anyway."

The correct response is:

1. detect the mismatch
2. stop before more action
3. salvage what is still useful
4. reroute the packet to the right lane
5. record whether the wrong lane changed state

## Hard-Stop Triggers

Stop immediately if any are true:

- the prompt says `This is agent chat ...` but the current role is not agent
- the prompt says `This is super ...` but the current role is not super
- the prompt names a different session ID than the current chat
- the packet ownership/workstream clearly belongs to another live lane
- the current lane would have to violate its no-touch role to comply

## First Response Rule

Before any repo action, say a compact identity check:

```text
Identity check:
- I am:
- This packet appears intended for:
- Match status: match / mismatch
```

If mismatch, do not continue into implementation, routing, or review.

## Recovery Procedure

### 1. Freeze

Stop new actions in the wrong chat.

### 2. Classify

Classify the state as:

- `S8 Wrong-chat contamination`

Use the intervention:

- `I6 Stop-and-warn`

### 3. Assess spill

Say whether the wrong chat already:

- only read the packet
- wrote analysis only
- touched durable files
- touched repo code
- ran commands

### 4. Salvage

Preserve only what is still safe:

- verified facts
- useful analysis
- clarified constraints

Do not preserve role-inappropriate work as if it were normal.

### 5. Reroute

Produce a compact recovery handoff with:

- intended target chat
- intended role
- intended ownership/workstream
- what was already done in the wrong lane
- what should continue in the correct lane

### 6. Lane-state cleanup

If the wrong chat should remain active, say so.
If it should return to prior work, say so.
If it should close or pause the mistaken lane attempt, record that in
`ACTIVE-CHAT-MAP.md` if needed.

Use `orchestration/LANE.md` when the mistake created ghost activity.

## Recovery Output Shape

```text
Wrong-chat recovery:
- Current chat:
- Current role:
- Packet appears intended for:
- Match status: mismatch
- Spill level:
- Safe salvage:
- Correct target:
- Next action:
```

## Golden Rule

Wrong-chat recovery should cost one short stop, not half a workstream.


