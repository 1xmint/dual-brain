# Template: Brainstorm Handoff

Lifecycle stage: **brainstorm** | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

A Brainstorm Handoff is the artifact a brainstorm chat produces when a
session ends. It lives in `docs/proposals/_drafts/` until the head
promotes it to a formal Proposal. It is not a decision -- it is
structured exploration with explicit open questions.

Treat this template as the canonical starting shape. Once your own repo
has a few good lifecycle handoffs, promote one buyer-safe example into
your project docs as the local reference example.

Copy this template to `docs/proposals/_drafts/b-<YYYYMMDD>-<slug>.md`.

---

## Frontmatter (copy this block; fill all required fields)

```yaml
---
# id: same stable id assigned at Inbox stage; never changes.
id: lc-YYYYMMDD-slug

# stage: always "brainstorm" for drafts in this folder.
stage: brainstorm

# owner: the brainstorm chat or agent that produced this handoff.
#        On handoff to head, update to the receiving agent.
owner: <brainstorm-chat-or-agent>

# created: creation date of the original Inbox entry (never changes).
created: YYYY-MM-DD

# last_touched: date this handoff was last edited.
last_touched: YYYY-MM-DD

# source_inbox_id: the Inbox entry this brainstorm was spun from.
#                  Use the lc- id, not a path.
source_inbox_id: lc-YYYYMMDD-slug

# links: other lifecycle ids referenced in this document.
links: []

# topic: carry forward from the Inbox entry.
topic: <freeform-string>

# prior_paths: the Inbox file path this artifact was promoted from.
prior_paths:
  - docs/inbox/i-YYYYMMDD-slug.md

# reviews: list of review iterations appended as they happen.
#          Format: "YYYY-MM-DD: <reviewer> -- <one-line note>"
reviews: []

# skipped_stages: carry forward from Inbox; add any newly skipped stages.
skipped_stages: []

# open_questions_count: how many open questions remain unresolved.
#                       0 is required to gate to Proposal.
open_questions_count: <N>
---
```

---

## Context

Describe the situation that drove this brainstorm. Two to four
sentences. What problem exists, what triggered the exploration, and
what constraints are in scope? This is the factual starting point --
no rhetoric, no recommendations yet.

Reference the source Inbox entry: `[[lc-YYYYMMDD-slug]]`.

## Pressure-Test Findings

What the brainstorm explored and what it found. This is the substance
of the session. Organize by finding, not by chronology.

### Finding 1: `<short title>`

What was discovered. Evidence cited (friction log entries, prior art,
data points). One paragraph per finding; more if the finding is
load-bearing.

### Finding 2: `<short title>`

...

### Things that were tested and failed

Explicit dead ends. Record these so the next stage doesn't re-explore
them. A brainstorm without dead ends is probably superficial.

- `<approach tried>` -- why it doesn't work.
- `<approach tried>` -- why it doesn't work.

## Open Questions

Every question that must be answered before this can become a Proposal.
Resolve or explicitly defer each one; the gate to Proposal requires
`open_questions_count: 0` or explicit deferred-with-reason entries.

- `[ ]` `<question>` -- status: unresolved | deferred (reason: `<why>`)
- `[ ]` `<question>` -- status: unresolved | deferred (reason: `<why>`)

## Recommended Next Stage

State plainly what this handoff recommends:

- **Promote to Proposal:** if the thesis is coherent, evidence is cited,
  and open questions are resolved or explicitly deferred.
- **Needs more brainstorm:** if key questions remain and a second session
  is warranted.
- **Archive:** if exploration revealed the idea is not worth pursuing.
  Record why.

Recommended action: `promote | revisit | archive`

Reason in one sentence: `<why>`

## Things Missed

Honest list of what this brainstorm did not cover. The head uses
this to scope the next session or to scope the Proposal critique.

- `<gap>` -- impact: `<high|med|low>` -- suggested owner: `<who>`
- `<gap>` -- impact: `<high|med|low>` -- suggested owner: `<who>`

---

## Handoff checklist (brainstorm chat fills this before routing)

- [ ] Frontmatter complete; `last_touched` updated.
- [ ] All findings have evidence cited, not just asserted.
- [ ] Open questions list is exhaustive -- nothing is implied.
- [ ] Dead ends documented so the Proposal stage doesn't re-explore.
- [ ] Recommended next stage is explicit with one-sentence reason.
- [ ] Things Missed section is honest -- not a dumping ground for
      "nice to haves," but a genuine gap list.
- [ ] Routed to head; head knows this is waiting.

---

*For the full gate checklist before promoting to Proposal, see
`../../templates/lifecycle/QUALITY-GATES.md`.*
