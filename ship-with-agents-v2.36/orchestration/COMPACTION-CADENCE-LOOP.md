# Compaction Cadence Loop

Use this as the canonical rhythm for:

- compaction review
- rotation review
- checkpoint writing
- checkpoint-event appends
- closeout and lane-state cleanup

This exists because 10/10 continuity is mostly about cadence, not only about
good templates.

## Core Rule

Do not wait for a lane to break before deciding whether to compact, rotate,
checkpoint, or close it.

Run the cadence loop at the smallest honest boundary that changed the truth.

## The Five Moments

### 1. Startup moment

Run `STARTUP-SYNTHESIS-GATE.md`:

- at fresh start
- after resume
- after migration
- after major compact
- after material phase change

This tells the lane what problem it is actually carrying now.

### 2. Context review moment

Run a compact-or-rotate review when any are true:

- `CONTEXT-LOAD-GATE.md` reaches `CL2` or higher
- `CONTEXT-TAX-HEURISTIC.md` reaches `CT2` or higher
- telemetry enters the lane's review zone
- the next phase is narrower than the current history
- more than one substantial unresolved thread is now alive

Use:

- `ROLE-AWARE-COMPACTION.md`
- `SURFACE-COMPACTION-AND-RESUME.md`

Decision:

- compact if the lane is still the right container
- rotate if the lane is no longer the right container

### 3. Execution-truth moment

Write or refresh the checkpoint when any are true:

- a meaningful gate passed
- material evidence landed
- the blocker state changed
- the stop boundary is near
- the next lane would need a truthful pickup without re-reading chat history

Use:

- `checkpoints/TEMPLATE.md`

The checkpoint should answer:

- what is true now
- what was verified
- what is next
- how risky pickup is

### 4. Transition-history moment

Append a checkpoint event only when the transition matters historically.

Use:

- `CHECKPOINT-EVENT-THRESHOLDS.md`

Typical event-worthy transitions:

- launch approved
- execution started
- major blocker or unblock
- meaningful verification outcome
- rotation or recovery
- closeout decision

Do not log every micro-step.

### 5. Closeout moment

Run closeout when a meaningful lane is:

- finishing
- pausing
- rotating
- handing off
- being abandoned

Use:

- `CLOSEOUT-GATE.md`
- `ACTIVE-LANE-CLOSEOUT.md`
- `closeouts/TEMPLATE.md`

This is where the system decides:

- is the work honestly closed?
- what is the lane-state action?
- what is the expected next session?

## Minimal Loop By Lane Type

### Head / review / super

- review compaction earlier
- checkpoint at major decision and routing boundaries
- close out or rotate as soon as the lane stops being one coherent coordination
  problem

### Agent / worker

- checkpoint at evidence and stop boundaries
- compact before exploration residue buries execution
- rotate when work identity changes, not because the lane is old

### Brainstorm

- compact after convergence
- checkpoint or handoff when synthesis beats more ideation
- close out once the exploration result has a real owner

## Surface Overlay

Cadence is role plus surface, not role alone.

- terminal with native compact/resume: compact earlier and automate where
  helpful
- app / desktop thread surfaces: preserve coherent threads longer, but rotate
  sooner when the thread stops matching one job
- weak continuity surfaces: checkpoint earlier and rely on durable migration
  packets

See `../SURFACE-COMPACTION-AND-RESUME.md`.

## Good Loop

```text
Cadence check:
- Startup synthesis current?: yes
- Context review result: compact soon
- Checkpoint needed now?: yes
- Event-worthy transition?: no
- Closeout action?: none
```

## Anti-Patterns

- compact only at panic threshold
- rotate only because the chat is old
- checkpoint only at end-of-day
- event-log every tiny action
- call work done before lane-state cleanup
- resume from vibes instead of artifacts

## Final Rule

The package should feel lighter after this loop, not heavier.

If the loop is producing more ritual than clarity, the lane is checkpointing or
closing too often.
If the loop is never triggered until things are messy, it is being run too
late.
