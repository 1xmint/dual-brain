# docs/architecture/

Structure: how the system is shaped, how the parts connect, and the
reasoning behind the shape choices.

## Divio role

Architecture documentation is structure-oriented. It describes the
system as a whole -- not every detail, but the shape that determines
how details fit together. A reader should be able to look here and
understand: what are the layers, how do they connect, what are the
hard constraints, and what can change without breaking the structure.

Architecture docs say "here is how X relates to Y and why that
boundary exists." They explain structure; they do not instruct tasks
(that is `../how-to/`) and they do not tabulate facts (that is
`../reference/`). The "why" of a boundary decision belongs here if it
is structural -- if it is historical context or background, it belongs
in `../explanation/`.

Use this folder for: layer diagrams, component relationship maps,
integration points, constraint documentation, and dependency topology.

## What belongs here

Canon-stage (Stage 8) artifacts describing system structure:
- Layer model documentation (head, super, agent, worker)
- Lifecycle graph documentation (stages as nodes, gates as edges)
- Cross-repo dependency maps
- Data flow descriptions (how ideas move from friction to inbox to canon)
- Trust model description (what each layer can and cannot do)

## Frontmatter requirements

Required fields:
- `id` -- `lc-YYYYMMDD-slug`
- `stage: canon`
- `owner`
- `created` -- never changes
- `last_touched`
- `prior_paths`

Optional:
- `history` -- sibling history file
- `supersedes` -- if this replaces a prior architecture doc
- `links` -- related decisions and reference docs this structure reflects

## Canon stage requirement

Architecture docs require the same Canon gate as reference docs:
load-bearing without contradiction, confirmed every 90 days.
Architecture that no longer matches the deployed system is worse than
no documentation -- it is misdirection. Move stale architecture to
`../archive/superseded/` and start a new proposal cycle.

## File naming

`c-YYYYMMDD-slug.md` -- prefix `c` for canon.

## Example entry

```
---
id: lc-20260426-layer-model
stage: canon
owner: head
created: 2026-04-26
last_touched: 2026-05-01
prior_paths:
  - docs/proposals/p-20260301-layer-model.md
  - docs/decisions/d-20260301-layer-model.md
links: [lc-20260301-layer-model-decision]
history: lc-20260426-layer-model.history.md
---

The orchestration system uses five layers arranged in a strict
hierarchy. Each layer has a bounded role; no layer reaches across
its boundary without an explicit gate.

Head -> Super -> Agent (build path)
Head -> Head -> Agent (ship/ops path)
Head -> Brainstorm (idea exploration, produces handoffs to head)

Hard constraints: agents do not deploy agents without super/head
mediation. Managers do not merge without tier-appropriate review.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
