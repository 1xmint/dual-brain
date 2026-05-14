---
description: Show what changed in this session — diff against session start or last commit on main
---

# /diff-session

Show a summarized diff of everything that changed in this session.

## Steps

1. **Find the session baseline** — in order of preference:
   - Run `git stash list` and `git log --oneline -1` to see latest commit.
   - If `scripts/session-start.ps1` wrote a `.session-baseline` marker file, read it
     for the starting commit SHA.
   - Otherwise, use the last commit on `main` / `master` as the baseline:
     `git merge-base HEAD origin/main`.
   - If the repo has no remote, use the parent of the first commit on this branch.
   State which baseline was chosen and why.

2. **Run the diff** — `git diff <baseline>..HEAD` for committed changes plus
   `git diff HEAD` for any uncommitted working-tree changes.

3. **Summarize by category** — group findings into:

   ```
   Added files:
   - <path> (<line count> lines)

   Modified files:
   - <path>: <one-line description of what changed>

   Deleted files:
   - <path>

   Uncommitted working-tree changes:
   - <path>: <staged | unstaged>
   ```

4. **Key edits** — for the 3 most significant modified files, add one sentence describing
   the nature of the change (e.g., "added `ship.md` slash command — 58 lines").

5. **Stats line** — total: N files changed, N insertions, N deletions.

## Stop conditions

- Summary produced → done. This command is read-only; no files are changed.
- If there are no changes since baseline, say so explicitly.

## Output tail

No user action needed: session diff above is the complete output.
