# Template: Lifecycle Proposal

Lifecycle stage: **proposal** | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

A Lifecycle Proposal is the formal stage-3 artifact in the idea
lifecycle. It lives in `docs/proposals/` and is the document that
enters Decision review. It must survive critique, present real
alternatives, and make an explicit ADR recommendation.

Copy this template to `docs/proposals/p-<YYYYMMDD>-<slug>.md`.

Note on the lighter-weight shape: `templates/proposal.md` is a
one-off chaos-recovery proposal format with no frontmatter contract.
This file (lifecycle PROPOSAL.md) is for forward-flow ideas moving
through the full lifecycle with a stable id. Use this one when the
idea has been through Inbox; use `templates/proposal.md` for ad-hoc
situational proposals that do not need lifecycle tracking.

---

## Frontmatter (copy this block; fill all required fields)

```yaml
---
# id: same stable id carried from Inbox/Brainstorm. Never changes.
id: lc-YYYYMMDD-slug

# stage: always "proposal" for documents in docs/proposals/.
stage: proposal

# owner: head who owns this proposal through Decision review.
owner: <agent-or-human>

# created: original creation date (from Inbox entry). Never changes.
created: YYYY-MM-DD

# last_touched: updated on every meaningful edit.
last_touched: YYYY-MM-DD

# prior_paths: audit trail of paths this artifact has lived at.
prior_paths:
  - docs/inbox/i-YYYYMMDD-slug.md
  - docs/proposals/_drafts/b-YYYYMMDD-slug.md  # omit if Brainstorm skipped

# links: other lifecycle ids referenced by this proposal (not paths).
links: []

# topic: carry forward; used for sibling-detection at Decision stage.
topic: <freeform-string>

# source: carry forward from Inbox entry.
source: manual

# reviews: append one line per review iteration.
#          Format: "YYYY-MM-DD: <reviewer> -- <outcome: pass|kick-back|pending>"
reviews: []

# skipped_stages: carry forward; add any newly skipped stages with reason.
skipped_stages: []

# adr_needed: does this proposal require a formal ADR at Decision stage?
#             yes -- for cross-cutting, architectural, or trust-model changes.
#             no  -- for scoped implementation choices; decision can be PR comment.
#             Reason is required either way.
adr_needed: yes | no
adr_needed_reason: "<one sentence>"

# cost_estimate: rough effort signal. Set at Proposal stage.
#   low  -- hours; single-session implementation.
#   med  -- days; multi-session, one agent.
#   high -- weeks; cross-team or cross-repo.
cost_estimate: low | med | high

# supersedes: if this proposal replaces an older one, list the old id.
supersedes: ""

# kicked_back_from: set if this proposal was rewound from a later stage.
kicked_back_from: ""

# reason: required if kicked_back_from is set or if proposal is archived.
reason: ""
---
```

---

## Thesis

One sentence. What is being proposed? Write it so a reviewer with no
prior context understands the core claim in ten seconds.

## Context

Two to five paragraphs. What is the current state? What pressure or
gap drives this proposal? What constraints are in scope? Be factual --
no advocacy yet. Reference the source brainstorm or inbox entry:
`[[lc-YYYYMMDD-slug]]`.

## Alternatives Considered

At least two alternatives. A proposal with fewer than two alternatives
fails the Decision gate. For each: describe it honestly, then explain
why it was set aside.

**Alternative A: `<short name>`**

What it would do. Why it was not chosen: `<honest reason>`.

**Alternative B: `<short name>`**

What it would do. Why it was not chosen: `<honest reason>`.

## Recommendation

What this proposal recommends, and why. One to three paragraphs. This
is where advocacy is appropriate -- but it must follow from the
alternatives analysis, not precede it.

## Risks and Tradeoffs

Honest list. A proposal with no risks is either trivial or the author
is not looking hard enough. For each risk: state it, then state the
mitigation or the accepted consequence.

- `<risk>` -- mitigation: `<what>` | accepted: `<why>`
- `<risk>` -- mitigation: `<what>` | accepted: `<why>`

## ADR-Needed Flag

Restate the `adr_needed:` field value here with one sentence of
rationale. This makes the gate check unambiguous for the reviewer.

- ADR needed: **yes | no**
- Reason: `<one sentence>`

## Cost Estimate

Restate the `cost_estimate:` field value here with a brief breakdown.

- Estimate: **low | med | high**
- Breakdown: `<what drives the estimate -- e.g., "two agent sessions
  plus one PR review cycle">`

---

*For the full gate checklist before submitting to Decision review, see
`../../templates/lifecycle/QUALITY-GATES.md`.*
