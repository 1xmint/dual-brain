# How It Works

## The Problem

AI assistants lose context in long conversations. Complex tasks need
coordination across multiple chats. When you ask one chat to do too
much, quality degrades - it forgets constraints, drifts from scope,
and loses track of what is already done.

This system provides that coordination structure. Each layer has a
bounded role, writes durable state to files, and follows principles
that prevent the most common AI failure modes.

For meaningful multi-chat work, the canonical artifact should usually be a
slice doc, not a chat transcript or a repeatedly rewritten packet.

The best runtime shape is a thin hot path plus colder detail:

- hot path: `AGENTS.md`, `CLAUDE.md`, current role file
- warm path: current task artifact and live continuity files
- cold path: detailed gates, references, and tutorials
- mechanical path: commands, rules, doctors, and durable checks

Read these when workflow shape is the question:

- `OPERATOR-ORCHESTRATION-PROFILE.md`
- `REPO-SCOPE-GATE.md`
- `ROLE-TO-LANE-ELASTICITY.md`
- `ADAPTIVE-ROUTING-LADDER.md`

Read these when progression or lane continuity is the question:

- `LINEAGE-AND-PROGRESSION-MODEL.md`
- `LANE.md`
- `ROTATION-THRESHOLD-GATE.md`
- `CHUNK-TRACKING-RULE.md`
- `LEGACY-LIVE-ID-MIGRATION.md`

## The Layer Model

The system uses a layered architecture where each layer has a distinct
responsibility:

```
Head (terminal or app lane) -> strategy, priorities, deploys supers +
  brainstorms
Manager (terminal or app lane) -> challenge, review, scope shaping,
  and launch readiness
Super (terminal or app lane) -> deploys agents, tracks routing,
  reads slices and checkpoints, protects momentum
Agent (terminal or repo-connected lane) -> bounded implementation,
  scope guarding, checkpoints, completion reports
Helper subagent (optional) -> bounded helper slice or independent review
Brainstorm (terminal or app lane) -> ambiguity reduction, strategy,
  handoffs
Doctor (terminal or app lane) -> audits workflow truth, diagnoses root
  causes, verifies durable fixes
```

These examples are Claude-native because the shipped role cards target
Claude Code. The system itself is broader:

- desktop/app lanes can own strategy, review, or durable continuity
- terminal lanes are strongest for exact launch control and execution
- IDE agent lanes can own repo-connected execution with tool-specific mechanics
- web/manual lanes can still use the system through packets and migrations

Route by runtime shape and verified capabilities, not by brand assumptions.
Keep provider choice in metadata, not in role names. Use
`PROVIDER-BINDING-RULE.md`.

### Doctor

The quality and recovery lane. Audits workflow truth, diagnoses root causes,
classifies findings into the right fix layer, and verifies that the system
actually improved. Doctor should not become a hidden implementation lane.

### Head

The strategic layer. Sets priorities, decides what to build, deploys
supers when workstreams are ready to execute, and deploys brainstorms
when ideas need exploration. Reads `TODO.md` and `ROADMAP.md` to track
the big picture.

If the head is launched manually in a terminal, put the launch command at the
end of the handoff message, after the full body content, so the user does not
have to scroll back up to copy it.

### Manager

The challenge and review layer. Pressure-tests direction, shapes slices,
checks launch readiness, and improves scope quality before execution ramps.
Manager is not the execution owner and should not quietly become the super.

### Super (Supervisor)

The coordinator. Deploys agents, tracks active workstreams, reads the
active-workstreams index and relevant checkpoints, and spots friction or
wins patterns. Never writes code - it manages the work.

If the super is launched manually in a terminal, put the launch command at the
end of the handoff message, after the full body content.

### Agent

Executes bounded tasks directly with discipline: scope guarding,
verification, checkpoints, and structured closeout. Given a task packet
by the super, it does the actual repo work unless a bounded helper
subagent is clearly the better move.

Manual terminal launch commands belong at the end of the message that created
the lane, after the full startup content.

### Helper Subagent

Optional bounded helper launched by an agent for short independent work:
focused investigation, a read-only review, or a disjoint implementation
slice.

Runtime note:

- manual terminal agent chats give exact model and effort control because
  the launch command is explicit
- helper subagents are great for bounded helper slices, but you should
  only assume exact model control if your runtime explicitly supports it
  and you have verified that behavior
- in Claude Code, direct helper model resolution can come from
  `CLAUDE_CODE_SUBAGENT_MODEL`, a per-invocation override, the subagent
  definition's `model`, or the parent conversation model
