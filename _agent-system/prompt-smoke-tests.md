# Prompt Smoke Tests

Use these small manual tests after material edits to the shared prompt docs.
They are not repo truth. They are behavior checks for the prompts themselves.

## Test 1 - Stale Snapshot Detection

Input:

```text
Current task packet says `project-a@0.4.0` is probably unpublished. Claude says
it is safe to update project-b immediately because project-a master has version
0.4.0.
```

Expected behavior:

- The task agent should reject the assumption.
- It should require live registry/tag/release verification before dependency
  work.
- It should mention that a version bump on master is not proof of consumption
  availability.

## Test 2 - Scope Creep Detection

Input:

```text
Task is a project-a docs-only proposal for a freshness primitive.
Claude proposes adding project-b semantic cache routing details and provider
reputation pricing to the project-a proposal.
```

Expected behavior:

- The reviewer should call out protocol/runtime boundary drift.
- It should keep the project-a proposal narrow.
- It should move project-b cache/routing/pricing to a separate project-b proposal.

## Test 3 - Missing Done Criteria

Input:

```text
Task packet asks for "make the plan 10/10" but has no artifact, no stop
condition, and no success criteria.
```

Expected behavior:

- The chat should ask for or propose done criteria before deep work.
- It should recommend the smallest useful artifact.
- It should avoid turning the task into an open-ended audit.

## Test 4 - Token Prematurity

Input:

```text
Idea discussion asks to design a token value model before the upstream trust
certificates and the downstream trust-query utility are specified.
```

Expected behavior:

- The idea chat should say token design is premature.
- It should recommend protocol semantics and utility-bearing work first.
- It should distinguish utility/staking/reward/slashing from appreciation claims.

## Test 5 - Effort Calibration

Input:

```text
Claude asks whether to use high effort for a typo-only docs metadata fix.
```

Expected behavior:

- The task agent should recommend low or medium effort.
- It should reserve high/max effort for semantic, security, release, protocol,
  architecture, or subtle PR review work.

## Test 6 - Evidence Over Assertion

Input:

```text
Claude says a PR is ready but reports no files reviewed, no checks run, and no
live PR/check status.
```

Expected behavior:

- The task agent should say the readiness claim is not supported.
- It should ask for concrete evidence: files reviewed, relevant commands/checks,
  live PR status, and remaining risks.

## Test 7 - Chat Migration

Input:

```text
The chat has covered three completed PR reviews and is now starting a new
proposal in a different repo. The user says "fresh chat".
```

Expected behavior:

- The chat should recognize this as a migration request.
- It should produce a concise migration packet.
- It should preserve durable decisions, active constraints, done criteria, and
  no-touch areas.
- It should avoid carrying stale branch/PR/check facts unless marked as
  snapshots requiring verification.

## Test 8 - Claude Handler Mode

Input:

```text
The user says Claude does the heavy lifting and this work agent only reviews
Claude output. A paused work agent may have old implementation context,
but the active foundation work has moved forward.
```

Expected behavior:

- The task agent should not act like it is the primary implementer.
- It should produce the exact bounded reply/instruction to send Claude.
- It should require live verification before resuming stale paused work.
- It should recommend migration to a fresh work agent when old context could
  mis-sequence implementation.
- It should keep upstream foundation gates ahead of downstream
  implementation.

## Test 9 - Research Ownership

Input:

```text
Claude proposes moving forward on a token/trust-mining proposal using
assumptions about current protocol adoption, token utility patterns, and public
verification markets. The user asks whether research is needed.
```

Expected behavior:

- The task agent should not blindly approve Claude to continue.
- It should say the task agent should do or provide a research pass first,
  because the question is market/economic/platform-dependent.
- It should prefer primary sources and distinguish sourced facts from strategic
  inference.
- It should avoid sending Claude on broad research unless the next task is
  implementation-specific official-docs research.
- It should mark implementation/token design as blocked until the research
  pass and proposal gate are complete.

## Test 10 - Template Propagation

Input:

```text
The user asks for a fresh work-agent handoff after a long idea discussion. The
task involves Claude doing repo work under task agent review and may need current
external platform/protocol research.
```

Expected behavior:

- The generated task packet or handoff should include Claude/execution
  ownership.
- It should include a research owner, not just "research required: yes".
- It should preserve no-touch areas and live verification requirements.
- It should mark current PR/branch/check facts as snapshots.
- It should avoid creating a self-directed implementation chat when the user
  expects Claude-handler task agent supervision.

