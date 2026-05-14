---
argument-hint: "<reason / label for this baseline>"
description: Mark current state as a known-good rollback point — writes to .baselines/baselines.jsonl
---

# /pin-baseline

Record a named rollback point at the current commit. `$ARGUMENTS` is a short reason or
label (e.g., "before refactor", "post-audit-pass-8.5", "working auth flow").

## Steps

1. **Require a reason** — if `$ARGUMENTS` is empty, stop and ask for a label before
   proceeding. A baseline without a reason is not useful.

2. **Get current state** — run `git rev-parse HEAD` for the commit SHA and
   `git status --short` to check for uncommitted changes. If uncommitted changes exist,
   warn the user: the baseline will point to the last commit, not the dirty tree.

3. **Ensure `.baselines/` exists** — create the directory if it does not exist.

4. **Append to ledger** — write one JSON line to `.baselines/baselines.jsonl`:
   ```json
   {"sha":"<full sha>","ts":"<ISO 8601 timestamp>","label":"<$ARGUMENTS>","dirty_tree":<true|false>}
   ```

5. **Optional git tag** — offer to create a lightweight git tag:
   ```
   Tag this baseline as git tag? (yes / no — default: no)
   ```
   If yes: `git tag baseline/<slug>` where `<slug>` is a kebab version of `$ARGUMENTS`.
   Do not push the tag unless explicitly asked.

6. **Confirm** — print the recorded entry and the file path.

## Stop conditions

- Baseline written to `.baselines/baselines.jsonl` → done.
- Empty `$ARGUMENTS` → stop, ask for label.
- Git repo not initialized → stop, report.

## Output tail

On success:
```
No user action needed: baseline recorded at <sha> — "<label>".
```

On empty label:
```
Decision needed from buyer: provide a short label for this baseline (e.g., "before big refactor").
```
