# How It Works

## The Problem

AI assistants lose context in long conversations. Complex tasks need
coordination across multiple chats. When you ask one chat to do too
much, quality degrades — it forgets constraints, drifts from scope, and
loses track of what's already done.

This system provides that coordination structure. Each agent has a
bounded role, writes checkpoints so state survives between sessions, and
follows principles that prevent the most common AI failure modes.

## The Layer Model

The system has four agent roles, organized in layers:

### Idea Chat

Brainstorms and shapes ideas into concrete work. Pressure-tests
strategy, architecture, and sequencing. When an idea is ready, it
produces a handoff for the orchestrator.

### Orchestrator

The coordinator. It deploys task agents, tracks active workstreams,
reads checkpoints to know where things stand, and spots friction
patterns. It never writes code — it manages the work.

### Task Agent

Executes bounded tasks with discipline: scope guarding, checkpoints,
verification. Given a task packet by the orchestrator, it works through
deliverables sequentially and reports back with a structured completion
report.

### Work Agent

Does the hands-on repo work — reading files, writing code, running
tests, committing, opening PRs. It follows bounded instructions and
reports evidence of what it did.

## Terminal vs Desktop Mode

**Claude Code (terminal — 2 layers):** The orchestrator runs as
`claude --agent orchestrator` and spawns task agent subagents directly.
The task agent and worker roles are combined — the subagent both plans
and executes. This is the primary mode.

**Claude Desktop (4 layers):** Each layer is a separate chat window.
You copy-paste handoffs between them: orchestrator &rarr; task agent
&rarr; work agent. The markdown prompt files (`orchestrator-prompt.md`,
`task-agent-prompt.md`, `work-agent-prompt.md`) are for this mode.

Both modes use the same principles and produce the same behavior.

## Key Concepts

### Checkpoints

State snapshots written after each milestone. The orchestrator reads
these to know where workstreams are — what completed, what's blocked,
what's next. Think of them as save points.

- **When written:** After every gate pass (a deliverable completed and
  verified), before reporting completion
- **Who reads them:** The orchestrator, to track progress and spot
  friction patterns across workstreams
- **Where they live:** `_agent-system/checkpoints/<workstream-name>.md`

### Handoffs

When an idea chat finishes designing something, it writes a handoff
file to `_agent-system/logs/`. You give the orchestrator the file path,
and it reads the handoff and turns the idea into workstreams with
bounded task packets.

### Rotation

When a chat gets long, AI quality degrades — the model forgets earlier
constraints, repeats reasoning, or loses track of decisions. The system
tells you when to rotate: save state to a session log and start a fresh
chat. The fresh chat picks up from the saved state without carrying
degraded context.

Rotation is always a user decision. The agents suggest it; you confirm.

### Merge Tiers

A risk-based system for deciding who approves PRs:

- **Tier 0:** Docs, tests, artifacts — task agent merges directly
- **Tier 1:** New features — task agent reviews and merges
- **Tier 2:** Auth, credentials, crypto — deep review, orchestrator
  merges
- **Tier 3:** Key material, live data — escalated to you for decision

If you work solo and commit directly to main, merge tiers become
relevant when your agents start opening PRs.

### Principles vs Rules

Each agent follows 5-8 core principles (not a long numbered list).
Principles cover entire failure classes: "verify before trusting,"
"flag scope changes immediately," "you coordinate, you don't build."
Detailed procedures, checklists, and examples live in reference files
the agent reads on demand — not on every turn.

### Evidence Ledger

For partially-built or pre-existing work, an evidence ledger captures
what exists, what's missing, and what assumptions need verification
before treating something as build-ready. Most users won't need this —
it's for when you integrate the system into a project that already has
work in progress.

## Example Walkthrough

**You want to add authentication to your app.**

1. **Idea chat** — You discuss the approach. OAuth? Magic links?
   Session-based? The idea chat pressure-tests your choice, checks for
   security gaps, and produces a handoff: "Add OAuth2 with Google
   provider. Backend routes + frontend login flow."

2. **Orchestrator** — Reads the handoff. Scopes it into two task
   packets: (a) backend auth routes and middleware, (b) frontend login
   UI. Checks for parallelism — backend and frontend touch different
   files but frontend depends on backend's API, so they deploy
   sequentially. Deploys task agent #1 for backend.

3. **Task agent #1 (backend)** — Works through the backend
   deliverables: auth routes, middleware, token validation, tests.
   Writes a checkpoint after each milestone. Produces a completion
   report when done.

4. **Task agent #2 (frontend)** — Starts after backend is complete
   (needs the auth API). Builds the login page, integrates with the
   backend routes, writes tests. Writes its own checkpoint and
   completion report.

5. **Orchestrator** — Reads both completion reports. Updates the
   roadmap. Surfaces any friction patterns. Proposes rule improvements
   if the task agents hit recurring problems.

## Next Steps

- [QUICK-START.md](QUICK-START.md) — get running in 5 minutes
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — adapt the system to your
  workflow
