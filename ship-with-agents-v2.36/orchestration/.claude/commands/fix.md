---
argument-hint: "<bug description>"
description: Bug fix workflow — reproduce, write failing test, fix, verify green, commit
---

# /fix

Fix a bug from description to committed green test. `$ARGUMENTS` is the bug description.

## Steps

1. **Reproduce** — read `$ARGUMENTS` and identify the repro path. Use the
   truth-and-verification skill: separate what is observed (error message, stack trace,
   file) from what is inferred (root cause). If repro steps are missing, ask for them
   before writing any code.

2. **Locate the defect** — grep for the relevant code. Read the smallest set of files
   needed to understand the failure path. Do not assume the bug location from the
   description alone.

3. **Write a failing test** — add a test that exercises the bug and currently fails (red).
   Use the `test-design` skill if the proof path is unclear. Commit or stage the
   test before fixing so the before/after is clear.

4. **Fix the defect** — change only the code needed to make the test pass. Do not
   refactor adjacent code in the same commit unless the bug requires it. Use the
   `error-handling` or `refactoring-patterns` skill when the failure crosses a
   boundary or the fix risks reshaping nearby code.

5. **Run quality checks** — detect the stack with `scripts/detect-stack.ps1`,
   then run `scripts/run-quality-checks.ps1`. The specific test written in step 3
   must pass. No other previously-passing tests may be newly failing.

6. **Commit** — stage only the fix and the new test. Use the `commit-hygiene`
   skill if unrelated cleanup leaked into the diff. Write the commit message as:
   `fix: <short description>` followed by a one-line note on what was wrong.

## Stop conditions

- New test passes, no regressions, fix committed → done.
- Repro impossible from `$ARGUMENTS` (no steps, no error, no reproducible state) →
  stop and ask for repro steps before proceeding.
- Fix requires touching auth, credentials, or trust-adjacent code → stop, escalate.
- Root cause is in a dependency outside this repo → stop, report upstream blocker.
- Test passes but the fix looks like it would break another path → stop, report conflict.
- Typecheck or lint fails on this change → stop, report blocker with the exact failing check.

## Output tail

On success:
```
No user action needed: bug fixed, quality checks green, committed on <branch>.
```

On repro failure:
```
Decision needed from buyer: cannot reproduce — <what is missing>. Provide: <specific ask>.
```

On blocker:
```
Decision needed from buyer: <root cause> is outside this scope. Options: <A / B>.
```
