# Wake-And-Continue Gate

Use this when another live lane already owns the next substantive step and the
canonical doc or review artifact has already been updated.

This exists because doc-first truth should reduce prompt transport, not just
move it from one giant packet to another.

## Core Truth

If the truth already lives in durable files and the next step belongs to an
already-running lane, wake that lane instead of re-pasting the whole workstream.
If the current lane can write the target lane's runtime inbox or equivalent
durable routing file directly, prefer that internal route first and keep the
user out of the transport loop.
But if the target lane will not actually pick the work up without a human nudge
and continued momentum matters now, route internally first and then emit one
tiny pickup trigger instead of pretending the work is already moving.
If the prior chat was killed, closed, or saved a checkpoint for a next-day
restart, this is not a wake case. Use a resume/relaunch packet instead.

Good wake:

- tiny
- named
- points at the canonical artifact
- tells the owner what responsibility to resume

Bad wake:

- another giant packet
- repeating the entire slice body
- making the user manually merge review notes into launch instructions

## When Wake Is The Right Mode

Prefer wake when all are true:

1. the target lane already exists
2. the target lane is already open/running now
3. the target lane already owns the next substantive step
4. the canonical slice, review memo, or inbox already contains the latest truth
5. the target lane can re-read durable artifacts directly
6. no untranscribed reasoning is still trapped in the current chat
7. the current lane cannot route the handoff cleanly through runtime inbox or
   equivalent durable routing files on its own

If any of those are false, use a stronger transport mode instead.
If the target lane exists in continuity truth but the actual chat session is
gone, prefer resume/relaunch from checkpoint over a wake.

## What A Wake Must Contain

Use this shape:

- exact visible target lane title when verified, or a robust role/scope
  descriptor when that is safer for the buyer
- canonical artifact path
- any linked review or checkpoint path the target must re-read
- one sentence on what the target now owns

Example:

```text
Wake the live checkout rollout supervisor
(currently `Supervisor - Checkout / Rollout`):

Re-read:
- _agent-system/slices/usefulness-proof-v2.md
- _agent-system/reviews/usefulness-proof-v2-review.md

Your ownership:
- you are still the launch owner for supervised execution
- decide the final child-agent launch or blocker from the updated slice truth
```

## What A Wake Must Not Contain

Do not turn a wake into:

- a second canonical packet
- a competing child launch packet from the wrong lane
- a full restatement of the slice if the slice is already current
- a request for the user to decide something the target owner should decide

## Wake Responsibility

When a lane receives a wake, it should:

1. re-read the named canonical artifact
2. re-read any linked review memo or checkpoint named in the wake
3. check unread relevant updates if watermark truth is stale or unknown
4. continue from its actual ownership boundary

It should not ask the user to restate the whole workstream if the files already
carry the truth.

If the current lane already wrote the target lane's inbox and the target still
needs a buyer nudge to look now, the current lane should surface a tiny
follow-up trigger such as:

- `Tell the active <role/scope> chat: Read your inbox, then continue.`

Prefer rendering the literal nudge in a tiny copy block. If the buyer is meant
to say exact words, do not leave them trapped in prose unless the current
surface truly cannot render a clean block:

```text
Read your inbox and continue.
```

If several already-resolved active lanes need the same inbox nudge and no
lane-specific wording is required, prefer one reusable note that can be pasted
unchanged into each target instead of several bespoke wake blocks.

That is still much smaller and cleaner than a second giant packet.
Prose-only "tell it to..." wording is weaker than the same trigger in a ready
copy block and should normally be treated as incomplete.

## Final Rule

If the user could reasonably ask:

"Why am I pasting another big packet into a lane that already owns this and can
read the doc?"

you probably needed a wake, not a packet.
If the user could instead ask:

"Why didn't you just put this in the manager's inbox and let the manager read
the doc?"

you probably needed internal routing, not a user-carried wake.
