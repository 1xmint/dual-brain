# docs/decisions/

ADRs only -- Architecture Decision Records that represent signed,
ratified choices.

## What belongs here

Stage 4 artifacts. An ADR is the output of the Decision stage: a
signed record of what was chosen, why, and what alternatives were
rejected. It is not a proposal, not a brainstorm, not a plan. It is
the formal answer to "what did we decide?"

Every ADR here corresponds to a proposal that passed the gate in
`../proposals/`. No ADR should exist here without a traceable
proposal id in its frontmatter.

Decisions do not expire (see TTL table in `../../IDEA-LIFECYCLE.md`).
They are Superseded when a newer ADR takes their place. Do not delete
old ADRs; a superseded ADR stays here with a `superseded_by:` field
pointing to the new id.

## What does NOT belong here

- Retroactive ADRs written after building has started (anti-pattern 5).
  If build preceded decision, that is a kick-back, not a normal flow.
- Proposals or brainstorm handoffs -- those live in `../proposals/`
  and `../proposals/_drafts/`
- Plans or roadmap entries -- those live in `../proposals/roadmap.md`

## Frontmatter requirements

Required fields:
- `id` -- unchanged from inbox; `lc-YYYYMMDD-slug`
- `stage: decision`
- `owner` -- head or user who signed; the head may draft but the
  head or user must sign
- `created` -- never changes
- `last_touched`
- `prior_paths` -- audit trail through inbox, brainstorm, proposal
- `links` -- must reference the proposal id this decision closes

Optional:
- `supersedes` -- if this ADR replaces another; cite the old id
- `superseded_by` -- set when this ADR is replaced; never delete
- `topic` -- carry forward for sibling traceability

## File naming

`d-YYYYMMDD-slug.md` -- prefix shifts to `d`.

## Template

The full ADR template is in `../../templates/ADR.md`. Use it. The
lifecycle-specific frontmatter additions (id, stage, prior_paths,
links) are being refined in a parallel agent's work; point to the
template and extend from it.

## Example entry

```
---
id: lc-20260426-friction-aggregation
stage: decision
owner: head
created: 2026-04-26
last_touched: 2026-04-29
prior_paths:
  - docs/inbox/i-20260426-friction-aggregation.md
  - docs/proposals/_drafts/b-20260426-friction-aggregation.md
  - docs/proposals/p-20260426-friction-aggregation.md
links: [lc-20260426-friction-aggregation]
topic: friction-pipeline
---

Decision: friction promotion to inbox is head-mediated. Automatic
promotion is rejected. This decision closes proposal lc-20260426-friction-
aggregation.

Signed: head, 2026-04-29.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)

ADR template: the file is at `templates/ADR.md` relative to the
package root.
