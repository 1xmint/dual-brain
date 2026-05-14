# Work-Agent Handoff Template

Use this when an idea discussion is ready to become a bounded work-agent task.

```text
Work-agent handoff

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
- What requires user attention or idea-chat escalation:

Non-goals:

Files/areas likely involved:

Files/areas out of scope:

Required verification before editing:

Required artifact:

Quality bar:

Loop-closure expectation:
- always provide next Claude prompt / next verification / migration packet /
  pause/archive recommendation / terminal stop with reason

Escalation expectation:
- flag user decisions / idea-chat packets / research gates / proposal-ADR-spec
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
  - task agent researches before Claude continues / Claude researches
    official coding docs / no online research needed / live repo-GitHub
    verification required

Tests/checks expected:

Merge/deploy/publish policy:

Exact instructions:

[Paste final work prompt here.]
```

## Handoff Rules

- Keep work bounded to one repo unless cross-repo work is explicitly required.
- For task agent chats, assume Claude is the implementation/repo-work
  agent and the task agent is the babysitter/reviewer unless the user
  explicitly says the task agent should edit or run local checks.
- Prefer proposal/ADR/spec before implementation when trust model, protocol
  semantics, repo boundaries, production behavior, release posture, or public
  API changes.
- Assign research ownership explicitly instead of sending Claude on broad
  online research by default.
- Use Claude `/agents` subagents only when they improve quality through bounded
  independent review, focused exploration, or disjoint implementation work.
  Require Claude to report which subagents were used and what evidence they
  returned.
- Include no-touch areas so the work agent can avoid accidental scope expansion.
- Include live verification requirements for PRs, checks, packages, publishes,
  deploy state, and security-sensitive dependencies.
- State whether the work agent can edit files or should only report.
- Include done criteria so the work agent does not keep expanding the task after
  the useful artifact is complete.
- Include what should happen after completion or merge so the task agent does
  not stop at a passive status update.
- Include when to involve the user, an idea chat, research, or a durable repo
  artifact so the task agent does not push Claude through the wrong decision
  layer.
