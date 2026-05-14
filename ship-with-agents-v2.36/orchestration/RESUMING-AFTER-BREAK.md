# Resuming After a Break

You stepped away for a few days, a couple of weeks, or longer. The
project is still here. The system is designed to make this easy —
this guide is the path back in.

## What's still true after a break

Three things outlive any individual chat session:

- **Files.** Source code, docs, prompt files, and configuration are
  all on disk. Nothing important lives only in chat history.
- **Checkpoints.** Each chat that ran wrote a small state file under
  `_agent-system-runtime/checkpoints/`. These are your save points.
- **Logs.** Rotated head, super, and head sessions wrote logs
  under `_agent-system-runtime/logs/`. These tell you what was decided and
  why.
- **Live lane maps.** `_agent-system/ACTIVE-CHAT-MAP.md` and
  `_agent-system-runtime/ACTIVE-WORKSTREAMS.md` tell you which lanes are still
  supposed to be current before you trust an old checkpoint.

You don't need to remember what happened. You read the files.

## The 10-minute reentry path

Do these in order. Stop as soon as you have enough context to make
the next move.

### 1. Read the live lane map first (1 minute)

Open:

- `_agent-system/ACTIVE-CHAT-MAP.md` if it exists
- `_agent-system-runtime/ACTIVE-WORKSTREAMS.md` if it exists

This tells you which lanes are still supposed to be active, paused, rotating,
or already closed.

### 2. Read the most recent rotation log (1-2 minutes)

PowerShell:

```powershell
Get-ChildItem _agent-system-runtime/logs | Sort-Object LastWriteTime -Descending | Select-Object -First 3
```

Shell:

```bash
ls -t _agent-system-runtime/logs/ | head -3
```

Open the most recent `head-*` log if you ran a head, or the most
recent `super-*` / `head-*` log otherwise. The log's pickup
note tells you what was open and what to do next.

### 3. Read open checkpoints (2-3 minutes)

PowerShell:

```powershell
Get-ChildItem _agent-system-runtime/checkpoints
```

Shell:

```bash
ls _agent-system-runtime/checkpoints/
```

Each `<chat-name>.md` file is a workstream's state. Skim each one
and ask:
- Is this still active, or did it land?
- Does the "next steps" section still match what I want to do?
- Is anything blocked on me?

If a checkpoint says "blocked on user," that's where you start.

### 4. Read your friction logs if you keep them (1-2 minutes)

If you've been running with rolling friction logs (`_salvage/<chat-name>-friction.md`),
skim the most recent one per layer. They tell you what was annoying
or unresolved when you stepped away — often the most useful context
when re-entering.

### 5. Decide what to relaunch (3-5 minutes)

You have three reasonable options:

- **Pick up an in-flight workstream.** Open a fresh chat with a name
  ending in `--recover1` (e.g., the dead `agent-12-auth` becomes
  `agent-12-auth--recover1`),
  point it at the existing checkpoint, and let it resume. Use the
  startup pattern in `START-AGENT.md` / `START-SUPER.md` /
  `START-HEAD.md`.
- **Start a new sequence at head.** If priorities have shifted while
  you were away, open the next `head-<N>` lane and read `START-HEAD.md`. Hand head
  the rotation log from step 1 and any new direction.
- **Close out cleanly.** If nothing on the queue still matters,
  archive the open checkpoints with a one-line "dropped — out of
  date" note and call it done.

## When things look unfamiliar

After a long break the layout might surprise you. A few quick
re-grounding moves:

- `README.md` and `START-HERE.md` at the project root are the buyer
  view; reading them refreshes the framing.
- `_agent-system/QUICK-START.md` has the 30-second concept primer.
- `_agent-system/HOW-IT-WORKS.md` has the layer model, naming
  convention, and rotation/crash semantics.
- `_agent-system/LESSONS.md` is institutional memory — past failures
  worth not repeating.

## When checkpoints are stale

A checkpoint is a *claim* about state at the moment it was written.
After a break, that claim may be wrong. Before acting on a
checkpoint:

- Verify the files it references still exist where it says.
- Check `Last verified at`, `Freshness window`, `Terminal status`,
  `Pickup confidence`, and `Resume risk`.
- Check `git log` since the checkpoint date — work may have landed
  outside the captured state.
- If the claim and reality diverge, trust reality and update the
  checkpoint, not the other way around.

This is the same discipline a head applies on session pickup.
See `_agent-system/head-prompt.md` (stale-checkpoint section) for the
detailed pattern.

## Anti-patterns

- **Don't try to read the full session history.** That's what the
  log + checkpoint were written for. Reading the raw chat is slower
  and less reliable.
- **Don't relaunch a chat with the original name.** A dead chat
  always gets a `--recover1` (crash) or `--run2` (planned rotation) suffix on
  resume. The checkpoint path stays the same; only the chat name
  changes.
- **Don't mass-archive checkpoints to "clean up."** Each one is
  cheap to keep and expensive to recreate. Drop the obviously stale
  ones; keep the rest.

## TL;DR

1. Read the most recent rotation log.
2. Skim open checkpoints under `_agent-system-runtime/checkpoints/`.
3. Pick the workstream that still matters.
4. Launch a `--recover1`-suffixed chat against the relevant START file.
5. Verify the checkpoint claim against reality before acting on it.
