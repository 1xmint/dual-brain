# Transport Choice Gate

Use this before ending any meaningful response that changes what should happen
next.

This file exists because identity alone is not enough.

A chat can correctly say who it is and still leave the user doing manual
transport work because it never states the exact next artifact.

A chat can also stop one layer too early by producing an architecture packet
or launch brief but not the first buyer-usable bridge that should follow.

## Core Truth

Do not end with:

- vague direction
- "the next honest move is..."
- "you can tell the other chat..."
- prose that forces the user to extract the real instruction

End with one explicit next-action artifact instead.
Then run `orchestration/references/DELIVERY-TAIL-PRESENTATION.md` so the artifact is staged in
the right order and is easy to copy.
Then run `orchestration/OPERATOR-ACTION-OWNERSHIP-GATE.md` so the lane that emits the
artifact is the right human-facing owner.
Then run `orchestration/COLLABORATIVE-STEERING-GATE.md` so user-guided workflow moves
stay collaborative without turning the user into the courier.
Then run `orchestration/.claude/skills/continuity-pickup/SKILL.md` so passive internal routing is
not mistaken for active pickup.
If the chosen delivery mode targets a specific live lane, also run
`orchestration/ACTIVE-MAP-FRESHNESS-GATE.md` before finalizing the tail.

## The Allowed Delivery Modes

Choose exactly one mode for the tail of the response:

1. `Continue here with:`
2. `Update this doc:`
3. `Wake <live lane>:`
4. `Paste this into <live lane>:`
5. `Launch this:`
6. one buyer-facing tail mode from `OUTPUT-MODES.md`
7. `Stop here:`

If none of these fit cleanly, the work is not ready to hand off yet.

## Default Preference Order

Prefer the lightest honest transport:

1. update the canonical slice or review doc if it already exists
2. continue in the current chat if the current chat is still the owner
3. use the recommended-move tail mode from `OUTPUT-MODES.md` when the remaining choice is a
   workflow-direction or ownership move the user prefers to steer and the lane
   already has one clear recommendation ready
4. use the no-action tail mode from `OUTPUT-MODES.md` when the current lane only owes awareness,
   state reporting, or an internal transition that no longer needs the user to
   transport or approve anything
5. if the current lane can directly fetch or complete the next lookup,
   GitHub/admin step, or artifact retrieval itself, do that before asking the
   user to carry it
6. if the current lane can route the transition through runtime inbox or other
   durable routing files itself, do that and then report
   the no-action tail mode only if waiting for pickup is genuinely acceptable
7. if the transition is routed internally but work should keep moving now and
   the target lane will not pick it up without a human nudge, use one tiny
   `Paste this into <live lane>:` or `Wake <live lane>:`
   trigger instead of hiding behind the lightweight completion tail from
   `OUTPUT-MODES.md`
8. wake another already-existing owner lane when canonical truth is already
   updated
9. paste into another explicitly named chat only when another lane must act and
   cannot reconstruct the next move from durable truth
10. launch only when a new execution or research lane is actually warranted
11. ask the user for a decision only when the remaining blocker is truly a user
   decision
12. stop only when the lane is genuinely closed for now

`architecture packet complete` or `launch brief complete` is not a natural
stopping point when the same lane already knows the obvious wake, paste block,
launch packet, or executable bridge that the buyer actually needs next.

## Mode Rules

### 1. Continue here with

Use when the current chat should keep going.

Rules:

- do not tell the user to paste the instruction back into the same chat
- give one small exact block or one small numbered list
- state the exact artifact or file to inspect next if relevant
- do not use this mode if the current lane still owes the main review,
  routing, or judgment step; read `orchestration/.claude/skills/continuity-pickup/SKILL.md` first

### 2. Update this doc

Use when the canonical truth should move through a durable artifact instead of
another pasted packet.

Rules:

- give the exact file path
- name the exact section to update when possible
- if the current lane can edit the doc directly, say what was updated and keep
  the response tail small
