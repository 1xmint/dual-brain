# Current Task Packet Template

Use this after the durable chat prompt and before Claude output, a
proposal draft, or a work request.

This is now the transport fallback.
If the work has a canonical slice doc, point to the slice and only inline the
minimum transport truth here.

```text
From:   <layer> <name> (<model>)
Intent: actualize | review | pressure-test | escalate | report | ask
Confidence: high | medium | low
Status: decision | proposal | draft | in-progress | blocked

Collaboration handshake:
- I am:
- You are:
- Your role on this task:
- Your current ownership:
- What you should say back in your first 2-3 lines so the next chat knows you loaded the handoff correctly:
- Intended recipient session ID:
- Hard-stop if this is not you:

Current task packet

Canonical work doc:
- Slice doc path:
- If none, say why a standalone packet is still enough:

Chat type:
- Brainstorm / proposal design / agent supervision / implementation handoff / PR review

Routing / state gate:
- Current chat state:
  - fresh start / active healthy / active drifting / stale overloaded /
    handoff received / resume after crash or shutdown / migration target /
    wrong-chat contamination / wrong-layer wrong-tool / model mismatch /
    strategy unresolved / completed-closeout
- Recommended intervention:
  - additive update / task-packet refresh / handoff acknowledgement /
    migration packet / resume packet / reroute-stop-and-warn /
    escalate upward / model-routing correction / closeout / fresh startup
- Why this intervention is the lightest honest move:

Repo(s):
- Primary repo:
- Secondary repos:
- Repos explicitly out of scope:
- Chat ownership / active workstream:
  - what this chat currently owns so wrong-chat pastes can be detected quickly

Goal:
- What are we trying to decide or complete?

Success / done criteria:
- What would count as finished?
- What evidence should prove it is finished?
- What should cause the task to stop and ask for direction?
- What should happen immediately after completion or merge:
- What requires user attention or brainstorm escalation:

Why now:
- Why this is the next priority:
- What upstream work is complete:
- What downstream work this unblocks:

Current state snapshot:
- Relevant PRs/issues/branches:
- Relevant accepted ADRs/specs/proposals:
- Relevant package/deploy/publish state:
- Known blockers:
- Facts that must be verified live before action:
- Assumptions that are not yet verified:
- Existing canonical review memo, if any:

Hard constraints:
- No-touch areas:
- No implementation yet / docs-only / code allowed:
- No merge/deploy/publish without approval:
- Scope boundaries:
- Security or release constraints:

Repo-boundary rules:
- What [repo-1] owns:
- What [repo-2] owns:
- Settled decisions that must not be re-litigated:

Expected output:
- Exact artifact wanted:
- Format:
- Transport choice:
  - continue here / update doc / paste into named chat / launch / decision
    needed / stop here
- Loop-closure expectation:
- Escalation expectation:
- Whether to produce a Claude/subagent prompt:
- Whether to produce a chat migration packet:
- Whether to update the canonical slice instead of rewriting this packet:
- Recommended model/effort level:
- Whether the task should be split or delegated:
- Whether online research/live verification is needed:
- Research owner:
- Reflection expectation:
  - checkpoint only / checkpoint + completion / event-triggered only / trust-lane elevated

Claude/subagent context, if any:
- Paste Claude's latest output or plan here.
- If pasted context may belong to another chat, say so explicitly.
```
