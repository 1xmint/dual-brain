# Model Configuration

Fill this out once during setup. Every prompt and START file reads
this to determine which models to use at each layer.

Also read `orchestration/OPERATOR-PREFERENCES.md` for durable user/operator truth that
should outrank generic defaults.
Also read `orchestration/OPERATOR-ORCHESTRATION-PROFILE.md` when workflow shape depends
on the operator's actual surfaces, subscriptions, or appetite for extra lanes.

## How to fill this out

Pick the strongest model you have access to for strategy work, and
the most cost-effective model for execution work. If you only have
one model, use it for everything.

## Your Setup

Treat this section as local operator truth, not package-wide law. Replace the
platform and launch examples with the actual runtime your installation uses.

### Budget policy (internal only)
- Budget envelope: ChatGPT/Codex subscription + Claude Max 5x ($100 + $100)
- Default premium ceiling: `claude-opus-4-7` is available but NOT the default
- Default strategy/coordination/research ceiling: `claude-opus-4-6`
- Premium escalation rule: use `claude-opus-4-7` only when the task is truly
  Tier 3 (novel/critical), the expected rework cost is higher than the model
  cost, and the user approves the escalation for that task
- Default bias: if `claude-opus-4-6` is sufficient, stay on it

### Strategy layer (head, manager)
- Platform: GPT/Codex desktop app by default for live review/strategy lanes
- Model: strongest available app-lane review model
- Launch: preserve the live app lane by default; if moved to Claude terminal,
  use `claude-opus-4-6 --effort high`
- Notes: Do not flatten app-lane strategy defaults into generic terminal
  assumptions. Keep any app-specific runtime control separate from the model
  line; if the current app setting is not visibly surfaced, treat it as
  unknown. Do not escalate to Opus 4.7 by default.

### Coordination layer (super)
- Platform: operator-chosen repo-connected coordination runtime (currently
  Claude Code terminal in this live setup)
- Model: claude-opus-4-6
- Launch example: `claude --agent super --model claude-opus-4-6 --effort high -n s<N>`
- Notes: Same model as strategy - coordination decisions cascade downstream.
  Prefer stable high-quality defaults over premium-by-default escalation.

### Execution layer (agent, worker)
- Platform: operator-chosen repo-connected execution runtime (currently Claude
  Code terminal in this live setup)
- Model: claude-sonnet-4-6
- Launch example: `claude --agent agent --model claude-sonnet-4-6 --effort high -n s<N>-<workstream>`
- Notes: This is the default heavy-lifting execution layer. Keep most
  implementation here. Escalate to claude-opus-4-6 for
  security/auth/crypto/high blast radius only when the stronger worker
  model is still justified after local truth and budget-posture checks.

### Research layer (brainstorm)
- Platform: operator-chosen research/runtime surface (currently Claude Code
  terminal in this live setup)
- Model: claude-opus-4-6
- Launch example: `claude --model claude-opus-4-6 --effort high`
- Notes: Brainstorms need strong reasoning, but that means Opus 4.6 by
  default, not automatic Opus 4.7.

## Preference Memory Rule

Before recommending or emitting a launch command, read in this order:

1. task- or slice-specific override
2. `orchestration/OPERATOR-PREFERENCES.md`
3. this file
4. `orchestration/RUNTIME-MODEL-GATE.md`
5. `orchestration/LAUNCH.md` when the packet wants a prompt file

Use this file for system defaults.
Use operator preferences for durable user voice.
Use slice or handoff overrides for one specific lane or phase.

## Buyer-Facing Dispatch Rule

Higher-cost coordination lanes should think, review, route, and explain.
Lower-cost execution lanes should build by default once direction is clear.

When a recommendation would hand work to another lane or launch a worker:

1. state the worker model and effort plainly
2. say why the configured execution default is sufficient, or why it is not
3. if the current higher-cost lane is keeping the work, say why the work is
   still coordination/review rather than normal implementation

Do not make the buyer infer model economics from hidden package defaults.

## Direct Helper Runtime Truth

Keep terminal-launched execution and directly spawned helpers separate.

- A manual terminal agent launch can pin model and effort explicitly in the
  launch command.
- A directly spawned helper or subagent is runtime-specific. Do not present it
  as "the Sonnet execution layer" unless local truth or runtime controls verify
  that.
- In Claude Code specifically, subagent model resolution can come from
  `CLAUDE_CODE_SUBAGENT_MODEL`, a per-invocation model override, the subagent
  definition's `model`, or finally the parent conversation model.
- If that chain is not verified in the current setup, say so plainly.
- If exact model economics matter, prefer a manual terminal execution lane over
  a direct spawned helper.
- If the helper would inherit a stronger parent model or the helper runtime is
  still unknown while the configured execution default is cheaper, do not use
  that helper as the normal implementation path. Either launch a manual
  terminal execution lane pinned to the configured execution model or ask the
  user for explicit approval to spend the stronger helper runtime.

