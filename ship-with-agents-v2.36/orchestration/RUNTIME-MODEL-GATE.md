# Runtime Model Gate

Use this gate before giving model, effort, budget, or escalation
guidance.

The system should not guess what runtime it is currently on.

## The Core Distinction

Keep these three things separate:

1. `Current runtime`
   - what model/effort this chat is actually running right now
2. `Project default`
   - what `_agent-system/MODEL-CONFIG.md` says this layer should
     normally use
3. `Recommended next runtime`
   - what model/effort a different or future chat should use next

Also keep these separate from all three:

4. `Support posture`
   - internal UX label like `shipping | guided | teaching`
5. `Thinking mode`
   - vendor runtime mode like `extended thinking` when that exact surface uses
     modes instead of effort
6. `Spawned helper runtime`
   - what model a directly spawned helper/subagent would actually use, if that
     differs from the parent lane or can be overridden separately

Do not collapse those into one statement.

## Step 1: Can This Chat Detect Its Current Runtime?

If the platform exposes current model/effort directly, use it.

Examples:

- Claude Code: `/status`, `/model`, status bar, or statusline telemetry
- other tools: equivalent visible runtime indicator if available

If the runtime is visible, state it explicitly.

Example:

- `Current runtime: claude-opus-4-6 / high`

If the runtime is not actually visible to the chat, do NOT guess.

Say:

- `Current runtime: unknown to this chat`

For Claude Code, the strongest live truth source is a configured statusline
plus `/status` when needed. If you have not configured telemetry, say so
instead of pretending the lane can always feel its own live state.

Do not let internal support posture or explanation depth leak into the runtime
slot. `guided` is not an effort level.

## Step 1b: Handle Spawned Helper Runtime Separately

If you are recommending or launching a directly spawned helper/subagent, do not
assume it shares the project's execution default just because the package says
"execution layer = Sonnet" or similar.

State one of these explicitly:

- `Spawned helper runtime: verified <model> / <effort>`
- `Spawned helper runtime: unknown to this chat`

For Claude Code direct subagents, the model can resolve from:

1. `CLAUDE_CODE_SUBAGENT_MODEL`
2. a per-invocation model parameter
3. the subagent definition's `model`
4. the parent conversation model

Unless local truth verifies one of those sources, do not promise that a direct
helper is cheaper than the parent lane or that it is already on the execution
default. If exact cost or model control matters, recommend a manual terminal
execution lane instead.

If the parent lane is stronger than the configured execution default and the
helper would inherit that stronger runtime, treat that as premium spend rather
than as the normal execution layer. Do not recommend or launch that helper as
routine implementation unless the buyer explicitly approves the stronger spend.

## Step 2: State The Project Default

Read the smallest relevant local truth source first:

- `_agent-system-local/OPERATOR-PREFERENCES.md`
- `_agent-system/ACTIVE-CHAT-MAP.md`
- `_agent-system/MODEL-CONFIG.md`
- repo `AGENTS.md`
- current task packet or handoff
- relevant checkpoint or session log

Then state the default for this layer.

If operator preferences and model config differ:

- operator preferences win
- model config becomes the fallback project default
- say that explicitly

If you are about to emit a launch packet for a higher layer like `super`,
do not silently swap in the cheaper execution default just because it is
available. Launching a super below the saved coordination baseline requires:

- explicit operator/setup truth that the super baseline is lower for this
  installation, or
- an explicit task/session override that says this super should run cheaper

If neither exists, treat the cheaper super launch as drift and correct it
before emitting the packet.

## Step 3: State The Recommendation Separately

If you are recommending a different runtime for a future step, say so
as a recommendation, not as if it is the current truth.

## Step 4: Handle Drift Explicitly

If `current runtime` and `project default` differ:

- say that explicitly
- say whether it is acceptable, intentional, or needs correction

When the current runtime is unknown:

- do not make claims that depend on knowing it
- anchor on project default
- avoid expensive escalation unless local truth and budget posture
  clearly justify it

This gate also helps prevent setup drift when the live lane is actually
running in GPT Desktop, Codex app, Claude terminal, or another pattern
that should be preserved by default.

It also prevents buyer-stated role baselines from being forgotten just because
they were said in chat instead of hardcoded in the prompt.

It also prevents vocabulary drift where the system starts reporting internal UX
labels as if they were vendor runtime controls.

It also prevents direct-helper drift where a spawned helper is casually
described as Sonnet or "the cheap worker" even though the runtime source was
never verified.
