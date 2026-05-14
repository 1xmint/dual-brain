# Undo / Session / Baseline Pattern

**Status:** Active  
**Introduced:** Pass 8.5 Deliverable C  
**Audience:** Solo dev / vibe coder — one-button safety net for AI-assisted sessions

---

## Why this exists

When an AI agent makes changes across multiple files in a session, the user
needs a fast, low-ceremony way to answer: "What changed since I started? Can
I get back?" Standard git answers the question eventually, but requires the
user to remember when they started and what the commit was. This pattern
makes that automatic.

The goal is not to replace git. It is to lower the friction of using git
correctly — so that "undo the session" is one command, not a forensics
exercise.

---

## File layout

```
.session-baseline          # per-checkout scratch file, gitignored
.baselines/
  baselines.jsonl          # append-only permanent ledger, committed
```

### .session-baseline

A plain key=value file written by `scripts/session-start.ps1`. It records
the commit SHA, branch, timestamp, and optional label at the moment a session
begins. One file, one session. It is gitignored because it is local
per-checkout state — like an editor's `.vscode/` settings — not shared
history.

Format:
```
sha=<full 40-char SHA>
branch=<branch name>
ts=<ISO 8601 timestamp>
label=<optional label>
```

### .baselines/baselines.jsonl

An append-only JSONL file written by `scripts/pin-baseline.ps1`. Each line
is a JSON object marking a known-good rollback point with a human-readable
reason. This file is committed because it is permanent record — the same
class of artifact as `observability/deletion-ledger.md`. It survives across
checkouts and machines.

Format (one JSON object per line):
```json
{"sha":"<full sha>","ts":"<ISO 8601>","label":"<reason>","dirty_tree":<true|false>}
```

---

## Scripts and when to use each

### scripts/session-start.ps1

Run this **at the beginning of a vibe-coding session** before asking the AI
to do anything meaningful.

```powershell
./scripts/session-start.ps1
./scripts/session-start.ps1 -Label "before auth refactor"
```

It records the current HEAD SHA to `.session-baseline`. If a baseline already
exists it asks before overwriting — so you will not silently lose the real
start point mid-session.

### scripts/session-diff.ps1

Run this **any time during or after a session** to see a categorized summary
of what changed.

```powershell
./scripts/session-diff.ps1
./scripts/session-diff.ps1 -Full
```

Baseline resolution order (matches `/diff-session` slash command):
1. `.session-baseline` file if present
2. `git merge-base HEAD origin/main` if origin/main exists
3. Error — run `session-start.ps1` first

The `-Full` flag prints the raw `git diff` output after the summary.

### scripts/pin-baseline.ps1

Run this **before a significant change** to record a named rollback point
that persists across sessions. Requires a label argument.

```powershell
./scripts/pin-baseline.ps1 -Reason "working auth flow"
./scripts/pin-baseline.ps1 -Reason "post-audit-pass-8.5"
```

The `-Reason` argument is mandatory — a baseline without a label is not
useful for recovery. The script optionally creates a lightweight git tag
(`baseline/<slug>`). Tags are not pushed automatically.

---

## Connection to slash commands

| Slash command    | Script invoked                   | Notes |
|------------------|----------------------------------|-------|
| `/diff-session`  | reads `.session-baseline`        | slash command is read-only; the file is written by `session-start.ps1` |
| `/undo-last`     | uses `git revert` / `git restore`| does not use a script; the pattern below governs method choice |
| `/pin-baseline`  | `scripts/pin-baseline.ps1`       | slash command calls the script or replicates its steps |

---

## The "revert preferred over reset --hard" safety rule

When undoing a commit, prefer `git revert HEAD --no-edit` over
`git reset --hard`. Revert creates a new commit that reverses the change.
This means:

- The original commit is preserved in history — you can see what was done
  and when.
- If the revert itself was a mistake, you can revert the revert.
- Push safety: revert never rewrites pushed history, reset --hard does.

`git reset --soft HEAD~1` is acceptable **only** when the commit has not been
pushed and is the first commit on a feature branch — i.e., there is no shared
history to corrupt.

For uncommitted changes, `git restore .` (staged) and `git clean -fd`
(untracked) are safe because nothing has been committed yet.

---

## What this pattern is NOT

- **Not a replacement for git.** It is a thin usability layer on top of git.
  The source of truth is still the git commit graph.
- **Not a backup system.** `.session-baseline` and `.baselines/baselines.jsonl`
  hold SHAs, not file snapshots. If you delete a commit with `git reset --hard`
  and garbage-collect, the SHA in the ledger can no longer be recovered.
- **Not a way to undo human actions.** `/undo-last` and these scripts only
  undo git-trackable changes. Files edited outside git, environment variables,
  deployed services, and database changes are outside scope.
- **Not multi-user.** `.session-baseline` is gitignored and per-checkout. Two
  developers on the same repo each have their own baseline; they do not share.

---

## Gitignore rationale

`.session-baseline` is gitignored for the same reason `.vscode/settings.json`
is typically gitignored: it is local per-checkout state, not shared history.
Committing it would create meaningless noise on every session start.

`.baselines/` is committed for the same reason `observability/deletion-ledger.md`
is committed: it is a permanent, human-readable audit record that has value
across time and machines. The directory itself is committed; individual
`.session-baseline` entries are not.
