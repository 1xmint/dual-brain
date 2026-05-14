# Personal Memory Pattern

Memory is the access layer, not the bloat carrier. Per-repo memory stays
close to the code it describes and is cheap to load. The global layer
captures what recurs across repos. Neither layer is a transcript.

## Two-Layer Architecture

**Layer 1 — Global** (`~/.claude/projects/<project-encoded-path>/memory/`)
- Types: `user`, `feedback`, `project`, `reference`
- Index: `MEMORY.md` — one bullet per entry
- Use when: the lesson applies across repos (Vera, scout, etc.)

**Layer 2 — Repo-scoped** (`.claude/memory/` in this repo)
- Index: `.claude/memory/INDEX.md` — one bullet per entry
- Use when: the pattern is specific to this repo and would be noise globally

## File Layout

```
.claude/
  memory/
    INDEX.md                   # one-line bullet per entry, links to file
    <slug>.md                  # individual memory entry
  skills/
    personal-memory/SKILL.md   # skill that routes memory reads/writes
```

## When to Write to Which Surface

| Signal | Write to |
|--------|----------|
| Preference applies across all repos | Global |
| Lesson from a cross-repo pattern | Global |
| Bug or pattern specific to this codebase | Repo `.claude/memory/` |
| Decision rationale for this repo's structure | `decisions/` (not memory) |
| Repo-specific skill or command preference | Repo `.claude/memory/` |
| Fast-changing state (branch, PR number) | Neither — use checkpoint |
| Secrets, tokens, credentials | Neither — never |

## Connection to Global Memory Types

Same four types apply to repo entries:

- `user` — how the user wants to work in this repo
- `feedback` — corrections or lessons from past sessions here
- `project` — deferred items, known open problems, active context
- `reference` — stable facts the model often gets wrong here

## Individual Entry Format

```markdown
---
name: <short human name>
description: <one sentence — what this memory enables>
type: user | feedback | project | reference
date: YYYY-MM-DD
---
<3-10 lines, specific and actionable>
```

## Anti-Patterns

- **Do not duplicate.** If the same entry exists globally, reference it
  there instead of copying it here.
- **Do not store secrets.** No tokens, passwords, API keys, or personal
  identifiers in any memory file.
- **Do not store fast-changing state.** Branch, open PR, active
  workstream — these belong in checkpoints.
- **Do not write prose transcripts.** Memory entries are reference
  facts, not session summaries.
- **Do not create an entry every session.** Write when a durable pattern
  is confirmed, not as a ritual.
- **Prune INDEX.md.** Stale entries should be deleted or archived.

## Scope Boundary

This layer is scoped to the current installed project only. Memory for other
repos belongs in those repos' own memory layers or in the global layer if
cross-cutting.
