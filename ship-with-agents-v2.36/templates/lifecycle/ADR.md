# Template: Lifecycle ADR (Decision Record)

Lifecycle stage: **decision** | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

A Lifecycle ADR is the formal stage-4 artifact in the idea lifecycle.
It records the decision that closes a Proposal and authorizes a Plan.
It lives in `docs/decisions/` and is signed by head and, where the
decision is sensitive, by the user. Once signed, it becomes the
authoritative record of what was chosen and why.

Copy this template to `docs/decisions/d-<YYYYMMDD>-<slug>.md`.

Note on the lighter-weight shape: `templates/ADR.md` is a standalone
architecture decision record with no frontmatter contract, suited for
lightweight or retroactive architectural notes. This file (lifecycle
ADR.md) is for decisions that emerge from the full forward-flow
lifecycle with a stable id and proposal link. Use this one when
closing a formal Proposal; use `templates/ADR.md` for one-off
architectural notes that do not need lifecycle tracking.

---

## Frontmatter (copy this block; fill all required fields)

```yaml
---
# id: same stable id carried from Inbox through Proposal. Never changes.
id: lc-YYYYMMDD-slug

# stage: always "decision" for documents in docs/decisions/.
stage: decision

# owner: head (or head for non-sensitive decisions).
#        User co-signs in the Sign-off section; ownership stays with head.
owner: head

# created: original creation date (from Inbox entry). Never changes.
created: YYYY-MM-DD

# last_touched: updated when signed or when status changes.
last_touched: YYYY-MM-DD

# proposal_id: the Proposal this ADR closes. Required; no ADR without proposal.
proposal_id: lc-YYYYMMDD-slug

# prior_paths: full audit trail of paths across all previous stages.
prior_paths:
  - docs/inbox/i-YYYYMMDD-slug.md
  - docs/proposals/_drafts/b-YYYYMMDD-slug.md  # omit if Brainstorm skipped
  - docs/proposals/p-YYYYMMDD-slug.md

# links: other lifecycle ids referenced by this decision.
links: []

# topic: carry forward for sibling-detection and archive tracing.
topic: <freeform-string>

# supersedes: if this ADR replaces an earlier decision, list the old id.
#             The old ADR gets superseded_by: set to this id; it stays in decisions/.
supersedes: ""

# superseded_by: set when a newer ADR replaces this one. Do not delete this ADR.
superseded_by: ""

# reviews: append one line per review or sign-off iteration.
#          Format: "YYYY-MM-DD: <reviewer> -- <outcome>"
reviews: []

# skipped_stages: carry forward from Proposal.
skipped_stages: []

# status: current state of this decision record.
#   proposed   -- written but not yet signed.
#   accepted   -- signed; authorizes Plan stage.
#   superseded -- replaced by a newer ADR (superseded_by is set).
status: proposed
---
```

---

## Context

What situation forced a decision? What was true before, what pressure
arose, and what constraints bounded the choice? Keep this factual --
no advocacy. Reference the source proposal: `[[lc-YYYYMMDD-slug]]`.

This section should be stable after signing. If the context changes,
a new ADR supersedes this one; this section is not edited retroactively.

## Decision

One paragraph in the present tense. State the decision plainly, as
if it were already done. No conditionals, no hedging.

> Example: "We adopt the per-stage TTL approach. Each lifecycle stage
> has its own expiry clock, not a global TTL. Stale-tagging is
> automatic; archiving requires explicit head triage-skip."

## Consequences

Honest accounting. Both directions. Neutral entries for non-obvious
follow-on behavior.

**Positive**

- `<what gets easier, safer, cheaper, or clearer>`;
- `<what gets easier, safer, cheaper, or clearer>`.

**Negative**

- `<what gets harder, more expensive, or more fragile>`;
- `<what we lose by making this choice>`.

**Neutral**

- `<non-obvious follow-on behavior that is neither gain nor loss>`.

## Alternatives Rejected

At least two, carried from the Proposal. Record each with the reason
it was rejected. This is the "why not" record future readers will need
when they revisit the decision.

- **Alternative A: `<name>`** -- rejected because `<reason>`.
- **Alternative B: `<name>`** -- rejected because `<reason>`.

## Sign-off

Decision is not effective until this section is complete.

| Role | Name / agent | Date | Signature |
|------|-------------|------|-----------|
| Head | `<name>` | YYYY-MM-DD | `[ ]` |
| User | `<name>` | YYYY-MM-DD | `[ ]` (required if sensitive) |

User sign-off is required when the decision touches: auth, credentials,
trust model, cryptography, live customer data, or any Tier 2/3 concern
as defined in the agent merge-tier rules.

After sign-off, update frontmatter: `status: accepted`, `last_touched:
<date>`.

---

*For the full gate checklist before moving to Plan stage, see
`../../templates/lifecycle/QUALITY-GATES.md`.*
