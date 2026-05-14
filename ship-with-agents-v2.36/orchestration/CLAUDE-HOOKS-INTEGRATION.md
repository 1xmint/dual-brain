# Claude Hooks Integration

How to use Claude Code hooks for deterministic workflow guardrails.

## Why Hooks Matter

Hooks are the strongest Claude-native upgrade because they let you enforce
behavior at the app level instead of hoping the model remembers.

Use hooks for things that should happen every time:

- startup reminders
- path protection
- automatic formatting
- stop-boundary reminders
- compaction reminders

Hooks work best when paired with visible telemetry. Let the statusline show the
live state; let hooks remind, block, or enforce at the action boundary.

## Start Small

Do not begin with a giant hook system.

Start with one or two hooks that solve a repeated real failure, then expand
only if they prove useful.

The shipped baseline now uses exactly that pattern:

- a project `.claude/settings.json`
- a post-edit live-surface path check for operational docs and role cards
- prompt hooks for `Stop` and `SubagentStop`
- a compact health registry under `health/`

That is the default portable baseline. Stronger command hooks can be layered on
later when a repeated failure is concrete enough to justify them.

## Good First Hook Targets

### SessionStart

Good for:

- reminding the session to read local operating files
- reminding the user or model about active workstream state
- prompting a short startup synthesis

### PreToolUse

Good for:

- blocking edits to sensitive directories
- preventing writes outside an allowed scope
- rejecting dangerous shell commands in certain projects

### PostToolUse

Good for:

- running formatters or style checks after edits
- logging important actions

### PreCompact

Good for:

- reminding the session to preserve the active goal and open blockers before
  compaction
- blocking bad compaction attempts when the custom instructions would clearly
  lose the active workstream

### Stop / SubagentStop

Good for:

- reminding the session to checkpoint, report coverage, or surface unfinished
  risk before the loop truly stops

## Settings Locations

Claude Code supports hook configuration in:

- `~/.claude/settings.json`
- `.claude/settings.json`
- `.claude/settings.local.json`

Use project settings for shared team behavior. Use local settings for personal
experiments and private automation.

## Example Pattern

Use the project directory variable so hooks call repo-local scripts safely:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/check-style.sh"
          }
        ]
      }
    ]
  }
}
```

## Recommended Internal Pattern

Use hooks only when the failure is repeated enough that prompt text has already
proven insufficient.

Good candidates:

- start-session reminders to run startup synthesis
- path guards for dangerous repos
- post-edit validation for tightly controlled codebases
- pre-compact reminders when the user repeatedly loses active blockers

## Health Pairing

Hooks are stronger when they can point at compact state instead of guessing.

Use `ORCHESTRATION-HEALTH-MODEL.md` plus the runtime `health/` files to keep:

- pickup truth
- readiness truth
- fanout truth
- top risks

compact enough for future commands and stronger command hooks.

## Hooks Are Not A License To Stop Thinking

Hooks are best for deterministic guardrails, not for replacing judgment.

Use them to enforce:

- "always remind"
- "always block"
- "always run"

Do not expect them to solve:

- product ambiguity
- strategy ambiguity
- complex review judgment

That is still where your workflow, prompts, and assurance routing matter.
