# docs/archive/superseded/

Terminal folder for canon documents that have been replaced by newer
canon -- not failed ideas, but succeeded docs that are no longer current.

## What belongs here

A superseded doc is one that reached Canon stage, was load-bearing,
and then was legitimately replaced by a newer canon doc covering the
same ground. It succeeded. It just no longer speaks for the system.

Examples:
- `VISION.md` v1 after `VISION.md` v2 is promoted to Canon
- An architecture doc describing a three-layer model after a five-layer
  model is canonized
- An ADR that was superseded by a newer ADR (though ADRs stay in
  `docs/decisions/` with `superseded_by:` set -- only canon docs
  with physical files that move come here)

## What does NOT belong here

- Ideas that were rejected or abandoned (those go to `../archive/`)
- Active canon docs (those live in `../reference/`, `../architecture/`,
  `../explanation/`, `../how-to/`, `../operations/`)
- Drafts that never reached Canon

## The reason: field is required

`reason:` must be set in frontmatter. It should name why this doc
was replaced, not just that it was.

Example valid reasons:
- `reason: superseded by lc-20260601-five-layer-model; three-layer
  model no longer matches the deployed shape`
- `reason: vision revised after dogfood revealed two anti-patterns
  the original vision did not anticipate`

## The pointer to the replacement is required

Every artifact here must include either:
- `superseded_by: <new-id>` in frontmatter, pointing to the
  replacement artifact's id, OR
- A body note at the top of the file in bold:

  `**Replaced by: [[lc-YYYYMMDD-new-slug]]`

Both is better. At minimum one is required. Without a pointer, a
reader has no path to the current truth.

## Frontmatter requirements

Required fields:
- `id` -- unchanged; `lc-YYYYMMDD-slug`
- `stage: superseded`
- `owner` -- head or head who made the supersede decision
- `created` -- never changes
- `last_touched` -- date superseded
- `prior_paths` -- full audit trail including the canon path this
  file came from
- `reason` -- REQUIRED; why this doc was replaced
- `superseded_by` -- REQUIRED; the id of the replacement

Optional:
- `links` -- back-links to history sibling or related decisions
- `history` -- pointer to the `<id>.history.md` sibling if one exists

## File naming

`su-YYYYMMDD-slug.md` -- prefix shifts to `su`; date and slug locked.

## Example entry

```
---
id: lc-20260301-three-layer-model
stage: superseded
owner: head
created: 2026-03-01
last_touched: 2026-05-15
prior_paths:
  - docs/architecture/c-20260301-three-layer-model.md
reason: superseded by lc-20260515-five-layer-model; the three-layer
  shape did not account for the brainstorm layer splitting from head
superseded_by: lc-20260515-five-layer-model
links: [lc-20260515-five-layer-model]
---

**Replaced by: [[lc-20260515-five-layer-model]]**

This document described the original three-layer orchestration model
(head, super/head, agent). It is preserved for historical context.
The five-layer model (head, super, agent, worker) is now
canonical -- see the replacement.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../../IDEA-LIFECYCLE.md)

Parent archive: `../README.md`
