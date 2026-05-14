# Quick Paths

Use this file when you do not want to reason from the whole package.

Pick the row that feels closest to your real situation and follow only that
path first.

## Path 1 - Solo Builder, One Repo, One Main Tool

Use this if:

- you are the main operator
- one coding tool does most of the work
- you only need occasional review or strategy help

Start:

1. Run `bootstrap/bootstrap-lightweight.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `FIRST-30-MINUTES.md`
4. Read `AGENT-WORKFLOW-GUIDE.md`
5. Do one real bounded task before adding more system

Default posture:

- workflow weight: `lightweight`
- review posture: `solo`
- cost posture: `standard`

## Path 2 - GPT Or Codex App For Strategy, Claude Code For Execution

Use this if:

- you want a strong strategy/review lane
- Claude Code or another terminal tool still does the repo changes
- you do not want strategy and execution collapsed into one chat

Start:

1. Run `bootstrap/bootstrap-lightweight.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `FIRST-30-MINUTES.md`
4. Read `PLATFORM-SETUP.md`
5. Keep the app lane as strategy/review and the terminal lane as execution

Default posture:

- workflow weight: `lightweight`
- review posture: `dual-brain` only when the work is worth it
- execution owner: terminal coding tool

## Path 3 - Small Team Or Repeated Multi-Chat Work

Use this if:

- one strategy lane plus one execution lane is no longer enough
- the same work crosses planning, review, launch, and closeout repeatedly
- you need durable checkpoints, active-lane tracking, or relaunchable slices

Start:

1. Run `bootstrap/bootstrap-orchestration.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `FIRST-30-MINUTES.md`
4. Read `orchestration/QUICK-START.md`
5. Move to `orchestration/DOC-FIRST-ORCHESTRATION.md` before packet churn starts

Default posture:

- workflow weight: `orchestration`
- use full-word visible chat titles
- keep compact session IDs internal

## Path 4 - Codex Terminal Or IDE-First Execution

Use this if:

- Claude Code is not your main executor
- Codex terminal, Cursor, Windsurf, or Copilot is your real working surface
- you still want the package's file truth and workflow rules

Start:

1. Run `bootstrap/bootstrap-lightweight.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `FIRST-30-MINUTES.md`
4. Read `PLATFORM-SETUP.md`
5. Read `TOOL-TRANSLATION-GUIDE.md` only after the first real task is flowing

Default posture:

- workflow weight: `lightweight`
- use repo docs and task packets first
- add orchestration only after repeated real need

## Path 5 - Local Model Helper Or Private Assistant

Use this if:

- a local model is part of the workflow
- privacy or cost matters
- you still have a stronger review or execution lane elsewhere

Start:

1. Run `bootstrap/bootstrap-lightweight.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `FIRST-30-MINUTES.md`
4. Read `PLATFORM-SETUP.md`
5. Keep the local model in bounded helper mode until it earns more trust

Default posture:

- workflow weight: `lightweight`
- local model role: helper by default
- do not install orchestration just because the package includes it

## Final Rule

The right first setup is the one that gets you to one clean real task with the
least extra ceremony.
