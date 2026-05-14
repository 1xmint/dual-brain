# CLAUDE.md

Project memory file for Claude Code. This file is auto-loaded when Claude Code
starts in this directory.

Use this for Claude Code-specific preferences and configuration. For universal
repo memory such as branch truth, merge conventions, deploy rules, and
stop-and-ask lists, use `AGENTS.md`.

Keep this file short. If Claude needs more detail, use:

- `.claude/commands/` for repeated workflows
- `.claude/rules/` for modular behavior rules
- `SPEC.md`, `PLAN.md`, and `STATUS.md` for current work truth

## Project Overview

`<one-sentence description of what this project is>`

## Tech Stack

- Language: `<language>`
- Framework: `<framework>`
- Database: `<database>`
- Package manager: `<package-manager>`
- Test runner: `<test-runner>`

## Common Commands

```text
# Build
<build-command>

# Test
<test-command>

# Lint
<lint-command>

# Type check
<typecheck-command>
```

## Code Style

- `<naming convention>`
- `<import ordering preference>`
- `<framework-specific patterns to follow>`

## Project Structure

- `<src/ - application source>`
- `<tests/ - test files>`
- `<docs/ - documentation>`
- `<other key directories>`

## What Not To Touch

- `<paths or files the agent should not modify without asking>`
- `<generated files, vendor directories, lock files>`

## Session Preferences

- Prefer small, focused changes over large rewrites.
- Run tests after code changes.
- Ask before modifying configuration files, CI pipelines, or deployment scripts.
- Prefer a thin hot path plus separate task docs over one giant memory file.

## Useful Claude-Native Surfaces

- `.claude/commands/` for reusable project commands
- `.claude/rules/` for modular instruction files
- `.claude/agents/` for role-specific startup files
- `.claude/settings.json` or `.claude/settings.local.json` for hooks and other
  shared configuration

## See Also

- `AGENTS.md` - canonical repo memory
- `SPEC.md`, `PLAN.md`, `STATUS.md` - current work memory stack
