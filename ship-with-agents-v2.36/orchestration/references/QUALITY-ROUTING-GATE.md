# Quality Routing Gate

Use this gate after `CHAT-STATE-GATE.md`.

The state gate decides the right intervention for a chat. This gate
decides the right execution and review lane for the work itself.

## The Core Question

Do not ask only:

- "Which model should I use?"

Ask:

- "What quality lane is this task in?"
- "What assurance level does it deserve?"
- "Which layer should act next?"
- "Do we need independent review?"
- "Do we need independent preflight review before launch?"
- "Do we need manual long-running agent chats, or is a bounded
  subagent enough?"

## Decision Inputs

Evaluate these before routing work:

1. `Risk`
   - Does this touch auth, security, money, data integrity, deploy,
     trust model, or irreversible architecture?
2. `Ambiguity`
   - Is the spec clear, or does it still need reasoning and judgment?
3. `Blast radius`
   - How expensive is a wrong decision or bad implementation?
4. `Need for independence`
   - Do we need a second brain to challenge the first one?
5. `Parallelism value`
   - Would manual long-running agent chats or subagents materially speed
     things up without causing collisions?
   - Should this stay one slice, or become a parent slice with child slices?
6. `Budget posture`
   - Conserve / default / premium-approved
7. `Assurance level`
   - Run `orchestration/ASSURANCE-GATE.md`

## Quality Lanes

Quality lane and assurance level are related, but not identical.

State both when the work is meaningful.

### Q0 - Lightweight

Use when the task is mechanical, bounded, and low-risk.

Typical flow:

`Head -> Super -> Agent -> Super -> Head`

Typical models:

- Head or strategy chat: configured default
- Super: configured coordination default
- Agent: cheapest safe execution model

Use this for:

- doc cleanups
- small refactors with a clear pattern
- low-risk file changes

### Q1 - Standard supervised build

Use when the task is normal feature work with some ambiguity but no
trust-critical blast radius.

Typical flow:

`Head -> Super -> Agent -> Super review -> Head`

Safe variant:

`Head -> Super parent slice -> 1-2 child agents in parallel -> Super review -> Head`

Typical models:

- Head: strategy default
- Super: coordination default
- Agent: execution default at high effort

Use this for:

- normal features
- moderate refactors
- most day-to-day repo work

### Q2 - High-quality audited build

Use when implementation quality matters enough that execution should be
independently challenged before head signs off.

Typical flow:

`Head -> Manager analysis or audit -> Super -> manual agent chat(s) -> Super review -> Manager independent audit -> Head`

Default caution rule:

- if the packet hits multiple caution triggers in
  `orchestration/LAUNCH.md`, get manager preflight before the user
  launches the worker

Typical models:

- Head: strategy default
- Manager: strongest configured reasoning model in the desktop app
  or equivalent
- Super: strongest configured coordination default
- Agent: cost-effective execution model unless the task is trust-adjacent

Use this for:

- important architecture-backed features
- quality-sensitive refactors
- work where "good enough" is not good enough
- situations where GPT and Claude should challenge each other

### Q3 - Trust / release / precedent lane

Use when the task touches trust, security, auth, money, deploy, schema,
or project-defining architecture.

Typical flow:

`Head -> Manager deep analysis -> Super -> agent on execution default unless stronger worker is explicitly justified -> Super review -> Manager independent audit -> Head sign-off`

Default caution rule:

- for trust, auth, signing, or real infra lanes, run
  `orchestration/LAUNCH.md` before telling the user to launch the
  worker

Optional additions:

- dedicated brainstorm before execution
- explicit human approval before merge or deploy

Use this for:

- auth and security changes
- migrations
- deploy or release gates
- protocol and system architecture decisions

## Manual Agent Chats Vs Subagents

### Use a manual long-running agent chat when:

- the workstream is substantial
- the task will likely need follow-ups
- the user benefits from visible persistent ownership
- the agent may need to spawn its own subagents
- you want better parallel multitasking across multiple workstreams
- exact model/effort control matters

### Use a bounded subagent when:

- the task is short and tightly scoped
- the result should flow straight back to the current supervisor
- persistent agent identity is unnecessary
- the overhead of a manual chat is not worth it
- inherited or runtime-dependent model behavior is acceptable
- the helper runtime is verified safe for the current budget posture, or a
  stronger helper spend was explicitly approved

### Default rule

If the work will have meaningful follow-up, use a manual agent chat.
If it is truly bounded and disposable, a subagent is enough.

When throughput is valuable, also decide whether:

- one super should own a parent slice and multiple child execution slices
- or the work should stay sequential because the dependency/collision map is
  still too tight

## GPT + Claude Collaboration Pattern

For your described subscription setup, the highest-quality default is
not "all tools all the time." It is:

- `Head`: sets quality lane and success criteria
- `Manager (GPT/Desktop or equivalent)`: independent analysis, review,
  pressure-test, or final audit when the lane needs it
- `Super (operator-chosen repo-connected execution surface; often Claude terminal in this setup)`: coordinates execution and owns the
  implementation loop
- `Agent (operator-chosen repo-connected execution surface; often Claude terminal in this setup)`: does the actual repo work
- `Subagents`: used by the agent when parallelism is worth it

Default execution norm:

- Manager + Super = heavier reasoning/control layer
- Agent + Subagents = normal heavy-lifting execution layer
- Keep the execution layer on the configured default unless local truth
  and budget posture justify a stronger worker model
- If a direct helper would inherit a stronger coordination model than the
  configured execution default, do not treat that helper as the default
  heavy-lifting layer. Use a manual execution lane or get explicit approval.

The critical design rule:

`GPT should be an independent reviewer or strategist, not a second
copy of the same implementation loop.`

If GPT only repeats what Claude already decided, you pay for redundancy
without gaining quality.

## Recommended Operating Pattern For Your Budget

For a `$100 Codex/GPT + $100 Claude` setup:

- Default high-quality lane for normal product work:
  - Head: strong default strategy model
  - Manager: GPT/Desktop only when the task needs independent challenge
  - Super: `claude-opus-4-6` high
  - Agent: `claude-sonnet-4-6` high
- Escalate the agent to `claude-opus-4-6` only when trust-adjacent work
  still requires a stronger worker after the heavier reasoning/control
  layers and local budget/default checks
- Escalate to premium only for true Tier 3 cases with approval

That means:

- do not run manager on every tiny task
- do use manager for architecture, quality audits, critical reviews,
  and "is this actually good?" checks
- do keep the operator-chosen primary execution environment as the main worker
  surface

## Output Requirement

When choosing a lane, say it explicitly:

- `Quality lane: Q0 / Q1 / Q2 / Q3`
- `Assurance level: A0 / A1 / A2 / A3`
- `Why this lane`
- `Who acts next`
- `Execution owner`
- `Review owner`
- `Approval owner`
- `Whether manager is required`
- `Whether manager preflight is required before launch`
- `Whether manual agent chat or bounded subagent is preferred`
- `Whether one slice or parent + child slices is preferred`
- `Budget posture: conserve / default / premium-approved`

When a lane recommendation changes the worker model above the normal
execution default, say that explicitly and justify the escalation from
local project truth, not from generic system possibility.

For `A2` and `A3` work, require coverage statements at review time using
`orchestration/CLOSEOUT-GATE.md`.

If you cannot name the lane, the routing is not ready yet.

