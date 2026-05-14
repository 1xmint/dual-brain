# Claude Code Session Telemetry

Last verified against Anthropic docs: 2026-05-01

How to stop guessing about the current session and start using Claude Code's
actual runtime telemetry.

## Big Idea

If Claude Code is the robot body, session telemetry is how you stop treating it
like a disembodied brain.

The most reliable public mechanism for current-session awareness is the
statusline data Claude Code exposes to local scripts. That data can show the
live session state without asking the model to remember it from earlier turns.

## What Claude Code Officially Exposes

Claude Code's statusline JSON can expose these fields for the current session:

- current model ID and display name
- current effort level when supported by the model
- context window size
- used and remaining context percentage
- current added directories
- session name
- current output style
- cost and duration
- some rate-limit information

That means the system does not need to infer:

- whether the lane is on a 200k or 1M context window
- whether effort is `medium`, `high`, or `max`
- whether extra directories were added with `/add-dir`
- whether the session is getting close to the compaction/rotation zone

## What This Solves

This makes it easier to answer:

- what model am I actually on right now?
- what effort am I actually on right now?
- how full is the current context window?
- is this a normal context session or an extended-context one?
- how close am I to the compaction threshold?

## What It Does Not Solve

Statusline telemetry helps the human and can support deterministic local
tooling, but it is not magic.

It does not automatically mean:

- the model itself always reasons from that telemetry perfectly
- slash commands self-trigger reliably without workflow support
- every provider has an equivalent telemetry surface

That is why the strongest setup is:

1. visible statusline telemetry
2. startup synthesis
3. role-aware compaction policy
4. optional hooks for deterministic reminders or blockers

## Recommended Claude-Native Setup

### 1. Use `/statusline`

Use `/statusline` to create a persistent session display that shows at least:

- model
- effort
- context percent
- context window size
- session name

Even better, color the statusline by lane so parallel chats are scannable:

- head lanes in one color
- super lanes in another
- execution agents in another
- brainstorm lanes in another

That gives you a quick "which lane am I looking at?" cue without reading the
whole line every time.

If you want the quickest setup, tell Claude Code exactly what you want:

```text
/statusline show model, effort, context percentage, context window size, and session name
```

### 2. Use a script when you want more control

This package ships example statusline scripts:

- `templates/claude-statusline.example.sh`
- `templates/claude-statusline.example.ps1`

Adapt them to your own settings.

The examples are a good starting point if you want:

- role-colored lanes
- visible named sessions
- live model and effort
- live context pressure

### 3. Tune automatic compaction on purpose

Claude Code also exposes documented environment variables for earlier
auto-compaction:

- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW`

Use them when you want the session to compact earlier than the default
approximately-95% behavior.

Practical examples:

- use `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=60` when you want auto-compaction to
  happen around 60% of the configured window
- on a 1M-context model, use `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` if you
  want compaction math to behave like a 500K window instead of waiting for the
  full 1M

These are strong knobs. Lower values reduce drift risk, but they also compact
more often. Start conservative and adjust based on real work.

### 4. Treat statusline as the source of live session truth

Use the statusline or `/status` for live runtime state.

Use package docs for:

- what to do with that state
- when to compact
- when to rotate
- when to add todos
- when to escalate assurance

### 5. Pair telemetry with hooks, not with fantasy

The cleanest operating pattern is:

1. statusline shows the live truth
2. startup synthesis turns that truth into a plan
3. hooks remind or block at the important boundaries
4. `/compact` is used deliberately with focus instructions

Color is helpful, but keep the hierarchy straight:

- statusline and `/status` are the runtime truth
- color is the convenience layer that makes that truth faster to scan

This is much more robust than hoping Claude will magically infer all of that
from raw session feel.

## Package Compaction Defaults

The package's compaction defaults are intentionally earlier than "the chat is
already clearly bad."

### Coordination lanes

Head, manager, and super should usually:

- review compaction earlier, around the mid-30% to mid-40% range if multiple
  workstreams or unresolved decisions are accumulating
- compact or rotate decisively if the lane is both context-heavy and clarity-
  degraded

### Execution lanes

Agents and workers should usually:

- review compaction in the 45% to 60% range
- compact before verbose investigation, logs, or broad file reads bury the real
  task
- rotate rather than compact when the session is no longer the right container

These are package heuristics, not provider guarantees. The real trigger is a
mix of:

- context telemetry
- role
- number of active workstreams
- salience of open blockers

## Practical Autocompact Defaults

There is no one perfect number, but these are honest starting points:

- `50` to `60` for head, manager, and super lanes that carry multiple
  workstreams or lots of packet/review state
- `60` to `70` for execution lanes that mostly stay on one workstream
- keep the default only if your sessions stay coherent and you are not seeing
  drift

If you do not know where to start:

- coordination-heavy lane: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=55`
- execution-heavy lane: `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=65`

Then adjust based on whether compaction is helping or happening too early.

## Suggested Color Pattern By Lane

You do not need this exact mapping, but it works well:

- head: bright cyan or blue
- super: magenta or purple
- manager: yellow
- agent or worker: green
- brainstorm: light magenta or orange

Use stable colors so lane recognition becomes muscle memory.

## 1M Context Rule

Do not multiply your compaction thresholds by five just because the model can
hold 1M context.

Extended context buys you:

- later token-pressure compaction
- more room for one coherent problem

It does not buy you:

- infinite salience
- permission to mix every workstream together forever

The safe rule is:

- raise hard token thresholds somewhat
- keep clarity triggers just as real

## Hooks Pair Well With Telemetry

Hooks can reinforce the telemetry rather than replace it.

Good combinations:

- `SessionStart` hook reminds the lane to run startup synthesis
- `PreCompact` hook reminds the lane what to preserve
- statusline keeps model, effort, and context pressure visible at all times
- `Stop` or `SubagentStop` hook blocks closeout until a checkpoint or coverage
  statement exists

See:

- `_agent-system/CLAUDE-HOOKS-INTEGRATION.md`
- `_agent-system/COMPACTION-CADENCE-LOOP.md`
- `_agent-system/CONTEXT-TAX-HEURISTIC.md`

## Recommended Reading

- `CLAUDE-CODE-POWER-FEATURES.md`
- `_agent-system/STARTUP-SYNTHESIS-GATE.md`
- `_agent-system/ROLE-AWARE-COMPACTION.md`
- `_agent-system/COMPACTION-CADENCE-LOOP.md`
- `_agent-system/CONTEXT-TAX-HEURISTIC.md`
- `_agent-system/TODO-POLICY.md`
- `_agent-system/CLAUDE-HOOKS-INTEGRATION.md`
