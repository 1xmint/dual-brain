# Repo Scope Gate

Use this before naming, launching, resuming, or routing a lane.

This exists because good role naming is not enough when multiple repos,
customers, or worktrees are active.

## Core Truth

Before trusting a lane name or routing move, make repo scope explicit.

At minimum decide:

- which repo this lane belongs to
- which workspace or worktree it belongs to
- whether this is single-repo or multi-repo work
- whether the lane is repo-scoped, workstream-scoped, or portfolio-scoped

## Required Repo-Scope Fields

When they matter, record:

- `repo slug`
- `repo root`
- `workspace root` or `worktree id`
- `customer / portfolio slug` when multiple customers or products are active

Use the smallest honest artifact:

- active map
- active workstreams index
- slice
- checkpoint
- closeout

## Naming Rule

Do not overload the lane key with every bit of repo meaning.

Use:

- stable lane key for role and workstream identity
- explicit metadata for repo scope
- visible repo naming when the user would otherwise be confused

Good:

- stable lane: `super-4-release-preflight`
- repo slug: `repo-ops`

Also good when clarity needs it:

- stable lane: `super-4-repo-ops-release-preflight`

## Launch Rule

Before launching a lane, answer:

1. is this lane tied to one repo?
2. is it tied to one worktree or workspace?
3. does a same-role lane already exist for that repo or workstream?
4. would the user be confused if the repo stayed implicit?

If 4 is yes, surface the repo visibly.

## Multi-Repo Rule

- head may stay portfolio-scoped
- manager lanes should usually be repo-scoped or major-track scoped
- super lanes should usually be repo-scoped and workstream-scoped
- agent lanes should always be task-scoped

Do not let one execution lane silently drift across repos.

## Recovery Rule

On resume or crash recovery, verify repo scope before trusting the checkpoint.

Wrong repo, wrong branch, wrong worktree, or wrong workspace identity is a
continuity failure, not a cosmetic detail.
