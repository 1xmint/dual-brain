# Quick Reference

Command card for operating your AI tools. Scan for what you need; no need to
read top to bottom.

For troubleshooting: `TROUBLESHOOTING.md`.
For applying the system in Cursor/Copilot/other tools:
`TOOL-TRANSLATION-GUIDE.md`.
For cost control: `COSTS.md`.
For surface-specific compact / rotate / resume behavior:
`SURFACE-COMPACTION-AND-RESUME.md`.
For the canonical compact / rotate / checkpoint / closeout rhythm:
`orchestration/COMPACTION-CADENCE-LOOP.md`.
For install and health-check shortcuts: `bootstrap/README.md`.
For what healthy first-week usage looks like: `FIRST-WEEK-PLAYBOOK.md`.
For persona-based fast starts: `QUICK-PATHS.md`.
For the exact first half hour after install: `FIRST-30-MINUTES.md`.

---

## Claude Code (terminal)

### Session control

| Command | What it does |
|---------|-------------|
| `claude --model <id> --effort <level> -n <name>` | Start a named session with specific model and effort |
| `claude --resume` | Resume the most recent session |
| `claude --continue` | Continue the last session flow |
| `claude --agent <role> --model <id> --effort <level> -n <name>` | Start as a specific agent role |
| `claude --add-dir <path>` | Add another working directory at launch for cross-repo work |
| `/clear` | Clear conversation history |
| `/compact` | Compact context with a focus summary when clarity degrades |
| `/statusline` | Generate or update a custom statusline script |
| `/status` | Show current session information |
| `/help` | Show the live built-in and custom command list |
| `Ctrl+C` | Cancel the current generation |
| `Escape` | Cancel current input |
| Up arrow | Recall the last thing you typed |

### Model and effort

| Command | What it does |
|---------|-------------|
| `/model` | Show current model (no args) |
| `/model claude-opus-4-6` | Switch to Opus |
| `/model claude-sonnet-4-6` | Switch to Sonnet |
| `/effort low` | Set low effort |
| `/effort medium` | Set medium effort |
| `/effort high` | Set high effort |

Use full model IDs: `claude-opus-4-6`, `claude-sonnet-4-6`,
`claude-haiku-4-5`.

### Cost and runtime awareness

| Command / setting | What it does |
|---------|-------------|
| `/cost` | Session cost breakdown + cache hit rate |
| `/status` | Quick live session info |
| `/statusline` | Generate a persistent model/effort/context display |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=55` | Example earlier autocompact threshold for coordination lanes |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=65` | Example earlier autocompact threshold for execution lanes |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` | Example "treat 1M like 500K" compaction math |

Compact / resume posture:

- this is the strongest native automation surface in the pack
- use `/compact` when clarity degrades, not only when context is nearly full
- use `claude --resume`, `claude --continue`, or `/resume` for clean pickup
- use hooks and statusline telemetry when you want the lane to self-manage

For the full setup, read `CLAUDE-CODE-SESSION-TELEMETRY.md`.

Tip: use named sessions plus a colored `/statusline` to make heads, supers,
agents, and brainstorm lanes easy to spot in parallel terminal tabs.

### Native workflow tools

| Command | What it does |
|---------|-------------|
| `/agents` | Manage and invoke Claude Code subagents |
| Project or user slash commands | Save repeatable prompts in `.claude/commands/` or `~/.claude/commands/` |
| `/memory` | Edit CLAUDE.md memory files |
| `/review` | Request code review |
| `/pr_comments` | View pull request comments |
| `/add-dir` | Add another working directory during the session |
| `/config` | Edit settings, permissions, and some local configuration |
| `/doctor` | Check Claude Code installation health |
| `/mcp` | Manage MCP servers and auth |
| `/permissions` | Review or change Claude Code permissions |
| `/terminal-setup` | Install Shift+Enter newline support in supported terminals |
| `/vim` | Enter vim input mode |
| `/output-style explanatory` | Switch to an explanatory style |
| `/output-style learning` | Switch to a learning-oriented style |

For when to use these instead of prompt-only workarounds, read
`CLAUDE-CODE-POWER-FEATURES.md`.

If you copy the orchestration package into `_agent-system/`, you can also copy
the example project commands in `_agent-system/.claude/commands/` and adapt:

- `/new-slice`
- `/review-slice`
- `/launch-slice`
- `/close-slice`

### Persistent settings

Location: `~/.claude/settings.json`

Set a default model:

```json
{ "model": "claude-sonnet-4-6" }
```

Example statusline setup:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 2
  }
}
```

For role-colored examples, see:

- `templates/claude-statusline.example.sh`
- `templates/claude-statusline.example.ps1`

---

## ChatGPT / OpenAI

### Desktop app

- Switch models from the model picker.
- Use the app for strong strategy, review, and durable app-lane continuity.
- Do not assume terminal-style compact controls unless the docs for your
  surface explicitly say so.

### Codex app

- Durable continuity: project threads and thread automations
- Live status: `/status`
- Treat the app as thread-centric first
- Continue the same thread when it still matches the job
- Start a fresh thread when the lane changes phase or stops being one coherent
  problem
- Keep the app lane as strategy/review unless it is also your real execution
  surface

### Codex (terminal)

| Command | What it does |
|---|---|
| `codex` | Start a Codex terminal session |
| `/compact` | Compact context manually |
| `/resume` | Resume a previous session |
| `/new` | Start a fresh session |
| `/fork` | Fork the current conversation |
| `/side` | Open a focused side conversation |

Useful config keys:

- `model_auto_compact_token_limit`
- `model_context_window`

Compact / resume posture:

