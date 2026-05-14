# Context Load Gate

Use this gate before:

- writing a large strategic response
- deciding not to rotate or compact
- carrying multiple substantial workstreams in one chat
- spawning a new child chat from an already crowded parent

This gate exists because "context feels fine" is too vague. Chats need a
concrete decision test before they drift into overloaded behavior.

It also exists because under-loaded is not the same as well-loaded: a chat can
have room left and still make low-awareness decisions if it skipped the nearest
existing docs, plans, checkpoints, or review artifacts.

## Step 1: Count The Active Load

Score the current chat across these dimensions:

1. substantial workstreams currently alive in this chat
2. unresolved strategic decisions mixed into the same thread
3. separate repos or product areas being discussed
4. operational cleanup mixed with strategy or routing
5. recent user restatements or visible re-derivation of prior truth

## Step 2: Classify The Load

- `CL1 Light`: one substantial workstream, low ambiguity, little
  re-derivation
- `CL2 Halfway crowded`: two substantial workstreams, or one
  workstream plus system surgery / operational cleanup
- `CL3 Heavy`: three or more substantial workstreams, or repeated
  re-derivation, or mixed strategy plus package plus deployment cleanup
- `CL4 Degrading`: the chat is already forgetting, repeating, or making
  naming or routing mistakes

## Step 3: Choose The Response

- `CL1`: continue normally
- `CL2`: suggest compaction or a fresh continuation soon; do not keep
  casually stacking work
- `CL3`: recommend rotation, migration, or workstream split before
  adding more substantial work
- `CL4`: stop adding new workstreams; compact or rotate now

## Step 4: Special Rule For Head And Super Chats

Head and super chats should rotate earlier than implementation chats.

If a head or super is simultaneously carrying:

- multiple substantial workstreams
- system surgery or packaging work
- routing or naming decisions
- plus open strategic questions

then `CL2` is already enough signal to suggest compaction.

Do not wait for visible quality collapse.

## Failure Signal

If the user has to say:

- "this thread should have compacted earlier"
- "we are carrying too many things in here"
- "why are we mixing all these workstreams?"

then the gate was missed.

If the user has to say:

- "you didn't look at the docs"
- "we already wrote this down"
- "read the existing resources first"

then the gate was also missed.

Use `CONTEXT-TAX-HEURISTIC.md` when the lane is still structurally survivable
but already paying a noticeable clarity or efficiency tax.
