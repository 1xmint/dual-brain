# Status Taxonomy

Lifecycle reference | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

This document is the canonical vocabulary for all `stage:` values and
status flags used in lifecycle frontmatter. When a field value is
ambiguous, this document is the tiebreaker.

Two orthogonal dimensions govern a lifecycle artifact:

1. **Stage** -- where in the lifecycle the artifact currently sits.
   Recorded in frontmatter `stage:`. Exactly one stage at a time.
2. **Status flags** -- conditions that can be true simultaneously
   alongside a stage. Recorded separately (in body or supplemental
   frontmatter). Multiple flags can be active at once.

---

## Stage values

### `inbox`

**Meaning:** A spark has been captured as a structured entry with a
thesis, owner, and source. It has not yet been explored or proposed.

**Who sets it:** Anyone (head confirms during triage).

**Valid next stages:**
- `brainstorm` -- when thesis, owner, and fitness check pass.
- `proposal` -- when Brainstorm stage is skipped with reason.
- `archived` -- when triaged out; `reason:` required.

**TTL:** 30 days without a touch auto-tags `stale`. Manual triage-skip
required before archiving.

---

### `brainstorm`

**Meaning:** The idea is in active exploration. A brainstorm chat or
agent is generating a handoff document in `docs/proposals/_drafts/`.

**Who sets it:** Brainstorm chat / agent.

**Valid next stages:**
- `proposal` -- when coherent thesis, evidence, and resolved/deferred
  open questions are present.
- `archived` -- when exploration reveals the idea is not worth
  pursuing; `reason:` required.

**TTL:** 14 days without a touch auto-tags `stale`.

---

### `proposal`

**Meaning:** A formal proposal document exists in `docs/proposals/`.
The idea has survived initial exploration and is ready for critique
and Decision review.

**Who sets it:** Head (when promoting from Brainstorm or directly
from Inbox with Brainstorm skipped).

**Valid next stages:**
- `decision` -- when critique passes, alternatives >= 2, ADR-needed
  flag set.
- `archived` -- when critique fails and the idea is closed; `reason:`
  required.
- `brainstorm` (kick-back) -- when the proposal needs more exploration
  before it can be decided. Unusual; prefer sharpening in place.

**TTL:** 21 days without a touch auto-tags `stale`.

---

### `decision`

**Meaning:** An ADR exists in `docs/decisions/`. The choice has been
made and signed. This is the stable record of what was decided and why.

**Who sets it:** Head (with user co-sign for sensitive decisions).

**Valid next stages:**
- `plan` -- when ADR is signed and links to proposal id.
- `superseded` -- when a newer ADR covers the same ground.

**TTL:** None. Decisions do not expire; they get superseded.

---

### `plan`

**Meaning:** The decision has been broken into a roadmap entry, a
parent GitHub issue, and sized sub-issues with owners.

**Who sets it:** Head.

**Valid next stages:**
- `build` -- when sub-issues are sized, owners assigned, and roadmap
  entry is created.
- `archived` -- when the plan is abandoned; `reason:` required.
- `proposal` (kick-back) -- when planning reveals the decision needs
  revision. Unusual; requires new ADR or amendment.

**TTL:** 30 days without progress triggers re-plan-or-kill triage.

---

### `build`

**Meaning:** Active implementation. Code, tests, and verification
artifacts are being produced.

**Who sets it:** Super (agent doing the build work).

**Valid next stages:**
- `ship` -- when code is merged, tests pass, audit is clean, docs
  are updated.
- `proposal` (kick-back) -- when implementation reveals the proposal
  was wrong. Branch preserved; proposal gets `kicked_back_from: build`.

**TTL:** 60 days without merge flags zombie WIP risk for head review.

---

### `ship`

**Meaning:** The artifact has been released. Release notes written,
git tag created, deployed within the stabilization window.

**Who sets it:** Head.

**Valid next stages:**
- `canon` -- after stabilization window passes with no rollback, idea
  is load-bearing >= N weeks (default N=4), no contradicting canon doc.

**TTL:** Passes through; no meaningful TTL at this stage.

---

### `canon`

**Meaning:** The idea is now durable truth. The artifact is a spec,
reference doc, architecture doc, or vision statement that the system
is actively built against. Load-bearing without contradiction.

**Who sets it:** Head and head jointly (head confirms; head
promotes the artifact).

**Valid next stages:**
- `superseded` -- when a newer canon doc covers the same ground.
  Old doc moves to `docs/archive/superseded/`.
- `proposal` (re-proposal / contest) -- when canon is contradicted by
  new evidence. A new proposal is written with `supersedes: <old-id>`;
  the old canon is contested through the full Decision gate.

