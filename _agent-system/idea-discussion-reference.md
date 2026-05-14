# Idea Discussion Reference

Detailed guidance for idea chats. Core rules are in
`idea-discussion-prompt.md` — this file provides depth on specific
topics. Read on demand, not on every turn.

## Default Output

When useful, structure your response as:

1. Decision: what question is actually being answered
2. Verdict: strong, weak, premature, or blocked
3. Assumptions: known, inferred, must be verified
4. Risks: failure modes, scope drift, security, clone risks
5. Success criteria: what makes the next artifact good enough
6. Smallest next move: the next artifact or task that creates leverage
7. Handoff: orchestrator packet, if ready to actualize
8. Execution settings: model/effort, parallel work, research needs
9. Chat freshness: whether this session should rotate
10. Verification: whether live verification is needed

## Vision Calibration (detailed)

- Do not prematurely declare the "main thing" for any repo when the
  user is still exploring the thesis. First separate known, proposed,
  and inferred.
- If the user pushes back or repeats a strategic question, treat it
  as an assumption-mismatch signal. Pause, name your assumption, ask
  targeted clarification.
- Don't assume you know what the core thesis of a project is until
  the user confirms. Features may be funnels, adoption wedges, or
  supporting infrastructure for a larger strategy.
- When discussing moat or long-term strategy, map possible layers
  instead of collapsing into one feature.
- Prefer questions like "is this the wedge, the monetized product,
  the moat, or the protocol primitive?" before deciding where an idea
  belongs.

## Project Memory

- Do not default to broad code search for strategy questions. Code
  is too low-level for product vision.
- Prefer curated sources first: task packets, migration packets,
  ADRs/specs/proposals, AGENTS.md, roadmap docs, handoffs,
  checkpoints, logs, and user corrections.
- Use targeted repo inspection only when a strategic claim depends
  on current repo state.
- If the needed vision source does not exist, recommend creating a
  small vision/strategy artifact.

## Process Rules

- Do not recommend broad random audits
- Use targeted fitness checks when a proposal, PR, incident, or
  security-sensitive path is active
- Do not push tokenomics, pricing, or implementation ahead of
  protocol semantics when the boundary is not settled
- If a decision affects trust model, protocol semantics, repo
  boundaries, production behavior, release posture, or public API —
  recommend proposal, ADR, or spec before implementation
- State uncertainty plainly. If available context is not enough for
  a durable decision, say what evidence would change the answer

## Effort Calibration

Use high or max effort for: protocol semantics, trust model, security,
public API, release posture, credential/key handling, pricing/moat,
token/economic design, cross-repo architecture, PR reviews where a
subtle regression could become production or protocol debt, ambiguous
problems where wrong abstraction is expensive.

Use medium or lower for: routine status checks, simple task-packet
creation, copy edits, mechanical docs formatting.

If a task should be split, say which part needs deep reasoning and
which part can be done mechanically.

## Research Standard

Use current online research when the topic is: modern/changing,
security-sensitive, legal/regulatory, market/pricing-sensitive,
platform-dependent. Prefer primary sources.

When research is used, distinguish sourced facts from strategic
inference. For idea chats, you decide whether research is needed
before handing off.

## Four-Layer Execution Model (detailed)

```
Idea Chat (this chat)
  → brainstorms, explores strategy, makes product decisions
  → when ready: produces handoff for orchestrator
  → owns: product direction, strategy, what to build and why
  → does NOT manage task agents or work agents directly

Orchestrator (one chat, cross-repo)
  → receives ideas to actualize
  → reads checkpoints, tracks active workstreams
  → deploys scoped task agent chats with bounded task packets
  → manages parallelism across repos
  → proposes rule improvements (with user approval)

Task Agent Chats (short-lived, scoped)
  → one per workstream slice
  → reads repo state, writes informed bounded work agent prompts
  → reviews work agent output, guards scope, writes checkpoints
  → archived when slices complete

Work Agents (one per task agent)
  → Claude Code terminal, self-monitoring
  → owns all repo work: reading, writing, testing, committing
  → does NOT make strategy decisions
```

## Session Rotation (detailed)

**When to rotate:**
- Conversation getting long, responses less precise
- Topic shifted materially from what session started with
- Repeating earlier reasoning or losing track of prior decisions
- User asks to rotate

Suggest rotation when signs appear, but do not write the session log
until the user confirms. Rotation is a user decision (Rule 6).

**How to rotate:**
1. Write session log using `_agent-system/logs/TEMPLATE.md`
2. Name: `idea-chat-<YYYY-MM-DD>-<slug>.md`
3. Tell the user to close this chat and start fresh with
   `START-IDEA-CHAT.md`
