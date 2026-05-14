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
the `orchestration/` directory. Common replacements:

- **`[your projects]`** — your project or repo names
- **`[repo-1]`, `[repo-2]`** — your repos with descriptions
- **Repo boundaries** — what each repo owns and its default branch

## Model Configuration

Fill out `orchestration/MODEL-CONFIG.md` once during setup. It configures
which models each layer uses and every prompt/START file reads it.

### Simple version

Use your strongest model for strategy/coordination (head, super, brainstorm).
Use your most cost-effective model for execution (agent, worker).
If you only have one model, use it for everything — the system adapts.

**IMPORTANT:** Always use full model ID strings. Short names like
`opus` and `sonnet` resolve to the latest version, which changes over
time.

### Changing defaults

The `.claude/agents/` files have a `model:` field in their frontmatter:

```yaml
# Model configured per orchestration/MODEL-CONFIG.md — change to match your setup
model: claude-sonnet-4-6
effort: high
```

Change the model ID to match your access level and MODEL-CONFIG.md.

### Example launch commands

These are launcher examples for a Claude-style runtime. Swap the launcher shape
to match your actual chosen terminal/runtime while keeping the same role/model
intent.

- **Super:** `claude --agent super --model <your-coordination-model> --effort high -n s1`
- **Agent (standard):** `claude --agent agent --model <your-execution-model> --effort high -n s1-auth`
- **Agent (escalated):** `claude --agent agent --model <your-strongest-model> --effort high -n s1-auth`

### Prompt-file launch adapters

If your runtime can consume prompt files natively, document that clean path and
prefer it.

If your runtime cannot, do not improvise shell-specific glue as generic system
UX. Pick one of these intentionally:

- use the portable two-block shape:
  - launch command block plus startup prompt block for interactive-launch-first
    runtimes
  - or startup prompt block plus launch command block for true prompt-first
    runtimes
- or create a verified helper script/wrapper for your real setup and document
  that as the standard adapter

Examples of adapter truth worth documenting:

- supported shell
- working directory expectation
- helper script path
- runtime-specific prompt-file flag, if one exists

### First-run operator preferences

Before you lean on the launch examples heavily, capture your own live setup
truth in `orchestration/OPERATOR-PREFERENCES.md`.

Minimum useful fields:

- which runtime owns super/agent launches
- whether your repo-connected terminal already starts in the right root
- whether you want bare launcher command blocks or explicit cwd setup
- whether a prompt-file adapter is real or not

If your terminal already starts in the right workspace root, say so there and
keep launch commands compact.

### Model tiers

The system uses three conceptual tiers (map to your available models):

- **Strategy tier** — head, super, brainstorm, security-sensitive agents
- **Execution tier** — agents doing bounded implementation, docs, rebases
- **Premium tier** — requires explicit permission; off by default

### Effort levels

- **Standard:** Bulk renames, docs, reformatting, clear pattern-following
- **High:** Multi-file changes, debugging, most implementation work
- **Low:** Never used. Standard is the floor for agents.

When your chosen runtime's models change, update the model IDs in your
`.claude/agents/` frontmatter or equivalent launcher metadata and the model
selection sections in the prompt files.

### GPT/Desktop manager guidance

For spawned GPT Desktop manager chats, keep model guidance generic unless your
workflow is locked to a specific provider.

Recommended default:

- use the strongest reasoning model available for manager-style work
- use medium/high or high effort for deep review, repo analysis, and prompt
  authoring
- use a cheaper balanced model only for light synthesis or simple mechanical
  checks

In launch packets, separate:

1. chat name
2. setup options
3. recommended option
4. model / effort recommendation
5. startup content to paste

Do not mix UI/operator instructions into the startup content itself.
Do not assume that a shell trick used on one machine is the right buyer-facing
launch shape for every installation.

### Context windows

Context sizes vary by model. As of early 2026, Sonnet has ~200K tokens
and Opus 4.6 has ~1M tokens. Check current Anthropic docs for your
model. When quality degrades — the agent repeats itself, forgets
constraints, or loses track of decisions — rotate to a fresh chat
rather than pushing through.

## Dual-System: Agent Definitions vs Prompt Files

The `.claude/agents/` files are the primary system — they power Claude
Code's `--agent` flag. The markdown prompt files
(`references/super-prompt.md`, `references/agent-prompt.md`,
`references/worker-prompt.md`) are the manual-mode equivalent for Claude
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

The parallelism rules still apply — the super checks whether
agents overlap on the same files before deploying in parallel.

### Multiple repos

List each repo with its ownership and default branch:

```
- backend-api: REST API service, main branch
- frontend-app: React SPA, main branch
- shared-types: Shared TypeScript types, main branch
```

The super uses repo boundaries to manage parallelism — work in
different repos can run in parallel, while work in the same repo with
overlapping files runs sequentially.

## What to Keep vs What to Delete

The system is modular. Remove what you don't use:

- **Don't use brainstorms?** Remove `references/brainstorm-prompt.md`,
  `references/brainstorm-reference.md`, and `START-BRAINSTORM.md`. The agent
  works independently.
- **Don't use the super?** Remove the super files and use
  the agent directly with `references/START-AGENT.md`.
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


