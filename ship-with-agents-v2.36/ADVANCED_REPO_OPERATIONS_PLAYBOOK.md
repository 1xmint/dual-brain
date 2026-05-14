# Advanced Repo Operations Playbook

> This is the detailed version. For the quick-start overview, see [`PUBLIC_REPO_PLAYBOOK.md`](PUBLIC_REPO_PLAYBOOK.md).

The long-form companion to `PUBLIC_REPO_PLAYBOOK.md`. This is the detailed, opinionated version for setting up a modern, low-friction, security-aware software repo.

## When To Use This Playbook

Use this playbook when the quick-start is not enough and you need specifics:

- you are actually deploying to a VPS and want SSH posture details;
- you are running a small team and want `AGENTS.md` rules that stick;
- you want GitHub Actions conventions beyond "use them";
- you are dealing with stateful systems and want real backup / restore discipline;
- you are using AI coding agents and want their behavior to stay reliable over weeks, not just one session.

If you only want the overview, start with `PUBLIC_REPO_PLAYBOOK.md` first. It covers the same ground in about a third of the length.

Everything in this playbook is guidance, not a guarantee. **This is not a security audit, not a compliance package, and not a substitute for a real engineer or a real security review when stakes are high.** Where terms like "hardening" appear below, they mean *reasonable default posture*, not a certified or audited state.

## Audience

Small teams and solo builders who want:

- clear GitHub workflows
- fast merge flow without silent automation
- predictable deploys
- lower hallucination and tooling drift when working with agents
- durable repo memory for humans and agents

## 1. Core Principles

Use these as defaults unless you have a strong reason not to.

### GitHub is the source of truth

- Treat GitHub as the canonical history.
- Normal flow should be: branch -> PR -> checks -> merge -> deploy/publish.
- Avoid direct server pushes for normal development.
- Keep emergency/manual server changes as rare exceptions.

### Keep production paths boring

- Deploy from protected branches only.
- Use GitHub Actions for deploys/publishes.
- Prefer deterministic, repeatable workflows over shell habits.
- If a process cannot be repeated safely, it is not operationally complete.

### Optimize for low-friction approval, not silent automation

- Make merges easy.
- Keep the final decision explicit.
- Use auto-merge after approval when checks are still running.
- Do not build a system where important production changes merge silently without human awareness.

### Write down operational truth

- Put repo-specific working rules in `AGENTS.md`.
- Document live paths, deploy assumptions, branch truth, and merge conventions.
- Do not force future contributors or agents to rediscover production reality.

## 2. Recommended Repo Structure

Every serious repo should have a small, high-signal doc set.

### Minimum recommended docs

- `README.md`
  - what the repo is
  - who it is for
  - how to run it
- `AGENTS.md`
  - working rules
  - merge/deploy behavior
  - live operational gotchas
- `ARCHITECTURE.md`
  - main components
  - data flow
  - integration boundaries
- `ROADMAP.md`
  - active priorities
  - near-term direction
- `SECURITY.md`
  - reporting/security contact
  - sensitive areas
  - baseline security posture expectations

### Good optional docs

- `WHY.md` or `VISION.md`
  - long-term purpose and repo boundary
- `OPERATIONS.md`
  - deploy, backup, restore, and incident steps
- `CONTRIBUTING.md`
  - contribution flow and local expectations

## 3. AGENTS.md Template Rules

Your `AGENTS.md` should answer these questions clearly:

- What branch is the real trunk?
- What remote is canonical?
- What path is standard for deploys?
- What is the merge convention?
- When should auto-merge be used?
- What should never be assumed?
- What are the known live paths / SSH aliases / environment assumptions?

### Strong merge guidance

Recommended defaults:

- default to `Squash and merge`
- use `Merge commit` only when preserving branch history is intentionally valuable
- use auto-merge when a PR is ready but checks are still pending
- require agents to ask before merge/deploy, but let them perform the action after approval

### Strong operational guidance

Document:

- canonical GitHub remote
- live VPS path
- standard deploy workflow name
- whether direct SSH deploys are normal or emergency-only
- whether ops access is through an `ops-user`, `deploy-user`, or another role account
- warning that documentation does not grant access by itself

## 4. GitHub Setup Checklist

### Branch protection

For a solo-but-serious workflow, use:

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Do not require approvals if you are the sole maintainer
- Do not allow force pushes
- Do not allow deletions

### Auto-merge

Enable repo-level auto-merge.

Recommended usage:

- if checks are already green, merge directly
- if the PR is ready but checks are still running, enable auto-merge

This gives you low-click flow without giving up safety.

### Security toggles

Enable when available:

- Dependency graph
- Automatic dependency submission
- Dependabot alerts
- Dependabot malware alerts
- Dependabot security updates
- Grouped security updates
- Dependabot version updates
- Private vulnerability reporting
- Secret scanning / secret protection
- Push protection
- Code scanning

## 5. GitHub Actions Conventions

### Pin actions by commit SHA

Do not rely only on action tags like `@v4`.

Prefer:

- `actions/checkout@<full_sha>`
- `actions/setup-node@<full_sha>`

This reduces supply-chain risk from tag drift or compromised actions.

### Keep workflows small and purposeful

Have separate workflows for:

- CI
- deploy
- publish
- security/code scanning

Avoid giant all-purpose workflows when possible.

### Keep deploys explicit

Best default for small teams:

