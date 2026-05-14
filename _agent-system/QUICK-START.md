# Quick Start

An agent orchestration system for Claude Code and Claude Desktop that
coordinates multi-layer AI workflows. It gives your AI assistants
structure: scope guarding, checkpoints, verification, and coordination
across workstreams.

## Prerequisites

- **Claude Code** (terminal CLI) or **Claude Desktop** (chat app)
- **A GitHub repo** with `gh` CLI installed and authenticated
  (recommended — see note below)
- **Model access:** The agents default to the top-tier model (currently
  Opus). If you only have Sonnet access, see
  [Model Configuration](CUSTOMIZATION.md#model-configuration)

## Three Ways to Use This System

### Path A: Full Orchestration

Idea Chat &rarr; Orchestrator &rarr; Task Agent &rarr; Work Agent

Use when you have multiple workstreams, cross-repo work, or want full
coordination. The orchestrator deploys task agents, tracks parallelism,
reads checkpoints, and spots friction patterns.

### Path B: Lightweight

Task Agent + Work Agent (skip idea chat and orchestrator)

Use when you already know what to build and just need supervised
execution. Give the task agent a task packet directly.

### Path C: Solo

Just the Work Agent for bounded tasks

Use for simple, well-defined tasks where you don't need scope guarding
or checkpoints. Give the work agent a task and let it execute.

## Your First 5 Minutes

1. **Copy `_agent-system/` into your repo.** Place it at the root of
   your project.

2. **Create `AGENTS.md` in your repo root.** This tells the agents what
   your project is. Include your project name, tech stack, conventions,
   and any no-touch areas. See
   [CUSTOMIZATION.md](CUSTOMIZATION.md#agentsmd) for details.

3. **Project details are pre-filled.** Repo names, boundaries, and
   ownership are already set for Soma, claw-net, and pulse. See
   [CUSTOMIZATION.md](CUSTOMIZATION.md) if you need to change them.

4. **Run the orchestrator:**

   **Claude Code (terminal):**
   ```
   claude --agent orchestrator
   ```

   **Claude Desktop:**
   Open a new chat and paste the contents of
   `_agent-system/START-ORCHESTRATOR.md`

5. **Give it work.** Tell the orchestrator what you want to build. It
   will scope the work, deploy task agents, and coordinate execution.

## Notes

- **Model access:** The agents default to the top-tier model (currently
  Opus). If you only have Sonnet access, change `model: opus` to
  `model: sonnet` in the `.claude/agents/` files. The system works with
  Sonnet — you trade some reasoning depth for broader model
  availability. See
  [CUSTOMIZATION.md](CUSTOMIZATION.md#model-configuration) for details.

- **GitHub CLI:** The system assumes GitHub with `gh` CLI for PR and
  merge management. If you use a different git host, adjust the merge
  commands in the prompt files and agent definitions.

## Next Steps

- [HOW-IT-WORKS.md](HOW-IT-WORKS.md) — understand the layer model,
  checkpoints, handoffs, and rotation
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — adapt the system to your
  workflow, change models, configure repo boundaries
