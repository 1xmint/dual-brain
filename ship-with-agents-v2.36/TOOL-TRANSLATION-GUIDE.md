# Tool Translation Guide

This pack is built on universal principles that work with any AI coding tool.
What changes is where the memory lives, how strong the tool is, and whether the
workflow should stay lightweight or grow into orchestration.

For compact / rotate / resume behavior by tool surface, also read
`SURFACE-COMPACTION-AND-RESUME.md`.

## Universal Principles

- repo memory
- two-chat method
- task packets
- loop closure
- stop-and-ask boundaries
- migration when context decays

## First Question: Lightweight Or Orchestrated?

Before translating the system into a tool, decide whether the repo needs:

- a lightweight shared workflow with repo-local docs, or
- the full `orchestration/` layer

For many collaborators, local-model helpers, and small shared repos, the
lightweight path is the right start.

## Capability Truth Beats Analogy

Before assuming that one tool can copy another tool's orchestration
behavior, read `orchestration/CAPABILITY-MATRIX.md`.

The public package is conservative on purpose:

- Claude Code is the most native orchestration path here
- exact per-helper model control should be treated as verified locally,
  not assumed globally
- Codex terminal is a real execution path, but do not assume it is a
  drop-in Claude subagent equivalent
- when capability is unclear, use the manual fallback instead of
  promising more than the tool can prove

## Runtime Shape Beats Branding

Do not route only from product names.

First classify the live lane:

- desktop/app lane
- terminal lane
- IDE agent mode
- web/manual lane

Then ask what it can actually do:

- repo access
- tool/command access
- durable multi-chat continuity
- helper spawning
- exact runtime control
- documented compact / resume / thread controls

If two products have different branding but the same practical lane shape, treat
them similarly until a verified capability difference matters.

## Claude Code

| Pack concept | Claude Code equivalent |
|---|---|
| Repo memory | `AGENTS.md` |
| Strategy chat | Separate Claude or desktop chat |
| Work chat | Claude Code CLI session |
| Task packet | Paste into work chat |

Notes:

- Lightweight path: often just `AGENTS.md` plus task packets
- Full path: add `orchestration/` and the shipped `.claude/agents/` definitions
- Claude Code has documented `/compact`, resume, hooks, and statusline
  primitives, so this is the most automation-friendly surface in the pack

## Cursor

| Pack concept | Cursor equivalent |
|---|---|
| Repo memory | `.cursorrules` or `.cursor/rules/` |
| Strategy chat | Separate tool/window |
| Work chat | Composer / Agent |

## GitHub Copilot

| Pack concept | Copilot equivalent |
|---|---|
| Repo memory | `.github/copilot-instructions.md` |
| Strategy chat | Separate tool/window |
| Work chat | Copilot Chat |

## ChatGPT / Codex / GPT

Use Custom Instructions, project instructions, a system prompt, or a
first-message paste of `AGENTS.md`.

| Pack concept | ChatGPT/Codex equivalent |
|---|---|
| Repo memory | Custom Instructions, project instructions, system prompt, or paste at start |
| Strategy chat | Dedicated planning/review conversation |
| Work chat | Dedicated execution conversation |

Important role truth:

- GPT/Desktop is excellent for strategy and review
- it should not be treated as an interchangeable lead executor alongside your
  primary coding tool
- if you want true dual-brain audited closeout, use GPT/Desktop as the
  second-brain challenge layer rather than pretending it is the same as
  the execution environment
- if the live lane is a durable app chat, preserve that lane by default instead
  of relaunching it as a generic terminal flow
- if the live lane is Codex app rather than Codex terminal, do not teach it
  CLI-only compact behavior unless you have verified that the app supports it

## Gemini / Other Web / IDE / CLI Lanes

Treat Gemini and similar setups according to their actual lane shape.

For plain web use, treat them like a strong strategy chat:

| Pack concept | Gemini / web-LLM equivalent |
|---|---|
| Repo memory | Paste `AGENTS.md` or key repo context manually |
| Strategy chat | Dedicated planning/review conversation |
| Work chat | Separate execution tool or separate browser conversation |

Best use:

- planning
- review
- comparison against another model's reasoning
- light documentation help

Use a stronger repo-connected tool for execution whenever possible.

If your Gemini setup is CLI- or IDE-connected, keep using the same package
principles but verify orchestration mechanics locally before promising helper
spawning or runtime pinning.

## Surface Continuity Truth

Not every strong surface should get the same compaction rule.

- terminal surfaces with documented compact + resume support can carry more
  automation
- desktop/app surfaces often want stronger thread preservation and cleaner
  migration packets
- when a surface is unclear, prefer explicit rotation and durable artifacts over
  made-up compact behavior

## Windsurf

Use `.windsurfrules` as the project-level rules file.

| Pack concept | Windsurf equivalent |
|---|---|
| Repo memory | `.windsurfrules` |
| Strategy chat | Separate tool/window |
| Work chat | Cascade / agent mode |

Setup:

1. Copy `templates/.windsurfrules` into your repo root as `.windsurfrules`
2. Use Cascade for implementation
3. Use a separate strategy tool/window when the task is complex

## Local Models

Translate the system conservatively.

- start with repo-local truth in `AGENTS.md`
- keep the model on bounded helper tasks unless it has proven it can handle
  more
- add orchestration only after the model and workflow have earned it

## Routing Truth

If you are unsure whether a task wants lightweight flow, a direct
standalone agent, a super-owned workstream, or a stronger audited loop,
read `orchestration/ROUTING-MATRIX.md`.

## Quick Reference

| Tool | Memory file location | Strategy chat | Work chat |
|---|---|---|---|
| Claude Code | `AGENTS.md` | Separate Claude or desktop chat | CLI session |
| Cursor | `.cursorrules` or `.cursor/rules/` | Separate tool/window | Composer / Agent |
| GitHub Copilot | `.github/copilot-instructions.md` | Separate tool/window | Copilot Chat |
| ChatGPT/Codex | Custom Instructions, project instructions, system prompt, or paste at start | Dedicated conversation | Dedicated conversation |
| Gemini / web LLMs | Paste at start | Dedicated conversation | Separate execution conversation/tool |
| Windsurf | `.windsurfrules` | Separate tool/window | Cascade |
