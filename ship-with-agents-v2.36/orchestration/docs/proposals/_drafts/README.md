# docs/proposals/_drafts/

This is where brainstorm chats land their handoffs -- not formal
proposals, but the output of a brainstorm session that has reached
a coherent thesis.

## What belongs here

Brainstorm handoff documents. These are Stage 2 artifacts. They are
exploratory, evidence-gathering, and question-resolving. They are not
yet proposals; they have not passed the Proposal gate.

The distinction matters: a brainstorm handoff is a thinking artifact.
A proposal is a recommendation artifact. Conflating them (anti-pattern
7: brainstorm-as-decision) is how you end up with undecided ideas
wearing the costume of decided ones.

What belongs here specifically:
- Handoff documents produced at the close of a brainstorm chat
- Artifacts that have a coherent thesis but whose open questions are
  not yet resolved enough for formal proposal
- Work-in-progress thinking on an idea that has an inbox entry

What does NOT belong here:
- Formal proposals (those live in `../proposals/`)
- Inbox entries (those live in `../inbox/`)
- Raw chat transcripts or raw friction logs

## Promotion gate

Promotion from `_drafts/` to `../proposals/` requires:
- Coherent thesis (one sentence stating the recommendation)
- Evidence cited (not just assertion)
- Open questions resolved or explicitly deferred with reason

If any of those three are missing, the document stays in `_drafts/`.
Do not promote on vibes.

The head owns the promotion decision. The brainstorm chat hands off;
it does not self-promote.

## Frontmatter requirements

Required fields:
- `id` -- same id as the inbox entry this brainstorm addresses; never changes
- `stage: brainstorm`
- `owner` -- the brainstorm chat that produced it, then the head
- `created` -- original creation date from inbox stage; never changes
- `last_touched`
- `prior_paths` -- should include the inbox path it came from

Optional:
- `links` -- related ids
- `topic` -- carries forward from inbox entry
- `reviews` -- appended on each review pass

## File naming

`b-YYYYMMDD-slug.md` -- prefix shifts from `i` to `b`; date and slug
are locked from the inbox entry.

## Example entry

```
---
id: lc-20260426-friction-aggregation
stage: brainstorm
owner: brainstorm-chat-b4
created: 2026-04-26
last_touched: 2026-04-27
prior_paths: [docs/inbox/i-20260426-friction-aggregation.md]
links: []
topic: friction-pipeline
reviews: []
---

Thesis: friction aggregation should be head-mediated, not automatic,
because automatic promotion floods inbox and destroys triage signal.

Evidence: three sessions showed auto-aggregation attempts that produced
noise. Manual promotion in session 4 produced one clean inbox entry.

Open questions: none blocking. Deferred: TTL for friction entries before
they expire without promotion (future version).
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../../IDEA-LIFECYCLE.md)

Promotion target: `../proposals/README.md`
