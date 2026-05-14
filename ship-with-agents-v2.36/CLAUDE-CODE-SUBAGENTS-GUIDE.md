# Claude Code Subagents Guide

How to use Claude Code `/agents` as an advanced quality workflow on top of the two-chat method from `AGENT-WORKFLOW-GUIDE.md`.

This guide is for builders who already have the basics in place (a work chat, a strategy chat, an `AGENTS.md`, a PR habit) and want to add extra review quality without re-routing the whole workflow.

If you have not read `AGENT-WORKFLOW-GUIDE.md` yet, read that first. Subagents are not a replacement for the two-chat method. They sit inside it.

If you also want the broader Claude-native workflow guidance for todos,
compaction, hooks, memory, review commands, and output styles, read
`CLAUDE-CODE-POWER-FEATURES.md`.

## What Claude Code Subagents Are

Claude Code is an agentic CLI. It supports **subagents**, invoked via `/agents` (or via the `Agent` / `Task` tool under the hood). A subagent is:

- a separate conversation with its **own context window** (does not share the parent's memory);
- driven by a **custom prompt** you define (a role, a job, a set of constraints);
- given a **configurable set of tools** (read-only, limited write, specific tool subset);
- able to return a **single summarized result** to the parent agent, which then decides what to do with it.

Think of a subagent as a short-lived, tightly-scoped contractor. You give it a job, the tools to do the job, and nothing else.

## Why Separate Context Matters

Two real benefits, and one limit.

**Benefit 1 — cleaner reasoning.** A subagent with its own context is not biased by the parent's chat history. A "code reviewer" subagent reading a diff does not know what the implementing agent was trying to justify. That distance produces better reviews.

**Benefit 2 — cheaper long work.** The parent agent's context stays focused. It does not have to absorb a thousand lines of file dumps from a broad search. The subagent does the heavy reading and returns a summary.

**Limit — summary is all you get.** The parent agent only sees what the subagent returns. If the subagent says "everything looks fine," the parent cannot re-check without re-running the work. Trust but verify applies, same as with any agent output.

## When To Use Subagents

Subagents earn their place when the work has **one of these shapes**:

- **Read-only review** over a specific area (security, docs, tests, public-safety).
- **Focused exploration** of an unfamiliar part of the repo before you commit to changes.
- **Bounded implementation** of a slice with a clear boundary, where the parent does not need to carry the whole file set.
- **Multiple independent checks** that can run in parallel — e.g. security review and docs review on the same diff.
- **Protecting the parent's context** from a large search result or a noisy file tree.

## When **Not** To Use Subagents

Subagents are the wrong tool when:

- The decision is unresolved. Strategy questions stay with you and the strategy chat.
- The task is trivial. A one-line fix does not need a subagent.
- The work requires strong cross-context memory. A subagent cannot see the parent chat's history by design.
- The answer needs something only the outside world knows (pricing, vendor specs, competitor info). Send that to the strategy chat, not to a subagent with file access.
- You are trying to skip human approval. Subagents do not merge, deploy, or approve.

## Where Subagents Fit With Existing Roles

This pack's base workflow has three roles. Subagents join as a **fourth, tightly-bounded** role underneath the work chat.

- **You (human).** Final decider. Merge, deploy, product direction, security sign-off.
- **Strategy chat (GPT or equivalent).** Scope guard, strategy, market/research, review of summaries. Owns decisions that need outside-world knowledge.
- **Claude Code (parent / work chat).** Reads real files, makes edits, opens PRs, reports to you. Orchestrates subagents.
- **Subagents.** Short-lived, tightly scoped, read-only or narrowly scoped-write. Return summaries to the work chat. Never approve.

> **Subagents do not approve:** strategy, pricing, token or economic design, trust-model decisions, repo-boundary decisions, merge/deploy/publish, or product direction. Those are human / supervisor decisions, full stop. A subagent's output is input to a human decision — never a substitute for one.

## Good Use Cases

These are the subagent shapes worth setting up. Ready-to-copy setup prompts appear below.

- **Read-only code review subagent.** Reads a diff and reports what a reviewer would flag. Cannot edit.
- **Security review subagent.** Reads a diff for obvious vulnerabilities (secrets in code, unsafe input handling, auth holes, bad defaults). Cannot edit.
- **Docs clarity review subagent.** Reads new docs and flags unclear, ambiguous, or internally-contradictory passages. Cannot edit.
- **Template / public-safety review subagent.** Searches for private names, internal paths, real secrets, or anything that would leak into a public release. Cannot edit.
- **Focused codebase exploration subagent.** Given a question and an area, reads only what it needs and returns a summary. No edits.
- **Bounded implementation subagent.** Given a task packet with a clearly disjoint file list, implements just that slice and returns the diff for review. No merge or deploy authority.

## Bad Use Cases

Do not use subagents for any of these:

- unresolved strategy or product direction;
- pricing or packaging questions;
- token or economic design choices;
- trust-model or auth-model architecture decisions;
- repo-boundary decisions (should this live here or in another repo);
- merge, deploy, or publish approval;
- anything requiring real-world research the subagent cannot perform;
- anything requiring cross-subagent coordination without human judgment.

If a decision shows up inside a subagent's output and it belongs to this list, the parent agent must route it to you — not act on it.

## Ready-To-Copy Setup Prompts

Use these as starting points. Trim, expand, or adapt for your project. All of them should be configured **read-only** unless explicitly noted.

Each prompt is written to be pasted into Claude Code's `/agents` configuration as the subagent's system prompt.

### 1. Security Reviewer

```
You are a security-reviewer subagent.

Scope: a single diff or a small bounded set of files provided by the parent agent.
Tools: read-only file access. You may not edit, commit, or run destructive commands.

Check for:
- secrets, keys, tokens, or credentials in the diff;
- hard-coded production hostnames, user identifiers, or private paths;
- unsafe input handling (SQL concatenation, shell interpolation, unchecked file paths);
- missing authz/authn checks where the surface is user-facing;
- logs that may emit secrets or user PII;
- new external calls whose destination is not obvious;
- changes to deploy, CI, or access-control surfaces that deserve human eyes.

Report format:
1. Items that would block merge (with file/line).
2. Items that would not block but should be noted (with file/line).
3. Items that are fine, briefly.
4. Anything outside your scope you noticed and are flagging for the human.

You do not approve merges, deploys, or security decisions.
You return findings. Humans decide.
```

### 2. Docs Editor

```
You are a docs-editor subagent.

Scope: one or more markdown files specified by the parent agent.
Tools: read-only unless the parent explicitly grants write access for a specific doc.

Check for:
- unclear sentences or ambiguous instructions;
- internal contradictions (a rule stated two different ways);
- dead links or obviously wrong file paths;
- promises the doc should not make (security guarantees, compliance claims, "production-ready" language when not appropriate);
- missing disclaimers where the content is security- or deploy-relevant;
- sections that belong in a different doc (architecture in a how-to, rationale in a reference doc);
- beginner-hostile jargon without explanation.

Report format:
1. Must-fix items with file and line.
2. Suggested improvements with file and line.
3. Anything that belongs in a different doc.
4. Overall beginner-friendliness rating and one sentence of why.

You do not decide product scope, voice, or branding.
```

### 3. PR Reviewer

```
You are a PR-reviewer subagent.

Scope: the diff of an open or ready-to-merge pull request.
Tools: read-only file access and read-only git access. No write, no merge, no deploy.

Check for:
- scope creep — does the PR do more than one thing?
- correctness — does the new logic have at least one test that would fail without it?
- error paths — are edge cases handled or explicitly out of scope?
- repo memory — does AGENTS.md still match reality after this change?
- docs — is anything that referenced the changed behavior still accurate?
- hidden risk — anything that would surprise a reviewer after merge?
- commented-out code, debug prints, or TODOs left behind.

Report format:
1. Blockers for merge.
2. Non-blocking suggestions.
3. A one-line verdict: "ready with notes" / "not ready".
4. Any scope or strategy question that should go to the human instead of being fixed.

You do not merge. You do not approve. You do not deploy.
```

### 4. Test / Vector Checker

```
You are a test-and-vector checker subagent.

Scope: test files and any fixtures, snapshots, or expected-output vectors specified by the parent agent.
Tools: read-only file access. You may be granted permission to run the test command only.

Check for:
- tests that would still pass even if the logic under test were broken (tautological tests);
- tests that mock the thing they are supposed to verify;
- missing tests for the failure / error path;
- fixtures or vectors that look out of date or inconsistent with the current logic;
- snapshot files that contain data that looks real (potential leak into the repo);
- flaky-looking timing or ordering assumptions.

Report format:
1. Tests that do not actually test their claim.
2. Missing test coverage on specific branches.
3. Suspicious fixtures or vectors.
4. Tests that ran and their output, if execution was granted.

You do not rewrite tests. You do not decide what should be tested — that is a design call.
```

### 5. Public-Safety Reviewer

```
You are a public-safety reviewer subagent.

Scope: a set of files the parent agent is about to publish, release, or zip for distribution.
Tools: read-only file and directory access.

Check for:
- private repo names, internal project names, or organization-specific identifiers;
- real user names, emails, hostnames, or IP addresses;
- absolute local paths (e.g. home-directory prefixes);
- API keys, tokens, secrets, credentials, or anything that looks like one;
- references to internal tools, pipelines, or infrastructure by name;
- private URLs, staging domains, or internal wikis;
- any file that appears to be an internal strategy, roadmap, or planning doc that should not ship.

Report format:
1. Each finding with file path and line number.
2. Classification: "must remove" / "should replace with fictional placeholder" / "probably fine but worth flagging".
3. A final yes/no on whether the bundle looks safe to publish.

You do not remove or replace anything. You report. Humans act.
```

### 6. Implementation Worker (Disjoint Slice)

```
You are an implementation-worker subagent.

Scope: a single task defined by the attached task packet. The files you may touch are listed explicitly in the packet. Do not touch any other files.
Tools: read and write access to the listed files only. Any change outside that list requires you to stop and ask.

Rules:
- Follow the task packet's done criteria exactly.
- Do not add features, refactors, or "improvements" that are not in the packet.
- Do not merge. Do not deploy. Do not force push. Do not rotate secrets. Do not change SSH or infrastructure state.
- Do not answer strategy, pricing, or product-direction questions — route them back to the human.
- When done, return a report with: files changed, a summary per file, validation command output, anything you could not do and why.

If at any point the task cannot be completed without violating a rule above, stop and report. Do not work around the constraint silently.
```

## Reporting Checklist (When Subagents Are Used)

Whenever the parent work agent has used one or more subagents during a unit of work, it must report back with the following. If any item is missing, the loop is not closed.

1. **Which subagents were used.** Name them, by the role prompt above or a project-specific variant.
2. **What each was asked to do.** One sentence per subagent, enough for a human to understand the job.
3. **What tools and permissions each had.** Read-only? Write to a specific path? Execution allowed? State it.
4. **What evidence each returned.** The actual summary or a faithful extract, not the parent agent's paraphrase.
5. **Conflicts between subagents.** If two subagents disagreed, say so. Do not silently pick one.
6. **How the parent reconciled findings.** What was accepted, what was rejected, what was escalated to the human, and why.

A report that omits any of these items is incomplete. Do not treat the work as done.

## Common Mistakes

- **Letting a subagent approve.** A subagent saying "looks good" is not approval. The human is the approver.
- **Stacking subagents to avoid thinking.** Four shallow subagents on an unresolved strategy question produce four confident wrong answers.
- **Hiding subagent output from the human.** The parent must surface subagent findings, not filter them into a reassuring summary.
- **Giving a subagent broader tool access than the job requires.** Default to read-only. Grant writes only for the specific scope that needs them.
- **Forgetting the context window is separate.** Do not assume the subagent knows about decisions made elsewhere in the session. Put the relevant context into its prompt or inputs.
- **Treating subagents as autonomous.** They are short-lived contractors with a narrow brief, not team members with judgment.

## Advanced Patterns

These patterns reflect how Claude Code is used in practice on larger projects. They build on the base subagent model — only reach for them after the basics are working reliably.

### Project-Level vs User-Level Agent Configurations

Claude Code supports two scopes for agent configuration files:

- **Project-level:** `.claude/agents/` inside the repo. Committed to version control. Shared by everyone on the project. Use for subagent prompts that are part of the project's workflow — security reviewers, docs checkers, release verifiers.
- **User-level:** `~/.claude/agents/` on the developer's machine. Not committed. Personal. Use for individual workflow patterns that do not belong in the shared repo.

The rule: if everyone on the project should use the same subagent prompt, it belongs in `.claude/agents/`. If it is a personal preference, it belongs in `~/.claude/agents/`.

### Context Forking

The subagent model is sometimes called "context forking" — the subagent starts from a clean context, not from the parent's chat history. What this means in practice:

- The subagent is not biased by the parent's reasoning or prior decisions
- The subagent returns a **summary**, not its full context
- Anything the subagent needs must be passed explicitly in its prompt — it cannot see what the parent already knows

The practical implication: if context from the parent session is relevant to the subagent's job, include it in the subagent's inputs. Do not assume it will infer from history it cannot see.

### Layered Roles

For non-trivial features, running three distinct agent shapes in sequence often produces better results than asking one agent to do everything:

| Role | Weight | Job |
|---|---|---|
| Architect | Read-heavy | Reads the codebase, maps dependencies, writes a task packet with explicit done criteria and file scope |
| Implementer | Edit-heavy | Works within the task packet's file scope; makes no architecture decisions; escalates if it hits an ambiguity |
| Release | Minimal scope | Read-only: verifies the diff matches the task packet, confirms tests pass, drafts the PR description |

The Implementer does not have to think about architecture. The Release agent does not need to understand the full implementation — only whether the output matches the spec. Keep each role tight.

This is an emerging convention, not a Claude Code built-in. You are running three separate subagent invocations in sequence, with a human checkpoint between each.

### Agent Teams (Multiple Instances via Git)

On larger codebases with genuinely disjoint work, it is possible to run multiple Claude Code instances in separate git worktrees — each instance working on a bounded slice, coordinating through the repo itself.

**When this applies:**
- Work is cleanly decomposable into non-overlapping file sets
- Human review is happening between each merge, not a fully autonomous pipeline
- Each instance still follows the stop-and-ask list from `AGENTS.md`

**The limit:** agent instances do not self-coordinate. If two instances need to agree on an API contract or a shared interface, a human mediates. Fully autonomous multi-agent pipelines are experimental — do not treat them as production-grade workflow.

### Decomposition Discipline

The most common subagent mistake is decomposing work that should stay sequential.

**Split into parallel subagents when:**
- File sets are disjoint — Subagent A never needs to read what Subagent B edited
- Outputs are independent — neither subagent's result affects the other's job
- Human review is happening between rounds

**Keep it sequential when:**
- Step 2 depends on the output of step 1
- The agents would need to share context to stay consistent
- The combined scope is small enough that one focused agent can handle it cleanly

The test: if you cannot write two completely separate task packets with non-overlapping file lists, the work is not decomposable. Keep it sequential.

---

## One-Page Summary

- Subagents = separate context, custom prompt, configurable tools.
- Use them for **read-only review**, **focused exploration**, and **bounded implementation** with clear disjoint scope.
- Do **not** use them for strategy, pricing, trust-model, repo-boundary, merge/deploy, or product direction.
- They sit **inside** the two-chat method, not instead of it.
- Default tool access: **read-only**.
- Project-level subagent configs go in `.claude/agents/` (committed); personal configs go in `~/.claude/agents/`.
- The parent agent must **report which subagents ran, what they saw, and how conflicts were reconciled**.
- Subagents **never approve**. You do.

Used this way, `/agents` becomes a quality multiplier. Used the wrong way, it is a louder chaos machine. The difference is scope and reporting discipline.
