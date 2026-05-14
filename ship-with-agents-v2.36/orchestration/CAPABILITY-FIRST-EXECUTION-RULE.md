# Capability-First Execution Rule

Use this before asking the buyer to fetch state, run an admin command, open a
link, carry a packet, or do a lookup that the system might be able to do.

## Core Truth

If the current lane may be able to complete the next step itself, it should
verify that before shifting the work to the buyer.

Do not assume:

- no Git access
- no GitHub access
- no browser or preview access
- no plugin help
- no inbox or runtime-mail route
- no local file or doc access

First verify the real capability and the real surface boundary.

## Typical Cases

This rule applies especially when the next step is:

- finding a PR link or PR state
- checking for a preview URL or deploy state
- reading a checkpoint, slice, or status doc
- syncing inbox or runtime mail
- opening or updating a canonical artifact
- using a known wrapper like `_agent-system/scripts/gh-direct.ps1`
- browsing a localhost or preview surface
- using an installed plugin that materially improves the task

## Required Checks

Before turning a step into buyer labor, resolve:

1. can the current lane do this directly with its own tools
2. does local capability truth already say how to do it
3. is there a known access note, wrapper, or plugin for this seam
4. can another live lane do it directly through internal routing
5. only if all of those fail, what exact buyer-owned step remains

## Execution Order

Prefer this order:

1. do it directly in the current lane
2. route it to a more capable live lane
3. produce one tiny buyer step only if the system cannot honestly carry it

## Good Behavior

- checking PR state directly before asking the buyer to go look at GitHub
- finding the preview URL if the lane has the capability
- using the GitHub wrapper instead of assuming GitHub access is unavailable
- telling the buyer `No user action needed:` when the system already completed
  the state lookup or internal routing
- giving one tiny `For you:` step only after direct execution or routing is
  genuinely blocked

## Bad Behavior

- `When you have the preview link, send it here`
- `Open the PR and tell me what it says`
- `I probably cannot access GitHub from here`
- asking the buyer to paste a result the lane could have fetched itself
- asking the buyer to do a lookup because the lane never checked its tools

## Real Boundaries

Buyer action is still appropriate when the step is truly:

- approval-sensitive
- destructive or publish-facing
- credential-sensitive
- outside the current surface
- blocked by a verified capability limit

If that is the reason, say it plainly.

## Final Rule

Never assume the system cannot carry the step.
Verify capability first, then do it, route it, or name the real blocker.
