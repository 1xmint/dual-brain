# Contamination Checklist

Use this checklist before committing to a public or open-source repo
when your private/internal system shares structure with the public one.

This prevents internal project names, personal identifiers, private
paths, and session artifacts from leaking into buyer-facing or
public-facing code.

## When to run

- Before every commit to your public repo
- Before every package build or zip
- After any sync from internal to public
- Before publishing to any distribution channel

## Step 1 — Define your banned terms

Create a list of terms that must never appear in public files:

```
# Project names
[your-internal-project-1]
[your-internal-project-2]

# Personal identifiers
[your-name]
[your-username]
[your-email-prefix]

# Internal repo names
[internal-repo-1]/
[internal-repo-2]/

# Internal paths
[internal-agent-system-path]/
[internal-logs-path]/

# Session artifacts
session-m, session-s, session-h, session-b
```

Replace the bracketed placeholders with your actual internal terms.

## Step 2 — Search

Run a case-insensitive search across your entire public repo for
every banned term:

```bash
grep -rni "term1\|term2\|term3" path/to/public-repo/
```

Or use your editor's project-wide search.

## Step 3 — Evaluate matches

**Hard blocks (always fix before committing):**
- Any match in prompt files, guides, templates, or examples
- Any match in README or buyer-facing documentation

**Acceptable matches (review but usually OK):**
- Matches inside `_internal/` or seller-only files that are excluded
  from the distributed package
- Matches inside the contamination checklist itself (this file)
- Matches inside sync-rules documentation that explains what to check

## Step 4 — Fix

For each real match:
1. Replace with a generic placeholder: `[your-project]`, `[your-repo]`,
   `[your-name]`
2. Or remove the reference entirely if it's not needed
3. Re-run the search to confirm zero matches

## Step 5 — Cold-start test

After fixing, ask: "Could a fresh user with zero context about my
internal system understand and use this file?"

Trace the buyer path from entry point to first use. Every link must
resolve. Every reference must make sense without internal knowledge.

## Tips

- Keep your banned terms list in a file that is excluded from the
  public package (e.g., `_internal/banned-terms.txt`)
- Automate the check with a pre-commit hook if you sync frequently
- When in doubt, strip it out — false negatives (leaked terms) are
  worse than false positives (over-genericized text)
- Internal system files are richer than public files by design — that
  gap is correct, not a bug to fix