- strong native fit for compact + resume automation
- use `/side` or `/fork` for detours instead of polluting the main lane
- tune autocompact earlier when quality matters more than maximum thread length
- start lightweight before you earn orchestration

### Checking quota

Settings -> Usage or Billing. If maxed, switch to a different provider if you
have one configured in `orchestration/MODEL-CONFIG.md`.

---

## Claude desktop / claude.ai / Claude app

- Treat this as an app/thread lane, not a Claude Code terminal clone
- Preserve coherent planning or review threads while they still match the job
- Rotate with a migration packet when the thread becomes mixed or changes phase
- Do not assume terminal `/compact` controls unless you have verified them

---

## Cursor / Copilot / Windsurf

These are IDEs with built-in AI, not standalone terminals.

- Model selection lives in tool settings and changes by product/version.
- There is usually no effort dial; model choice and prompting are the levers.
- Apply the orchestration concepts through repo memory files and separate
  strategy vs execution lanes.
- First honest move: add `AGENTS.md`, add the tool memory file, and do one
  bounded task before adding more system.

See `TOOL-TRANSLATION-GUIDE.md`.

---

## Replit Core

- Best as an optional cloud sandbox, demo, publish, auth, or database lane
- Keep local package docs as canonical truth
- Use one bounded handoff, not vague cloud wandering
- Write results back into local checkpoint / closeout truth

Read:

- `REPLIT-INTEGRATION.md`
- `REPLIT-COST-GATE.md`
- `START-REPLIT-SANDBOX.md`
- `templates/REPLIT-HANDOFF-TEMPLATE.md`
- `REMOTE-SESSION-BRIDGE.md`
- `templates/REMOTE-SESSION-HANDOFF.md`

---

## Local model setup (Aider, Continue.dev, Ollama)

### Aider

```text
aider --read AGENTS.md
```

Aider loads `AGENTS.md` as read-only context every turn.

### Continue.dev

Type `@AGENTS.md` in the Continue chat to pull repo memory into context.

### Ollama / LM Studio / local OpenAI-compatible APIs

Paste `AGENTS.md` as system prompt or first message. If the model serves an
OpenAI-compatible API, you can redirect Claude Code:

```text
ANTHROPIC_BASE_URL=http://localhost:11434/v1 claude
```

Quality depends heavily on model size. For orchestration roles, use the
strongest model available. For bounded agent tasks, smaller models can work.

Full details: `TOOL-TRANSLATION-GUIDE.md` and `PLATFORM-SETUP.md`.

---

## Terminal basics

### Keyboard shortcuts

| Shortcut | In terminal | In editor |
|----------|------------|-----------|
| `Ctrl+C` | Cancel / interrupt | Copy |
| `Ctrl+Shift+C` | Copy (Windows/Linux) | - |
| `Ctrl+Shift+V` | Paste (Windows/Linux) | - |
| `Cmd+C` / `Cmd+V` | Copy / Paste (Mac) | Same |
| `Ctrl+A` | Go to start of line | Select all |
| `Ctrl+E` | Go to end of line | - |
| `Ctrl+U` | Clear the current line | - |
| `Ctrl+L` | Clear the screen | - |
| Up arrow | Recall previous command | - |
| Tab | Autocomplete file/command names | - |

### Running parallel chats

Each Claude Code or Codex session runs in its own terminal tab. Name sessions
with `-n` so you can tell them apart.

---

## Common questions

**How do I switch my AI model?**  
Claude Code: `/model claude-sonnet-4-6`. Desktop apps: model dropdown.

**How do I see what I am spending?**  
Claude Code: `/cost`. Desktop apps: Usage or Billing pages.

**How do I stop the AI mid-response?**  
Terminal: `Ctrl+C`. Desktop apps: Stop button.

**Should I compact or rotate?**  
Check `SURFACE-COMPACTION-AND-RESUME.md`. Terminal Claude/Codex lanes have
stronger documented compact/resume controls; app lanes often want cleaner
thread rotation instead.

**The AI forgot what we were talking about.**  
Confirm current model/runtime truth, then use the right primitive for the
surface: compact, resume, or migrate from a checkpoint.

**How do I start a new chat for a different task?**  
Open a new terminal tab and run a new command, or start a new app thread/chat.

---

## Error recovery

| What happened | What you see | What to do |
|---|---|---|
| Rate limit hit | Capacity or rate-limit error | Wait for reset or switch provider |
| Wrong model | Unexpectedly slow, expensive, or weak | Check current model and switch |
| Wrong effort | Over-thinking simple tasks or shallow on hard ones | Adjust effort or move to a better surface |
| Context compacted | AI forgot earlier work | Normal in long sessions; use checkpoint or migration packet |
| Terminal frozen | No response to typing | `Ctrl+C`, or open a new terminal tab |
| Unwanted file changes | AI modified files you did not expect | Use `git status` and `git diff`, then revert intentionally |
| Session crashed | Terminal/app closed unexpectedly | Use the native resume path first, then fall back to checkpoint recovery |
| Command not found | CLI not recognized | Install or fix PATH |

---

## Where to go for more

| Topic | File |
|-------|------|
| First-week operating model | `FIRST-WEEK-PLAYBOOK.md` |
| Troubleshooting | `TROUBLESHOOTING.md` |
| Applying the system in other tools | `TOOL-TRANSLATION-GUIDE.md` |
| Cost control and monitoring | `COSTS.md` |
| Platform-specific setup | `PLATFORM-SETUP.md` |
| Surface-specific continuity | `SURFACE-COMPACTION-AND-RESUME.md` |
| Claude Code telemetry | `CLAUDE-CODE-SESSION-TELEMETRY.md` |
| Orchestration system overview | `orchestration/README.md` |
| Orchestration quick start | `orchestration/QUICK-START.md` |
