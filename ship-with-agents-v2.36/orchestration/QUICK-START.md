# Quick Start

Get running in 5 minutes. First choose the repo-connected runtime you actually
plan to use. The command examples below use `claude` because that is the
current live-system example, not because the package requires Claude-specific
launching.

## 1. Copy the system into your project

Copy the `orchestration/` folder (or the `orchestration/` folder from
the product repo) into the root of your project directory. Copy the
`.claude/agents/` folder into your project's `.claude/agents/`.

## 2. Customize

Open these files and replace the `[your projects]` and
`[repo-1]`/`[repo-2]` placeholders with your actual project names:

- `orchestration/references/head-prompt.md`
- `orchestration/references/super-prompt.md`
- `orchestration/references/agent-prompt.md`
- `orchestration/references/brainstorm-prompt.md`
- `.claude/agents/head.md`
- `.claude/agents/super.md`
- `.claude/agents/agent.md`

Before your first real launch, also update:

- `orchestration/OPERATOR-PREFERENCES.md`

At minimum, save:

- which runtime you actually use for super/agent lanes
- whether your repo-connected terminal already starts in the right root
- whether you want bare launcher commands or explicit cwd setup

See [CUSTOMIZATION.md](CUSTOMIZATION.md) for detailed guidance.

## 3. Choose your entry point

### Path A: Full system (Head → Super → Agent)

Start a head session to manage everything from the top.

Example launcher command for a Claude-style runtime:

```
claude --agent head --model claude-opus-4-6 --effort high -n h1
```

Then paste:

```
Read `orchestration/START-HEAD.md`.

This is head session 1.
Current priorities: check TODO.md
New direction: [what you want to build]
```

The head deploys supers, which deploy agents. Full coordination.

### Path B: Solo agent (skip head and super)

For a single bounded task, go straight to a direct agent.

Example launcher command for a Claude-style runtime:

```
claude --agent agent --model claude-sonnet-4-6 --effort high -n a1-<slug>
```

Then paste:

```
Read `orchestration/references/START-AGENT.md`.

This is agent chat a1-<slug>.
Workstream: [name]
Goal: [what to build]
Checkpoint: orchestration/checkpoints/a1-<slug>.md
```

No coordination overhead. Fast. Use `a<N>-<slug>` naming for direct
agents (e.g., `a1-ratelimit`, `a2-docs`).

### Path C: Super without head

For multi-step work in one or more repos without the strategic layer.

Example launcher command for a Claude-style runtime:

```
claude --agent super --model claude-opus-4-6 --effort high -n s1
```

Then paste:

```
Read `orchestration/references/START-SUPER.md`.

This is super session 1.
Current active workstreams: none
New task: [what to build]
```

The super scopes work, deploys agents, tracks progress.

### Path D: Brainstorm

For brainstorming, architecture, and strategy.

Example launcher command for a Claude-style runtime:

```
claude --model claude-opus-4-6 --effort high
```

Then paste:

```
Read `orchestration/START-BRAINSTORM.md`.

This is brainstorm b1.
Current topic: [what to explore]
```

## Which Path Should I Use?

| Situation | Path | Why |
|---|---|---|
| One bounded task (fix a bug, write a doc) | **B: Solo Agent** | No coordination overhead. Fast. |
| Multi-step work in one repo (feature build, refactor) | **C: Super** | Super scopes work, deploys agents, tracks progress. |
| Multiple workstreams across repos | **A: Full system** | Strategic oversight + parallel supers. |
| Brainstorming, architecture, strategy | **D: Brainstorm** | Thinking partner. Produces handoffs, not code. |

**Rule of thumb:** If the task fits in one agent context window and
doesn't need parallelism, use Path B. If you need coordination or
parallel agents, use Path C. If you're running multiple supers or
need strategic oversight across workstreams, use Path A.

## Chat Naming Convention

Every chat gets a name so you can track what's running:

- **Head:** `h1`, `h2`, `h3` (increment per session)
- **Manager:** `m1`, `m2`, `m3` (GPT Desktop, increment per workstream)
- **Brainstorm:** `b1`, `b2`, `b3` (increment per session)
- **Super:** `s1`, `s2`, `s3` (increment per session)
- **Super-owned agents:** `s1-auth`, `s1-frontend` (super prefix + workstream)
- **Direct agents:** `a1`, `a1-ratelimit` (no super, bounded work)
- **Rotation (planned):** append `r<N>` — `h1r2`, `m1r2`, `b3r2`, `s1-auth-r2`
- **Crash recovery:** append `.<N>` — `h1.1`, `m1.1`, `b3.1`, `s1-auth.1`
- **Combined:** `m1r2.1` (rotated once, then crashed once)

## Notes

- **Model access:** The system uses full model ID strings for
  predictability. `claude-opus-4-6` for head/super/coordination,
  `claude-sonnet-4-6` for agents. Short names like `opus` resolve to
  the latest version (currently 4.7) which may not be what you want.
  See [CUSTOMIZATION.md](CUSTOMIZATION.md#model-configuration) for
  details.

- **GitHub CLI:** The system assumes GitHub with `gh` CLI for PR and
  merge management. If you use a different git host, adjust the merge
  commands in the prompt files and agent definitions.

## Next Steps

- [HOW-IT-WORKS.md](HOW-IT-WORKS.md) — understand the layer model,
  checkpoints, handoffs, naming, and rotation
- [CUSTOMIZATION.md](CUSTOMIZATION.md) — adapt the system to your
  workflow, change models, configure repo boundaries


