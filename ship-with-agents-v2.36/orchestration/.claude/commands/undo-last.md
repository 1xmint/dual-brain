---
argument-hint: "[how far back — default: last AI action]"
description: Revert the last AI-driven change to a known-good state with confirmation gate
---

# /undo-last

Revert the last AI-driven change. `$ARGUMENTS` controls how far back (default: last commit
on current branch).

## Steps

1. **Identify what will be undone** — run `git log --oneline -5` and `git status`.
   Show the user exactly what is about to be undone:
   - If there are uncommitted changes: show `git diff --stat`.
   - If the last change is a commit: show the commit hash, message, and `git show --stat HEAD`.
   - If `$ARGUMENTS` specifies N commits: show all N commits.

2. **Confirm** — print the summary and ask:
   ```
   Undo the above? (yes / no)
   ```
   Wait for an explicit answer. Do not proceed on silence.

3. **Apply the undo**:
   - Uncommitted changes only: `git restore .` (staged) + `git clean -fd` (untracked, if any).
   - Last commit, prefer revert: `git revert HEAD --no-edit` (creates a new commit, safe).
   - If the commit is the first on a feature branch and has not been pushed: offer
     `git reset --soft HEAD~1` as an alternative to revert.
   - N commits back: `git revert HEAD~N..HEAD --no-edit` (one revert commit per commit).

4. **Log the undo** — append one line to `observability/turn-events.jsonl`:
   ```json
   {"event":"undo-applied","reverted_ref":"<sha>","method":"<revert|reset-soft>","ts":"<ISO timestamp>"}
   ```
   If the file does not exist, note that logging was skipped.

5. **Verify** — run `git log --oneline -3` and `git status` after the undo to confirm
   the tree is clean.

## Stop conditions

- Undo confirmed and applied, tree clean → done.
- User says "no" or does not confirm → stop immediately, no changes made.
- Merge commit or ambiguous multi-parent history detected → stop, explain risk, ask.

## Output tail

On success:
```
No user action needed: undo applied. Tree is clean at <sha>.
```

On decline:
```
No user action needed: undo cancelled. No changes made.
```

On ambiguous history:
```
Decision needed from buyer: <what makes this risky>. Options: <A / B>.
```
