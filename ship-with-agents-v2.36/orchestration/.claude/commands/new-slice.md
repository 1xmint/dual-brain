---
argument-hint: [slug]
description: Create or draft a canonical execution slice
---

Create or update a canonical slice doc for `$ARGUMENTS`.

Rules:
- Use `slices/TEMPLATE.md` as the structure.
- Store the live slice in `slices/` unless local install
  truth says otherwise.
- Set the smallest honest initial state.
- Do not mark `launch_ready: yes` unless the verification path and ownership are
  clear.
- If a slice already exists for this work, update it instead of duplicating it.
