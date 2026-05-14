# Spawn Decision Gate

Use this gate before recommending or launching a new manager, super,
brainstorm, agent, or helper subagent.

This gate exists because "new chat seems helpful" is not enough. The
system should choose the lightest honest structure, not spawn by habit.

Also read `orchestration/EXECUTION-ROUTING-GATE.md` when the question is really:

- direct agent exception?
- super-owned execution?
- or new super?

Also read `orchestration/EXECUTION-OWNER-REUSE-GATE.md` when the question is really:

- should the current super just stay hot?
- is this tiny enough for a direct agent?
- or is a fresh supervisor truly justified?

Also read `orchestration/MULTITASKING-THROUGHPUT-GATE.md` when the question is
really:

- one slice or parent + child slices?
- one super with fanout or several supers?
- one agent or several safe parallel agents?

Also read `orchestration/LAUNCH.md` when the question is really:

- does `launch` mean packet, desktop spawn, or terminal injection?
- is the system about to over-assume the buyer's launch workflow?

## Step 1: Ask Whether A New Chat Is Actually Needed

Before spawning, check:

1. does the current live chat already own the work and still have
   healthy context?
2. would an additive update or task-packet refresh solve it?
3. is the new work bounded and independent enough to benefit from
   separate context?
4. does the new work need a durable identity, checkpoint, or rotation
   path?
5. does exact model or effort control matter?
6. is parallelism genuinely valuable, or would it create conflicts?
7. who is the current operational owner of this workstream?
8. am I that owner, or has ownership been explicitly reclaimed?

If the current chat can safely own it, do not spawn just because a new
chat sounds cleaner.

## Step 2: Choose The Smallest Honest Structure

- `SD1 Additive update`: the right chat is already running
- `SD2 Helper subagent or desktop background helper`: bounded review,
  targeted research, or disjoint helper slice
- `SD3 Direct standalone agent`: bounded execution lane with no live
  super owner, or a justified direct-agent exception
- `SD4 Super-owned agent`: execution lane that belongs to a live super
  and is the default for meaningful supervised execution
- `SD5 New super`: a new coordination lane is needed
- `SD6 New manager`: a new deep-analysis lane is needed
- `SD7 New brainstorm`: genuine exploration or decision support is
  needed

## Step 3: Apply Routing Rules

Prefer:

- additive update over fresh spawn when the current owner is healthy
- helper subagent over durable chat when the work is short and bounded
- durable terminal chat over helper subagent when the work needs its own
  checkpoints, logs, or future follow-ups
- manual terminal launch when exact runtime control matters
- one live super with safe child-slice fanout over multiple supers spawned only
  for speed theater
- direct agent exception only when the packet is genuinely small and does not
  need durable supervision
- super-owned execution when follow-ups, checkpointing, or live supervision are
  likely
- verified live lineage over fresh root numbering

Avoid:

- spawning a new root lane because filenames make a number available
- using a stronger worker model when the real need is better audit or
  coordination
- parallel spawns that touch the same files or depend on the same build
  order
- a higher layer spawning or closing another owner's child lane without an
  explicit ownership change
- head or review lanes keeping a slice loop to themselves when the real next
  move is super-owned execution routing
- a review lane writing a second child-launch packet for a live super-owned
  workstream when the real next move is to wake the super
- proposing a sibling supervisor for the next seam of a hot workstream when the
  current super could own the follow-on packet or launch the direct agent
- calling a helper container a full supervisor before checking `LAUNCH.md`
- hearing `launch` and choosing direct terminal injection or desktop helper
  spawn when a terminal packet would have been the safer default

## Step 4: Before Naming

If a new durable chat is warranted:

1. run `orchestration/SESSION-ID-GATE.md`
2. verify whether the work belongs to an existing live lineage
3. preserve lineage if it does
4. only then choose the session ID

## Failure Signal

If the user has to ask:

- "why not just keep this in the current chat?"
- "why did this spawn instead of updating the live one?"
- "why did this jump to a new root?"

then the spawn decision was probably under-justified.

