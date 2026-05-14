# PR Readiness Checklist

Run through this before marking a pull request ready for review. It is shorter than it looks. Most items are a glance, not an audit.

If you cannot tick a box honestly, do not fake it. Either fix it, or call it out in the PR description so a reviewer is not surprised.

## Scope

- [ ] The PR does one thing. If it does more than one, split it.
- [ ] The PR title and description describe the change, not the chat that produced it.
- [ ] Unrelated changes (formatting sweeps, dependency bumps, style tweaks) are not mixed in.

## Correctness

- [ ] The change actually compiles / builds.
- [ ] Relevant tests pass locally.
- [ ] New logic has at least one test that would fail without it.
- [ ] Error paths and edge cases are handled, or explicitly called out in the PR description as out of scope.
- [ ] No commented-out code is left behind without a reason.

## Real Verification

- [ ] I (the human) have opened the diff and read it, not just skimmed the agent's summary.
- [ ] If the change is user-facing, I have used the feature end-to-end, including at least one failure case.
- [ ] If the change touches auth, permissions, or input validation, a second set of eyes has looked at it.

## Docs And Repo Memory

- [ ] `AGENTS.md` still matches reality after this change.
- [ ] Any doc that mentions the changed behavior has been updated or the PR description explains why not.
- [ ] If this is a non-trivial structural decision, an ADR exists or is linked.
- [ ] If this is a proposal becoming a decision, the proposal status is updated or archived.

## Agent Workflow

- [ ] No open loops from the work chat. Every "done" claim has evidence (file paths, diffs, command output).
- [ ] The agent did not silently do anything outside the task packet's scope.
- [ ] Nothing was merged, deployed, deleted, force-pushed, or rotated without explicit human approval.

## Security Sanity

Not a security audit. A sanity pass.

- [ ] No secrets, keys, tokens, or credentials in the diff.
- [ ] No hard-coded production hostnames, paths, or user identifiers unless intentional.
- [ ] If the PR adds logging, it does not log secrets, tokens, or user PII.
- [ ] If the PR adds an external call, the destination is known and intentional.
- [ ] If the PR touches deployment, CI, or access control, a human has reviewed that specifically.

## Deploy Awareness

- [ ] I know which branch this merges into.
- [ ] I know whether merging triggers a deploy, or whether a deploy is a separate action.
- [ ] If it triggers a deploy, I am ready for that right now.
- [ ] Rollback path is clear enough that I could back this out in minutes if needed.

## Review Friendliness

- [ ] PR description explains **why**, not just **what**.
- [ ] The diff is small enough for a human to review in one sitting, or is deliberately split into reviewable commits.
- [ ] Any risky or non-obvious part of the change is called out in the description.

## Final Gate

- [ ] If any box above is unchecked, the PR description says so, honestly, in plain language.

"Honest" beats "perfect." A PR with a known gap flagged in the description is reviewable. A PR that silently hides a gap is a future incident.
