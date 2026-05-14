# First Idea Walkthrough

End-to-end pass on one realistic idea using the lifecycle. Takes about 30 minutes.
You end with a Decision (ADR signed) and a clear path to Plan and Build. This walkthrough
shows you the full shape from friction note to canonical record without exhaustively
repeating every stage -- because many ideas reach Decision and then pause while separate
work catches up.

The lifecycle works without going through every stage every time. That is the point.

---

## What you need

- A repo with the lifecycle scaffold installed (`docs/inbox/`, `docs/proposals/`,
  `docs/decisions/`, `templates/lifecycle/`).
- A friction observation worth promoting to Inbox. Use a real one from your rolling
  friction log, or use the hypothetical in this walkthrough.

If you do not have a friction observation yet, skip to Step 2 and write the Inbox
entry directly. Friction log -> Inbox is one path; direct Inbox creation is another.
Both are valid.

---

## The example idea

We will track this idea through the lifecycle:

> "Head has no standard triage cadence for the Inbox. Ideas pile up unreviewed.
> Observed twice across two sessions."

This is a real class of problem the package's own orchestration layer produces.
It is concrete enough to move through the lifecycle meaningfully, small enough to
finish in 30 minutes.

---

## Step 1 -- Capture in friction log

Every chat maintains a rolling friction log. When you notice something worth keeping,
append an entry. Format follows `head-1-friction.md` (shape reference in `_salvage/`).

```
### F7 -- Head Inbox triage has no cadence
Date: 2026-04-26
Observed: head session `head-1` ran for 90 minutes without touching docs/inbox/.
  Inbox had 3 entries from prior sessions. None were triaged. Pattern also seen in `head-1--run2`.
Candidate fix: Require head to triage Inbox at session open (not close). Add to
  START-HEAD.md as a required ritual. One line, no new files.
Status: open
```

One entry per observation. Don't promote everything -- one-offs stay here. You promote
a pattern to Inbox when you have seen it twice or when the cost of ignoring it is high.

---

## Step 2 -- Head promotes to Inbox

The head reviews friction logs on rotation or session open, identifies patterns, and
explicitly promotes them. This is never automatic.

Create `docs/inbox/i-20260426-head-inbox-cadence.md`:

```markdown
---
id: lc-20260426-head-inbox-cadence
stage: inbox
owner: head
created: 2026-04-26
last_touched: 2026-04-26
prior_paths: []
links: []
topic: head-triage-ops
source: friction:head-1:F7
reviews: []
skipped_stages: []
cost_estimate: low
---

# Head Inbox triage has no cadence

## Thesis

The head has no required moment to review `docs/inbox/`. Without a ritual, Inbox
entries sit unreviewed across sessions and the lifecycle stalls at stage 1.

## Evidence

- `head-1` session (2026-04-26): 90 minutes of active work, 3 Inbox entries untouched.
- `head-1--run2` session (prior rotation): same pattern, same result.

## Candidate fix

Add a required triage ritual to `START-HEAD.md`: check `docs/inbox/INDEX.md` at
session open. Move stale entries to `archived` or advance them to `brainstorm`/`proposal`
within the session. No new files needed; one line in one existing file.

## Open questions

- Should triage be session-open or session-close? (Open; initial lean: open.)
- Should stale TTL be enforced automatically or surfaced for manual review? (Deferred to a future version.)
```

Back-reference the friction log: update the friction entry's `Status:` line.

```
Status: promoted -> lc-20260426-head-inbox-cadence
```

The trail is now two-directional. The id in the friction log points forward; the
`source:` field in the Inbox entry points back.

---

## Step 3 -- Brainstorm exploration (or skip with reason)

Two paths here.

### Path A -- full brainstorm

If the idea is architecturally novel, high-stakes, or needs extensive option
exploration, launch a brainstorm session. It produces a handoff doc in
`docs/proposals/_drafts/`. That handoff feeds Step 4.

For this idea, a full brainstorm is not warranted. The candidate fix is already stated
in the Inbox entry. Launching a brainstorm session would be lifecycle theater.

### Path B -- skip (this idea takes Path B)

Update the frontmatter:

```yaml
skipped_stages: [brainstorm]
reason: "candidate fix is already well-defined in Inbox entry; exploration adds no value"
```

