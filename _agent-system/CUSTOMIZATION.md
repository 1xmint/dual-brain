# Customization

How to adapt the agent system to your project and workflow.

## AGENTS.md

`AGENTS.md` is a project description file that lives in your repo root.
It tells the agents what your project is, what stack you use, and what
conventions to follow. Every agent reads it as the top of the
source-of-truth hierarchy.

**Where it goes:** Root of your repo (alongside `package.json`,
`Cargo.toml`, etc.)

**What to put in it:**

- Project name and purpose (1-2 sentences)
- Tech stack (language, framework, database, test runner, package
  manager)
- Coding conventions (style, naming, patterns to follow)
- Branch and PR conventions
- No-touch areas or sensitive paths
- Any project-specific rules agents should respect

## CUSTOMIZE Blocks

The prompt files contain `<!-- CUSTOMIZE -->` comments marking places
where you should insert your project details. Search for them across
the `_agent-system/` directory. Common replacements:

- **`[your projects]`** — your project or repo names
- **`[repo-1]`, `[repo-2]`** — your repos with descriptions
- **Repo boundaries** — what each repo owns and its default branch

## Model Configuration

### Simple version

Use the standard model (currently Sonnet) for simple, mechanical work.
Use the top-tier model (currently Opus) for complex work that needs
judgment. The system recommends models automatically in each prompt.

### Changing defaults

The `.claude/agents/` files have a `model:` field in their frontmatter:

```yaml
model: opus
effort: high
```

Change `opus` to `sonnet` if you only have Sonnet access, or to match
your preference. The system works with Sonnet — you trade some
reasoning depth for broader model availability.

### Generic tiers

The system refers to models in three tiers:

- **Top-tier model** (currently Opus 4.6) — task agents, complex work,
  security-sensitive tasks
- **Standard model** (currently Sonnet 4.6) — mechanical work, docs,
  rebases, simple fixes
- **Premium-tier model** (currently Opus 4.7) — requires explicit
  permission and confirmed budget; off by default

When new Claude models release, update the model names in your
`.claude/agents/` frontmatter and the model selection sections in the
prompt files.

### Context windows

Context sizes vary by model. As of early 2026, Sonnet has ~200K tokens
and Opus 4.6 has ~1M tokens. Check current Anthropic docs for your
model. When quality degrades — the agent repeats itself, forgets
constraints, or loses track of decisions — rotate to a fresh chat
rather than pushing through.

## Dual-System: Agent Definitions vs Prompt Files

The `.claude/agents/` files are the primary system — they power Claude
Code's `--agent` flag. The markdown prompt files
(`orchestrator-prompt.md`, `task-agent-prompt.md`,
`work-agent-prompt.md`) are the manual-mode equivalent for Claude
Desktop, where you copy-paste prompts between chat windows.

Both use the same principles and produce the same behavior. If you
only use Claude Code, you can ignore the markdown prompt files. If you
only use Claude Desktop, you can ignore the `.claude/agents/` directory.

## Repo Boundaries

### Single repo

If you have one repo, simplify the repo boundaries section in the
prompt files:

```
- my-app: Full-stack application, main branch
```

The parallelism rules still apply — the orchestrator checks whether
task agents overlap on the same files before deploying in parallel.

### Multiple repos

List each repo with its ownership and default branch:

```
- backend-api: REST API service, main branch
- frontend-app: React SPA, main branch
- shared-types: Shared TypeScript types, main branch
```

The orchestrator uses repo boundaries to manage parallelism — work in
different repos can run in parallel, while work in the same repo with
overlapping files runs sequentially.

## What to Keep vs What to Delete

The system is modular. Remove what you don't use:

- **Don't use idea chats?** Remove `idea-discussion-prompt.md`,
  `idea-discussion-reference.md`, and `START-IDEA-CHAT.md`. The task
  agent and work agent work independently.
- **Don't use the orchestrator?** Remove the orchestrator files and use
  the task agent directly with `START-TASK-AGENT.md`.
- **Only use Claude Code?** The `.claude/agents/` files are
  self-contained. You can ignore the markdown prompt files.
- **Only use Claude Desktop?** Use the markdown prompt files and START
  files. Ignore `.claude/agents/`.

Keep: `checkpoints/`, `logs/`, templates, and `prompt-change-log.md` —
these support the core workflow regardless of which layers you use.

## Tracking Your Changes

`prompt-change-log.md` ships blank. Use it to track your own prompt
changes — what you changed, why, and what failure it prevents. This
helps when you modify the core principles or reference files, so future
edits don't accidentally revert your customizations.
