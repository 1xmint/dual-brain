# Chat Migration Template

Use this when a work agent, task agent, or idea chat has become long, stale, confused,
or is switching to a materially new workstream.

Migration phrases the chats should understand:

- migrate chat
- fresh chat
- start a fresh work agent
- compact this into a new task packet
- make a migration packet
- prepare handoff to a new chat

## When To Recommend Migration

Recommend a fresh chat when:

- the chat has accumulated multiple completed subtasks or old workstreams
- the next task has a different repo, artifact, or decision surface
- the chat is repeating stale assumptions
- context is getting hard to audit
- the user asks for a new phase, new PR, new proposal, or new implementation
  slice
- the model starts missing constraints already stated earlier
- live verification is needed and old context may bias the result

Do not recommend migration just to avoid doing a small next step. If the task is
nearly complete, finish it and then prepare a handoff if useful.

## Migration Packet

```text
Chat migration packet

New chat type:
- idea discussion / task agent / implementation work / PR review / release preflight

Why migrate:
- What became long/stale/confused:
- Why a fresh chat improves quality:

Repo(s):
- Primary repo:
- Secondary repos:
- Repos explicitly out of scope:
- Chat ownership / active workstream:
  - what the new chat will own, so wrong-chat context can be rejected quickly

Durable context to preserve:
- Repo boundaries:
- Accepted decisions:
- Active constraints:
- Security/release/deploy rules:

Current state snapshot:
- Relevant PRs/issues/branches:
- Relevant accepted ADRs/specs/proposals:
- Package/publish/deploy/check state:
- Known blockers:
- Facts that must be verified live:

Completed work not to re-litigate:
- What is done:
- What should not be reopened unless new evidence appears:

Active task:
- Goal:
- Done criteria:
- What to do immediately after completion or merge:
- What requires user attention or idea-chat escalation:
- Non-goals:
- Required artifact:
- Files/areas likely involved:
- Files/areas out of scope:

Execution settings:
- Recommended model/effort level:
- Whether to split/delegate:
- Claude/execution ownership:
  - Claude does heavy repo work under supervisor review / supervisor may edit
    locally / report-only
- Claude `/agents` usage:
  - not needed / use read-only review subagent / use focused research or docs
    subagent / use bounded implementation subagent with disjoint ownership
- Whether online research/live verification is required:
- Research owner:
  - task agent researches before Claude continues / Claude researches
    official coding docs / no online research needed / live repo-GitHub
    verification required

Exact first message for the new chat:

[Paste durable prompt or instruction here.]

Exact task packet for the new chat:

[Paste current task packet here.]
```

## Migration Rules

- Treat current-state facts as snapshots requiring verification.
- Preserve source-of-truth order: repo `AGENTS.md`, live GitHub/package/CI/deploy
  state, local Git, accepted ADRs/specs/proposals, then pasted context.
- Keep the migration packet shorter than the old chat. Carry the spine, not the
  sediment.
- Include done criteria so the new chat knows when to stop.
- Include loop-closure expectations so the new chat gives the next action after
  status, completion, checks, or merge.
- Include escalation expectations so the new chat knows when to ask the user,
  produce an idea-chat packet, require research, or recommend a repo decision
  artifact.
- Include no-touch areas so the new chat does not reopen closed work.
- Include Claude/execution ownership and research ownership so the fresh
  chat does not accidentally turn into a self-directed implementation chat.
- Include the active workstream clearly so the new chat can warn on wrong-chat
  pastes instead of absorbing them silently.
