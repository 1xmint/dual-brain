# docs/archive/

Terminal folder for ideas that did not complete the lifecycle --
rejected, abandoned, or stale-and-skipped.

## What belongs here

Artifacts that are done moving through the lifecycle, but not because
they became canon. Specifically:

- Ideas rejected at any stage (fitness check failed, critique failed,
  Decision chose against)
- Ideas abandoned mid-lifecycle (owner left, context evaporated,
  problem dissolved)
- Stale ideas that the head chose not to revive after the TTL
  auto-tag (stale + manual triage-skip = archive)
- Duplicate proposals killed by the merge-or-kill protocol, with
  `reason: duplicate-of: <id>`

Archive is NOT:
- A place to hide rejection without recording why (anti-pattern 9)
- A place for superseded canon docs (those go to `archive/superseded/`)
- A passive graveyard you dump things into to avoid deciding

## The reason: field is required

Every artifact here must have `reason:` set in its frontmatter. This
is not optional. Without a reason, archive is indistinguishable from
a black hole. Future readers need to know: was this rejected? abandoned?
outcompeted? The reason is the difference between "this folder is
trustworthy history" and "this folder is where things go to disappear."

Examples of valid reason values:
- `reason: rejected-at-proposal: critique found no evidence base`
- `reason: abandoned: owner rotated out, no successor`
- `reason: duplicate-of: lc-20260410-friction-pipeline`
- `reason: stale: 30 days no-touch, head chose not to revive`

## Frontmatter requirements

Required fields:
- `id` -- unchanged; `lc-YYYYMMDD-slug`
- `stage: archived`
- `owner` -- who made the archive decision
- `created` -- never changes
- `last_touched` -- date of archive decision
- `prior_paths` -- audit trail of every path the artifact held
- `reason` -- REQUIRED; see above

Optional:
- `links` -- if archived as duplicate, links to the surviving id
- `topic`

## File naming

`ar-YYYYMMDD-slug.md` -- prefix shifts to `ar`.

## Differentiation from archive/superseded/

`archive/` holds ideas that did not make it.
`archive/superseded/` holds canon docs that were replaced by newer
canon. A superseded doc succeeded; it is just no longer current.
An archived idea may have never shipped at all.

## Example entry

```
---
id: lc-20260415-auto-promote-friction
stage: archived
owner: head
created: 2026-04-15
last_touched: 2026-04-28
prior_paths: [docs/inbox/i-20260415-auto-promote-friction.md]
reason: duplicate-of: lc-20260426-friction-aggregation
links: [lc-20260426-friction-aggregation]
topic: friction-pipeline
---

Archived at Decision stage. This proposal was outcompeted by
lc-20260426-friction-aggregation which covered the same problem with
stronger evidence. See that artifact for the surviving approach.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