- if the current lane cannot edit the doc directly, provide one exact
  executable update artifact:
  - replacement block
  - append block
  - or exact patch block
- do not stop at a prose shopping list of desired edits
- if the doc update is enough by itself, do not also create a second competing
  packet body

Also read `orchestration/DOC-UPDATE-PROTOCOL.md`.

### 3. Wake <live lane>

Use when another already-existing chat owns the next step and the canonical doc
or review truth is already current.

Rules:

- name the exact current visible display title when verified, or use a robust
  role/scope descriptor when that is safer for the buyer
- keep routing id and stable lane as supporting metadata only when truly needed
- keep the wake tiny
- point at the canonical slice, review memo, checkpoint, or inbox it should
  re-read
- state what responsibility the target now owns
- do not turn a wake into a second giant packet
- prefer internal routing through runtime inbox/update-bus files first when the
  current lane can write those durable files itself

Also read `orchestration/WAKE-AND-CONTINUE-GATE.md`.

### 4. Paste this into <live lane>

Use when another already-existing chat needs the next move.

Rules:

- name the target in the buyer's world first:
  - exact visible display title when verified
  - otherwise exact role plus scope descriptor
- only add routing id or stable lane as supporting metadata when that
  materially reduces ambiguity
- use one copy block
- make the block self-contained
- do not make the user assemble fragments from surrounding prose
- place the copy block near the end of the response with a clear label such as:
  - `Copy this into the active <role/scope> chat:`
- if the buyer is expected to say exact literal words, those words must appear
  in the block itself rather than only in surrounding prose unless the current
  surface truly cannot render a clean block

### 5. Launch this

Use when a new terminal or runtime lane should be opened.

Rules:

- prefer one clear buyer action
- run `orchestration/LAUNCH.md` first
- if the current lane can write a durable startup prompt file and the chosen
  runtime or verified operator adapter can ingest that file cleanly, prefer
  that and emit one final launch command block that reads the file
- if file-backed launch is not available, use one startup block plus one final
  command block in the resolved runtime order
- if the runtime is interactive-launch-first, emit the launch command first
  and the startup prompt second with a clear "paste this next into the launched
  session" label
- if file-backed launch exists but only works through ad hoc shell glue,
  usually prefer the portable startup-block-plus-command fallback instead
- keep the startup body pointed at the canonical slice or work doc when one
  exists
- keep the launch sequence at the end of the response so the user sees one
  clean ordered launch packet
- do not emit multiple competing copy blocks for the same launch
- do not use the buyer-facing display title as the terminal session name unless
  the chosen runtime explicitly uses that field as the real session id
- do not hardcode a shell/editor surface like `VS Code PowerShell terminal`
  unless that is actually resolved from operator truth

### 6. No user action needed

Use when the lane has already advanced the current transition as far as needed
and the user does not need to transport, approve, launch, or decide anything
right now.

Rules:

- state what changed
- name the durable artifact or state that now carries the truth
- say what will happen next, or why it is safe to wait
- if the current lane routed the next transition through runtime inbox or
  update-bus files, say so explicitly
- do not use this mode when the next owner still needs a human nudge before
  work actually resumes
- do not hide a wake, paste, approval, or launch request inside this mode
- do not use this mode as a polite stall when the current lane could still take
  the next substantive step now

### 7. Decision needed from user

Use when only the user can honestly choose the next move.

Rules:

- run `orchestration/REAL-USER-DECISION-GATE.md` first
- keep the choice list short
- say what each option changes
- do not use this mode when the lane already has one recommended workflow move
  that the user could simply approve with `go`
- do not hide an unmade routing decision inside a fake recommendation
- do not ask the user to bless a bounded technical fix the lane can already
  specify exactly

### 8. Recommended next move

Use when the lane has one clear recommendation for a workflow-direction or
ownership move and the user should guide that move without becoming the
transport layer.

