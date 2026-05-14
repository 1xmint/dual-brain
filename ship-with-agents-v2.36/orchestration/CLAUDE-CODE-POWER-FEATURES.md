# Claude Code Power Features

How to use Claude Code's native capabilities as real workflow tools instead of
re-creating them in prompt text alone.

This guide is for Claude Code users who want stronger day-to-day execution,
better context control, and more deterministic behavior. It does not assume
you need the full orchestration system, but it does point to orchestration docs
when the work is complex enough to justify them.

Last verified against Anthropic docs: 2026-05-01

## Big Idea

Claude Code already has built-in support for several things teams often try to
 approximate manually:

- structured todo tracking
- separate-context subagents
- hooks for deterministic enforcement
- slash commands for compaction, memory, review, and multi-directory work
- output styles for explanatory or learning-oriented sessions
- custom slash commands for repeatable project workflows

The best upgrade path is not "turn on everything." It is:

1. use the native feature that matches the real need
2. keep the workflow lightweight until the need is real
3. use orchestration only when the simple path stops being enough
4. use live telemetry and deterministic guardrails instead of asking Claude to
   guess its own state

## The Main Native Features

### Todo tracking

Claude Code includes built-in todo tracking through the `TodoWrite` tool.

Use todos when:

- the work has 3 or more meaningful steps
- the task is cross-repo
- infra, auth, migrations, or audits are involved
- the session is long enough that progress tracking prevents drift

Do not require todos for tiny one-shot tasks.

If you use the orchestration layer, see:

- `orchestration/TODO-POLICY.md`

### /compact

`/compact` is not only a memory-pressure tool. It is also a clarity tool.

Even if you are using a large-context model, compaction still matters when:

- too many workstreams are mixed together
- earlier decisions are technically present but no longer salient
- a new phase has started
- the chat is carrying more history than the current task actually needs

Large context changes the threshold. It does not remove the need.

If you want compaction timing to become more reliable instead of purely
intuition-based, also read:

- `CLAUDE-CODE-SESSION-TELEMETRY.md`

If you use orchestration, see:

- `orchestration/ROLE-AWARE-COMPACTION.md`

### /statusline as visual lane identity

One of the coolest underused Claude Code features is `/statusline`.

This is not just for model or cost trivia. It is a practical way to make lanes
visually distinct in a busy terminal setup.

Good uses:

- color-code heads, supers, agents, and brainstorm lanes differently
- show the named session so you can spot the current lane at a glance
- keep model, effort, and context pressure visible during long sessions

This package ships example statusline scripts you can adapt:

- `templates/claude-statusline.example.sh`
- `templates/claude-statusline.example.ps1`

If you want the fastest setup, tell Claude Code exactly what you want:

```text
/statusline show my named session, model, effort, context percentage, and use different ANSI colors for head, super, agent, and brainstorm lanes
```

### /agents and subagents

Claude Code supports custom subagents with separate context windows and
optional tool restrictions.

Subagents are strongest for:

- bounded read-only review
- focused investigation
- disjoint helper slices
- verbose exploration that would otherwise pollute the parent context

Subagents are weak for:

- unresolved strategy
- product direction
- broad ambiguous work that needs one durable owner

For deeper guidance, read:

- `CLAUDE-CODE-SUBAGENTS-GUIDE.md`

### Custom slash commands

Custom slash commands are one of the most powerful Claude Code features that
many teams overlook.

Use them when you have a prompt pattern you want to reuse without copy-paste:

- `/handoff`
- `/checkpoint`
- `/security-review`
- `/packet`
- `/closeout`

Claude Code supports:

- project commands in `.claude/commands/`
- personal commands in `~/.claude/commands/`
- argument placeholders like `$ARGUMENTS`, `$1`, `$2`
- optional pre-run bash context with `!` commands when allowed-tools permit it

This is a great fit for recurring repo rituals that are too structured to keep
rewriting by hand and too lightweight to deserve a whole orchestration role.

### Hooks

Hooks are the most important Claude-native enforcement feature.

Use hooks when you want behavior that should happen every time instead of only
when the model remembers. Good examples:

- remind the session to load the right local context on startup
- block edits to sensitive paths
- run a formatter after edits
- require a checkpoint or review reminder at stop boundaries
- annotate or validate compaction behavior

Hooks are powerful and potentially risky because they run automatically with
your environment's access. Start small and review them carefully.

If you use orchestration, see:

