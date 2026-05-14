---
argument-hint: "<thing to remember>"
description: Write a durable memory entry. Routes to repo memory or global memory based on scope. $ARGUMENTS is the thing to remember.
---

# /remember

Record a durable memory entry from `$ARGUMENTS`.

## Step 1 — Restate

Restate `$ARGUMENTS` in one sentence. Separate the observed fact from
any inferred scope. If the intent is ambiguous, ask one clarifying
question before proceeding.

## Step 2 — Classify scope

| Signal in $ARGUMENTS | Write to |
|----------------------|----------|
| About this repo's structure, conventions, or quirks | Repo: `.claude/memory/` |
| About how the user wants to work in this repo only | Repo |
| About a pattern that recurs across multiple repos | Global: `~/.claude/projects/.../memory/` |
| About a model-wide user preference | Global |
| About a decision rationale for this repo | `decisions/` instead |
| Fast-changing state (branch, PR, ticket) | Neither — use a checkpoint |

If still ambiguous: default to repo scope and note the ambiguity.

## Step 3 — Choose type

`user` — how the user prefers to work
`feedback` — correction or lesson from a past session
`project` — deferred item, open problem, active context
`reference` — stable fact the model often gets wrong here

## Step 4 — Write the entry

**For repo scope** — create `.claude/memory/<slug>.md`:

```
---
name: <human-readable name>
description: <one sentence — what this memory enables>
type: <user|feedback|project|reference>
date: <YYYY-MM-DD>
---
<3-10 lines, specific and actionable. No transcript prose.>
```

Then append one bullet to `.claude/memory/INDEX.md`:
```
- [slug](slug.md) — one-line description
```

**For global scope** — create or append to
`~/.claude/projects/<project-encoded-path>/memory/<slug>.md`
with the same frontmatter format, then add a bullet to
`~/.claude/projects/<project-encoded-path>/memory/MEMORY.md`.

Do NOT write outside this repo's `.claude/memory/` or the global path
above. Do NOT create memory directories in other repos.

## Step 5 — Return

- `Entry written:` path
- `Type:` user / feedback / project / reference
- `Surface:` repo / global
- `INDEX updated:` yes
- `Global copy needed:` yes (reason) / no
