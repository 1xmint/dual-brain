# GPT / ChatGPT / Codex - Quick Reference

Last verified: 2026-04-28

This file goes stale quickly. Before making a real model or pricing
decision, check the official OpenAI pages:

- https://platform.openai.com/docs/models
- https://openai.com/chatgpt/pricing

## Durable Truth

In this package, GPT/Desktop and Codex are useful for different jobs:

- `ChatGPT / GPT desktop or web chat`: strategy, review, research framing,
  architecture discussion, pressure-testing
- `Codex terminal`: repo-connected execution, file edits, terminal work,
  bounded implementation

Do not treat GPT/Desktop and your main coding tool as interchangeable
lead brains. In the dual-brain setup:

- GPT/Desktop owns strategy and review
- Codex terminal or Claude Code owns execution

## Current Official Snapshot

As of 2026-04-28, OpenAI's official models page includes:

- GPT-5.2 and smaller GPT-5 variants
- GPT-5.2-Codex and other Codex-tuned coding variants
- GPT-4.1 and GPT-4o families
- reasoning models such as `o3`
- open-weight `gpt-oss` models

As of 2026-04-28, OpenAI's ChatGPT pricing page lists:

- Free
- Plus
- Pro
- Business
- Enterprise

Treat those as a point-in-time snapshot, not a durable promise. The
official pages above are the source of truth.

## ChatGPT Desktop / Web Chat

Best use in this package:

- planning
- review
- architecture discussion
- second-opinion pressure testing
- light research framing before execution

What it is not:

- not a drop-in replacement for Claude Code agent mode
- not the primary repo execution tool in the recommended hybrid setup
- not the source of repo truth; repo truth still lives in files

Practical limits:

- no Claude-style `--agent` launch flow
- no direct terminal execution by default
- no automatic sync with Claude Code or Codex sessions

**Chat title tip:** In some GPT/Codex desktop chat UIs, the first line
of the first message becomes the default sidebar title. When launching
a named head or brainstorm chat, start with the intended title, such as
`Head - Portfolio / Priorities` or `Brainstorm - Portfolio / Pricing Research`.

## Codex Terminal

Use Codex when you want OpenAI-powered terminal execution rather than a
desktop strategy chat.

Typical fit:

- bounded implementation
- repo inspection
- patching and refactoring
- execution under a separate strategy/review layer

Codex is closest to the execution role in this package, not the
strategy layer.

Codex works best with a layered memory stack:

- concise `AGENTS.md` as the hot path
- separate current-work docs such as `SPEC.md`, `PLAN.md`, and `STATUS.md`
- skills, hooks, and rules for repeated workflows instead of giant prompt files

## Role Mapping In This Package

If you are using GPT-family tools with this system:

- `Strategy layer`: ChatGPT Desktop or web chat
- `Coordination layer`: Codex terminal or Claude Code terminal
- `Execution layer`: Codex terminal or Claude Code terminal
- `Research layer`: ChatGPT Desktop, web chat, or another deliberate
  strategy/review chat

If you need deeper orchestration, keep the role boundary clear:

- desktop/web GPT chat = planning, review, and independent challenge
- terminal coding tool = implementation and repo operations

## Reasoning / Effort Reality

OpenAI model controls change over time. Some API models support explicit
reasoning controls, but the ChatGPT UI and Codex experience do not map
cleanly to Claude's `--effort` conventions.

For this package, the important rule is:

- choose the quality lane first in `QUALITY-ROUTING-GATE.md`
- then choose the cheapest OpenAI model or surface that can honestly
  support that lane

## When GPT + Claude Makes Sense

This pattern is strong when:

- you want a second brain on architecture or review
- you want strategy and execution in separate context windows
- you want Claude Code or Codex doing repo work while GPT pressures the
  decisions

It is weak when:

- you only have one subscription
- the task is small enough for one tool
- the copy-paste overhead exceeds the review value

You are the bridge between them unless your workflow has a deliberate
handoff system.
