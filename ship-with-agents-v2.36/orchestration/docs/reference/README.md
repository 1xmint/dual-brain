# docs/reference/

Facts: precise, complete descriptions of the system's surfaces,
contracts, and conventions.

## Divio role

Reference documentation is information-oriented. It describes the
system accurately and completely so a reader can look up a specific
fact without needing to understand the whole. It does not explain
why; it does not guide a task; it states what is.

Use this folder when you need to answer: "what is the exact shape of
X?" If the answer belongs in a spec, a field table, or an API surface
description, it belongs here.

This folder does not contain opinions, reasoning, or step-by-step
guides. Those belong in `../explanation/` and `../how-to/` respectively.

## What belongs here

Canon-stage artifacts (Stage 8) that are fact-tables or precise specs:
- Frontmatter field reference (every field, type, required/optional)
- File naming convention reference
- Stage-transition gate checklist (what is required at each gate)
- Anti-pattern taxonomy with formal definitions
- Agent role surface descriptions (what each role can and cannot do)
- Configuration option tables

## Frontmatter requirements

Required fields:
- `id` -- `lc-YYYYMMDD-slug`
- `stage: canon`
- `owner` -- head or head who promoted to Canon
- `created` -- never changes
- `last_touched` -- updated on every meaningful edit
- `prior_paths` -- full trail from inbox through canon

Optional:
- `history` -- pointer to `<id>.history.md` sibling
- `supersedes` -- if this replaces a prior reference doc
- `links` -- related ids (architecture docs, ADRs it reflects)

## Canon stage requirement

Reference docs are only Canon once they are load-bearing without
contradiction. Do not promote a reference doc to Canon because it is
written -- promote it after it has been used and found accurate.
Premature canonicalization is anti-pattern 4.

Every 90 days, the head confirms each canon doc here is still
load-bearing. If reality has moved on, the doc enters a new proposal
cycle or moves to `../archive/superseded/`.

## File naming

`c-YYYYMMDD-slug.md` -- prefix `c` for canon. Date and slug locked.

## Example entry

```
---
id: lc-20260426-frontmatter-contract
stage: canon
owner: head
created: 2026-04-26
last_touched: 2026-05-01
prior_paths:
  - docs/inbox/i-20260426-frontmatter-contract.md
  - docs/proposals/p-20260426-frontmatter-contract.md
  - docs/decisions/d-20260426-frontmatter-contract.md
links: [lc-20260426-idea-lifecycle-spec]
history: lc-20260426-frontmatter-contract.history.md
---

All lifecycle artifacts carry the following frontmatter fields. The
`id` field is the only field whose convention cannot change in future versions.

| Field | Required | Type | Notes |
|---|---|---|---|
| id | yes | lc-YYYYMMDD-slug | never changes |
| stage | yes | enum | see stage list |
...
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
