# Platform Setup

This file helps you set up your actual tool surface without installing more
system than the work needs.

Read `CHOOSE-YOUR-SETUP.md` first if you have not already chosen:

- workflow weight
- main surface
- cost posture
- review posture

If you want the package to install cleanly instead of by hand, also read
`bootstrap/README.md`.

If you want the shortest persona-based route after this file, read:

- `QUICK-PATHS.md`
- `FIRST-30-MINUTES.md`

## Start With Workflow Weight

### Lightweight shared-repo lane

Use this first when:

- one person is the primary operator
- collaborators are bounded helpers, reviewers, or implementers on narrow tasks
- repo-local truth in `AGENTS.md` plus a few core docs is enough

In this lane, do not copy `orchestration/` by default. Start with:

- `templates/AGENTS.md`
- one tool memory file if your tool supports it
- `templates/task-packet.md`
- `templates/work-chat-handoff.md`
- `templates/chat-migration-packet.md`

If the work later grows beyond simple transport, move to canonical slice docs
instead of giant packet rewrites. See
`orchestration/DOC-FIRST-ORCHESTRATION.md`.

### Full orchestration lane

Use this when:

- multiple active workstreams need routing
- handoffs between chats are frequent enough to justify structure
- one strategy chat plus one execution chat is no longer enough
- you need layered ownership, checkpoints, or durable migrations

Only this lane should start by copying `orchestration/` into the repo.
For this lane, prefer canonical slice docs plus tiny launch stubs once more
than one review layer is involved.

## Runtime Shape First

Before you reason from product names, reason from runtime shape.

Ask:

- is this a desktop/app lane, terminal lane, IDE lane, or web/manual lane?
- does it have repo access?
- does it have tool or command access?
- does it preserve durable lane identity?
- what compact / resume / thread controls are actually documented for it?

If exact runtime control, helper spawning, or cross-tool capability
differences matter for your setup, also read:

- `orchestration/CAPABILITY-MATRIX.md`
- `orchestration/ROUTING-MATRIX.md`
- `orchestration/OPERATOR-ORCHESTRATION-PROFILE.md`
- `SURFACE-COMPACTION-AND-RESUME.md`

## Support Levels

| Setup | Support Level | What To Expect |
|---|---|---|
| Claude Code execution | Native | Full repo access and strongest orchestration support |
| Desktop/app strategy lane | Native | Strong planning/review layer with durable thread identity |
| Cursor / Copilot / Windsurf memory files | Native | Native project memory, tool-specific execution UX |
| Codex terminal execution | Manual but supported | Use pack principles and prompts, not Claude agent definitions |
| IDE agent mode | Supported with caveats | Repo-connected, but advanced orchestration is tool-specific |
| Local models via IDE or redirect | Supported with caveats | Best as bounded helpers unless proven stronger |
| Replit Core cloud workspace | Optional accelerator | Best for bounded spikes, demos, auth/DB setup, or publish surfaces |
| Web-only | Manual | Copy-paste workflow; migration packets matter more |

## Claude Desktop / Other App Lanes

Use this for planning, review, and architecture discussion.

- lightweight lane: strategy/review against repo-local docs
- orchestration lane: use the public `head` flow, not a hidden manager layer

Context truth:

- do not assume Claude desktop/app has the same documented compact controls as
  Claude Code terminal
- favor clean thread rotation with migration packets when the lane becomes
  mixed or changes phase

## ChatGPT / Codex Desktop Or App Lanes

Use this for planning, research, and review.

- lightweight lane: strategy/review only
- orchestration lane: public `head` flow plus canonical slice docs when work
  becomes multi-chat

Do not treat GPT/Desktop as an interchangeable lead executor alongside Claude
Code just because both are strong models.

Context truth:

- treat Codex app as thread-centric first
- use `/status` and durable thread identity instead of guessing
- do not assume the app exposes the same documented `/compact` controls as the
  terminal

First honest start:

1. keep the app lane for strategy, review, and durable thread continuity
2. run `bootstrap/bootstrap-lightweight.ps1`
3. run `bootstrap/agent-system-doctor.ps1`
4. put repo truth into `AGENTS.md`
5. let Claude Code, Codex terminal, or your IDE lane do the repo mutations

## Gemini / Other Web Or App Lanes

Use these as strategy, review, and comparison tools unless your workflow has a
stronger repo-connected execution path.

- lightweight lane: paste `AGENTS.md` or key repo context manually
- orchestration lane: manual strategy/review layer only

## Claude Code

Use this for file reading, code changes, command execution, and agent
coordination. The buyer package ships four Claude Code agent definitions:
`head`, `super`, `agent`, and `worker`.

Before you add more orchestration, read `CLAUDE-CODE-POWER-FEATURES.md`.
Claude Code already has native support for:

- built-in todos for non-trivial work
- `/compact` for context and clarity control
- `/statusline` and `/status` for live session telemetry
- custom slash commands for repeatable project rituals
- `/agents` subagents for bounded helper slices
- hooks for deterministic guardrails

If Claude Code is your main long-running execution lane, also read:

- `CLAUDE-CODE-SESSION-TELEMETRY.md`
- `SURFACE-COMPACTION-AND-RESUME.md`

If you regularly run multiple Claude lanes in parallel, consider a colored
statusline keyed to session names so heads, supers, agents, and brainstorms
are visually distinct at a glance.

First honest start:

1. run `bootstrap/bootstrap-lightweight.ps1`
2. run `bootstrap/agent-system-doctor.ps1`
3. read `FIRST-30-MINUTES.md`
4. do one real bounded task before deciding you need orchestration

