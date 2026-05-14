# Current Task Packet Template

Use this after the durable chat prompt and before Claude output, a proposal
draft, or a work request.

```text
Current task packet

Chat type:
- Idea discussion / proposal design / task agent supervision / implementation handoff / PR review

─────────────────────────────────────────────────────────────────────────────
TASK AGENT: YOUR ONLY JOB IS TO PRODUCE THE WORK-AGENT PROMPT.
You are NOT the implementer. The task below describes what to build.
That does not mean you build it. You read enough to write a bounded
prompt, then you stop and produce that prompt in a code block.
You do NOT create files, edit code, run tests, or execute git commands.
If you are about to do any of those things — STOP. Write the prompt.
─────────────────────────────────────────────────────────────────────────────

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
- What requires user attention or idea-chat escalation:

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

Verify before coding (required for integration work):
- Dependency install status:
  - Is the upstream package already in package.json / go.mod / etc.?
  - If not, what is the correct install command and version?
- Correct import paths:
  - What is the actual exported name from the upstream package?
  - Cross-repo imports are not possible — does this need a local client wrapper?
- Target system storage model:
  - Is data stored in SQLite / file-based / in-memory / external DB?
  - Read the relevant db/storage file before assuming.
- Upstream API behavior assumptions:
  - What methods are available? Verify against source or published types, not assumptions.
  - Does the upstream method do X automatically, or must we call it explicitly?
- Leave blank (or write "N/A — greenfield") if this is not integration work.
- Check for stale worktrees before branching.
  Run `git worktree list` — any worktree holding the target branch will
  block `git checkout`. Remove stale worktrees first with
  `git worktree remove <path>`.
- For publish workstreams: before issuing a tag push, verify the workflow
  hasn't already run. Check `gh run list --workflow=publish-packages.yml`
  and `npm view <package> dist-tags.latest` — detects prior completion and
  prevents duplicate-tag stops.
- Required upstream artifacts (proposals, ADRs, specs) — verify these exist
  on the target branch (not just in git history). Squash merges can silently
  drop files that were bundled into unrelated feature branches.

Hard constraints:
- No-touch areas:
- No implementation yet / docs-only / code allowed:
- No merge/deploy/publish without approval:
- Scope boundaries:
- Security or release constraints:

Repo-boundary rules:
- What claw-net owns: orchestration runtime, API, billing, auth integration, deploy
- What Soma owns: protocol semantics, credential/trust primitives, npm packages
- What pulse owns: X-only social agent logic, product-specific features
- Settled decisions that must not be re-litigated:

Decision needed:
- What question must be answered?
- What would count as good enough?
- What should not be decided yet?
- What evidence would change the decision?

Quality bar:
- What would make this 10/10?
- What failure modes must be avoided?
- What clone/security/production-readiness concerns matter?

Expected output:
- Exact artifact wanted:
- Format:
- Loop-closure expectation:
  - always provide next Claude prompt / next verification / migration packet /
    pause/archive recommendation / terminal stop with reason
- Escalation expectation:
  - flag user decisions / idea-chat packets / research gates / proposal-ADR-spec
    needs instead of blindly continuing implementation
- Whether to produce a Claude/work-agent prompt:
- Claude/execution ownership:
  - Claude does heavy repo work under supervisor review / supervisor may edit
    locally / report-only
- Claude `/agents` usage:
  - not needed / use read-only review subagent / use focused research or docs
    subagent / use bounded implementation subagent with disjoint ownership
- Whether to produce a chat migration packet:
- Whether to propose repo docs/ADR/proposal changes:
- Recommended model/effort level:
- Whether the task should be split or delegated:
- Whether online research/live verification is needed:
- Research owner:
  - task agent researches before Claude continues / Claude researches
    official coding docs / no online research needed / live repo-GitHub
    verification required

Claude/work-agent context, if any:
- Paste Claude's latest output or plan here.
- If pasted context may belong to another chat, say so explicitly.
```

## Notes

- Put temporary project facts here, not in durable prompt files.
- Mark facts as snapshots when they could have changed.
- Call out what must be verified live before approval or implementation.
- Keep this packet tight enough that the reviewing chat can reason concretely.
- Wrap pasted context in delimiters such as `<claude_output>...</claude_output>`
  when it is long or easy to confuse with instructions.