- merge to trunk
- manually trigger `workflow_dispatch` deploy

Better productivity version:

- human approves in chat
- agent triggers deploy from CLI

This is usually better than auto-deploying every merge while a system is still evolving.

## 6. Recommended Merge and Deploy Flow

This is the practical sweet spot.

### Normal code change

1. Create focused branch off trunk.
2. Open PR.
3. Run required CI checks.
4. Review scope and assumptions.
5. Ask for merge approval.
6. If approved:
   - merge directly if green, or
   - enable auto-merge if checks are pending
7. Trigger deploy/publish through GitHub Actions when appropriate.

### Why this works

- low manual effort
- good visibility
- safe enough for production
- easy for humans and agents to follow

## 7. VPS and Deployment Posture

### SSH posture

Strong defaults:

- disable root login
- disable password auth
- disable keyboard-interactive auth
- use key-based SSH only

### Keep the app behind the front door

- do not expose raw app ports publicly if traffic should go through a reverse proxy
- bind internal app ports to localhost only where appropriate
- verify from outside that direct app-port access is closed

### Prefer least privilege

- CI can have deploy-specific access
- humans should use the smallest admin path they need
- do not casually give everyone deploy-user SSH

### Container defaults

Reasonable default posture, not a certified hardening guide:

- run as non-root
- use `no-new-privileges`
- drop unnecessary capabilities
- prefer read-only root filesystem where practical
- use explicit writable mounts for app data

## 8. Backup and Restore Discipline

Backups are not real until restore is tested.

### Good backup habits

- keep snapshots in a predictable path
- include SQLite `db`, `-wal`, and `-shm` files together
- include checksums
- prune old snapshots on a retention policy

### Good restore drill

Test:

- snapshot creation works
- latest snapshot contains expected files
- integrity check passes
- restore procedure is documented

For SQLite:

- run `PRAGMA integrity_check;`
- make sure the runtime DB path and backup naming match reality

### Common failure mode

The biggest backup mistake is path drift:

- runtime writes one filename
- backup script expects another
- everyone thinks backups exist
- restore day proves otherwise

Always align:

- runtime DB path
- backup script defaults
- restore documentation

## 9. Tailscale / Access Control Guidance

### What to document

- the human admin SSH path
- the CI deploy SSH path
- the exact host tags used
- which users are allowed on deploy hosts

### Good least-privilege shape

- CI/tagged automation can reach deploy hosts as the deploy user if needed
- humans can reach deploy hosts as the admin user
- do not grant broad deploy-user access to humans unless you truly need it

### Important truth

Being on the same machine or using the same project does not guarantee equal SSH access across tools or sessions.

Real access depends on:

- loaded SSH keys
- SSH config
- active Tailscale auth
- Tailscale SSH policy
- local agent/tool environment

## 10. How to Make AI Agents More Reliable

### Give them repo memory

Put the following in `AGENTS.md`:

- trunk branch
- canonical remote
- merge convention
- auto-merge rule
- deploy workflow name
- live server path
- SSH alias notes
- known operational gotchas

### Make them ask before critical actions

Agents should:

- ask before merge
- ask before deploy/publish
- perform the action after approval

This is better than making the human click through everything, but safer than silent automation.

### Give them ground truth

When opening a new chat or handing work to a new agent, provide:

- current repo/org layout
- deploy truth
- current workstream
- live path assumptions
- what has already been merged

## 11. Smells to Watch For

These are early signs that a repo is drifting into pain.

- production path differs from docs
- backup script targets a different file than runtime
- long-lived branch reality diverges from trunk
- CI checks exist but are not the ones actually enforced
- private repo branch protections are configured but not truly enforceable on the current plan
- agents keep asking for the same operational facts because repo memory is missing them
- deploy depends on shell habit instead of workflow

## 12. The Quality Standard

A repo is in strong shape when:

- trunk is clearly defined
- GitHub is canonical
- PR flow is standard and enforced
- checks are stable and meaningful
- auto-merge reduces waiting without removing awareness
- deploy/publish are repeatable from GitHub Actions
- secrets and access are least-privilege
- backups are tested, not assumed
- operational truth is documented in the repo
- humans and agents can both follow the same path

## 13. Reusable Quickstart Checklist

Copy this into a new repo setup task:

- create `AGENTS.md`
- define trunk branch
- define canonical remote
- enable branch protection
- enable auto-merge
- enable GitHub security features
- pin GitHub Actions to SHAs
- define CI / deploy / publish workflows
- document deploy path and live server path
- document SSH/Tailscale access expectations
- set up backup script if the app has state
- run one restore drill
- document merge/deploy approval behavior for agents

## 14. Final Advice

The best repo setup is not the fanciest one.

It is the one where:

- the next person knows what is true
- production behavior matches documentation
- the safe path is also the easy path
- your tools reduce work instead of creating mystery

Aim for:

- fewer surprises
- fewer special cases
- fewer hidden paths
- more written truth
- more repeatable workflows

That is what makes a repo feel modern, fast, and trustworthy.

## Quick-Start Companion

If you want the short version of this document to share with someone new — or to keep open as a one-page summary — read `PUBLIC_REPO_PLAYBOOK.md`. It is the quick-start companion to this playbook and covers the same ground with less detail.

For the full pack context (who this is for, how it fits with AI-agent workflows, disclaimers, tier information) see `START-HERE.md` and `README.md`.