Anti-paralysis principle: skipping a stage is a first-class pattern. The requirement
is recording *why*, not going through every stage every time.

---

## Step 4 -- Promote to Proposal

The Inbox entry has a stated thesis, evidence, and a candidate fix. It passes the
Inbox -> Proposal gate. Promote it.

Rename (or copy and delete original):

```
docs/inbox/i-20260426-head-inbox-cadence.md
  ->
docs/proposals/p-20260426-head-inbox-cadence.md
```

The filename prefix shifts from `i-` to `p-`. The `id` field does not change.
Update `prior_paths:` to record where it came from.

Flesh out the proposal body using `templates/lifecycle/PROPOSAL.md` as the shape.
Key additions at Proposal stage:

```markdown
---
id: lc-20260426-head-inbox-cadence
stage: proposal
owner: head
created: 2026-04-26
last_touched: 2026-04-26
prior_paths: [docs/inbox/i-20260426-head-inbox-cadence.md]
links: []
topic: head-triage-ops
source: friction:head-1:F7
reviews: []
skipped_stages: [brainstorm]
reason: "candidate fix already well-defined; no brainstorm needed"
cost_estimate: low
---

# Proposal: Head Inbox triage cadence

## Thesis

Add a required session-open triage ritual for the head. One line in
`START-HEAD.md`. Prevents Inbox rot without adding process weight.

## Alternatives considered

1. **Add triage to session-close instead of session-open.** Risk: a crashed or
   rotated session never reaches close. Session-open is more robust.

2. **Automate Inbox stale-detection via a script.** Higher implementation cost;
   deferred to a future version. Premature for v2.0 where manual triage is the baseline.

3. **Do nothing; leave triage to head discretion.** Observed pattern shows
   discretion is insufficient. Two sessions without triage is the evidence.

## Risks

- Triage ritual adds ~2 minutes to session open. Acceptable given payoff.
- Head forgets. Mitigation: ritual is in START-HEAD.md where it's read first.

## ADR needed

Yes. This changes required head behavior at session open. It touches the
`orchestration/` contract and should be an explicit record.
```

---

## Step 5 -- Head critique

One review round. Update `reviews:` in frontmatter:

```yaml
reviews:
  - reviewer: head
    date: 2026-04-26
    verdict: approved
    notes: "Alternative 1 (session-close) is a real risk; session-open is correct.
      Alternative 2 deferral is right. Proceed to Decision."
```

If the critique surfaces a gap, rewind here and update the proposal body before
advancing. In this case the proposal holds.

---

## Step 6 -- Decision (ADR)

The proposal has passed critique, alternatives are considered, ADR-needed is flagged.
Create `docs/decisions/d-20260426-head-inbox-cadence.md`:

```markdown
---
id: lc-20260426-head-inbox-cadence-adr
stage: decision
owner: head
created: 2026-04-26
last_touched: 2026-04-26
prior_paths: []
links: [lc-20260426-head-inbox-cadence]
topic: head-triage-ops
source: friction:head-1:F7
reviews: []
skipped_stages: [brainstorm]
---

# ADR: Head Inbox triage is a required session-open ritual

## Status

Accepted -- 2026-04-26

## Context

The head role has no required moment to review `docs/inbox/`. Two sessions
(`head-1--run2`, `head-1`) ran without any Inbox triage. Inbox entries sit unreviewed; the lifecycle stalls
at stage 1. See proposal `[[lc-20260426-head-inbox-cadence]]` for full context.

## Decision

Add one line to `orchestration/START-HEAD.md` (and the corresponding section of
`head-prompt.md`) specifying that Inbox triage is required at session open.

Triage means: review every entry in `docs/inbox/`, and for each one, either advance
it toward Proposal, archive it with a reason, or explicitly mark it `deferred` with
a date. Triage does not mean resolve everything -- it means touch everything.

## Alternatives rejected

- Session-close triage: rejected; crashed sessions never reach close.
- Automated stale detection: deferred to a future version; premature for manual-baseline v2.0.
- Discretionary triage: rejected; two-session evidence shows discretion is insufficient.

## Consequences

- head sessions begin with a 2-minute Inbox scan.
- Inbox rot is surfaced within one session, not silently across many.
- A future version can automate the detection layer on top of this behavioral baseline.

## Sign-off

head: approved
date: 2026-04-26
```

