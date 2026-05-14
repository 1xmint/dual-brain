# Choose Your Setup

Use this file first if you want the shortest path to the right install.

If you want the shortest path to the right install for a recognizable persona,
read `QUICK-PATHS.md` immediately after this file.

The package has two honest starting modes:

- lightweight collaboration
- full orchestration

Do not start by copying everything just because it exists.

## Before You Launch Any Chats

Use full-word chat titles so the role is obvious to a first-time user.

Good examples:

- `Head - Portfolio / Priorities`
- `Doctor - Repo Ops / System Audit`
- `Supervisor - App Core / Auth Flow`
- `Agent - App Core / Cache Fix`
- `Brainstorm - Marketing / Landing Page Ideas`

Do not assume people know what `h1`, `s1`, `a1`, or `b1` mean.

## Step 1: Pick Your Workflow Weight

Choose `lightweight` if most of these are true:

- one person is the primary operator
- one strategy/review chat is enough
- one execution tool is enough
- handoffs are occasional
- the work can live in `AGENTS.md` plus task packets

Choose `orchestration` if most of these are true:

- multiple active workstreams need routing
- the same work crosses planning, review, launch, and closeout
- you need save points, migrations, or durable chat/work-thread identity
- one strategy chat plus one execution chat is no longer enough

## Step 2: Pick Your Main Surface

Choose the row that matches your real setup:

| Main setup | Best path |
|---|---|
| Claude Code is your main executor | lightweight or orchestration, Claude-native |
| GPT/Desktop or Codex app for strategy + Claude Code for execution | hybrid strategy/execution path |
| Codex terminal or IDE-only flow | lightweight first, orchestration only if clearly needed |
| local model helper or private assistant | lightweight first |
| Replit Core as cloud helper | keep local docs as truth, add Replit only as optional sandbox / demo / auth-db chat |

## Step 3: Pick Your Cost / Review Posture

Use:

- `budget` when cost control matters most
- `standard` for the safest everyday default
- `pro` when the work is expensive to get wrong

Review posture:

- `solo` for one-brain execution
- `dual-brain` when a real second review brain is worth the extra friction and cost

## Recommended Defaults

If you are unsure, start here:

- workflow weight: `lightweight`
- main surface: your actual execution tool, not your favorite model brand
- cost posture: `standard`
- review posture: `solo`

Graduate to orchestration only when the simple path stops being enough.

## Fastest Safe Starts

### Path A: Lightweight

Run one bootstrap script:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-lightweight.ps1 -TargetRepo <repo-path>
```

Then read:

1. `FIRST-30-MINUTES.md`
2. `START-HERE.md`
3. `AGENT-WORKFLOW-GUIDE.md`
4. `PLATFORM-SETUP.md`
5. `FIRST-WEEK-PLAYBOOK.md`
6. fill `_agent-system-local/OPERATOR-PREFERENCES.md` if you already know your
   durable role/model defaults
7. fill `_agent-system-local/OPERATOR-CAPABILITIES.md` if you already know
   active optional surfaces like Replit Core

### Path B: Full orchestration

Run one bootstrap script:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-orchestration.ps1 -TargetRepo <repo-path>
```

Then read:

1. `FIRST-30-MINUTES.md`
2. `orchestration/QUICK-START.md`
3. `FIRST-WEEK-PLAYBOOK.md`
4. `orchestration/DOC-FIRST-ORCHESTRATION.md`
5. fill `_agent-system-local/OPERATOR-PREFERENCES.md` before heavy multi-chat
   work if you already know your durable role/model defaults
6. fill `_agent-system-local/OPERATOR-CAPABILITIES.md` if you already know
   active optional surfaces like Replit Core
7. `UPGRADE-GUIDE.md`

## After Install

Run the doctor:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/agent-system-doctor.ps1 -TargetRepo <repo-path>
```

That checks for:

- missing core folders
- mixed vendor/runtime state
- missing local config
- missing runtime scaffolding
- missing Claude agent definitions in orchestration installs
- missing operator preference memory

If you want an optional cloud sandbox, demo, or auth / database accelerator
after install, read:

- `REPLIT-INTEGRATION.md`
- `REPLIT-COST-GATE.md`
- `START-REPLIT-SANDBOX.md`

If you later adopt a remote cloud-session tool for long-running Claude Code or
Codex chats inside Replit, also read:

- `REMOTE-SESSION-BRIDGE.md`

## Final Rule

Peak setup means:

- start lighter than your ego wants
- separate vendor, local, and runtime early if the system matters
- move to canonical work docs (`slice` in orchestration mode) before chat
  transport becomes annoying
- get to one clean real task before reading the rest of the pack