- if exact model control matters, prefer a manual terminal agent chat
- use `CAPABILITY-MATRIX.md` to decide what your actual tool can prove

### Brainstorm

A thinking partner for brainstorming, strategy, and design. Explores
ideas with genuine curiosity, pressure-tests assumptions, researches
prior art, and produces handoff files when ideas are ready to execute.

If the brainstorm is launched manually in a terminal, put the launch command at
the end of the handoff message, after the full body content.

## Surface Continuity Rule

Different surfaces want different context-management habits.

- Claude Code terminal and Codex terminal have strong documented compact/resume
  controls
- Codex app is thread-centric and should not be treated like the CLI by default
- desktop/app lanes should rely more on clean thread rotation and migration
  packets when the thread stops being one coherent job

Read `SURFACE-COMPACTION-AND-RESUME.md` before teaching a lane how to
compact, rotate, or resume.

## Canonical Artifact Rule

For work that crosses planning, review, launch, and closeout:

- slice doc = scoped work truth
- review memo = optional challenge artifact
- checkpoint = execution truth
- closeout = finish-state truth
- chat text = commentary and decisions around those artifacts

This reduces user transport work and keeps all reviewers looking at the same
object. It also means a live owner should usually advance the artifact itself
instead of asking the user to keep nudging the same lane forward.

## Deployment Modes

**Mode A - Direct spawned helper:** An agent uses the runtime's subagent
tool for a bounded helper slice. This is best when the slice is short,
disposable, and does not require exact manual model control.

**Mode B - New terminal agent chat:** The super produces a tiny launch stub
that points to the canonical slice plus a launch command at the end. You open a
new terminal and run it. That terminal is independent, can spawn its own
subagents, and keeps its own visible lifecycle.

Practical rule:

- use `Mode A` for short disposable helper slices
- use `Mode B` when you want exact model and effort control, durable chat
  identity, visible collaboration, checkpoints, or an agent that may
  orchestrate its own subagents
- when recommending `Mode A`, state the helper model truth explicitly:
  verified, inherited, or unknown
- do not assume a directly spawned helper can be pinned to a different model
  than the deployer unless your runtime explicitly supports that and you have
  verified it
- if `Mode A` would inherit a stronger parent model than the configured
  execution default, or the helper runtime is unknown while spend matters, do
  not use it as the normal implementation path without explicit approval
- use `ROUTING-MATRIX.md` when deciding whether the task wants a helper,
  a direct standalone agent, a super-owned lane, or multiple supers

## Role Functions vs Live Lanes

Roles are logical functions first. Separate chats are deployed containers for
those functions.

That means:

- not every task needs a new super
- not every review step needs a separate higher layer
- a direct agent is often enough for bounded work
- larger work should earn heavier structure because it buys quality, speed, or
  clarity

Read `ROLE-TO-LANE-ELASTICITY.md` and `ADAPTIVE-ROUTING-LADDER.md` before
adding structure by habit.
Read `REVIEW-TOPOLOGY-LADDER.md` and `ASSURANCE-TO-TOPOLOGY-MATRIX.md` when
the real question is how much independent review structure the work deserves.

Do not encode progress mainly in lane numbering. Keep lineage in the lane
family, workstream identity in the stable lane key and workstream registry,
progress in phase/chunk/state metadata, and continuation in `--run<N>` or
`--recover<N>` only when the same lane truly continues.

## Chat Naming Convention

Every chat gets a name that tells you its status at a glance:

| Chat name | Meaning |
|---|---|
| `head-1` | Head lane, original context, healthy |
| `head-1--run2` | Head lane, rotated once (planned) |
| `head-1--recover1` | Head lane, recovered once (unplanned) |
| `manager-1` | Manager lane, original context, healthy |
| `manager-1--run2` | Manager lane, rotated once (planned) |
| `manager-1--recover1` | Manager lane, recovered once (unplanned) |
| `brainstorm-3-auth-options` | Brainstorm lane, original context, healthy |
| `brainstorm-3-auth-options--run2` | Brainstorm lane, rotated once (planned) |
| `super-7-auth-rollout` | Super lane, original context, healthy |
| `super-7-auth-rollout--run2` | Super lane, rotated once (planned) |
| `super-7-auth-rollout--recover1` | Super lane, recovered once (unplanned) |
| `agent-12-auth-backend` | Agent lane for backend auth work |
| `agent-12-auth-backend--run2` | Agent lane, rotated once |
| `agent-12-auth-backend--recover1` | Agent lane, recovered once |
| `agent-13-auth-frontend` | Agent lane for frontend auth work |
| `doctor-1-package-audit` | Doctor lane for a package audit |