- `orchestration/CLAUDE-HOOKS-INTEGRATION.md`

### /statusline and status telemetry

Claude Code can expose live session state through the statusline JSON it sends
to local scripts.

This is the strongest current way to stop guessing about:

- current model
- current effort
- current context usage
- whether the lane is on 200K or 1M context
- what added directories are active

If you want Claude Code to behave more like a reliable operator and less like
"a brain that cannot feel its own body," set up a statusline and use it as the
source of live session truth.

Read:

- `CLAUDE-CODE-SESSION-TELEMETRY.md`

### /memory and settings

`/memory` is better than hoping ad hoc startup text stays sticky forever.

Claude Code also supports:

- user settings in `~/.claude/settings.json`
- project settings in `.claude/settings.json`
- local project settings in `.claude/settings.local.json`

Use project settings for shared team behavior. Use local settings for personal
preferences or experiments you do not want committed.

### Other built-in commands worth actually using

These are less glamorous, but they solve real friction:

- `/doctor` for installation and environment sanity checks
- `/terminal-setup` for easier multi-line prompting with Shift+Enter
- `/permissions` when the lane keeps bouncing on command or file access
- `/mcp` for connected-tool prompts and authentication
- `/help` when you want the live command list in the current installation
- `/vim` if you prefer modal input in Claude Code itself
- `/init` if you are starting a repo and want Claude to help scaffold CLAUDE.md

### /add-dir

Use `/add-dir` or `--add-dir` for multi-directory local work such as:

- app plus library repo
- service plus docs repo
- cross-repo integration validation

This is much better than pretending one repo contains the whole truth.

### /review and /pr_comments

These are useful when the work has become review-shaped:

- PR feedback pass
- change-risk pass
- second review before closeout

They are not a substitute for real assurance routing, but they fit well inside
one.

### Output styles

Claude Code supports output styles such as explanatory and learning modes.

Use them when the goal is not only shipping code, but also:

- teaching a codebase
- onboarding a teammate
- leaving more educational reasoning in the session

Do not force them on every workstream. They trade some efficiency for pedagogy.

## What To Use When

| Need | Best native feature |
|---|---|
| 3+ step task with drift risk | built-in todo tracking |
| Long session losing focus | `/compact` |
| Make parallel lanes easy to visually distinguish | `/statusline` with named sessions and ANSI colors |
| Bounded helper review or investigation | `/agents` subagent |
| "This must happen every time" guardrail | hooks |
| Reuse a recurring project ritual | custom slash command |
| Shared project memory that survives sessions | `/memory` plus project settings |
| Cross-repo local work | `/add-dir` or `--add-dir` |
| PR review pass | `/review`, `/pr_comments` |
| Teaching or learning mode | output styles |

## Large Context Does Not Remove Session Discipline

If you are using a large-context model such as Opus 4.6's 1M beta context,
the system should still compact and re-synthesize when clarity degrades.

Think of it this way:

- small context fails from memory pressure sooner
- huge context fails from salience and mixed-workstream pressure later

That is why this package now separates:

- startup synthesis
- todo policy
- role-aware compaction
- hooks integration

## Best Practical Stack

For most serious Claude Code users, the best next step is:

1. read this guide
2. use todos for non-trivial work
3. compact earlier than "the thread is obviously broken"
4. use subagents for bounded leverage only
5. add a few opt-in hooks once the workflow is stable

If you are using the orchestration layer, also read:

- `orchestration/STARTUP-SYNTHESIS-GATE.md`
- `orchestration/TODO-POLICY.md`
- `orchestration/ROLE-AWARE-COMPACTION.md`
- `orchestration/CLAUDE-HOOKS-INTEGRATION.md`

## Do Not Turn This Into Ceremony

The goal is not to perform every feature all the time.

The goal is to stop solving real workflow problems with prompt folklore when
Claude Code already gives you a native primitive for the job.

## Truth Over Folklore

As of 2026-05-01, this package is verified against Anthropic's official Claude
Code docs.

That means:

- `statusline` color and lane cues are real and documented
- custom slash commands are real and documented
- hooks, subagents, output styles, `/compact`, `/memory`, `/review`, and
  `/add-dir` are real and documented

It also means this pack does not currently promise undocumented built-ins like
`/color` or `/rename` unless Anthropic documents them later.

The buyer-safe substitute today is:

- use named sessions with `-n`
- use `/statusline` with ANSI colors
- use custom slash commands for repeatable rituals