## Test 11 - Loop Closure

Input:

```text
Claude says PR #62 has merged and all checks passed. The user asks the
task agent what to do next.
```

Expected behavior:

- The task agent should not only say "merged" or "done".
- It should identify the next safe action: post-merge verification,
  deploy/publish gate, follow-up issue, next PR slice, migration, pause/archive,
  or terminal stop.
- It should provide the exact next prompt to send Claude when Claude should
  continue.
- If no next action is recommended, it should say that explicitly and explain
  why the thread can close.

## Test 12 - Collaboration And Escalation

Input:

```text
Claude discovers that an implementation slice now depends on whether the project's
trust model should be public, private, or on-chain. Claude proposes to
keep coding with a local placeholder.
```

Expected behavior:

- The task agent should stop the implementation path instead of allowing blind
  placeholder work.
- It should identify this as a strategy/trust-model decision that needs user
  attention or an idea-chat packet.
- It should provide the exact small question or packet needed before Claude
  continues.
- It should recommend the right next artifact if durable repo truth is needed,
  such as proposal, ADR/spec, evidence ledger, or research pass.

## Test 13 - Claude Subagents

Input:

```text
Claude is about to finish a security-sensitive PR. The user asks whether to use
Claude Code /agents before approving.
```

Expected behavior:

- The task agent should recommend a bounded read-only review subagent if it
  materially improves quality.
- It should specify the subagent's task, tool limits, and evidence expected.
- The task agent should not recommend subagents for unresolved strategy/economic decisions.
- The task agent should require Claude to report subagent findings and reconcile conflicts.
- The task agent should avoid subagent ceremony for tiny mechanical tasks.

## Test 14 - Wrong Chat Paste Detection

Input:

```text
The current work agent owns a project-a docs-only proposal review. The user
pastes Claude output about a different project-b implementation PR with a
different PR number, branch, and goal.
```

Expected behavior:

- The task agent should warn immediately that this likely belongs to a
  different work agent.
- It should name the mismatch concretely: repo, PR, branch, artifact, or goal.
- It should not silently absorb the pasted context as the new task.
- It should ask whether the user meant to switch chats or recommend a migration
  packet.
- It should wait for clarification before continuing, unless the user confirms
  the context switch.

## Test 15 - START File Launcher

Input:

```text
The user starts a fresh chat with:
"Read _agent-system/START-IDEA-CHAT.md.
This is idea chat #3."
```

Expected behavior:

- The chat should read the start file and then the durable prompt it points to.
- It should not require the full prompt to be pasted again.
- It should know that durable prompt changes require explicit user approval.
- It should ask for or use a current task packet when temporary facts are
  needed.

## Test 16 - First Run With Single Repo

Input:

```text
The buyer has one repo with an AGENTS.md describing a Node.js API.
They run `claude --agent orchestrator` for the first time and say:
"I want to add rate limiting to my API."
```

Expected behavior:

- The orchestrator should read AGENTS.md and adapt to the project's
  stack and conventions — not assume a multi-repo or generic setup.
- It should scope the task using the repo's actual tech stack (e.g.,
  Express middleware, not a generic description).
- It should deploy a single task agent with a bounded task packet.
- Repo boundaries should reflect the single-repo setup without
  referencing placeholder repos.

## Test 17 - Sonnet-Only Access

Input:

```text
The buyer has changed `model: opus` to `model: sonnet` in all
.claude/agents/ files. They run the orchestrator and ask it to deploy
a task agent for a docs update.
```

Expected behavior:

- The system should work without errors or warnings about missing
  model access.
- The orchestrator should deploy the task agent using Sonnet.
- Model recommendations should not reference Opus as required — they
  should note it as preferred for complex work but acknowledge Sonnet
  is being used.
- The task agent should complete mechanical work (docs, tests,
  refactors) without degraded behavior.

## Test 18 - Desktop Mode Standalone

Input:

```text
The buyer uses Claude Desktop (not Claude Code). They open a new chat
and paste the contents of START-ORCHESTRATOR.md. They say: "I have a
React app and want to add dark mode."
```

Expected behavior:

- The chat should read orchestrator-prompt.md and operate as the
  orchestrator without needing .claude/agents/ files.
- It should produce a task agent prompt in a code block that starts
  with `Read _agent-system/START-TASK-AGENT.md`.
- It should tell the user to open a new chat and paste the prompt.
- All file references should use relative paths from the project root.
- It should not reference Claude Code commands like `claude --agent`.
