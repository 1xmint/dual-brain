# Claude Code — Quick Reference

Last verified: 2026-04-30
This file goes stale. When in doubt, check https://docs.anthropic.com
or run `claude --help` and `/model` in a live session.

---

## Available Models

| Model | Model ID | Best For |
|---|---|---|
| Opus 4.7 | `claude-opus-4-7` | Most capable. Complex agentic coding, long-horizon autonomy, deep investigation |
| Opus 4.6 | `claude-opus-4-6` | Deep reasoning, 1M context window (beta). Codebase refactoring, multi-agent coordination |
| Sonnet 4.6 | `claude-sonnet-4-6` | Best cost/performance ratio. Bug detection, general coding |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Fastest, cheapest. Quick lookups, cost-sensitive work |

**Always use full model ID strings in launch commands.** Short aliases
(`opus`, `sonnet`) resolve to the latest version and change over time.
Example: `--model opus` now resolves to 4.7, not 4.6.

## Effort Levels

| Level | Effect | Use When |
|---|---|---|
| `low` | Minimal thinking. Fastest, cheapest | Simple/routine tasks, quick lookups |
| `medium` | Moderate thinking. Balanced | Mechanical work with clear specs |
| `high` | Deep reasoning. **Default for Opus 4.6 and Sonnet 4.6** | Strategy, coordination, coding, most real work |
| `xhigh` | Between high and max. **Default for Opus 4.7 only.** Other models fall back to high | Complex tasks on Opus 4.7 |
| `max` | Maximum thinking budget. Deepest reasoning. Slowest, most expensive | Hardest problems, security, architecture decisions |

**`auto` is NOT an effort level.** There is no auto-selection by task
complexity as of this date.

**How to set effort:**
- `--effort <level>` at launch
- `/effort` slash command (interactive slider)
- `/model` picker (arrow keys adjust effort)
- `CLAUDE_CODE_EFFORT_LEVEL` environment variable
- `effort` frontmatter in custom skills/slash commands

## CLI Flags

| Flag | Description |
|---|---|
| `--model <id>` | Set model (full ID or alias) |
| `--effort <level>` | Set effort level |
| `--agent <name>` | Launch with a custom agent definition from `.claude/agents/` |
| `-n <name>` | Name the session |
| `-p`, `--print` | Non-interactive one-shot mode |
| `-c`, `--continue` | Continue most recent conversation |
| `-r`, `--resume <id>` | Resume a specific session by ID |
| `--verbose` | Verbose logging |
| `--bare` | Minimal headless mode (no hooks/LSP/plugins) |
| `--max-turns <n>` | Limit conversation turns |
| `--output-format <fmt>` | json, text, stream-json |
| `--permission-mode <mode>` | default, acceptEdits, plan, dontAsk, bypassPermissions |
| `--add-dir <path>` | Add additional project directories |
| `--append-system-prompt <text>` | Append to system prompt |
| `--system-prompt <text>` | Replace system prompt |
| `--system-prompt-file <path>` | Load system prompt from file |
| `--allowedTools <tools>` | Pre-approve specific tools |
| `--mcp-config <path>` | Add MCP server configuration |

## Slash Commands (In-Session)

| Command | What It Does |
|---|---|
| `/model` | Model picker — switch model, adjust effort with arrow keys |
| `/effort` | Effort slider — arrow-key navigation between levels |
| `/fast` | Toggle fast mode on/off |
| `/compact` | Summarize conversation to reclaim context |
| `/clear` | Wipe conversation, start fresh |
| `/config` | Open configuration panel |
| `/agents` | Manage custom Claude Code subagents |
| `/memory` | Edit CLAUDE.md memory files |
| `/review` | Request code review |
| `/pr_comments` | View pull request comments |
| `/add-dir` | Add another working directory during the session |
| `/output-style` | Switch output style |
| `/status` | Show current session info (model, context, etc.) |
| `/help` | Show available commands |

## Agent Mode

**How it works:** `claude --agent <name>` loads a custom agent
definition from `.claude/agents/<name>.md`. The agent file is a
markdown file with optional YAML frontmatter that can set model,
effort, allowed tools, and system prompt content.

**Where definitions live:** `.claude/agents/` in your project root.

## Native Workflow Features

- Built-in todos (`TodoWrite`) are best for non-trivial multi-step work.
- `/compact` is a clarity tool, not only a last-second memory tool.
- Hooks can enforce deterministic workflow rules at session or tool boundaries.
- `/memory` plus settings files are better than relying only on ad hoc startup
  reminders.
- Output styles are useful for explanatory or learning-oriented sessions.
- A short `CLAUDE.md` plus modular `.claude/commands/`, `.claude/rules/`, and
  `.claude/agents/` usually scales better than one giant memory file.

See also:

- `../CLAUDE-CODE-POWER-FEATURES.md`
- `STARTUP-SYNTHESIS-GATE.md`
- `ROLE-AWARE-COMPACTION.md`
- `TODO-POLICY.md`
- `CLAUDE-HOOKS-INTEGRATION.md`

## Fast Mode

- Toggle with `/fast` in-session
- On Opus 4.6: uses Opus 4.6 with faster output — does NOT
  downgrade to a smaller model
- Useful for rapid iteration on understood problems

## Checking Current Model/Effort

- `/model` - shows current model and effort, lets you adjust
- `/status` - shows session info
- Status bar at bottom of terminal - shows model, effort, context usage
- `/statusline` - generate or update a persistent telemetry display

For stronger long-session discipline, also read:

- `../CLAUDE-CODE-SESSION-TELEMETRY.md`

## Pricing Tiers

| Tier | Price | Claude Code | Models |
|---|---|---|---|
| Free | $0 | Limited | Basic model access |
| Pro | $20/mo | Yes | Opus 4.6, Sonnet 4.6, Haiku 4.5 |
| Max 5x | $100/mo | Yes, 5x usage | All models including Opus 4.7 |
| Max 20x | $200/mo | Yes, 20x usage | All models including Opus 4.7 |
| Team | Per-seat | Premium seats | Sonnet 4.6, Opus 4.7 |
| Enterprise | Custom | Premium seats | All models + advanced admin |

## Platforms

| Platform | Experience |
|---|---|
| **Terminal (CLI)** | Full feature set. All flags, slash commands, agent mode, hooks, MCP, routines |
| **VS Code / Cursor / Windsurf** | Native extension. Inline editing in IDE |
| **JetBrains** | Native extension |
| **Desktop App (Mac/Windows)** | Runs multiple Claude Code tasks in parallel |
| **Web (claude.ai/code)** | Browser-based access |

## Model x Effort Decision Matrix

| Task Type | Recommended Model | Effort |
|---|---|---|
| Strategy, architecture, brainstorming | Opus 4.6+ | high or max |
| Coordination (super) | Opus 4.6 | high |
| Standard coding, features, refactors | Sonnet 4.6 | high |
| Security, auth, crypto, trust | Opus 4.6+ | high or max |
| Mechanical work (renames, docs, formatting) | Sonnet 4.6 | medium |
| Quick lookups, simple fixes | Haiku 4.5 or Sonnet 4.6 | low or medium |
| Prompt authoring for downstream layers | Opus 4.6 | high |

## Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_MODEL` | Default model for all sessions |
| `CLAUDE_CODE_EFFORT_LEVEL` | Default effort level |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | What `sonnet` alias resolves to |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | What `opus` alias resolves to |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | What `haiku` alias resolves to |
| `ANTHROPIC_BASE_URL` | Redirect to local/proxy API endpoint |
