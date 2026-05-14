<!-- generated-by: handwritten — not derived from doctrine source files -->
<!-- canonical-hash: not-drift-checked — see decisions/PERSONAL-MEMORY-PATTERN.md -->
<!-- canonical-sources:
  - decisions/PERSONAL-MEMORY-PATTERN.md
-->
---
name: personal-memory
description: Repo-scoped personal memory reads and writes. Use when the agent should consult past patterns before acting in this repo, record a new durable lesson from this session, or route a memory to the right surface (repo vs global). Also triggers when the user says "remember this", "note that", "we decided", or asks what was learned in a previous session.
---

# Personal Memory

Use this skill to read existing memory before acting on repo patterns,
and to write new entries when a durable lesson is confirmed.

## Read first

1. `.claude/memory/INDEX.md` — scan for relevant existing entries
2. Load the specific entry file if one matches
3. `decisions/PERSONAL-MEMORY-PATTERN.md` — only if the routing
   question itself is ambiguous

## Default loop

1. **Resolve** — what is the agent trying to remember or recall?
   Name the topic before touching any file.

2. **Classify** — which surface is right?
   - Specific to this repo → `.claude/memory/<slug>.md`
   - Cross-repo or model-wide → global `~/.claude/projects/.../memory/`
   - Decision rationale → `decisions/` (not memory)
   - Fast-changing state → checkpoint (not memory)

3. **Read or write:**
   - Read: scan INDEX.md, load the matching file, return the relevant fact
   - Write: create a small entry file, then append one bullet to INDEX.md

4. **Link to global** — if the lesson is cross-cutting, note that it
   should also be written to the global layer and name the type
   (`user`, `feedback`, `project`, or `reference`).

## Entry format (when writing)

```
---
name: <short human name>
description: <one sentence>
type: user | feedback | project | reference
date: YYYY-MM-DD
---
<3-10 lines, specific and actionable>
```

## Output shape

When memory is consulted:
- `Memory loaded:` — slug and one-line summary
- `Relevant fact:` — the specific detail that applies now
- `Routing note:` — repo-only, or should also go global?

When memory is written:
- `Entry written:` — path and slug
- `INDEX updated:` — yes / no
- `Global copy needed:` — yes (type: X) / no
