---
argument-hint: "<feature description>"
description: End-to-end feature shipping workflow — branch, implement, test, commit, optional PR
---

# /ship

Ship a feature from description to committed code. `$ARGUMENTS` is the feature description.

## Steps

1. **Clarify scope** — restate the feature in one sentence. If the description is ambiguous,
   use the truth-and-verification skill: separate observed intent from inferred scope before
   writing any code.

2. **Check current state** — run `git status` and `git log --oneline -5`. If there are
   uncommitted changes unrelated to this feature, stop and surface them before proceeding.

3. **Create a branch** — `git checkout -b feature/<slug>` where `<slug>` is a short kebab
   name derived from `$ARGUMENTS`. Always create a branch, even for small changes.

4. **Implement** — make the smallest code change that satisfies the feature description.
   Prefer editing existing files over creating new ones. If the change touches auth,
   credentials, or trust-adjacent code, escalate before continuing.

5. **Write or update tests** — add at least one test that would fail without this change.
   Use the `test-design` skill if the right proof is not obvious.

6. **Run quality checks** — detect the stack with
   `scripts/detect-stack.ps1`, then run
   `scripts/run-quality-checks.ps1`. Expect type/static checks, lint, and
   tests when the repo supports them. If a category is missing, surface that
   gap honestly.

7. **Verify green** — if any quality check fails, fix it or stop with a blocker report.
   Do not commit red tests, type failures, or lint failures.

8. **Commit** — stage only the files changed for this feature. Use the
   `commit-hygiene` skill if the boundary is fuzzy. Write a clear commit message.
   If the pre-commit hook runs, let it finish; do not bypass it.

9. **Optional PR** — if the branch is not main/master, offer to open a PR with
   `gh pr create`. Default: yes for features, skip for one-file fixes.

## Stop conditions

- Tests pass and change is committed on the feature branch → done.
- Uncommitted unrelated changes found in step 2 → stop, report, ask how to proceed.
- Ambiguous scope that cannot be resolved from `$ARGUMENTS` alone → stop, ask one
  clarifying question.
- Auth / trust-adjacent code touched → stop, escalate before writing.
- Quality checks fail and root cause is not in this feature's scope → stop, report blocker.

## Output tail

On success:
```
No user action needed: feature committed on branch <branch-name>. Quality checks pass.
```

On blocker:
```
Decision needed from buyer: <one-sentence blocker description and options>.
```
