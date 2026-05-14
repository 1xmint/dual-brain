# Execution Owner Reuse Gate

Use this before:

- proposing a fresh supervisor for the next seam
- deciding whether a live supervisor should stay hot
- choosing between direct agent, live-super fanout, or new-super split

This exists because a system can know the abstract topology and still leak
quality by respawning coordination lanes one seam at a time.

## Core Truth

- a live execution owner should stay hot until the coordination boundary truly
  changes
- a dev-sized workstream usually wants one supervisor that keeps coordinating
  child agents, not a new supervisor for each bounded follow-on seam
- a tiny bounded packet should usually drop to a direct agent, not climb to a
  sibling supervisor
- that direct-agent shortcut is only safe when the helper/runtime path is
  verified cheap enough or the buyer explicitly approved a stronger spend

## Decision Order

Ask these in order:

1. is this the same hot workstream or review cell?
2. does a live execution owner already exist for it?
3. is that owner still healthy for this next packet?
4. is the next packet tiny enough for a direct-agent exception?
5. if not tiny, does the current execution owner still clearly own the
   coordination boundary?
6. only then ask whether a new supervisor is justified

## Default Outcomes

### Same workstream + live super + tiny packet

Prefer:

- a direct agent launched by the current super
- or a direct agent exception only if no live super should obviously own it

Do not open a sibling supervisor just because the packet has a new seam name.

### Same workstream + live super + dev-sized follow-on work

Prefer:

- keep the current super alive
- let that super own child-slice fanout, checkpoints, and follow-ups
- let agents do the implementation work

This is the default for meaningful supervised execution.

### Same workstream + bounded trial or proof question

Prefer:

- manager decides directly if the review question is tiny
- or reuse the current live super if coordination still adds value
- or a direct agent if the packet is tiny and the review question is already
  settled

Do not open a fresh supervisor just to ask whether one more bounded trial is
the next move unless the review boundary truly changed.

### Same workstream + no healthy live execution owner

Only then consider:

- reviving the current owner
- explicitly reassigning ownership
- or opening a new supervisor if the old one is no longer the right container

### Different workstream or different coordination cell

A new supervisor may be warranted when:

- repo scope is different enough that ownership should split
- mission and follow-up chain are independent
- collision management under one super would stop being honest
- the current super is context-stretched or the wrong operational boundary
- the work deserves parallel supervised lanes with separate durable ownership

## New-Super Justification Test

Before proposing a fresh supervisor, be able to say:

- what changed about the coordination boundary
- why the current execution owner should not keep the work
- why a direct agent would be too light
- what durable mission the new supervisor will own

If those answers are weak, the new supervisor is probably theater.

## Anti-Patterns

- one seam, one supervisor
- using a new supervisor as a substitute for one super with honest agent fanout
- treating a just-finished small packet as evidence that the super should be
  replaced
- paying a full fresh-lane startup cost for one same-workstream trial decision
- making the buyer act as the router for a fresh supervisor when the live super
  could simply continue
- inferring progression mainly from supervisor numbering instead of current
  workstream truth

## Output Discipline

When this gate matters, state:

- `Execution structure: stay here / direct agent / reuse live super / new super`
- `Current execution owner: ...`
- `Why not the other two options: ...`

If you choose `new super`, justify it explicitly.
If you choose `reuse live super`, the next owner should usually be that live
super or an agent it launches.
If the next move is implementation-shaped and direction is already clear,
execution should usually drop to the configured execution default. If it does
not, explain why.
If the shortcut would silently inherit a stronger parent helper runtime,
do not present it as the normal cheap execution path.

## Final Rule

If the user could reasonably ask:

"Why didn't the current supervisor just keep owning this and call agents?"

then the system has probably failed the reuse test.
