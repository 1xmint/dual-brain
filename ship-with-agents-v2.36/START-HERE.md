# Start Here

**Stop AI-generated project chaos before it starts.**

This pack is a practical operating system for anyone building software with
Claude, Codex, Cursor, ChatGPT, Gemini, Windsurf, local models, or a hybrid
stack.

The main mistake buyers make is installing too much system too early.
The main mistake advanced users make is keeping everything in chat history too
long.

This file helps you avoid both.

## Chat Roles You Can Actually Use

You do not need to memorize cryptic letter codes.

Buyer-facing chat titles should usually be full words:

- `Head - Portfolio / Priorities`
- `Doctor - Repo Ops / Package Audit`
- `Supervisor - App Core / Feature Rollout`
- `Agent - App Core / Cache Fix`
- `Brainstorm - Portfolio / Pricing Ideas`

Use full words in the visible chat title.
Keep the technical lane key internal when the sidebar title needs to stay
human-friendly.

Default internal lane keys now use full words too:

- `head-1`
- `super-1-feature-rollout`
- `agent-12-cache-fix`

Keep progress and continuity out of the stable lane key. Use explicit fields for
phase, milestone, chunk, and state, plus continuation tokens like `--run2` or
`--recover1` when needed.

Use:

- `Head` for strategy and top-level routing
- `Doctor` for audit, diagnosis, recovery, and quality pressure-testing
- `Supervisor` for coordination, launches, checkpoints, and safe fanout
- `Agent` for direct implementation
- `Brainstorm` for open-ended ideation
- `Worker` for bounded helper execution when an agent needs a separate lane

## Plain-Language Translation

You do not need to know the internal orchestration vocabulary on day one.

Translate it like this:

- `lane` = chat or work thread
- `slice` = main work doc for one task or workstream
- `checkpoint` = save point / latest status file
- `closeout` = final wrap-up record

You also do not need to use those words yourself.
If you say plan, spec, brief, work doc, thread, or status note, the system
should still understand what you mean.

Use `orchestration/PLAIN-LANGUAGE-GATE.md` if you want the durable rule that
the package should explain these words instead of assuming them.

Read `orchestration/HUMAN-FRIENDLY-NAMING-GATE.md` if you want the durable
rule behind this, and `orchestration/NAMING-SCHEMA.md` for the package-wide
technical schema.

## Fastest Path

If you want the shortest honest setup:

1. Read `CHOOSE-YOUR-SETUP.md`.
2. Read `QUICK-PATHS.md` if you want the shortest persona-based path.
3. Pick `lightweight` or `orchestration`.
4. Run one bootstrap script from `bootstrap/`.
5. Run the doctor from `bootstrap/`.
6. Read `FIRST-30-MINUTES.md`.
7. Fill `_agent-system-local/OPERATOR-PREFERENCES.md` if you already know your
   durable role/model defaults.
8. Fill `_agent-system-local/OPERATOR-CAPABILITIES.md` if you already have
   active optional surfaces like Replit Core.
9. Read only the next docs your chosen path still needs.
10. Use `FIRST-WEEK-PLAYBOOK.md` if you want a noob-safe and long-term-clean
   mental model for what "healthy usage" looks like.

That is the intended modern onboarding path.

## The Default Recommendation

Start lighter than your ego wants.

Use `lightweight` first unless the work already has:

- multiple active workstreams
- repeated cross-chat review and relaunch
- durable checkpoints and migrations
- a real need for layered routing

If the work is not there yet, do not start by copying the whole orchestration
system just because it has more internal vocabulary.

## Three Decisions

Use `CHOOSE-YOUR-SETUP.md` to choose:

1. workflow weight
2. main surface
3. cost and review posture

If you are unsure, use:

- workflow weight: `lightweight`
- cost posture: `standard`
- review posture: `solo`
- persona path: `QUICK-PATHS.md` -> `Path 1`

## Start Modes

### Path A: Lightweight

Run:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-lightweight.ps1 -TargetRepo <repo-path>
```

Then read:

1. `FIRST-30-MINUTES.md`
2. `AGENT-WORKFLOW-GUIDE.md`
3. `PLATFORM-SETUP.md`
4. `LIGHTWEIGHT-COLLABORATION-GUIDE.md`

### Path B: Full orchestration

Run:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/bootstrap-orchestration.ps1 -TargetRepo <repo-path>
```

Then read:

1. `FIRST-30-MINUTES.md`
2. `orchestration/QUICK-START.md`
3. `orchestration/DOC-FIRST-ORCHESTRATION.md`
4. `UPGRADE-GUIDE.md`

### Path C: Check your install

After either path, run:

```text
powershell -ExecutionPolicy Bypass -File bootstrap/agent-system-doctor.ps1 -TargetRepo <repo-path>
```

## Who This Is For

- first-time AI-assisted builders
- solo founders shipping a small app, API, bot, or SaaS
- nontraditional builders who can prompt but need stronger repo habits
- small teams that want safer agent workflows
- experienced developers who want reusable templates and guardrails

If you have ever reopened a repo and thought, "I do not trust the current
state," this pack is for you.

## What Problem This Solves

Most AI-assisted builders do not fail because the model cannot write code.
They fail because the working system around the model is weak:

- context goes stale in long sessions
- repo truth lives in chats instead of files
- handoffs become copy-paste chores
- review becomes symbolic
- the user becomes the manual transport layer

This pack gives each of those a place to live and a rule for how to handle it.

## What To Read Next

- Need the first-week mental model: `FIRST-WEEK-PLAYBOOK.md`
- Need the shortest persona-based entry: `QUICK-PATHS.md`
- Need the exact first half hour: `FIRST-30-MINUTES.md`
- Need tool-lane setup: `PLATFORM-SETUP.md`
- Need optional Replit sandbox / demo / auth-db lane guidance:
  `REPLIT-INTEGRATION.md`
- Need future remote cloud-session discipline:
  `REMOTE-SESSION-BRIDGE.md`
- Need the minimum repo memory system: `templates/README.md`
- Need Claude-native workflow power: `CLAUDE-CODE-POWER-FEATURES.md`
- Need better cost posture: `COSTS.md`
- Need upgrade-safe installs: `UPGRADE-GUIDE.md`
- Need what changed in recent versions: `CHANGELOG.md`, `MIGRATIONS.md`
- Need multi-chat orchestration: `orchestration/QUICK-START.md`
- Need one canonical work doc instead of packet ping-pong:
  `orchestration/DOC-FIRST-ORCHESTRATION.md`

## One-Line Version

> Pick the lightest safe mode, bootstrap it, run the doctor, and let docs carry
> truth before chat history becomes the system.
