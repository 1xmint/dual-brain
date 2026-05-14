# Repo Ops Starter Pack

**Stop AI-generated project chaos before it starts.**

A practical operating system for building software with Claude, Codex, Cursor,
ChatGPT, Gemini, Windsurf, local models, or a hybrid stack. The pack gives your
repo memory, workflow rules, handoff structure, and setup guidance so your
agents work inside a system instead of improvising from chat history.

This is the flagship / Pro edition. Smaller tiers are derived by removing
modules. See `PACKAGE-TIERS.md`.

## Fastest Safe Start

If you want the shortest honest path:

1. Read `CHOOSE-YOUR-SETUP.md`.
2. Read `QUICK-PATHS.md` if you want the persona-based shortcut.
3. Pick `lightweight` or `orchestration`.
4. Run one bootstrap script from `bootstrap/`.
5. Run the doctor from `bootstrap/`.
6. Read `FIRST-30-MINUTES.md`.
7. Fill `_agent-system-local/OPERATOR-PREFERENCES.md` if you already know your
   durable role/model defaults.
8. Fill `_agent-system-local/OPERATOR-CAPABILITIES.md` if you already know
   active optional surfaces like Replit Core.
9. Only then read the next docs your chosen path still needs.

That is the main product path now.

## Two Real Starting Modes

### Lightweight

Use this when:

- one person is the main operator
- one strategy/review lane is enough
- one execution tool is enough
- handoffs are occasional
- `AGENTS.md` plus task packets still feels natural

This is the default recommendation.

### Full orchestration

Use this when:

- multiple active workstreams need routing
- the same work crosses planning, review, launch, and closeout
- you need checkpoints, migrations, or durable lane identity
- one strategy lane plus one execution lane is no longer enough

Do not start here just because the package includes it.

## Selector

Use `CHOOSE-YOUR-SETUP.md` to decide:

- workflow weight: lightweight or orchestration
- main surface: Claude Code, Codex app, GPT + Claude, local hybrid, or other
- cost posture: budget, standard, or pro
- review posture: solo or dual-brain

That file is now the cleanest buyer front door.

## Bootstrap And Doctor

Use `bootstrap/README.md` if you want the pack to behave more like a product
than a pile of docs.

Available helpers:

- `bootstrap/bootstrap-lightweight.ps1`
- `bootstrap/bootstrap-orchestration.ps1`
- `bootstrap/agent-system-doctor.ps1`
- shell equivalents in the same folder

The bootstrap scripts create the correct folder shape and starter files.
The doctor checks whether the install still looks healthy.
If you want Replit as an optional cloud sandbox or demo surface after install,
read `REPLIT-INTEGRATION.md`.
If you later adopt a remote cloud-session tool for Claude Code or Codex in
Replit, read `REMOTE-SESSION-BRIDGE.md`.

## What You Get

**Front doors**

- `CHOOSE-YOUR-SETUP.md`
- `QUICK-PATHS.md`
- `START-HERE.md`
- `FIRST-30-MINUTES.md`
- `FIRST-WEEK-PLAYBOOK.md`
- `PACKAGE-TIERS.md`
- `PACKAGE-MANIFEST.md`
- `QUICK-REFERENCE.md`
- `CHANGELOG.md`
- `MIGRATIONS.md`
- `UPGRADE-GUIDE.md`

**Core guides**

- `AGENT-WORKFLOW-GUIDE.md`
- `LIGHTWEIGHT-COLLABORATION-GUIDE.md`
- `PLATFORM-SETUP.md`
- `REPLIT-INTEGRATION.md`
- `REMOTE-SESSION-BRIDGE.md`
- `TOOL-TRANSLATION-GUIDE.md`
- `COSTS.md`
- `SURFACE-COMPACTION-AND-RESUME.md`
- `CLAUDE-CODE-POWER-FEATURES.md`
- `CLAUDE-CODE-SESSION-TELEMETRY.md`
- `TROUBLESHOOTING.md`

**Bootstrap**

- `bootstrap/README.md`
- bootstrap installers for lightweight and orchestration mode
- doctor scripts for install-health checks

**Orchestration** (`orchestration/`)

- optional multi-layer coordination system
- plain-language translation is built in; see
  `orchestration/PLAIN-LANGUAGE-GATE.md`
- buyers can say plan, spec, work doc, thread, or status note instead of the
  internal package words
- public roles: `head`, `doctor`, `super`, `agent`, `worker`, `brainstorm`
- buyer-facing chat titles should still use full words like `Head1`,
  `Supervisor1`, and `Agent1`
- stable internal lane keys now default to full-word forms like
  `head-1`, `super-1-checkout-rollout`, and `agent-12-checkout-api`
- ownership, progress, and continuation are separate fields; see
  `orchestration/NAMING-SCHEMA.md`
- doc-first work-doc workflow for multi-chat work
  (`slice` = the package's internal name for that work doc)
- transport, continuity, ownership, and closeout rules
- optional dual-brain audited mode

**Templates** (`templates/`)

- repo memory: `AGENTS.md`
- tool memory files
- task packets and handoff templates
- local/runtime install config and capability-memory templates

## Recommended Reading Order

### If you are new

1. `CHOOSE-YOUR-SETUP.md`
2. `QUICK-PATHS.md`
3. `START-HERE.md`
4. `FIRST-30-MINUTES.md`
5. `PLATFORM-SETUP.md`
6. `FIRST-WEEK-PLAYBOOK.md`
7. `LIGHTWEIGHT-COLLABORATION-GUIDE.md`

### If you already know repos

1. `CHOOSE-YOUR-SETUP.md`
2. `QUICK-PATHS.md`
3. `bootstrap/README.md`
4. `FIRST-30-MINUTES.md`
5. `PLATFORM-SETUP.md`
6. `FIRST-WEEK-PLAYBOOK.md`
7. `templates/README.md`

### If you truly need orchestration

1. `CHOOSE-YOUR-SETUP.md`
2. `QUICK-PATHS.md`
3. `bootstrap/README.md`
4. `FIRST-30-MINUTES.md`
5. `orchestration/QUICK-START.md`
6. `FIRST-WEEK-PLAYBOOK.md`
7. `orchestration/DOC-FIRST-ORCHESTRATION.md`
8. `UPGRADE-GUIDE.md`

## What This Pack Does Not Do

- It is not a security audit.
- It is not a compliance package.
- It does not replace a senior engineer, security review, or professional
  DevOps when stakes are high.
- It does not guarantee every tool or model can run every workflow equally
  well.
- It is not a one-size-fits-all deploy system.

The principles are portable. The depth of automation depends on your tool,
model quality, and whether that environment supports direct file access and
structured tool use.

## One-Line Version

> Pick the lightest safe setup, bootstrap it cleanly, and only graduate into
> heavier orchestration when the work actually earns it.
