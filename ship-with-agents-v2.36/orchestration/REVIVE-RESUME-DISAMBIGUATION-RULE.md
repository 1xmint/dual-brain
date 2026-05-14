# Revive Resume Disambiguation Rule

Use this when the buyer says things like:

- `revive`
- `resume`
- `restart today`
- `bring it back`
- `pick this back up from checkpoint`

## Core Truth

`revive` is not automatically a wake.

If the prior chat was killed, closed, shut down overnight, or intentionally
ended after writing a checkpoint, the right move is usually a resume or relaunch
packet, not `read your inbox`.

## Resolve The Mode

Choose one first:

1. `wake-existing`
2. `resume-or-relaunch`
3. `uncertain`

## 1. Wake Existing

Use wake only when the target lane is already open and waiting now.

Strong signals:

- the buyer is clearly in that live chat already
- the lane is already open in terminal or desktop and only needs a nudge
- the user explicitly says the session is still open/waiting

Output shape:

- tiny wake trigger
- not a launch command

## 2. Resume Or Relaunch

Use this when the prior chat is gone and continuity should come from checkpoint,
closeout, or runtime artifacts.

Strong signals:

- the buyer says they killed chats last night
- the buyer says they are restarting today
- the prior machine/app/session was closed
- the lane saved a checkpoint specifically for restart

Output shape:

- exact launch or native resume command first
- then the revive/resume prompt or checkpoint-based pickup packet
- if the runtime supports native resume cleanly, prefer that over rebuilding a
  giant packet

## 3. Uncertain

If it is not clear whether the lane is still open:

- do not silently choose wake
- do not silently choose relaunch
- say the ambiguity plainly
- give the smallest safe branch or resolve from runtime truth first

## Bad Pattern

- writing inbox and mail
- saying `revived and queued`
- then giving only `read inbox`

when the buyer actually meant:

- `that chat is dead; give me the command to bring it back`

## Final Rule

If the buyer mentioned yesterday's checkpoints, killed chats, or restarting
today, default away from wake and toward resume or relaunch.