## Effort Levels

See `orchestration/claude-info.md` for the full reference. Summary:

- **max**: Maximum thinking. Hardest problems, security-critical
  architecture. Slowest, most expensive.
- **xhigh**: Between high and max. Default for Opus 4.7 only - other
  models fall back to high.
- **high**: Deep reasoning. Default for Opus 4.6 and Sonnet 4.6. Use
  for strategy, coordination, coding, brainstorms, security, auth,
  crypto, trust, migrations, ambiguous specs, complex refactors.
- **medium**: Moderate thinking. Use for mechanical work with clear
  specs - renames, docs, test additions, reformatting.
- **low**: Minimal thinking. Quick lookups, trivial fixes. Medium is
  the recommended floor for real work.

**Note:** `auto` is NOT an effort level. There is no auto-selection.

If your platform doesn't support effort levels, ignore this section.

## Chat Self-Assessment

Every chat should check on startup:

1. Am I running the model/effort my layer requires? (Check the
   Your Setup section above.)
2. Is the prompt I received appropriately sized? Large prompts
   (200+ lines) need high effort minimum.
3. If I'm being asked to author prompts for downstream layers,
   I need high effort - prompt quality matters.
4. Am I about to recommend a premium model just because it exists?
   If yes, stop and justify why the configured default is insufficient.

If mismatched, say so before proceeding. Example: "I'm running
Sonnet at medium effort. This architecture task needs Opus at high.
Recommend: restart with `claude --model claude-opus-4-6 --effort high`"

For current model capabilities and effort level details, see
`orchestration/claude-info.md` and `orchestration/gpt-info.md`.

## Effort Tuning Within a Session

You can change effort mid-session with `/effort` or `/model`.

- **Start high** for understanding the problem, reading large inputs,
  and authoring downstream prompts
- **Tune down to medium** for mechanical execution after the problem
  is understood
- **Tune back up** when you hit unexpected complexity

The user can set effort at launch and adjust later. See
`orchestration/claude-info.md` for all available methods (CLI flag, slash
command, env var, skill frontmatter).

## Model Selection Principles

1. Pick the cheapest model that is still safe for the job.
2. Quality wins over cost, but token efficiency is part of quality.
3. Use stronger models when the task changes direction, trust, or
   architecture - or when a wrong call would be expensive to fix.
4. Use cheaper models when the task packet is clear, file scope is
   bounded, and done criteria are explicit.
5. If you only have access to one model, that's fine - the system
   works with any capable model. Adjust effort expectations to match
   your model's capabilities.
6. If a stronger coordination lane is recommending or launching execution, it
   should disclose why the work is dropping to the execution default and
   justify any stronger worker escalation.

## Model Decision Protocol

The super and agents read this section on startup to make runtime
model decisions. This supplements the static configuration above
with dynamic selection logic.

Also read `orchestration/references/QUALITY-ROUTING-GATE.md` when deciding not just
which model to use, but which quality lane and layer flow the task
should follow.

Also read `orchestration/RUNTIME-MODEL-GATE.md` before claiming what model or
effort a chat is currently on. Distinguish current runtime, project
default, and recommended next runtime.

### Decision Inputs

Evaluate these four signals before choosing a model for a task:

1. **Task risk** - Does this task touch security, auth, crypto,
   trust, money, or user data? Higher risk -> stronger model.
2. **Spec clarity** - Is the task packet clear with explicit done
   criteria, or is it ambiguous/underspecified? Ambiguity ->
   stronger model for reasoning. Clear spec -> cheaper model is safe.
3. **User budget signal** - Has the user indicated budget
   constraints? ("conserve tokens", "I'm on free tier") or budget
   freedom? ("use Opus for everything", "I have credits to burn")
   Respect the signal. Subscription access is NOT budget freedom by
   itself. Having access to Opus 4.7 does not make it the default.
4. **Task type** - Research/architecture/brainstorming needs strong
   reasoning. Mechanical work (renames, docs, reformatting) needs
   reliable execution, not deep reasoning.

### Escalation Tiers

- **Tier 0 - Mechanical:** Clear spec, bounded scope, no trust
  implications. Use cheapest safe execution model + medium effort.
  Examples: file renames, doc formatting, adding test stubs from a
  pattern, bulk search-and-replace.

- **Tier 1 - Standard development:** Some ambiguity, moderate scope,
  no trust implications. Use execution model + high effort.
  Examples: new feature with clear requirements, refactoring with
  known patterns, writing docs from existing code.

- **Tier 2 - Trust-adjacent:** Security, auth, crypto, trust model,
  migrations, financial logic, or anything where a wrong
  implementation could compromise users. Use strongest safe default
  model + high effort. Examples: auth middleware, token validation,
  database migrations, API key handling, payment flows.

