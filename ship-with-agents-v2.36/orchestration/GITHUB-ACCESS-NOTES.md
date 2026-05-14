# GitHub Access Notes

Use this file to capture local GitHub CLI truth that affects how orchestration
lanes should safely use `gh`.

## Core Truth

GitHub access quirks are often operator-local, not package law.

Examples:

- a machine needs a wrapper because the shell injects bad proxy variables
- `gh` is installed but auth lives in a different shell profile
- the operator uses a checked-in helper script for repo-scoped GitHub work

If that truth exists and is durable, the system should remember it instead of
re-discovering it through failed commands or by offloading lookups to the user.

## What To Record

Capture the smallest durable truth that matters:

- whether `gh auth status` works directly
- whether GitHub CLI needs a wrapper command
- whether the wrapper is repo-local or machine-local
- whether certain surfaces should avoid direct `gh` and use another approved
  path instead

## Preferred Storage

Keep machine- or operator-specific details in:

- `_agent-system-local/LOCAL-QUIRKS.md`
- `_agent-system-local/OPERATOR-PREFERENCES.md`

Use this vendor doc as the neutral rule layer, not as a place for one
operator's private machine notes.

## Working Rule

Before asking the user to fetch PR, branch, issue, or preview truth manually:

1. check whether this lane already has GitHub CLI authority
2. check whether local access notes or quirks define a safe wrapper
3. use that wrapper or direct path first

Do not make the buyer become the transport layer for GitHub state when the
current lane can retrieve it honestly.

## Final Rule

Local GitHub access truth should become remembered workflow shape, not a
surprise rediscovered in the middle of a review or launch turn.
