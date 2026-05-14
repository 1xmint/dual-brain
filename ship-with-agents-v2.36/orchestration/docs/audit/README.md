# docs/audit/

Verification artifacts from the Build stage -- the evidence that a
build actually passed its gates before shipping.

## What belongs here

Stage 6 artifacts. The Build stage has two parts: building and
verifying. Verification is the exit gate of Build, not a separate
stage. An audit entry here is that exit gate materialized.

What belongs here:
- Test reports (pass/fail summary, coverage, flaky-test log)
- Audit logs (cross-ref checks, linting runs, security scans)
- Contamination scans (did buyer-facing files leak internal content?)
- Manual verification notes when automated checks are not available

**Build cannot pass to Ship without an entry in this folder.** If a
build has no audit artifact, it has not completed Stage 6. Do not
promote to Ship stage without a corresponding audit entry here that
links to the build artifact being verified.

## What does NOT belong here

- Canon documentation (that lives in `../reference/`, `../architecture/`,
  `../explanation/`)
- Build artifacts themselves (source tree or release bundle) -- those
  live in the source tree and git tags
- Pre-build planning (proposals, plans) -- those live in
  `../proposals/`

## Frontmatter requirements

Required fields:
- `id` -- references the build artifact being verified; `lc-YYYYMMDD-slug`
- `stage: build`
- `owner` -- the super or agent that ran the verification
- `created`
- `last_touched`
- `links` -- must include the proposal id and any ADR id being verified

Optional:
- `cost_actual` -- set here or at Ship if tracked
- `kicked_back_from` -- if this audit discovered a problem that rewound
  to Proposal, record it here before moving the proposal artifact

## File naming

`bd-YYYYMMDD-slug.md` -- prefix `bd` for build. Date and slug carry
forward from the original inbox entry.

## Status conventions

Audit entries carry one of:
- `Verdict: pass` -- all gates cleared; ready to promote to Ship
- `Verdict: fail` -- gates did not clear; reason recorded; proposal
  may need kick-back
- `Verdict: partial` -- some gates pass, some deferred; must document
  which are deferred and why before Ship

## Example entry

```
---
id: lc-20260426-friction-aggregation
stage: build
owner: super-s4
created: 2026-04-30
last_touched: 2026-04-30
links: [lc-20260426-friction-aggregation]
---

Verdict: pass

cross-refs: 0 phantoms (check-cross-refs.sh, 2026-04-30)
tests: all pass (npm test, 47 cases)
contamination: clean (no _internal/ content in buyer-facing files)
docs updated: yes (CHANGELOG.md entry added)
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