- **Tier 3 - Novel/critical:** Novel architecture, protocol design,
  safety-critical systems, or work that sets precedent for the
  entire project. Use premium model (if available) + high effort.
  **Requires explicit user permission** - ask first, state the
  reason, wait for approval. Examples: designing a new trust
  protocol, cryptographic scheme selection, system architecture
  decisions that cannot be easily reversed.

**Default premium policy:** Premium models are opt-in escalation tools,
not ambient defaults. For this system, `claude-opus-4-6` is the
default strategy/coordination/research ceiling unless the user
approves a Tier 3 exception.

### Runtime Overrides

The user can override model selection at any time by telling the
super or manager. Examples:

- "Use Opus for everything tonight" -> all agents use strongest model
- "I'm on free tier, use the cheapest models possible" -> all agents
  use execution model + medium effort, accept reduced quality
- "This is security-critical, escalate to Tier 2" -> current and
  subsequent agents use strongest model
- "Go back to defaults" -> revert to MODEL-CONFIG.md static config

The override lasts for the current session. Next session reverts to
`orchestration/OPERATOR-PREFERENCES.md` defaults unless the user restates the override
or the durable preference file is updated.

Supers: when an override is active, note it in every agent
deployment prompt so agents know the current policy.

## Example Configurations

### Claude Pro ($20/mo) - Sonnet everywhere
- Strategy: claude-sonnet-4-6 (desktop app)
- Super: claude --model claude-sonnet-4-6 --effort high
- Agent: claude --model claude-sonnet-4-6 --effort high
- Brainstorm: claude --model claude-sonnet-4-6 --effort high

Use this only when Sonnet is genuinely the strongest coordination model
available in the installation. Do not borrow this example for an Opus-backed
setup that still has a stronger saved super baseline.

### Claude Max / Team - Opus for strategy, Sonnet for execution
- Strategy: claude-opus-4-6 (desktop app)
- Super: claude --model claude-opus-4-6 --effort high
- Agent: claude --model claude-sonnet-4-6 --effort high
- Brainstorm: claude --model claude-opus-4-6 --effort high

### OpenAI - GPT for strategy, Codex for execution
- Strategy: gpt-4o (ChatGPT desktop)
- Super: [use ChatGPT or Codex terminal]
- Agent: [Codex terminal]
- Brainstorm: gpt-4o (ChatGPT desktop)

### Local - Ollama + Claude Code redirect
- Strategy: Qwen3.5-35B via Continue (VS Code)
- Super: claude --model local-model (via ANTHROPIC_BASE_URL)
- Agent: claude --model local-model (via ANTHROPIC_BASE_URL)
- Brainstorm: Qwen3.5-35B via Continue

### Mixed - GPT for strategy, Claude for execution
- Strategy: gpt-4o (ChatGPT desktop)
- Super: claude --model claude-opus-4-6 --effort high
- Agent: claude --model claude-sonnet-4-6 --effort high
- Brainstorm: gpt-4o (ChatGPT desktop)

Even in mixed-provider setups, do not silently de-escalate the coordination
layer onto the cheaper execution model. If a super is going to run on Sonnet
instead of the saved coordination baseline, that should come from explicit
setup truth or an explicit task/session override, not from cost reflex.

## Escalation and De-escalation Signals

**Escalate (recommend stronger model/higher effort) when:**
- Task exceeds bounded scope - touches >10 files or multiple subsystems
- You're unsure about the correct approach
- The task touches security, auth, crypto, trust
- You're authoring prompts that will govern other agents

**De-escalate (recommend cheaper model/lower effort) when:**
- The task is mechanical with no judgment calls
- You're following an explicit pattern from another file
- The scope is bounded to 1-3 files with clear done criteria

**How to escalate:** Tell the user: "This task exceeds Tier [N].
Recommend restarting with [model] at [effort], or escalating to
[role]."

## Platform-Specific Guidance

For detailed model capabilities, pricing, and platform features, see
`orchestration/claude-info.md` and `orchestration/gpt-info.md`. Those files are the
single source of truth - when details change, update the info files.

### Claude Code only (terminal)
- Head/Manager: configured strategy model at high effort
- Super: configured coordination model at high effort
- Agent: cost-effective model at high effort
- Brainstorm: configured research model at high effort

### Desktop + Terminal (dual-brain)
- Head/Manager: Desktop app (Claude Desktop or ChatGPT) for strategy
- Super/Agent: Claude Code terminal for execution
- Brainstorm: Either - desktop for freeform, terminal for code-adjacent

### Desktop only
- All layers run in desktop app
- Orchestration prompts pasted manually
- No --agent, --effort, or -n flags available
- Use START files as paste-in prompts

### Local models
- See `orchestration/claude-info.md` for ANTHROPIC_BASE_URL redirect
- See `orchestration/gpt-info.md` for Codex CLI and local GPT options
- 70B+ for strategy layers, 30B+ for execution
- Tool-use support required


