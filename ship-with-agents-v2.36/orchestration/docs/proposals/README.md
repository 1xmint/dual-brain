# docs/proposals/

Formal proposals: recommendations that have passed the brainstorm gate
and are ready for critique, alternative consideration, and Decision.

## What belongs here

Stage 3 artifacts. A proposal is a recommendation artifact, not a
thinking artifact. It has:
- A single coherent thesis (what we should do)
- Evidence (why)
- At least two alternatives considered (why not those)
- An explicit ADR-needed flag if the decision is architectural

Promoted from `_drafts/` by the head when the brainstorm handoff
meets the promotion gate. One id maps to exactly one proposal file.
Two people working the same problem is a concurrent-proposals case --
see the merge-or-kill protocol in `../../IDEA-LIFECYCLE.md`.

Also lives here:
- `roadmap.md` -- the aggregate roadmap entry list, updated at Plan stage

## What does NOT belong here

- Drafts that haven't passed the brainstorm gate (use `_drafts/`)
- Alternatives that lost -- they are recorded in the proposal body,
  not as sibling files (anti-pattern 2)
- Multiple proposals for the same idea -- one id, one current artifact

## Frontmatter requirements

Required fields:
- `id` -- unchanged from inbox; `lc-YYYYMMDD-slug`
- `stage: proposal`
- `owner`
- `created` -- never changes
- `last_touched`
- `prior_paths` -- audit trail from inbox and brainstorm paths
- `topic` -- required here for sibling-detection at Decision stage

Optional:
- `links` -- related ids
- `reviews` -- appended per review iteration
- `cost_estimate: low|med|high`
- `kicked_back_from: build` -- if this proposal was rewound from Build
- `reason` -- required if kicked_back_from is set

## File naming

`p-YYYYMMDD-slug.md` -- prefix shifts to `p`; date and slug locked.

## Promotion gate out

From Proposal to Decision:
- Critique passed
- At least two alternatives considered and recorded
- `ADR-needed: true|false` flag set in the body

## Example entry

```
---
id: lc-20260426-friction-aggregation
stage: proposal
owner: head
created: 2026-04-26
last_touched: 2026-04-28
prior_paths:
  - docs/inbox/i-20260426-friction-aggregation.md
  - docs/proposals/_drafts/b-20260426-friction-aggregation.md
topic: friction-pipeline
cost_estimate: low
reviews: []
---

ADR-needed: false

Recommendation: friction promotion to inbox is head-mediated,
triggered by pattern recognition across sessions, never automatic.

Alternatives considered: (1) automatic promotion on 3+ occurrences --
rejected, floods inbox; (2) per-chat inbox entries -- rejected, creates
duplicate ids for same root cause.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
