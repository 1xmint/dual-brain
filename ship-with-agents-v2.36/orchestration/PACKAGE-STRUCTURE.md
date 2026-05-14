# Package Structure

Status: internal architecture note

This document explains the current internal structure, what is strong about it, what is still weak, and what would make it truly 10/10.

## Short Verdict

The new `orchestration/orchestration/` layout is a strong direction, but it is not yet fully 10/10 or bulletproof.

What is already strong:

- clear separation between internal system and Gumroad package
- one shared universal rules file
- one role folder per chat type
- local guides for rotation and rule proposals
- a path toward lower drift and better provider switching

What is not yet fully proven:

- whether all role names are final
- whether every role folder truly earns its weight
- whether the layout is compact enough for everyday use
- whether it is automation-friendly enough for future tooling

The right use of this structure is:

- internal battle-testing first
- translation to the public package second

## Design Goal

The system should let any role:

- understand what it is
- understand what it owns
- understand what it must not do
- find the exact local guide it needs before acting
- summarize state cleanly
- rotate and recover without losing fidelity
- collaborate across GPT and Claude without provider drift

## Current Layout

```text
orchestration/
  README.md
  GUMROAD-SYNC-RULES.md
  PACKAGE-STRUCTURE.md
  orchestration/
    README.md
    UNIVERSAL-RULES.md
    super/
    manager/
    head/
    brainstorm/
    agent/
    idea-helper/ (experimental)
```

Each role folder currently contains:

- `README.md`
- `rotation-guide.md`
- `propose-rules.md`
- `rules/README.md`
- `todo/README.md`
- `logs/README.md`

## What Makes This Good

### 1. Internal/public separation

The strongest part of the design is that our richer internal operating system is now separate from the buyer-facing Gumroad skeleton.

This reduces contamination risk:

- private project context stays internal
- only generic improvements get translated outward

### 2. Universal plus local guidance

The layout solves a real problem:

- one universal file for shared principles
- one local folder per role for role-specific guides

That is better than scattering role behavior across one giant prompt.

### 3. Guides for exact moments

The local guides are useful because they let a chat deliberately re-read a small focused procedure before acting.

Examples:

- rotation
- proposing rules
- local operating notes

This is a better memory strategy than hoping the chat remembers everything from one long prompt.

## What Keeps It From Being 10/10 Yet

### 1. Role naming is not settled

The internal role names currently differ from some live package terms:

- Role names are now settled: head, manager, super, agent, brainstorm, idea-helper
- `idea-helper` is experimental and may be deprecated

This is the biggest structural risk.

If naming is not settled, everything built on top of it will drift.

### 2. Too many folders can become fake structure

Every role currently has:

- local rules folder
- local todo folder
- local logs folder

That may be too much.

If those folders do not hold real durable value, they become empty ceremony and increase navigation cost.

10/10 systems are dense, not decorative.

### 3. Automation support is still weak

Right now the structure is human-readable, but not strongly machine-readable.

For good automation later, the system will likely need a single index file that says:

- which roles exist
- what each role reads first
- which guides are canonical
- which folders are experimental

Without that, future automation will rely on path conventions alone.

### 4. No shared artifact map yet

The role folders explain behavior, but the system still needs one compact map of artifact ownership:

- who writes checkpoints
- who writes logs
- who writes handoffs
- who writes task packets
- who writes review memos

That is critical for real robustness.

## Golden Version

The structure becomes 10/10 when it satisfies all of these:

1. Final role names are settled.
2. Every role pack is compact and obviously useful.
3. There is one shared artifact ownership map.
4. There is one shared lifecycle model:
   - reuse
   - rotate
   - spawn new
   - collaborate back
   - summarize to
5. There is one automation-friendly system index.
6. Internal structure and public translation rules are explicit.

## Recommended Evolution

### Keep now

- `README.md`
- `references/GUMROAD-SYNC-RULES.md`
- `orchestration/README.md`
- `orchestration/UNIVERSAL-RULES.md`
- per-role `README.md`
- per-role `rotation-guide.md`
- per-role `propose-rules.md`

### Treat as provisional

- per-role `rules/`
- per-role `todo/`
- per-role `logs/`

These should stay only if they accumulate real value during battle-testing. If not, they should collapse back into shared system areas.

### Add next

1. `SYSTEM-INDEX.md`

- one machine-and-human-readable map of all roles and canonical guides

2. `ARTIFACT-MAP.md`

- who reads and writes what

3. `LIFECYCLE.md`

- shared routing and rotation model across all roles

Those three would strengthen robustness and automation far more than adding more empty local folders.

## Automation Readiness

This structure is moderately automation-friendly now, not highly automation-friendly.

Why it is already useful:

- predictable paths
- universal rules file
- per-role guidebook entry points

Why it is not yet ideal:

- no system index
- no structured metadata
- no declared experimental vs stable roles

If future automation matters, the best next addition is a single index file, not more folders.

## Final Recommendation

Use this structure now as an internal battle-testing guidebook system.

Do not assume it is fully final yet.

Treat the current version as:

- strong internal scaffolding
- not yet the public package structure
- not yet the final automation-ready architecture

The next step to make it truly robust is not “more folders.” It is:

1. settle role names
2. add a system index
3. add an artifact map
4. keep only the local folders that prove useful in real use