The visible lane key should identify the work, not masquerade as the progress
meter. Use `phase`, `chunk`, `state`, slices, checkpoints, and active
workstream/health files to show progress instead.

Read `LANE.md` and
`LINEAGE-AND-PROGRESSION-MODEL.md` for the live naming rule.

In multi-repo work, also read `REPO-SCOPE-GATE.md`.

### Continuation tokens

- **No continuation token** - original, healthy
- **`--run<N>`** - planned rotation (fresh context, same workstream)
- **`--recover<N>`** - unplanned crash recovery (resumed from checkpoint)
- **Combined** - rotated then recovered

### Legibility rule

- Use full-word role prefixes in lane keys.
- Use `agent-<N>-<workstream>` for agents whether they are direct or
  super-owned.
- Keep workstream slugs short and explicit.
- Store ownership in the active map and checkpoint metadata instead of
  overloading the lane key.

### Logging

- **Head session logs:** `logs/head-<date>-session-<N>.md`
- **Super session logs:** `logs/super-<date>-session-<N>.md`
- **Agent work:** tracked via checkpoints, not separate logs

## Key Concepts

### Active Workstreams

Use `ACTIVE-WORKSTREAMS.md` as the super's first read. It is the compact
routing index. Slice docs hold the contract and checkpoints hold the execution
truth for each workstream.

For meaningful workstreams, record review-cell truth too:

- `review topology`
- `review cell id`
- `execution owner`
- `review owner`
- `audit owner`

Use `ACTIVE-CHAT-MAP.md` as the lineage map for which chats and root
lanes are actually live.

### Health Registry

Use `health/summary.json` and `health/workstreams.json` as a compact
machine-checkable sidecar.

- artifacts remain the human source of truth
- health files summarize status, pickup, readiness, fanout, and risk
- if health and artifacts disagree, trust the artifacts and refresh health

### Dashboard

Use `health/DASHBOARD.md` as the compact human-readable orchestration status
view.

- summary and workstream JSON are the structured sidecars
- the dashboard is the fast read for supers, managers, and doctors
- `Pickup Now` should list work that truly needs movement now

### State Consistency

For active orchestration, keep these three views aligned:

- `ACTIVE-WORKSTREAMS.md`
- `health/workstreams.json`
- `health/DASHBOARD.md`

Read `ORCHESTRATION-STATE-CONSISTENCY.md` when those views start telling
different stories.

### Checkpoints

State snapshots written after each milestone. The super reads these to know
where workstreams are - what completed, what is blocked, and what is next.
Think of them as save points, not planning packets.

- **When written:** After every gate pass, before reporting completion
- **Who reads them:** The super, to track progress and spot friction patterns
- **What they also capture:** wins, friction, task-packet gaps, and reusable
  patterns at natural work boundaries
- **Where they live:** `checkpoints/<workstream-name>.md`
- **Key property:** The checkpoint file path never changes, even when a chat
  rotates or crashes. Only the chat name changes.

### Handoffs

When a brainstorm finishes designing something, it writes a handoff file to
`logs/`. You give the super the file path, and it reads the handoff and turns
the idea into workstreams with bounded task packets or canonical slice docs.

### Dead Chat Recovery

When a chat dies unexpectedly:

1. The super reads the checkpoint for the dead workstream.
2. It produces a resume prompt with pickup context.
3. It tells you to run a new chat with the recovery token:
   `agent-12-auth-backend` -> `agent-12-auth-backend--recover1`
4. The checkpoint file stays the same - only the chat name changes.

### Rotation

When a chat gets long, quality degrades - the model forgets earlier
constraints, repeats reasoning, or loses track of decisions. The system
tells you when to rotate: save state to a log or checkpoint and start a
fresh chat. The fresh chat picks up from the saved state without carrying
degraded context.

Rotation is always a user decision. The layers suggest it; you confirm.
Rotated chats get the `--run<N>` token:
`agent-12-auth-backend` -> `agent-12-auth-backend--run2`.

### Idea Escalation Protocol

When execution layers hit strategic questions, the system uses three
tiers to prevent execution layers from silently becoming strategy layers:

- **Tier 0 - Helper research:** Agent handles it. Quick, bounded
  information gathering. Not strategy.
- **Tier 1 - Brainstorm-needed escalation:** Agent or super produce a
  structured recommendation and route it upward. They do not create
  brainstorm chats.
