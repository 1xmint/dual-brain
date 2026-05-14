# Self-Improvement Loop

Use this file when the system hits friction, notices a win, or learns a
new durable pattern.

Self-improving does not mean random self-editing. It means running a
repeatable evaluator loop that turns observed behavior into better
future behavior with less babysitting.

## Core Truth

The loop is:

1. detect
2. classify
3. capture
4. decide scope
5. improve the right durable file
6. publish and propagate
7. verify the next similar case

This is the operational version of "specify, measure, improve."

## Step 1: Detect

Detection can come from:

- user correction
- a checkpoint or completion report
- a routing or naming miss
- a context-load miss
- a surprisingly good pattern worth repeating
- the lane explicitly recognizing "I should have..." before the work is truly
  settled

## Step 2: Classify

Name the failure or win class before proposing changes.

Common classes:

- context-load failure
- spawn-routing failure
- lineage or naming failure
- local-truth or model-routing failure
- capability-assumption failure
- task-packet gap
- role-discipline failure
- storage or upgrade-safety failure
- durable win worth reusing

## Step 3: Capture

Capture the smallest durable truth needed:

- what happened
- why it mattered
- what it cost
- what should happen next time
- what was corrected immediately versus what still needs durable promotion

Use `REFLECTION-TRIGGERS.md` to decide whether the capture should happen
now or at the next boundary.

## Step 4: Decide Scope

Choose the smallest honest target:

- current checkpoint or completion report only
- `LESSONS.md`
- `WINS.md`
- prompt or template edit
- new gate or decision file
- update-bus publish
- active-chat update prompt fallback

Do not jump straight to a new global rule if the issue is local only.
Do not leave a cross-chat failure trapped in one checkpoint.

If the issue may be setup-specific, also read `SYSTEM-IMPROVEMENT-LOOP.md`
before promoting it into shared vendor truth.

## Step 5: Improve The Right Durable Artifact

Use this priority:

1. if the behavior failed at the moment of action, prefer a gate
2. if durable truth was missing, prefer a template or startup-file
   change
3. if naming or storage was unclear, prefer a structural doc
4. if the pattern is a durable positive, promote it into `WINS.md`

Before stopping, also run `SELF-CORRECTION-OWNERSHIP.md`.
If the lane can still correct the live behavior now, do that before treating
the loop as complete.

Only update shared files after approval.

If the improvement touches multiple shared docs, mirrored files, or release
metadata, also use `STAGED-EDIT-PROTOCOL.md` so the change lands
in small verified pieces instead of one brittle bulk edit.

## Step 6: Propagate

If active chats are still running under the old truth:

- read `ACTIVE-CHAT-MAP.md` first
- prefer `UPDATE-BUS.md`
- publish once to the runtime update feed
- route the update into the relevant inboxes
- use manual update snippets only as fallback

If the triggering failure was shown from one concrete live lane, treat that
lane as relevant by default. Do not assume doctor/head/root inbox routing alone
will reach the exact chat the buyer is about to wake.

This closes the loop for live work instead of waiting for fresh chats.

Do not target update snippets from memory, checkpoint residue, or an older
example session ID when active-map truth is available.

If `ACTIVE-CHAT-MAP.md` looks stale:

- say that explicitly
- use cautious targeting
- recommend updating the map before broad propagation or new launch guidance

If the runtime update bus does not exist yet:

- say that explicitly
- fall back to targeted manual notes
- treat the missing bus as workflow debt if active-lane count is growing

## Step 7: Verify

The next time a similar situation appears, check whether the new gate or
file actually changed behavior.

If the same mistake repeats, treat that as a gate-design failure, not
just an enforcement miss.

## Design Rule

Prefer:

- explicit triggers over passive memory
- gates at action boundaries over longer prompts
- structured reflection at checkpoints, handoffs, rotations, and
  completion over per-response ceremony
- immediate self-correction over reflective apologies
- durable files that reduce user babysitting
- publish-once, consume-locally update propagation over repeated paste work

Avoid:

- "the chat should already know"
- adding another lesson when the real fix is a gate
- pretending the system improved when no live propagation occurred
