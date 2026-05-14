# docs/explanation/

Reasoning: the background, trade-offs, and design history that help
a reader understand why the system is shaped the way it is.

## Divio role

Explanation documentation is understanding-oriented. It provides
context and background so that a reader can build a mental model of
the system, not just operate it. It answers "why does this exist?"
and "why did we choose this over the alternatives?"

Explanation is distinct from architecture: architecture says what the
structure is; explanation says why that structure was chosen. Explanation
is distinct from reference: reference states facts; explanation
contextualizes them. A reader who wants to challenge or extend a
design decision will start here and in `../decisions/`.

Use this folder for: design rationale, historical context, trade-off
analysis, anti-pattern explanations (why they are harmful), and
the reasoning behind non-obvious constraints.

## What belongs here

Canon-stage (Stage 8) artifacts that explain reasoning:
- Why the lifecycle has 9 stages instead of 5 or 12
- Why the `id` field convention cannot change in future versions
- Why brainstorm outputs do not count as decisions (anti-pattern 7)
- Why Canon and Ship are distinct stages (the most under-recognized
  distinction in the lifecycle)
- Why the head's weekly triage is non-negotiable
- Trade-off analysis docs for major design choices

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
- `links` -- related decisions, architecture docs, reference docs
- `supersedes` -- if this explanation replaces a prior one

## Canon stage requirement

Explanation docs can drift. As the system evolves, the reasoning that
was true for v2.0 may not apply to later versions. Review every 90 days; update
or supersede rather than letting stale reasoning mislead.

## File naming

`c-YYYYMMDD-slug.md` -- prefix `c` for canon.

## Example entry

```
---
id: lc-20260426-canon-vs-ship
stage: canon
owner: head
created: 2026-04-26
last_touched: 2026-05-03
prior_paths:
  - docs/proposals/p-20260426-canon-vs-ship.md
links: [lc-20260426-idea-lifecycle-spec]
---

Ship and Canon are distinct stages because shipping a feature does
not make it canonical truth. A feature can ship, reveal unexpected
behavior, and be walked back -- that is not a canon document.

Canon requires evidence of being load-bearing: the feature has been
used, its documentation has been tested against real questions, and
no contradicting canon exists. This distinction protects against
premature canonicalization (anti-pattern 4), which is the most common
way documentation systems drift from reality.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