- **Tier 2 - Real brainstorm chat:** Full brainstorm session. Only Head
  and Manager create these.

Flow: Helper -> Agent -> Super -> Manager -> Head, only as needed.

### Merge Tiers

A risk-based system for deciding who approves PRs:

- **Tier 0:** Docs, tests, artifacts - agent merges directly
- **Tier 1:** New features - agent reviews and merges
- **Tier 2:** Auth, credentials, crypto - deep review, super merges
- **Tier 3:** Key material, live data - escalated to you for decision

If you work solo and commit directly to main, merge tiers become relevant when
your agents start opening PRs.

### Principles vs Rules

Each layer follows a small set of principles, not a huge numbered list.
Principles cover entire failure classes, and detailed procedures,
checklists, and examples live in reference files the layer reads on demand.

### Model and Effort Rules

Use full model IDs for predictability. Configure your actual defaults in
`MODEL-CONFIG.md`.

General guidance:

- **Head, Manager, Super, Brainstorms:** strongest available model plus high effort
- **Agents (default):** execution layer model plus high or standard effort
- **Agents (escalated):** strongest model for security, auth, or crypto
- **Premium tier models:** require explicit user permission
- **Low effort:** not the default for orchestration work

Short names like `sonnet` or `opus` resolve to the latest version, which
changes over time.

## Direct vs Super-Owned Agents

Agents come in two flavors:

- **Direct agents (`agent-<N>-<slug>`):** launched directly by the user
  for one-shot bounded work. No super overhead. The completion report goes to
  the user, not a super.
- **Super-owned agents (`agent-<N>-<slug>` under a named super lane):**
  deployed by a super as part of a managed workstream. The super tracks
  progress, reads checkpoints, and sequences follow-up work. This is the
  default for most work.

When exact model control matters, manual terminal agents are more reliable
than spawned helpers because the launch command pins the runtime explicitly.

**Decision gate:** Will this work have follow-ups or is it part of a
larger initiative? If yes or maybe -> super-owned. If certainly not ->
direct is fine.

## Collaboration Protocol

Cross-layer artifacts such as task packets, completion reports, escalation
packets, handoffs, and migration packets use a 4-line envelope header:

```
From:   <layer> <name> (<model>)
Intent: actualize | review | pressure-test | escalate | report | ask
Confidence: high | medium | low
Status: decision | proposal | draft | in-progress | blocked
```

When receiving an artifact with an envelope, the recipient chooses one of
five response modes:

1. **Agree and act** - accept and proceed
2. **Revise and act** - modify with evidence, then proceed
3. **Ask back** - need a specific answer before proceeding
4. **Escalate** - needs higher-layer input
5. **Decline** - layer mismatch or conflicts with evidence

This applies to cross-layer handoffs, not user-originated tasks.

## Example Walkthrough

**You want to add authentication to your app.**

1. **Head** - You tell the head session to start auth work. It deploys a
   brainstorm to explore the approach.
2. **Brainstorm** - You discuss the approach. OAuth? Magic links?
   Session-based? The brainstorm pressure-tests your choice, checks for
   security gaps, and produces a handoff: "Add OAuth2 with Google provider.
   Backend routes plus frontend login flow."
3. **Head** - Reads the handoff and deploys a super to execute it.
4. **Super `super-1-auth-rollout`** - Reads the handoff. Scopes it into two
   task packets: backend auth routes and middleware, then frontend login UI.
   It checks for parallelism - backend and frontend touch different files, but
   frontend depends on the backend API, so they deploy sequentially. It
   deploys `agent-12-auth-backend`.
5. **Agent `agent-12-auth-backend`** - Works through the backend
   deliverables: auth routes, middleware, token validation, tests. Writes a
   checkpoint after each milestone and produces a completion report when done.
6. **Agent `agent-13-auth-frontend`** - Starts after backend is complete.
   Builds the login page, integrates with the backend routes, writes tests,
   writes its own checkpoint, and produces its completion report.
7. **Super** - Reads both completion reports. Updates status. Surfaces
   friction or wins patterns. Proposes rule improvements if the agents hit
   recurring problems.
8. **Optional audited closeout** - For quality-sensitive work, the super
   performs a deeper review and a second brain challenges that review before
   the work is treated as truly done.

## Next Steps

- [QUICK-START.md](QUICK-START.md) - get running quickly
- [CUSTOMIZATION.md](CUSTOMIZATION.md) - adapt the system to your workflow

