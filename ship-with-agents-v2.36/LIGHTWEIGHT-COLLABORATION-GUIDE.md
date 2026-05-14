# Lightweight Collaboration Guide

Use this guide when you are working with a first-time collaborator, a bounded
helper, or a local-model assistant and you do not want to drop a full
orchestration system into the repo on day one.

## Core Truth

Many collaborators do not need the full package installed inside the repo.

A lightweight shared-repo workflow is often enough when:

- one person is the primary operator
- another person or model is helping on bounded tasks
- the repo is still small enough to explain clearly with a few durable files
- you want shared truth without creating a heavy chat-management system

Start lightweight first. Add orchestration only when the simple workflow stops
being enough.

## What To Copy Into The Repo First

Minimum useful setup:

- `templates/AGENTS.md`
- one or more of `ARCHITECTURE.md`, `OPERATIONS.md`, `ROADMAP.md`, `SECURITY.md`
  as needed
- one tool memory file if your primary tool supports it:
  - `CLAUDE.md`
  - `.cursorrules`
  - `.windsurfrules`
  - `copilot-instructions.md`

Useful optional helpers:

- `templates/task-packet.md`
- `templates/work-chat-handoff.md`
- `templates/chat-migration-packet.md`

That is enough for many real projects.

## What Not To Assume

Do not assume:

- every collaborator needs the full `orchestration/` folder
- every local model should be treated like a lead executor
- every repo needs logs, checkpoints, or layered chat roles on day one
- every tool stack should be installed the same way

The package is modular on purpose.

## Strict Role Separation For Hybrid Setups

If you are using Claude plus GPT plus a local model, keep the roles strict:

- GPT/Desktop = strategy, review, pressure-testing, research framing
- Claude Code or your main coding tool = primary execution
- local model = bounded helper for drafting, transforms, summarization, or
  private narrow tasks

Do not run all three as interchangeable lead brains. That creates coordination
tax without adding reliability.

## A Good First-Time Collaborator Setup

1. Put `AGENTS.md` in the repo root.
2. Add only the core docs the collaborator actually needs.
3. Give the collaborator one bounded task packet at a time.
4. Keep one human or primary operator responsible for final integration.
5. Add more structure only after a real failure shows the need.

This works especially well when a collaborator is:

- new to the repo
- using Aider, Codex, Cursor, Windsurf, or a local model
- helping on landing pages, docs, styling, bug fixes, or narrow refactors

## What To Hand Them On Day One

If you are the primary operator and someone else is helping, the most useful
first packet is usually:

1. `AGENTS.md`
2. one small task packet
3. one clear note about what they should not touch
4. one clear note about how they should report back

That is often more effective than dropping the full package on them at once.

## When Repo-Local Docs Are Enough

Repo-local docs are usually enough when:

- the task is bounded
- the ownership is clear
- the collaborator does not need to route multiple workstreams
- one execution chat plus one strategy/review chat is enough

In that case, focus on durable repo truth instead of orchestration mechanics.

## When To Add Full Orchestration

Copy `orchestration/` into the repo only when one or more of these are true:

- multiple workstreams need coordination
- handoffs between chats are frequent and getting messy
- context rot is slowing the team down
- you need explicit layered ownership or durable checkpoints
- a simple two-chat/manual system is no longer enough

If none of those are true yet, stay lightweight.

## Local Models

Default rule:

- local models are bounded helpers unless they have proven they can safely do
  more

Good fits:

- summarization
- drafting
- transforms
- private review
- narrow implementation with strong task packets

Bad early fits:

- leading orchestration
- handling ambiguous multi-step routing
- acting as the sole source of repo truth

## Simple Operating Pattern

Use this by default:

1. durable repo truth lives in files
2. one strategy/review chat shapes the task
3. one execution tool does the work
4. collaborator output comes back through a bounded handoff
5. the primary operator verifies and integrates

This is the smallest reliable system for many teams.

## If A Collaborator Worked In The Wrong State

If someone worked in the wrong branch, wrong clone, or a broken local state:

- do not assume their work is worthless
- inspect for recoverable files, commits, or diffs first
- salvage valid work into the correct lane if possible
- only restart from scratch after the salvage check fails

This keeps workflow corrections from turning into unnecessary rebuilds.
