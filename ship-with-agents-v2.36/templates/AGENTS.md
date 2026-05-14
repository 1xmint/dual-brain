# AGENTS.md

This file is the canonical repo memory for humans and agents working in this project.

Keep it short, sharp, and true. If a line stops being true, fix it the same day.
If this file grows large, keep the hot path here and move longer detail into
task-specific docs such as `SPEC.md`, `PLAN.md`, and `STATUS.md`.

## Repo Role

- One-sentence identity: `<what this repo is, in one line>`
- Primary users: `<humans / agents / services>`
- What this repo does **not** own: `<adjacent surfaces owned by other repos / systems>`

## Source Of Truth

- GitHub is the source of truth.
- Trunk branch: `<main-or-master>`
- Canonical remote: `<remote-url>`

## Standard Workflow

- Normal flow is: branch → PR → checks → merge → deploy/publish.
- Do not use direct server pushes for normal development.
- Use CI/CD (GitHub Actions or equivalent) for deploys and publishes unless explicitly doing emergency recovery.

## Merge Conventions

- Default to **Squash and merge**.
- Use **Merge commit** only when preserving branch history is intentionally valuable.
- If a PR is ready but checks are still running, prefer enabling auto-merge.
- Agents must **ask before merge or deploy**. After approval, agents may perform the action.

## Branch And PR Rules

- Verify the actual current branch before starting work. Do not trust stale session headers.
- Keep PRs small, focused, reviewable.
- Do not mix unrelated work into the same PR.

## Validation Commands

Realistic, lightweight commands that matter for normal work. Replace the examples.

- typecheck: `<command>`
- build: `<command>`
- unit tests: `<command>`
- lint: `<command>`

## Deploy Truth

- Deploy workflow name: `<workflow-name>`
- Publish workflow name: `<workflow-name-or-n/a>`
- Live server path: `<server-path-or-n/a>`
- Standard admin access path or alias: `<ssh-alias-or-n/a>`
- Deploy user / path assumptions: `<notes>`

## Secrets

- Where secrets live: `<secret-store>`
- What must never be committed: `<examples>`
- Rotation expectations: `<cadence-or-on-event>`

## Security Defaults

Generic defaults, not a security audit. Adjust for your project.

- Prefer least privilege. Give humans, agents, and services the smallest access they need to do the job.
- Do not broaden deploy-user SSH access casually.
- Keep raw internal service ports off the public internet unless exposure is intentional.
- Treat backup and restore as part of production readiness, not as optional cleanup.

## Critical Gotchas

Few but high-signal. Each item must still matter today.

- `<example: live DB path is X; backup script must write to the same path>`
- `<example: import helpers from the barrel file, not internal files directly>`
- `<example: the production cron runs at :05, do not deploy in the 5-minute window>`

## Working Style

- Prefer small, foundation-first changes over giant speculative rewrites.
- Call out hidden deploy or runtime assumptions before coding.
- If a plan depends on current guidance or security-sensitive behavior, verify with current sources.
- Keep the hot path small and behavioral. Use separate docs for long
  explanations, edge cases, or current-project work truth.

## Project Memory Stack

Suggested default stack:

- `AGENTS.md` for durable repo-wide truth
- `CLAUDE.md` for Claude Code-specific memory
- `SPEC.md` for the current bounded problem statement
- `PLAN.md` for the current execution plan
- `STATUS.md` for present-tense execution truth

## Stop-And-Ask List

Agents must stop and wait for a human before:

- merging a PR;
- deploying or publishing;
- force-pushing;
- deleting files, branches, tags, or data;
- rotating secrets or keys;
- any SSH or infrastructure-access change;
- any migration against real user data;
- any change to paying-customer surfaces;
- any strategy, pricing, licensing, or legal decision;
- any security-boundary change (auth, permissions, exposure);
- whenever the agent is unsure a prior step actually worked.

## Loop Closure Rule

An agent may not mark work "done" without concrete evidence: file path, diff, test output, or verified behavior. "Done" alone is not accepted.

## Access Note

Documentation does not grant access by itself. Real access depends on keys, config, policy, and active auth state. If a doc conflicts with live reality, verify live reality first and update the doc promptly.