**TTL:** Review every 90 days; confirm still load-bearing.

---

### `archived` (terminal)

**Meaning:** The idea was rejected, abandoned, or stale-triaged out
of the active lifecycle. The artifact is preserved for history but is
no longer active.

**Who sets it:** Anyone (head for most cases; head for contested
canon).

**Valid next stages:** None. Terminal state.

**Required:** `reason:` field in frontmatter must explain the
archival. "Archived" without reason is the anti-pattern "archive as
graveyard."

---

### `superseded` (terminal)

**Meaning:** A newer artifact (canon doc, ADR, or proposal) has
replaced this one. The artifact stays in `docs/archive/superseded/`
with a pointer to its successor.

**Who sets it:** Head or head.

**Valid next stages:** None. Terminal state.

**Required:** `superseded_by: <new-id>` in frontmatter. The successor
must have `supersedes: <old-id>`.

---

## Status flags

Status flags are orthogonal to stage -- they describe a condition on
top of the current stage, not a replacement for it. Multiple flags can
be active simultaneously.

| Flag | Meaning | Who sets it | Cleared by |
|------|---------|-------------|-----------|
| `raw` | Captured but not reviewed. Default for new Inbox entries. | Author | Head triage |
| `triaged` | Head has reviewed; decision made (keep, promote, park). | Head | Stage promotion or archival |
| `stale` | TTL expired with no meaningful touch. | Auto (head runs check) | Owner updates `last_touched` with real work |
| `promoted` | Artifact has moved to the next stage; this copy is historical. | Head | N/A (artifact is superseded by the promoted version) |
| `in-review` | Under active critique or Decision review. | Head or head | Review completes (pass or kick-back) |
| `kicked-back` | Rewound from a later stage; `kicked_back_from:` field is set. | Super or head | New proposal revision passes review |
| `sealed` | Canon doc confirmed load-bearing; no changes without a new contest proposal. | Head | Successful contest (new proposal + decision) |

---

## State-transition diagram

```
                          [spark event]
                               |
                               v
                 +-------------+-------------+
                 |           INBOX           |
                 |  raw -> triaged -> stale  |
                 +---+-------------------+---+
                     |                   |
               [gate pass]          [archived]
                     |
          +----------+----------+
          |                     |
    [brainstorm             [skip brainstorm,
     not skipped]            reason recorded]
          |                     |
          v                     |
  +-------+-------+             |
  |   BRAINSTORM  |             |
  |  (_drafts/)   |             |
  +-------+-------+             |
          |                     |
    [gate pass]            [archived]
          |                     |
          +----------+----------+
                     |
                     v
           +---------+---------+
           |      PROPOSAL     |
           |  (docs/proposals) |
           +---------+---------+
                     |
               [gate pass]
                     |
                     v
            +--------+--------+
            |    DECISION     |
            |  (docs/decisions|
            |   /ADR signed)  |
            +--------+--------+
                     |
               [gate pass]
                     |
                     v
              +------+------+
              |    PLAN     |
              | (roadmap +  |
              |  GH issues) |
              +------+------+
                     |
               [gate pass]
                     |
                     v
              +------+------+
              |    BUILD    |
              | (code+tests |
              |   +audit)   |
              +------+------+
                     |
               [gate pass]
                     |           [kick-back]
                     v           <-----------+
               +-----+-----+                |
               |    SHIP   |         +------+------+
               | (release  |         |  PROPOSAL   |
               |    +tag)  |         | (rewound)   |
               +-----+-----+         +-------------+
                     |
               [gate pass]
                     |
                     v
               +-----+-----+
               |   CANON   |<---------+
               | (durable  |          |
               |   truth)  |          |
               +-----+-----+          |
                     |                |
           [contradicted]      [re-canonized]
                     |                |
                     v                |
             +-------+-------+        |
             | RE-PROPOSAL   +--------+
             | (new id,      |
             | supersedes:)  |
             +---------------+
                     |
               (any stage)
                     |
                     v
            +--------+--------+
            |    ARCHIVED     | (terminal)
            | (docs/archive/) |
            +-----------------+

            +--------+--------+
            |   SUPERSEDED    | (terminal)
            | (archive/super  |
            |   seded/)       |
            +-----------------+
```

---

## Canonical frontmatter `stage:` values (machine-readable list)

```
inbox
brainstorm
proposal
decision
plan
build
ship
canon
archived
superseded
```

No other values are valid in v2.0. Unrecognized stage values are
frontmatter rot; surface as friction.

---

*This taxonomy is the authoritative reference. If IDEA-LIFECYCLE.md
and this document conflict, surface as friction and update both.*