Rules:

- run `orchestration/COLLABORATIVE-STEERING-GATE.md` first
- make one recommendation, not a sprawling menu
- say briefly why this is the recommended path
- state the bridge mode
- say exactly what the lane will do if the user says `go`, `ok`, or
  `sounds good`
- do not ask the user to carry the packet if the lane can route it itself
- if the lane cannot route it itself and another live lane is the next owner,
  include one exact ready `Paste this into ...` or `Wake ...` artifact in the
  same turn
- do not use this mode for small internal execution details that should already
  proceed directly
- after the user approves, do not ask for a second approval of the same move

## Artifact-Layer Rule

Typical stacks look like:

1. concept or synthesis note
2. architecture packet or plan doc
3. execution brief or launch brief
4. executable bridge such as a wake, paste block, launch packet, or exact
   runtime note

If layer 2 or 3 already exists and layer 4 is obvious, same-lane-owned, and
not blocked by a real decision, do not stop early and ask whether the buyer
wants the next layer. Surface layer 4 now.

### 9. Stop here

Use when the lane is actually done, paused, or intentionally parked.

Rules:

- state the lane-state action explicitly
- name the durable artifact that preserves pickup truth

## Collaboration Rule

When manager/head/super collaboration is in play, do not only challenge the
substance.

Also challenge the delivery mode.

Questions to ask:

- should this have been a doc update instead of prose?
- should this lane even own the human-facing action block?
- is the target another chat, the current chat, or a new lane?
- is no human action actually required right now?
- is the user still acting like the transport bus?
- is this really user-owned, or am I dumping a reviewer-owned threshold call
  onto the user?
- is this a true user decision, or just a collaborative steering move that
  should use one recommendation plus `go`?
- is the tail explicit enough that a busy user can act without inference?
- is the real copy block or command visually obvious and placed at the end?

## Anti-Patterns

- response ends with a recommendation but no exact next artifact
- another chat is named, but there is no copy block
- another chat is named only by backend routing id even though the buyer only
  sees visible chat titles
- another chat is implicitly the real target, but the response ends with
  "confirm you agree" or "if yes, I'll draft it" instead of a wake, doc update,
  or copy block
- another chat is the real target, but the response still says "route it to the
  manager lane" without the exact manager bridge
- another live owner exists and could have been woken, but the response emits a
  second giant packet instead
- another live owner exists and the current lane could have routed the
  transition through runtime inbox/update-bus files, but it still asks the user
  to carry a wake by hand
- another live owner has not actually picked up the work yet, but the response
  still ends with the lightweight completion tail from `OUTPUT-MODES.md`
- `Update this doc:` names a file but only gives a blurry edit wishlist
- `Continue here with:` assigns the current lane homework it could have done
  before responding
- the lightweight completion tail from `OUTPUT-MODES.md` is used even though
  the lane is still relying on the user to wake another chat, approve the next
  bounded artifact, or notice a hidden request
- a workflow ownership change is silently closed-looped even though the user
  would reasonably expect to steer it
- the heavy escalation tail from `OUTPUT-MODES.md` is used where the steering
  tail would have kept collaboration lighter and faster
- a canonical slice exists, but the chat keeps rewriting packets in prose
- both a doc update and a competing pasted packet body are treated as truth
- terminal lane emits a user-facing launch block even though an active
  app-lane coordinator should own the operator action
- the heavy escalation tail from `OUTPUT-MODES.md` is used for a bounded
  technical fix that the lane already knows how to apply
- launch command appears without the final startup body
- launch command appears before the startup body when the runtime needs
  prompt-first ordering
- startup prompt appears before the command when the runtime needs
  launch-first ordering
- copy block is technically present but buried above later commentary
- same-chat continuation is phrased as a paste-back instruction

## Final Rule

If the user still has to infer where the truth lives or how to transport it,
the response is not handoff-complete.



