<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 4b7b9ffd2522b99852c5c2cdc2dd2d4aec3b2c708b8ccaa02269bfff07434136 -->
<!-- canonical-sources:
  - SURFACE-COMPACTION-AND-RESUME.md
  - RUNTIME-TERM-SEPARATION-RULE.md
  - SURFACE-RUNTIME-TERM-MATRIX.md
  - CLAUDE-HOOKS-INTEGRATION.md
  - claude-info.md
  - gpt-info.md
  - SESSION-ID-GATE.md
  - OPERATOR-ORCHESTRATION-PROFILE.md
  - OPERATOR-CAPABILITIES.md
-->
---
name: surface-runtime
description: Surface-specific memory model, runtime wording, operator setup, and preference truth. Use when the answer depends on which app/runtime is in play or how the operator actually works.
---

# Surface Runtime

Use this skill when surface behavior, compaction, or operator setup changes
what advice is honest.

## Read first

1. `SURFACE-COMPACTION-AND-RESUME.md`
2. `RUNTIME-TERM-SEPARATION-RULE.md`
3. `SURFACE-RUNTIME-TERM-MATRIX.md`

Then load as needed:

- `CLAUDE-HOOKS-INTEGRATION.md`
- `claude-info.md`
- `gpt-info.md`
- `SESSION-ID-GATE.md`
- `OPERATOR-ORCHESTRATION-PROFILE.md`
- `OPERATOR-CAPABILITIES.md`

## Default loop

1. Identify the real runtime surface.
2. Use the right vendor/runtime labels for that surface.
3. Keep operator truth separate from repo doctrine.
4. Admit when a Claude-only optimization does not help Codex or other
   surfaces.

## Output shape

- `Surface:`
- `Capability truth:`
- `Compaction risk:`
- `Operator-specific note:`

