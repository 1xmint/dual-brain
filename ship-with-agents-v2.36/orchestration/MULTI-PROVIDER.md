# Multi-Provider Collaboration

How to run two AI providers as one coordinated system without treating them as
interchangeable lead brains.

This guide assumes the corrected public package truth:

- GPT/Desktop or a second provider is a strategy/review brain
- Claude Code or your main coding tool is the primary execution brain
- local models are bounded helpers unless they have proven they can do more

## Why Use Two Providers

Single-provider setups have characteristic failure modes:

- model-specific blind spots
- rate limits or degraded service at the wrong time
- no independent check on high-stakes work

Two providers become useful when they share a written substrate:

- repo files
- task packets
- checkpoints
- review files

They do not need to share chat history to work well together.

## Strict Role Separation

In the public package, the safest default split is:

- primary executor: Claude Code or your main coding tool
- strategy/review provider: GPT/Desktop or another strong provider
- optional local model: bounded helper

Do not run all providers as interchangeable lead executors.

## When Cross-Provider Review Is Worth It

Cross-provider review costs time and tokens. Use it deliberately.

Good triggers:

- security-sensitive changes
- license or legal wording
- irreversible release or publish decisions
- customer-facing copy, docs, or public language
- architecture decisions that are expensive to reverse

Bad triggers:

- simple formatting
- boilerplate updates
- mechanical file moves

## Shared Review File

If you want a durable cross-provider review trail, write it to:

`orchestration/reviews/<task-slug>-<YYYY-MM-DD>.md`

Example:

`orchestration/reviews/auth-middleware-2026-04-26.md`

Suggested structure:

```md
# Review: <task-slug>
Date: <date>
Primary provider: <provider> / <model-id>
Reviewer provider: <provider> / <model-id>

## Primary output

## Primary self-assessment

## Review findings

## Revision

## Resolution
```

## Fallback Rules

When the review provider is unavailable:

- always-block work: pause until review is available
- on-request review: proceed with a written flag
- spot-check review: skip if necessary

For always-block work, write the pause clearly in the checkpoint or handoff.

## Layer Guidance

Suggested starting defaults:

- head: either provider, whichever you trust more for strategy
- super: whichever provider is strongest for coordination in your workflow
- brainstorm: either provider, or run both separately and compare
- agent/execution: your strongest tool-use-capable provider

The point is not symmetry. The point is complementary strengths.

## Cost Discipline

Cross-provider review roughly doubles the attention spent on reviewed work.

Keep it sustainable by:

- using it on risky work, not all work
- limiting reviews to one pass unless the user explicitly wants more
- writing findings cleanly so the executor can revise once and move on

## Best Use In This Package

The highest-value public pattern is:

1. strategy/review provider shapes or critiques the work
2. execution provider makes the repo changes
3. review provider spot-checks only when the work class justifies it

That gives you stronger judgment without collapsing into coordination tax.
