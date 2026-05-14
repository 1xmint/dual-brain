# Truth Before Assumption

Use this as the shared doctrine for every role when truth, routing, or state
could materially change the next move.

## Core Law

If runtime or canonical truth exists, read it before you guess.

Do not assume when the assumption would change:

- lane identity
- next owner
- buyer labor
- review state
- closeout state
- release or launch readiness
- repo/runtime state
- whether safe waiting is actually safe

## Resolve Classify Act

1. `Resolve`
   - identify the smallest honest truth needed:
     - identity
     - owner
     - current artifact
     - workstream state
     - next owner
2. `Classify`
   - `Known truth`
   - `Inference`
   - `Missing truth`
   - `Risky ambiguity`
   - `Safe ambiguity`
3. `Act`
   - if truth is known and sufficient, proceed
   - if truth should exist but is missing, repair or route repair
   - if another lane clearly owns the next move, route
   - if ambiguity is risky, stop and label it
   - if ambiguity is safe and reversible, proceed lightly

Do not compress `missing truth` into confident language.

## Truth Source Priority

Use this order when deciding what to trust:

1. active runtime control-plane files
2. canonical slice, checkpoint, or closeout
3. lane capsule or workstream story
4. update bus and inbox files
5. recent verified session artifacts
6. memory
7. inference

For meaningful scoping or recommendation turns, explicitly scan the nearest
available items in tiers 1-5 before acting as if memory or the current pasted
message is sufficient.

## Assumption Risk Ladder

- `A0 - Harmless presentation default`
  - concise prose vs small table
  - shipping vs guided posture when low consequence
  - action: proceed
- `A1 - Reversible workflow default`
  - drafting the smallest bounded artifact
  - choosing the lightest recommended next move when ownership is already clear
  - action: proceed, but keep it easy to undo
- `A2 - State or context ambiguity`
  - repo/runtime status
  - whether a checkpoint or inbox exists
  - whether a workstream is still active
  - action: read the smallest honest truth source first
- `A3 - Control-plane ambiguity`
  - who owns the next move
  - whether the buyer is this lane
  - whether a lane already rotated
  - whether closeout or launch-ready truth is real
  - action: verify before acting and say so explicitly if verification fails

High speed is good.
Hidden A3 assumptions are not.

## Inference Labels

Use these when truth is incomplete but work still needs to move:

- `Known truth:`
- `Inference:`
- `Missing truth:`

Label inference when ambiguity affects:

- routing
- review or closeout state
- launch readiness
- buyer labor
- lane identity

If the system is relying on inference, it should know that it is.

## Verify Before Routing

Before naming a next owner, opening a new lane, or claiming safe waiting,
verify:

- live lane target name
- routing id, display name, and stable-lane match
- review state when routing from review to launch or closeout
- pickup state before saying `No user action needed:`
- closeout state before saying a slice is effectively done
- whether a fresh lane is truly needed instead of reuse

Use the smallest honest sources:

- `_agent-system/ACTIVE-CHAT-MAP.md`
- `_agent-system/ACTIVE-WORKSTREAMS.md`
- `_agent-system-runtime/health/workstreams.json`
- canonical slice/checkpoint/closeout
- update bus or inbox
- lane capsule

If you cannot verify routing truth, say what is unresolved, name the missing
surface, and give the smallest repair step.

## What May And May Not Be Assumed

Low-risk reversible defaults are okay:

- concise formatting choice
- support posture when buyer preference is not explicit
- ordinary wording for a summary or bridge
- a tiny next step that is easy to undo and does not change ownership truth

Do not assume:

- a live lane name or rotated title
- that the buyer is equivalent to a routing id
- that an inbox is empty before identity is resolved
- that a workstream is done because one execution report sounds good
- that a fresh lane is needed without pricing reuse first
- that passive routing equals active pickup

## Final Rule

The system should stay fast, but never by inventing control-plane truth.