The ADR links back to the proposal id via `links:` in frontmatter and
`[[lc-20260426-head-inbox-cadence]]` in the body. The proposal id never changes
even when its file moves between stage folders.

---

## Step 7 -- Plan, Build, Ship, Canon (the rest of the path)

The same shape continues from here.

**Plan:** The head creates a roadmap entry and a GitHub issue. For this idea the
implementation is one line in one file; the Plan stage is a commit description and
a linked issue, not a multi-sprint breakdown. Sub-issues are only warranted when
the work spans multiple agents or sessions.

**Build:** An agent edits `START-HEAD.md` and `head-prompt.md`. Tests are the
prompt smoke tests in `orchestration/prompt-smoke-tests.md`. The agent opens a PR
and posts the verification result.

**Ship:** The PR merges. The release notes for the next version cut include this entry.
The artifact advances to `stage: ship` in frontmatter.

**Canon:** After the change has been load-bearing for 4+ weeks with no contradicting
behavior, the head promotes the relevant sections of `START-HEAD.md` to
`stage: canon` status. A history sibling (`lc-20260426-head-inbox-cadence.history.md`)
records the full chain.

For many ideas, Decision is the natural pause point. Plan and Build can start days
or weeks later when an agent slot is available. The lifecycle does not require
continuous forward motion -- it requires that motion, when it happens, goes through
the right gates.

---

## Anti-paralysis sidebar

### Solo dev archetype

If you are one person with one or two repos, collapse to 5 stages:

```
Inbox -> Proposal -> Build -> Ship -> Canon
```

Skip Brainstorm, formal Decision (ADR), and Plan by default.

- Brainstorm becomes a longer Inbox entry.
- Decision becomes a commit message with a `DECISION:` prefix.
- Plan becomes the implementation itself.

One INDEX.md for the whole `docs/` folder. No per-folder duplication.

Most ideas live and die in Inbox. That is healthy. An Inbox that has 10 entries,
7 of which never advance, is doing its job: it captured signals and the owner
made a judgment call. An Inbox that is never reviewed is the failure state.

The lifecycle serves the idea, not the other way around.

---

## What if you skip a stage?

Skipping is a first-class pattern. The only requirement is recording why.

```yaml
skipped_stages: [brainstorm, plan]
reason: "trivial fix; implementation is one line; no exploration or sizing needed"
```

Stages that are routinely safe to skip:

- **Brainstorm:** when the candidate fix is already obvious and low-stakes.
- **Plan:** when the build is a single bounded task for one agent in one session.
- **ADR/Decision:** for non-architectural, non-cross-cutting changes (solo archetype).

Stages that are not safe to skip silently:

- **Proposal -> Decision** for cross-cutting or architectural changes.
- **Build -> Ship** gates (tests, audit). Skipping these is not a stage skip -- it is
  a quality failure.

When time pressure forces a skip you would not normally make, record it:

```yaml
skipped_stages: [brainstorm]
reason: "time-pressured; shipped under deadline; revisit if problems surface"
```

The record is the protection. Silent skips create debt you cannot see.

---

## What if you have never done this before?

Write your first Inbox entry. That is the only step that matters today.

The frontmatter looks intimidating. Ignore the optional fields. The four required
fields are:

```yaml
---
id: lc-20260426-your-slug-here
stage: inbox
owner: you
created: 2026-04-26
---
```

Everything else fills in as the idea moves. `last_touched` is today.
`prior_paths` is empty until the first promotion. `skipped_stages` is empty until
you skip something. Start with the four required fields and add the rest when they
become relevant.

The most common failure mode is not writing the wrong frontmatter -- it is not
writing anything because the frontmatter looks like too much work. Four fields.
One file. That is the entry cost.

---

## What is next

- `orchestration/IDEA-LIFECYCLE.md` -- the full spec: all 9 stages, the frontmatter
  contract, TTLs, anti-patterns, and per-archetype guidance.
- `templates/lifecycle/` -- the template for each stage. Use these as your starting
  shape; they include comments explaining each field.
- `templates/lifecycle/QUALITY-GATES.md` -- the per-transition checklist. Print it.
- `orchestration/docs/INDEX.md` -- the global index of active lifecycle artifacts
  in this repo.
