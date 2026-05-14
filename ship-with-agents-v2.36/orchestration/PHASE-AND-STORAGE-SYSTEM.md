# Phase And Storage System

Use this file when your work is lasting long enough that simple session
names are no longer enough.

The key idea is:

- `visible title` = what the buyer sees
- `stable lane key` = who owns the work
- `phase / milestone / chunk` = where the work belongs in delivery
- `continuation token` = session health history only

Do not make one number carry all three meanings.

Read `NAMING-SCHEMA.md` if you want the package-wide naming grammar first.

## The Four Layers Of Identity

### 1. Visible Title

Visible title tells the buyer what the lane is doing.

Examples:

- `Head - Portfolio / Priorities`
- `Supervisor - App Core / Checkout Rollout`
- `Agent - App Core / Checkout API`

### 2. Stable Lane Key

Stable lane key tells you who owns the responsibility.

Examples:

- `head-1`
- `super-1-checkout-rollout`
- `agent-12-checkout-api`
- `brainstorm-3-pricing-options`

This is durable ownership, not progress and not session health.

### 3. Progress Metadata

Progress fields tell you what stage or chunk the work belongs to.

Examples:

- `p1`
- `p2`
- `m3`
- `c02`
- `w3`
- `day0`
- `launch1`

Use whichever phase vocabulary your project can actually sustain.
`p1`, `p2`, `p3` is the safest generic default.

### 4. Continuation Token

Continuation tokens describe continuity, not work meaning.

- `--run2` = planned rotation
- `--recover1` = crash recovery
- `--run2--recover1` = rotated, then recovered

These tokens should never be used as a substitute for phase or
milestone naming.

## Recommended Naming Shapes

### Head

- visible title: `Head - Portfolio / Priorities`
- stable lane key: `head-1`

### Super

- visible title: `Supervisor - App Core / Checkout Rollout`
- stable lane key: `super-1-checkout-rollout`

### Agent

- visible title: `Agent - App Core / Checkout API`
- stable lane key: `agent-12-checkout-api`

### Brainstorm

- visible title: `Brainstorm - Portfolio / Pricing Options`
- stable lane key: `brainstorm-3-pricing-options`

### Rotation And Crash

- `super-1-checkout-rollout--run2`
- `agent-12-checkout-api--recover1`
- `agent-12-checkout-api--run2--recover1`

## The Storage Model

Use four storage layers.

### 1. Live routing index

`ACTIVE-WORKSTREAMS.md`

Purpose:

- what is active right now
- who owns it
- what phase it belongs to
- where the stable checkpoint lives

### 2. Stable checkpoint file

`checkpoints/<stable-workstream-slug>.md`

Purpose:

- current truth for the workstream
- latest verified state
- next pickup point

Rule:

- the checkpoint file path should stay stable across rotations and crash
  recovery
- phase belongs in explicit fields, not in the lane key or continuation token

### 3. Phase archive

Use a project-local archive path outside the session name to group what
finished in a milestone or phase.

Examples:

- `docs/archive/p2/auth-closeout.md`
- `logs/archive/day0/query-lane-closeout.md`

Purpose:

- what shipped in phase 2
- what closed in week 3
- what was abandoned or superseded

### 4. Pattern memory

Use:

- `LESSONS.md`
- `WINS.md`
- prompt-change-log

Purpose:

- cross-workstream intelligence
- repeated friction
- repeated success
- capability and routing mistakes

This is system memory, not project-progress storage.

## Recommended Default Rule

If you do not already have a mature project taxonomy:

1. Use stable lane IDs for ownership.
2. Use `p1`, `p2`, `p3` or your real phase vocabulary for progress.
3. Use rotation and crash tokens only for chat continuity.
4. Keep checkpoint filenames stable and simple.

This is easier to maintain than clever numbering.

## Why This Is Better

Bad long-term pattern:

- `s5.1`
- `s5.2`
- `s5.3`

This becomes ambiguous:

- is it a new phase?
- a rotation?
- a restart?
- a sublane?
- chunk progress?

Better long-term pattern:

- stable lane: `super-1-checkout-rollout`
- phase: `p2`
- chunk: `c02`
- current session: `super-1-checkout-rollout--run2`

Now ownership, progress, and session health are separate.

## What To Store Where

### Chat name

Store:

- lane ownership
- optional workstream slug
- continuation token only when needed

Do not store deep historical narrative here.

### Checkpoint

Store:

- current workstream truth
- latest gate passed
- evidence
- blockers
- next task
- pickup prompt

### Archive note

Store:

- what closed
- what phase it belonged to
- final evidence
- final decisions
- residual risks or deferred follow-ups

### Lessons And Wins

Store:

- generalized patterns only
- not one-off project chatter

## Practical Rule For Buyers

If the project is still small:

- do not overbuild this
- just use a stable lane key plus a continuation token when needed

If the project is getting long-lived or multi-phase:

- add explicit phase / milestone / chunk fields
- keep checkpoint filenames stable
- archive closeouts by phase

This package is designed to earn complexity, not front-load it.
