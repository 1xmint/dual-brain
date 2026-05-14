---
argument-hint: [checkpoint-or-workstream]
description: Write or refresh the current checkpoint with present-tense execution truth
---

Write or update the checkpoint for `$ARGUMENTS`.

Rules:

- capture current execution truth, not a speculative plan
- include the smallest honest next task
- note any open blockers or decisions
- include continuity and pickup fields required by the local checkpoint schema
- if a checkpoint already exists, refresh it instead of creating a duplicate
