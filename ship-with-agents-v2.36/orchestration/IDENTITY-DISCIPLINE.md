# Identity Discipline

Use this whenever a lane needs to resolve who it is, which inbox applies, or
who produced and should receive a meaningful artifact.

Also use `references/TRANSPORT-CHOICE-GATE.md` when deciding how the artifact should
actually move next.

## Core Truth

Identity should never stay ambiguous at the moment it matters.

The system must keep these clear:

- who is speaking
- what role that chat has
- which live lane that identity resolves to
- who produced the artifact
- who the artifact is for
- whether the target is another chat or the current one

If identity is unresolved, say so explicitly.
Do not collapse `identity unresolved` into `empty inbox`, `no actionable
updates`, or fake clean sync language.

## Resolution Order

When resolving the current lane or a human reference to another live lane,
prefer:

1. explicit current-thread continuity when resolving the current lane
2. current-thread mission and recent behavior
3. exact `routing id`
4. exact `stable lane`
5. exact `display name`
6. current-session match from the active map
7. semantic title match:
   - same role
   - same repo/product
   - same mission wording
8. parent/workstream cross-check

Do not over-apply external-target caution to the current lane when this thread
already strongly resolves its role and mission.
If multiple candidates remain, stop and say identity is ambiguous.

## Certainty Ladder

- `C0 - Unknown`
  - no clear role continuity
  - no strong runtime or thread truth
  - multiple plausible identities
  - action: stop and resolve identity explicitly
- `C1 - Weak inference`
  - some mission similarity
  - incomplete runtime truth
  - suggestive but not strong thread continuity
  - action: proceed only on low-risk steps and label the inference
- `C2 - Strong thread continuity`
  - thread has been acting consistently as one lane
  - recent mission and role are stable
  - no real conflicting identity is visible
  - action: treat the lane as current-thread resolved and use runtime truth for
    routing details, not for re-proving the obvious
- `C3 - Strong thread and runtime match`
  - thread continuity is strong
  - active-map or lane/runtime truth agrees
  - action: proceed normally and only reopen identity if a real conflict
    appears

## Required Sources

Use the smallest honest truth source:

- `ACTIVE-CHAT-MAP.md`
- `ACTIVE-WORKSTREAMS.md`
- `health/workstreams.json`
- `updates/inbox/`
- lane capsule if present

Do not guess from memory if those files exist.

## Required Identity Fields

For meaningful artifacts, include:

- `Current session:`
- `Current role:`
- `Artifact produced by:`
- `Intended recipient:`

If the artifact is a checkpoint, include:

- `Checkpoint written by session:`

Return these fields when canonical lane resolution matters:

- `display name`
- `stable lane`
- `routing id`
- `role`
- `owner lane`
- `repo slug`
- `workstream`
- `inbox path`
- `lifecycle state`

## Self-Targeting And Self-Note Checks

Before treating a note as foreign or telling the user to paste somewhere else,
check:

1. whether this lane just authored the note or a near-identical note
2. whether the note explicitly names this lane's display name, stable lane, or
   routing id
3. whether the note's mission matches the current thread's mission
4. whether obeying the note would keep the same role and ownership
5. whether a stronger conflicting target exists
6. whether the note is the continuity artifact this fresh chat was opened from

If the note clearly matches the current lane, say so and continue.
Do not forget who you obviously are just because the system also knows how to
be cautious.

## Paste Target Rule

If the target is the current chat, do not say:

- "paste this back into me"
- "route this into this same chat"

Say instead:

- `Continue here with: ...`
- or acknowledge that the current chat has already adopted the continuation

If the target is another chat, name it in the buyer's world first:

- exact current visible display name when verified
- exact role plus scope anchor when display-name drift is possible
- routing id or stable lane only as supporting metadata, not the lead label

Do not make the buyer decode backend control-plane truth when a visible
human-facing locator can do the job.

## Provenance And Failure Mode

Completion reports, checkpoints, and handoffs should always say which session
produced them.

If no canonical lane record is found, return:

- `Lane identity unresolved:`
- identities attempted
- truth sources checked
- missing surfaces
- the smallest repair step

Only say `Inbox found: no new updates` after identity has already been
resolved.

## Final Rule

If a reader cannot tell who produced an artifact, who it is for, or which
exact next artifact to use, identity discipline has not finished the handoff.

