# Orchestration

This folder contains the public multi-layer orchestration system that ships with
the package.

Use it when your workflow has enough moving pieces that one chat is no longer
enough.

Plain-language note:

- `lane` = chat or work thread
- `slice` = main work doc for one task or workstream
- `checkpoint` = save point / latest status file
- `closeout` = final wrap-up record

The buyer does not need to use those exact words.
Plan, spec, work doc, thread, and status note should all be understood.

Hot-path note:

- use `AGENTS.md`, `CLAUDE.md`, and `.claude/agents/<role>.md` as the thin
  runtime layer
- use longer prompt and gate docs on demand, not by default every turn

## Important Boundary

This is not the default starting point for every buyer.

If your repo only needs:

- durable repo truth
- one strategy/review lane
- one execution tool
- bounded handoffs

stay lightweight first and use `../LIGHTWEIGHT-COLLABORATION-GUIDE.md`.

## Public Role Boundary

The buyer package ships public roles for:

- `head`
- `manager`
- `doctor`
- `super`
- `agent`
- `worker`
- `brainstorm`

The `manager` layer is optional, not mandatory.
Use it when stronger review and launch-readiness challenge are worth the extra
lane.

The doctor is the quality-and-recovery role:

- audit
- root-cause diagnosis
- workflow and release pressure-testing
- self-improvement classification

## Buyer-Facing Naming Rule

For desktop and app chat titles, prefer full-word names over cryptic shorthand.

Examples:

- `Head - Portfolio`
- `Doctor - Agent Systems`
- `Supervisor - App Core / Auth`
- `Agent - Cache Fix`
- `Brainstorm - Pricing`

Use `LANE.md` for the durable rule.
Use `LANE.md` plus
`LINEAGE-AND-PROGRESSION-MODEL.md` for the live internal lane and continuation
model.

## Fast Start

1. Read `../CHOOSE-YOUR-SETUP.md`.
2. Run `../bootstrap/bootstrap-orchestration.ps1`.
3. Run `../bootstrap/agent-system-doctor.ps1`.
4. If you are operating directly inside this live repo, fill
   `OPERATOR-PREFERENCES.md`. If you are testing the packaged install, fill the
   packaged local operator-preferences file in that install.
5. Read `QUICK-START.md`.
6. Read `DOC-FIRST-ORCHESTRATION.md`.

That is the smallest honest orchestration onboarding path.

## What Ships Here

- launch files for fresh chats
- durable prompts
- human-friendly naming guidance and a buyer-facing doctor role
- canonical work-doc workflow for work that outgrows plain packet transport
  (`slice` = the internal package name for that work doc)
- handoff and migration templates
- model guidance
- capability and routing guidance
- phase, storage, continuity, and closeout guidance
- collaboration, transport, ownership, and delivery-tail guidance
- delivery-tail presentation guidance so the real copy block and final command
  are visually obvious at the end of the response
- artifact-custody guidance so approval and direct-edit capability do not
  silently overrule the live owner's canonical slice
- execution-routing guidance so supers supervise, agents execute, and direct
  agent launches stay a small-task exception
- multitasking-throughput guidance so head, review brains, and supers actively
  look for safe parent-slice / child-slice fanout instead of serializing work
  by habit
- staged-edit guidance so risky package/doc surgery defaults to small verified
  chunks instead of one brittle bulk edit
- update-bus guidance so live chats can absorb workflow changes from runtime
  files instead of repeated manual note-pasting
- optional Claude project slash commands for slice creation, review, launch,
  and closeout
- a first-class doctor lane with a playbook, finding schema, severity model,
  doctor-native commands, a sweep protocol, and a runtime observability layer
  for live-turn evidence, lane freshness, unresolved frustrations, and
  cross-lane awareness

## Three Buyer-Facing Ideas

If you want the simplest mental model, compress the system into:

### Truth

Where the durable work object lives.

- canonical slice docs
- review memos when needed
- checkpoints for execution truth

### Routing

Who owns the current step.

- `head` = top-level direction
- `manager` = review, launch-readiness, and workstream challenge
- `super` = coordination and multi-lane execution ownership
- `agent` = direct implementation owner

### Continuity

How the work survives time and context pressure.

- migration packets
- compact / rotate / resume rules
- runtime state separated from replaceable vendor files

## Minimum Reading Order

### Required

1. `QUICK-START.md`
2. `DOC-FIRST-ORCHESTRATION.md`
3. `SLICE-STATE-RULES.md`
4. `references/TRANSPORT-CHOICE-GATE.md`
5. `references/DELIVERY-TAIL-PRESENTATION.md`
6. `.claude/skills/continuity-pickup/SKILL.md`
7. `LANE.md`
8. `ARTIFACT-CUSTODY-GATE.md`
9. `EXECUTION-ROUTING-GATE.md`
10. `MULTITASKING-THROUGHPUT-GATE.md`
11. `STAGED-EDIT-PROTOCOL.md`
12. `UPDATE-BUS.md`
13. `RUNTIME-SEPARATION.md`
14. `REVIEW-TOPOLOGY-LADDER.md`
15. `MANAGER-CONTEXT-PURITY-GATE.md`

### Then read only what you need

- `CAPABILITY-MATRIX.md`
- `ROUTING-MATRIX.md`
- `ROLE-AWARE-COMPACTION.md`
- `CLAUDE-HOOKS-INTEGRATION.md`
- `DUAL-BRAIN-MODE.md`
- `SYSTEM-IMPROVEMENT-LOOP.md`

Do not try to internalize every gate on day one.

## Canonical Artifact Rule

Once work needs repeated review, approval, relaunch, or handoff, prefer:

- one canonical work doc (`slice` in package terms)
- small review memos only when needed
- checkpoints for execution truth
- tiny launch stubs that point to the slice

Do not keep re-pasting slightly different packet bodies if a durable artifact
would be cleaner.

When a canonical slice already belongs to a live coordination owner, higher
layers should normally route approval back to that owner instead of directly
rewriting the slice tail or launch block.

## Install Truth

For the packaged install, the safest default layout is:

- packaged vendor layer = replaceable shipped doctrine/prompt layer
- packaged local layer = buyer-specific overrides
- packaged runtime layer = live slices, reviews, checkpoints, logs, archive

Use `INSTALL-MODES.md` and `RUNTIME-SEPARATION.md` for the full rules.

In this live repo, the equivalent truths live under:

- `orchestration/` = shared doctrine and prompts
- `orchestration/OPERATOR-PREFERENCES.md` and `orchestration/OPERATOR-CAPABILITIES.md` =
  durable operator truth
- `orchestration/updates/`, `orchestration/lanes/`, `orchestration/checkpoints/`,
  `orchestration/closeouts/`, `orchestration/health/`, and `orchestration/observability/` = live
  runtime state

## Portability

The orchestration ideas are portable across tools, but launch mechanics differ.

- Claude Code: most native path
- app lanes: preserve them as app lanes when they already own a durable role
- Codex, Cursor, Copilot, Windsurf: use translated memory files and manual
  launches where native orchestration is not proven
- local-model setups: best used as bounded or hybrid/manual helpers unless
  proven stronger