Graduate to orchestration only when one execution lane plus one review lane
stops being enough.

## Codex Terminal

Use this when Codex terminal is your real execution surface instead of Claude
Code.

Default posture:

- start `lightweight`
- use repo docs and task packets first
- keep a separate strategy/review lane when the work is easy to overrun

First honest start:

1. run `bootstrap/bootstrap-lightweight.ps1`
2. run `bootstrap/agent-system-doctor.ps1`
3. read `FIRST-30-MINUTES.md`
4. start one real execution task in Codex terminal
5. read `TOOL-TRANSLATION-GUIDE.md` only after the first lane is moving

If the same work repeatedly crosses review, launch, and closeout, that is the
signal to adopt orchestration, not the fact that Codex terminal exists.

## Local Models via Claude Code Redirect

Use this when you want Claude Code's interface but local inference.

Example:

```bash
ollama pull qwen2.5:32b
ANTHROPIC_BASE_URL=http://localhost:11434/v1 claude --model qwen2.5:32b --effort high
```

Default truth:

- local models are bounded helpers unless they have proven they can handle more
- do not install the whole orchestration system on day one unless there is a
  real need

## Local Models via IDE

Use `AGENTS.md` as the canonical repo memory.

- Cursor: use `.cursorrules`
- Windsurf: use `.windsurfrules`
- Continue: use editor-native context plus `AGENTS.md`

This is often a good fit for the lightweight lane.

## Cursor / Windsurf / Copilot

Use these when the IDE agent is the real execution surface.

Default posture:

- start `lightweight`
- keep `AGENTS.md` as canonical repo memory
- use the tool-native memory file too when available

First honest start:

1. run `bootstrap/bootstrap-lightweight.ps1`
2. run `bootstrap/agent-system-doctor.ps1`
3. read `FIRST-30-MINUTES.md`
4. add `AGENTS.md`
5. add one tool memory file:
   - Cursor: `.cursorrules`
   - Windsurf: `.windsurfrules`
   - Copilot: `copilot-instructions.md`
6. run one bounded real task before adding orchestration

Use orchestration only when the workflow pain is real:

- repeated relaunches
- repeated packet churn
- multi-chat review/launch/closeout loops

## Replit Core

Use Replit as an optional cloud helper, not as the package's main
orchestration brain.

Best uses:

- fast cloud sandbox for a bounded spike
- quick demo or publish surface
- auth or database acceleration
- import a repo and validate a clean cloud run

Keep this operating shape:

- local package docs remain canonical truth
- Replit is a bounded execution or demo surface
- important results come back into local slice/checkpoint/closeout truth

If you plan to use Replit intentionally, also read:

- `REPLIT-INTEGRATION.md`
- `REPLIT-COST-GATE.md`
- `START-REPLIT-SANDBOX.md`

If you later use a remote-session tool to host long-lived Claude Code or Codex
lanes in Replit, also read:

- `REMOTE-SESSION-BRIDGE.md`

## Web-Only

Open one strategy tab and one work tab. Paste `AGENTS.md` into both. Use
`templates/task-packet.md` for work and `templates/chat-migration-packet.md`
when context degrades.

Do not force orchestration into a web-only workflow unless you are willing to
manage the extra manual handoffs yourself.

## First Run Walkthroughs By Setup

### Lane A - Lightweight shared repo

1. Run `bootstrap/bootstrap-lightweight.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Read `LIGHTWEIGHT-COLLABORATION-GUIDE.md`
4. Start with one bounded task using `templates/task-packet.md`

### Lane B - Claude-native orchestration

1. Run `bootstrap/bootstrap-orchestration.ps1`
2. Run `bootstrap/agent-system-doctor.ps1`
3. Start from `orchestration/QUICK-START.md`
4. Move to `orchestration/DOC-FIRST-ORCHESTRATION.md` before packet churn begins

### Lane C - GPT/ChatGPT strategy + Claude Code execution

1. Choose lightweight or orchestration honestly
2. Preserve GPT/Desktop as the strategy/review owner
3. Use Claude Code for execution
4. If the same work crosses review, launch, and closeout, move it to one
   canonical slice

### Lane D - Codex terminal + separate strategy chat

1. Start lightweight first
2. Read `FIRST-30-MINUTES.md`
3. Use a separate strategy chat for review and scope control
4. Read `TOOL-TRANSLATION-GUIDE.md`
5. Read `SURFACE-COMPACTION-AND-RESUME.md`

### Lane E - Local-model hybrid or local-only manual flow

1. Start with one bounded task
2. Keep the model in helper mode unless it has proven it can safely do more
3. Add more structure only after repeated real need

### Lane F - Web-only manual

1. Keep `AGENTS.md` ready to paste
2. Open one strategy tab and one work tab
3. Use task packets and migration packets

## Quick Reference

| Need | Default answer |
|---|---|
| Shared repo with a first-time collaborator | Start lightweight with repo-local docs |
| Local-model helper | Keep it bounded unless proven stronger |
| GPT + Claude together | GPT/Desktop for strategy, Claude Code for execution |
| Multi-layer chat routing | Add orchestration only when the simple flow stops being enough |

## Adaptive Rule

Before recommending a heavier workflow, record the operator's real setup in
`orchestration/OPERATOR-ORCHESTRATION-PROFILE.md`.

That profile should influence:

- whether to stay in the current lane
- whether a direct agent is enough
- whether a super-owned lane is justified
- whether portfolio or multi-repo routing is now warranted
