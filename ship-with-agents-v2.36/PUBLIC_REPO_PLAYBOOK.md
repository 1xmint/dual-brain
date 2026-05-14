# Public Repo Playbook

> This is the quick-start version. For the detailed guide with CI/CD, branch protection, and VPS setup, see [`ADVANCED_REPO_OPERATIONS_PLAYBOOK.md`](ADVANCED_REPO_OPERATIONS_PLAYBOOK.md).

A short, shareable quick-start for setting up a modern, low-friction software repo.

## When To Use This Playbook

Use this playbook when you want a fast, readable overview:

- you are setting up a new repo and want a single page of sensible defaults;
- you are onboarding a collaborator and want something short to hand them;
- you are sharing your process with someone outside the project.

If you want the deeper, longer version with specifics on SSH, backups, container defaults, and AI-agent reliability, read **`ADVANCED_REPO_OPERATIONS_PLAYBOOK.md`** next. The advanced playbook is a superset of this one.

Everything below is guidance, not a guarantee. This is not a security audit, not a compliance package, and not a replacement for a real engineer or a real security review when stakes are high.

## Audience

Solo builders and small teams who want:

- a clearer GitHub workflow
- safer deploys than improvised habits
- lower manual overhead
- documented operational truth
- better collaboration between humans and AI tools

## Principles

- GitHub should be the source of truth.
- The standard path should be branch -> PR -> checks -> merge -> deploy/publish.
- Production changes should be repeatable and visible.
- Repo documentation should reflect real operational behavior.
- Safe defaults should also be the easy defaults.

## Recommended docs

Every repo should have a compact, high-signal documentation set:

- `README.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `SECURITY.md`

Good optional additions:

- `VISION.md` or `WHY.md`
- `OPERATIONS.md`
- `CONTRIBUTING.md`

## GitHub recommendations

### Branch protection

Use:

- pull requests required before merge
- required status checks
- up-to-date branch requirement
- conversation resolution requirement
- no force pushes
- no deletions

For solo-maintainer repos, required approvals are often unnecessary friction.

### Auto-merge

Enable auto-merge.

Good default:

- merge directly if checks are already green
- use auto-merge if the PR is ready but checks are still running

This keeps the flow fast without making merges invisible.

### Security features

Enable when available:

- dependency graph
- dependabot alerts
- security updates
- code scanning
- vulnerability reporting
- secret protection

## Actions and CI/CD guidance

- pin GitHub Actions to commit SHAs, not just tags
- keep CI, deploy, publish, and security workflows clearly separated
- prefer explicit, repeatable GitHub Actions over ad hoc server workflows

## Deployment guidance

- use protected branches as the deploy source
- keep deploys reproducible
- avoid normal development flow that depends on direct server pushes
- keep emergency/manual recovery as a separate documented path

## Ops guidance

- document the live server path
- document the standard SSH/admin path
- document the deploy workflow name
- document what is and is not assumed

## Backup guidance

- test restores, not just backups
- for SQLite, include the database, WAL, and SHM files together
- keep backup naming aligned with the runtime database path
- run integrity checks during restore drills

## AI-agent guidance

If AI tools are part of the workflow:

- give them a repo memory file like `AGENTS.md`
- document branch truth, merge conventions, deploy conventions, and live paths
- require them to ask before merge/deploy, but allow them to perform the action after approval

## Signs a repo needs cleanup

- docs do not match production
- deploy depends on shell habit instead of workflow
- backups target the wrong path
- CI checks are unclear or unstable
- contributors keep rediscovering the same operational facts

## What “good” looks like

A repo is in a strong state when:

- trunk is clear
- GitHub is canonical
- checks are meaningful
- merge flow is low-friction
- deploy flow is repeatable
- access is least-privilege
- backup/restore has been tested
- operational truth is documented

That combination usually matters more than fancy tooling.

## Go Deeper

If you want specifics on:

- AGENTS.md rules for AI-assisted workflows;
- SSH posture and container defaults for VPS-backed projects;
- SQLite backup / restore detail;
- Tailscale-style access control shape;
- how to make AI agents more reliable;

read `ADVANCED_REPO_OPERATIONS_PLAYBOOK.md`. It is the long-form companion to this file. Everything here is covered there in more detail — nothing is dropped.
