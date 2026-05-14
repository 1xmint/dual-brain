# Templates

Copy-paste starter files for a new or existing repo. Use what you need. Skip
what you do not.

`AGENTS.md` is the canonical repo memory file. Everything else supports it.

## Minimum Starter Set

If you want the smallest useful setup, start with:

- `AGENTS.md`
- one tool memory file that matches your main tool
- `task-packet.md`
- `chat-migration-packet.md`

If the work grows beyond simple copy-paste transport, move to canonical slice
docs in `orchestration/slices/` instead of stretching plain task packets too
far.

That is enough for many solo builders and lightweight collaborator flows.

If you want the package to create that starter shape for you, read
`../bootstrap/README.md` and run `bootstrap/bootstrap-lightweight.ps1`.

## Tool-Specific Memory Files

- `CLAUDE.md` - Claude Code / Claude Desktop memory file
- `.cursorrules` - Cursor rules file
- `.windsurfrules` - Windsurf rules file
- `copilot-instructions.md` - GitHub Copilot instructions

If your tool has no native memory file, keep `AGENTS.md` in the repo and paste
the key context manually at session start.

## Install / Upgrade Template

- `INSTALL-CONFIG.md` - local install truth for buyers who separate
  vendor files, local overrides, and runtime state
- `ENABLED-MODULES.md` - which optional package modules your project is
  actually using
- `OPERATOR-PREFERENCES.md` - durable buyer voice for role baselines,
  preferred surfaces, and premium-model policy
- `LOCAL-QUIRKS.md` - environment-specific quirks and limitations that
  should survive package upgrades
- `LOCAL-LESSONS.md` - buyer-specific friction and local operating
  truth
- `LOCAL-WINS.md` - buyer-specific patterns worth repeating

If you are using orchestration or expect package upgrades, prefer generating
these through the bootstrap scripts instead of copying them ad hoc.

If you want workflow changes to propagate without repeated manual note-pasting,
bootstrap the runtime update bus instead of inventing ad hoc inbox files by
hand.

## Core Repo Docs

- `AGENTS.md` - canonical repo truth for humans and agents
- `ARCHITECTURE.md` - what the repo owns and how the pieces fit
- `OPERATIONS.md` - deploy, secrets, rollback, and runtime truth
- `ROADMAP.md` - current priorities and planned work
- `SECURITY.md` - trust boundaries and sensitive surfaces

## Workflow Templates

- `task-packet.md` - bounded unit of work for a coding tool
- `work-chat-handoff.md` - pass work from strategy/review into execution
- `chat-migration-packet.md` - move to a fresh chat without dragging stale
  history with you
- `PR-readiness-checklist.md` - pre-merge discipline

## Decision Templates

- `proposal.md` - shape a non-trivial idea before implementation
- `ADR.md` - record durable decisions
- `evidence-ledger.md` - rescue messy or partially trusted code honestly

## Advanced Lifecycle Templates

`templates/lifecycle/` is optional and more advanced.

Use it when you want explicit idea-stage structure beyond the standard proposal
and ADR flow.

Most buyers do not need to start here on day one.
