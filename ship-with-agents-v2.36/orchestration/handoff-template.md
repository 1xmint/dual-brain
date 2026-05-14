# Agent Handoff Template

Use this when a brainstorm is ready to become a bounded agent task.

```text
From:   <layer> <name> (<model>)
Intent: actualize | review | pressure-test | escalate | report | ask
Confidence: high | medium | low
Status: decision | proposal | draft | in-progress | blocked

Collaboration handshake:
- Sender identity and role:
- Recipient identity and role:
- Intended recipient session ID:
- Recipient ownership once accepted:
- First-line acknowledgement the recipient should use:
- Hard-stop if this is not you:

Agent handoff

Canonical work doc:
- Slice doc path:
- If no slice exists yet, should the recipient create one first:

Repo:

Task type:
- proposal / ADR / spec / docs-only plan / implementation slice / PR review / release preflight

Priority:

Upstream state:
- What is complete:
- What is blocked:
- What must be verified live:

Goal:

Done criteria:
- What must be true before this task is considered complete:
- What evidence should be reported:
- When to stop and ask:
- What to do immediately after completion or merge:
- What requires user attention or brainstorm escalation:

Non-goals:

Files/areas likely involved:

Files/areas out of scope:

Required verification before editing:

Required artifact:

Quality bar:

Loop-closure expectation:
- always provide next Claude prompt / next verification / migration packet /
  pause/archive recommendation / terminal stop with reason
- exact delivery mode:
  - continue here / update doc / paste into named chat / launch / decision
    needed / stop here

Escalation expectation:
- flag user decisions / brainstorm packets / research gates / proposal-ADR-spec
  needs instead of blindly continuing implementation

Assumptions to verify or preserve:

Recommended execution settings:
- Model/effort level:
- Whether to split/delegate:
- Claude/execution ownership:
  - Claude does heavy repo work under supervisor review / supervisor may edit
    locally / report-only
- Claude `/agents` usage:
  - not needed / use read-only review subagent / use focused research or docs
    subagent / use bounded implementation subagent with disjoint ownership
- Whether online research/live verification is required:
- Research owner:
  - agent researches before Claude continues / Claude researches
    official coding docs / no online research needed / live repo-GitHub
    verification required
- Reflection expectation:
  - what should be captured if friction, wins, or packet gaps appear
- Audited closeout expectation:
  - none / standard second-brain review / true dual-brain audited closeout

Tests/checks expected:

Merge/deploy/publish policy:

Exact instructions:

[Paste final work prompt here.]
```

## Handoff Rules

- Keep work bounded to one repo unless cross-repo work is explicitly required.
- For agent chats, assume the agent is the main execution owner unless the
  task explicitly wants separate helper subagents or a desktop-style split.
- Prefer proposal/ADR/spec before implementation when trust model, protocol
  semantics, repo boundaries, production behavior, release posture, or public
  API changes.
- Assign research ownership explicitly instead of sending Claude on broad
  online research by default.
- Use Claude `/agents` subagents only when they improve quality through bounded
  independent review, focused exploration, or disjoint implementation work.
  Require Claude to report which subagents were used and what evidence they
  returned.
- Include no-touch areas so the subagent can avoid accidental scope expansion.
- Include live verification requirements for PRs, checks, packages, publishes,
  deploy state, and security-sensitive dependencies.
- State whether the subagent can edit files or should only report.
- Include done criteria so the subagent does not keep expanding the task after
  the useful artifact is complete.
- When a canonical slice exists, keep it authoritative and avoid duplicating
  the whole packet body in multiple places.
- Include what should happen after completion or merge so the agent does
  not stop at a passive status update.
- Include when to involve the user, a brainstorm, research, or a durable repo
  artifact so the agent does not push Claude through the wrong decision
  layer.
- If the handoff is going to another chat, include the exact copy block instead
  of leaving the user to reconstruct it from prose.
