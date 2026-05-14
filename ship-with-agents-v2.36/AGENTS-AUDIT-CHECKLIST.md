# AGENTS Audit Checklist

Use this checklist after a repo reorganization, workflow change, deploy change, or major architecture cleanup.

The goal is not to make `AGENTS.md` bigger.

The goal is to make it:

- sharper
- more truthful
- easier for future agents to follow
- less likely to drift from reality

## What AGENTS.md Is For

`AGENTS.md` is the repo-operating memory file.

It should contain:

- repo-specific working truth
- branch/remote/deploy reality
- merge conventions
- validation commands
- live operational gotchas

It should not become a second README, architecture essay, or runbook dump.

## 1. Repo Role Check

Verify the file clearly answers:

- What is this repo?
- What is it not?
- Which neighboring repo owns adjacent truth?

If the role is vague, future agents will drift.

### Pass standard

- one-sentence repo identity exists
- neighboring repo boundaries are explicit
- no bloated mission statement

## 2. Source-Of-Truth Check

Verify the file clearly states:

- GitHub is the source of truth
- the real trunk branch
- the canonical remote

### Pass standard

- branch name is current
- remote/org name is current
- no stale references to old orgs, old remotes, or old branch names

## 3. Merge Workflow Check

Verify the file clearly states:

- default merge method is squash
- use auto-merge when a PR is ready but checks are still pending
- ask before merge
- after approval, the agent may perform the merge

### Pass standard

- merge policy is explicit
- auto-merge guidance is current
- no contradictory “always ask” vs “always auto-merge” wording

## 4. Deploy / Publish Workflow Check

Verify the file clearly states:

- standard deploy workflow name
- standard publish workflow name if relevant
- GitHub Actions is the normal path
- direct server pushes are emergency-only, if applicable
- ask before deploy/publish
- after approval, the agent may perform the action

### Pass standard

- workflow names are current
- runtime/deploy path is not implied from memory or vibes
- no stale manual deploy habits presented as normal flow

## 5. Validation Command Check

Verify the file contains the real lightweight commands that matter.

Examples:

- typecheck
- build
- unit tests
- targeted package checks

### Pass standard

- commands are current
- commands are realistic for normal work
- commands are not vague
- commands are not overly expensive by default unless truly needed

## 6. Ops Access Truth Check

Verify the file clearly states:

- live server path
- standard SSH alias or admin path
- deploy-user assumptions
- warning that docs do not grant access by themselves

### Pass standard

- live path matches reality
- access notes reflect real practice
- no false certainty about who can SSH as whom

## 7. Critical Gotchas Check

This section should contain only the truths that repeatedly matter.

Good examples:

- live DB path
- backup path
- import barrel path requirement
- current deploy/runtime path mismatch that future changes must respect

Bad examples:

- generic philosophy
- long historical stories
- temporary one-off confusion that no longer matters

### Pass standard

- few but high-signal items
- no dumping ground behavior
- each gotcha still matters today

## 8. Duplication Check

Anything that belongs somewhere else should move.

Ask of each section:

- should this live in `README.md`?
- should this live in `OPERATIONS.md`?
- should this live in `ARCHITECTURE.md`?
- should this be an ADR?

### Pass standard

- AGENTS contains operational memory, not duplicated doc-system prose

## 9. Staleness Check

Look for:

- old branch names
- old org names
- old server paths
- outdated workflow names
- references to merged/removed long-lived branches as if they are active
- assumptions invalidated by repo reorg

### Pass standard

- no obvious stale facts remain

## 10. Length Check

Shorter is usually better.

If the file feels bloated, it probably is.

### Pass standard

- every section earns its place
- no long paragraphs where bullets would do
- no duplicate explanations

## 11. Cross-Repo Consistency Check

Across related repos, make sure the structure is consistent even if content differs.

Each repo should have the same general AGENTS shape:

1. repo role
2. source of truth
3. workflow
4. merge conventions
5. validation commands
6. deploy/publish truth
7. ops access notes
8. critical gotchas

### Pass standard

- same general structure across repos
- repo-specific facts remain repo-specific
- no copy-pasted lies

## 12. Final Quality Questions

Before calling the file done, ask:

- Would a new agent know the real branch, remote, and deploy path?
- Would it know how to validate changes?
- Would it know when to ask before merge/deploy?
- Would it avoid stale operational assumptions?
- Would it know which neighboring repo owns adjacent truth?
- Is anything here duplicated from a better canonical document?

If any answer is “no”, the file is not done yet.

## Quick Audit Workflow

Use this short process:

1. compare `AGENTS.md` against live repo reality
2. compare it against `README.md`, `OPERATIONS.md`, and ADRs
3. delete anything that does not belong
4. tighten wording into sharp bullets
5. verify merge/deploy commands and workflow names
6. verify live paths and access notes
7. do one final consistency pass across all related repos

## Recommendation

Run this audit:

- after a repo reorg
- after a deploy/release workflow overhaul
- after an org/remote move
- after a major architecture shift
- before calling a repo “production-ready”

That is how `AGENTS.md` stays a force multiplier instead of turning into a stale sidecar.
