# Chat State Gate

Use this gate before producing a startup packet, corrective update,
handoff, migration packet, resume packet, or new rule proposal.

This gate exists because "already running chat" is only one branch of a
larger failure family. The deeper problem is choosing the wrong
intervention for the chat's actual state.

## Step 1: Classify The State

Choose the closest state before you act.

- `S1 Fresh start`: no running chat owns the work yet.
- `S2 Active and healthy`: the correct chat is already running and can
  continue safely.
- `S3 Active but drifting`: the correct chat is still running, but its
  task, constraints, or ownership need tightening.
- `S4 Stale or overloaded`: the chat is still running, but context is
  long, mixed, noisy, or degrading.
- `S5 Handoff received`: another chat is transferring ownership or a
  bounded task into this chat.
- `S6 Resume after crash or shutdown`: the prior chat is gone and work
  should continue from checkpoint or session log.
- `S7 Migration target`: a fresh chat should inherit the durable spine
  and current task packet.
- `S8 Wrong-chat contamination`: pasted context likely belongs to a
  different workstream, repo, or owner.
- `S9 Wrong-layer or wrong-tool state`: the work is being routed to the
  wrong layer or runtime.
- `S10 Model mismatch or budget mismatch`: the model/effort
  recommendation is wrong for the task or budget.
- `S11 Strategy unresolved`: the task has crossed into product,
  architecture, or trust decisions that need escalation.
- `S12 Completed or closeout`: the right move is logging, closeout, or a
  clear stop, not more buildup.

## Step 2: Choose The Intervention

After classifying the state, choose the lightest intervention that
honestly fixes it.

- `I1 Additive in-session update`: for `S2` or `S3` when the right chat
  is already running and only needs a focused correction or next step.
- `I2 Task-packet refresh`: when the chat is still right, but facts,
  success criteria, or constraints have materially changed.
- `I3 Explicit handoff acknowledgement`: for `S5`; the recipient should
  state identity, role, and accepted ownership before continuing.
- `I4 Migration packet`: for `S4` or `S7` when context should move to a
  fresh chat.
- `I5 Resume packet`: for `S6`; resume from checkpoint/session log with
  the right suffix and preserved ownership.
- `I6 Stop-and-warn`: for `S8` or `S9`; name the contamination or layer
  mismatch before accepting the work.
- `I7 Escalate upward`: for `S11`; execution should stop until strategy
  is resolved by the right layer.
- `I8 Model-routing correction`: for `S10`; adjust the recommendation or
  launch command before continuing.
- `I9 Closeout`: for `S12`; write the log, record pickup if needed, and
  stop.
- `I10 Fresh startup packet`: use only for `S1`, or when the user
  explicitly wants a fresh start after lighter interventions were ruled
  out.

## Step 3: Preserve Vs Replace

Before writing the intervention, decide what survives and what resets.

Preserve when still valid:

- chat identity and role
- current ownership
- active workstream
- durable constraints
- verified facts
- accepted decisions
- checkpoint path

Replace or refresh when stale:

- temporary snapshots
- outdated assumptions
- old success criteria
- obsolete next steps
- mismatched model/effort guidance
- pasted context from another chat

If you are preserving less than half of the current working context, you
probably need a migration or resume packet instead of an additive
update.

## Step 4: Verify Session-ID Lineage Before Fresh Startup

If the chosen intervention is `I10 Fresh startup packet`, or if you are
spawning a new bounded child chat under an existing lane, run
`orchestration/SESSION-ID-GATE.md` before choosing the new session ID.

Choosing the wrong intervention and choosing the wrong lineage often
happen together. Do not treat them as separate accidents.

## Step 5: Check Context Load Before Continuing

If the chosen state is `S3 Active but drifting`, `S4 Stale or
overloaded`, or the chat is about to mix several substantial
workstreams, run `orchestration/CONTEXT-LOAD-GATE.md`.

Choosing the right intervention is not enough if the current chat is
already too crowded to carry it cleanly.

## Step 6: Check Spawn Necessity Before Recommending A New Chat

If the chosen intervention would create a new manager, super, agent, or
brainstorm, run `orchestration/references/SPAWN-DECISION-GATE.md` first.

Do not let "fresh startup packet" become the default answer when an
additive update, migration packet, or bounded helper would be cleaner.

## Intervention Priority

When multiple states seem true, resolve in this order:

1. `S8` wrong-chat contamination
2. `S9` wrong-layer or wrong-tool state
3. `S10` model or budget mismatch
4. `S11` strategy unresolved
5. `S6` resume after crash or shutdown
6. `S4` stale or overloaded
7. `S5` handoff received
8. `S3` active but drifting
9. `S2` active and healthy
10. `S1` fresh start
11. `S12` completed or closeout

This order exists so the system fixes dangerous misrouting before it
optimizes convenience.

For `S8 Wrong-chat contamination`, run `orchestration/WRONG-CHAT-RECOVERY.md`.
For `S6 Resume after crash or shutdown`, also run
`orchestration/REVIVE-RESUME-DISAMBIGUATION-RULE.md`.

## The Adaptive Rule-Making Gate

When proposing a new rule, do not stop at "this happened once."

A durable rule candidate must pass all of these:

1. `Observed failure`: addresses a concrete failure that actually
   happened.
2. `Existing-principle check`: no current principle already covers the
   failure class, or the change clearly strengthens that principle
   instead of duplicating it.
3. `State classification`: you can name which chat state(s) were
   mishandled.
4. `Intervention clarity`: you can name which intervention should have
   happened instead.
5. `Scenario sweep`: test the candidate against at least these
   families:
   - active healthy chat
   - active drifting chat
   - stale or overloaded chat
   - resume or migration case
   - wrong-chat or wrong-layer case
6. `Abstraction check`: it covers the class, not just the exact
   anecdote.
7. `Testability`: another layer could tell whether the behavior
   violates the rule.

If a candidate fails the scenario sweep, write a state-aware gate or
decision rule instead of another symptom rule.


