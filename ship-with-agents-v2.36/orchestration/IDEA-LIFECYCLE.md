# Idea Lifecycle

How ideas move from spark to canonical truth in a project that uses
this pack. Companion to `HOW-IT-WORKS.md` -- where orchestration
answers "how do agents coordinate work," lifecycle answers "how do
ideas become durable truth."

If you have running orchestration but ideas die in chat, never become
proposals, or become canon without anyone deciding -- this file is
the missing half.

> **Trial status (v2.0):** This lifecycle ships as a v2.0 trial. The
> 9-stage shape, the frontmatter contract, and the friction bridge
> are all dogfooded but young. Use them; surface friction; the next
> version refines based on what real use produces. The frontmatter
> `id` field is the one piece that will not change in future versions -- it's
> the load-bearing primitive everything else points at.

## Why this exists

Without an idea lifecycle:

- Sparks die in chat history.
- Brainstorms produce handoffs that nobody picks up.
- Proposals get implemented, but nobody can tell why.
- Canonical docs drift; old assumptions stay load-bearing while reality moves on.
- The orchestration layer runs forever without producing durable truth.

The lifecycle is a graph (with backedges, see [Reverse flow](#reverse-flow))
that takes an idea from "someone said something interesting" to "this
is now how the system works," with explicit gates between each stage.

## The 9 stages (plus 2 terminals)

| # | Stage | Artifact | Location | Owner | Gate to next |
|---|---|---|---|---|---|
| 1 | **Inbox** | Triaged entry: thesis + owner + status | `docs/inbox/` | head | Thesis stated; fitness check passed; someone owns it |
| 2 | **Brainstorm** | Exploration handoff doc | `docs/proposals/_drafts/` | brainstorm chat | Coherent thesis + evidence + open questions resolved or deferred |
| 3 | **Proposal** | Formal proposal | `docs/proposals/` | head | Critique passed, alternatives considered, ADR-needed flag set |
| 4 | **Decision** | ADR | `docs/decisions/` | head + user | ADR signed |
| 5 | **Plan** | Roadmap entry + parent issue + sub-issues | `docs/proposals/roadmap.md` + GitHub | head | Sub-issues sized, owners assigned |
| 6 | **Build** | Code + tests + verification artifacts | source tree + `docs/audit/` | super | All gates pass: tests, audit, doc updates |
| 7 | **Ship** | Release notes + tag | `CHANGELOG.md` + git tag | head | Deployed, no rollback within stabilization window |
| 8 | **Canon** | Spec, reference, architecture, vision | `docs/reference/`, `docs/architecture/`, `docs/explanation/`, `VISION.md` | head + head | Load-bearing N weeks without contradiction |
| --- | (terminal) **Archived** | Historical artifact | `docs/archive/` | anyone | Rejected, abandoned, or stale + triage-skip |
| --- | (terminal) **Superseded** | Pointer + history | `docs/archive/superseded/` | head/head | Newer canon takes its place |

**Spark is an event, not a stage.** Sparks happen in friction logs,
casual conversation, GitHub Discussions. The first durable artifact
is the Inbox entry. A friction note that doesn't become an Inbox
entry isn't in the lifecycle -- it's still a friction note. This is
deliberate: it avoids the "captured but never filed" zombie state.

### Why some stages collapse

- **Drafted and Proposed are one stage.** Same artifact, different
  polish levels. In practice nobody maintains two files. Polish
  happens in place; iterations are tracked in frontmatter
  (`reviews:`).
- **Building and Verified are one stage.** Verification is the exit
  gate of Build, not a separate stage. A build with no verification
  isn't done; an audit with no build is meaningless.

### Why some stages stay separate

- **Plan and Decision are distinct.** The ADR records *what we
  chose*; the Plan records *how we'll cut it up*. Conflating them
  conflates strategy with execution sizing.
- **Canon and Ship are distinct.** A shipped feature isn't yet
  canonical truth. It's only canon once it's load-bearing without
  contradiction. This is the most under-recognized distinction in
  the lifecycle and the one to protect hardest.

## How an idea moves

### Forward flow (the normal case)

```
spark (event)
   |
   v
[Inbox] --> [Brainstorm] --> [Proposal] --> [Decision] -->
[Plan] --> [Build] --> [Ship] --> [Canon]
                                         \
                                          --> (Superseded eventually)

(any stage can also exit to: Archived)
```

Forward gates are listed in the table above and detailed in
[`templates/lifecycle/QUALITY-GATES.md`](../templates/lifecycle/QUALITY-GATES.md).

### Reverse flow

The lifecycle is a directed graph with explicit backedges, not a
pipeline. Reality has reverse motion; spec it explicitly so people
surface it instead of hiding it.

- **Canon contested.** A canonical doc is contradicted by reality
  (new evidence, changed environment). Path: Canon -> Re-Proposal
  (new id with `supersedes: <old-id>`) -> Decision -> re-Canon. Old
  canon moves to `archive/superseded/` with a pointer.
- **Decision overturned.** ADR-2 supersedes ADR-1. ADR-1 stays in
  `decisions/` with `superseded_by:` field. Don't delete history.
- **Build kicks back to Proposal.** Implementation reveals the
  proposal was wrong. Branch preserved; proposal rewinds with
  `kicked_back_from: build` and a reason. WIP code doesn't disappear.

Kick-back is **not a failure** -- it is a normal feature of the
lifecycle. Without that framing, builders hide divergence. With it,
divergence becomes a signal that the proposal needed to evolve.

### Concurrent proposals (merge-or-kill protocol)

Two people work on the same problem in parallel. At Decision stage,
head checks for sibling proposals on the same `topic:` (frontmatter
soft tag). If found, exactly one of:

- **Merge.** One proposal absorbs the other; merged proposal links
  both ids in `links:`.
- **Kill.** One becomes Archived with `reason: duplicate-of: <id>`.

The Decision must explicitly call out which proposal won and why.
Silent forks are forbidden.

## The frontmatter contract

Every artifact in the lifecycle carries this frontmatter. The `id`
field is the load-bearing primitive: paths can move, ids don't.

```yaml
---
id: lc-YYYYMMDD-slug                  # NEVER changes once assigned
stage: inbox|brainstorm|proposal|decision|plan|build|ship|canon|archived|superseded
owner: <agent-or-human>               # required; on rotation, explicit handoff
created: YYYY-MM-DD                   # creation date, never changes
last_touched: YYYY-MM-DD              # updated on every meaningful edit
prior_paths: []                       # audit trail when promoted between stages
links: []                             # other ids (NOT paths) this artifact references
topic: <freeform-string>              # for sibling-detection at Decision stage
source: <manual|friction:h3:F5|github:repo#123|...>  # provenance
reviews: []                           # appended on each review iteration
skipped_stages: []                    # with reason if non-empty
cost_estimate: low|med|high           # optional; set at Proposal stage
cost_actual: <unit-tbd>               # optional; set at Build/Ship
history: <id>.history.md              # set at Canon stage; sibling history file
supersedes: <old-id>                  # if this artifact replaces another
superseded_by: <new-id>               # if a newer artifact replaced this
kicked_back_from: <stage>             # if this artifact was rewound
reason: <freeform>                    # required for archive, skip, kick-back
---
```

### Cross-reference rules

- The `id` is **the only stable cross-reference**. Format:
  `lc-<YYYYMMDD>-<slug>`. The `lc-` prefix is constant.
- Body-text references use `[[lc-...]]` syntax or markdown links
  with the id as the anchor.
- **Path-based cross-references are forbidden.** Files move between
  stages; ids do not.
- Tooling later resolves id -> current path via per-folder
  `INDEX.md`. Until tooling exists, `prior_paths` in
  frontmatter is the manual audit trail.

### What can change in future versions

- Stage list (add, remove, rename)
- TTL per stage
- Frontmatter required fields beyond the core
- Naming convention prefix scheme
- INDEX automation
- CLI tooling (`swa lifecycle list`, `resolve`, `promote`)

### What can NEVER change

- The `id` field convention itself. It is the load-bearing primitive
  that future versions cannot break.

## File naming

`<prefix>-<YYYYMMDD>-<slug>.md`

- `prefix` is one or two characters per stage/terminal:
  `i` (inbox), `b` (brainstorm), `p` (proposal), `d` (decision),
  `pl` (plan), `bd` (build), `sh` (ship), `c` (canon), `ar` (archived),
  `su` (superseded).
- `YYYYMMDD` is **creation date** -- never changes when the artifact
  promotes.
- `slug` is lowercase-hyphenated topic, max 6 words. Editable once
  before first promotion; locked thereafter.

Example: `i-20260426-friction-aggregation.md` (inbox) ->
`p-20260426-friction-aggregation.md` (proposal). The filename prefix
shifts; the `id` field in frontmatter stays as
`lc-20260426-friction-aggregation` throughout the artifact's life.

## Stage transition gates

The full per-transition checklist is in
[`templates/lifecycle/QUALITY-GATES.md`](../templates/lifecycle/QUALITY-GATES.md).
Print it. Pin it. The short version:

- **Inbox -> Brainstorm**: thesis, owner, fitness check.
- **Brainstorm -> Proposal**: coherent thesis, evidence cited, open questions resolved or deferred.
- **Proposal -> Decision**: critique passed, alternatives considered (>= 2), ADR-needed flag set.
- **Decision -> Plan**: ADR signed, links to proposal id.
- **Plan -> Build**: sub-issues sized, owners assigned, roadmap entry created.
- **Build -> Ship**: code merged, tests pass, audit clean, docs updated.
- **Ship -> Canon**: released, no rollback within stabilization window, load-bearing >= N weeks (default N=4), no contradicting canon doc exists.
- **Any -> Archived**: reason recorded, references updated.
- **Canon -> Superseded**: newer canon doc exists, pointer added.

## Stale-idea TTLs

Per-stage TTL, not global. Stale is not the same as Archived.

| Stage | TTL | On expiry |
|---|---|---|
| Inbox | 30 days no-touch | Auto-tag `stale`; surface in weekly triage |
| Brainstorm | 14 days | Auto-tag `stale`; head pings owner |
| Proposal | 21 days | Auto-tag `stale`; surfaces in next decision sync |
| Decision | never | Decisions don't expire; they get Superseded |
| Plan | 30 days | Re-plan or kill |
| Build | 60 days | Flag zombie WIP risk |
| Ship | n/a | (passes through) |
| Canon | review every 90 days | Confirm still load-bearing |

Auto-archive only after `stale` plus manual triage skip (head
chose not to revive). Never silent auto-archive.

## Anti-patterns

These are forbidden. The spec exists to make them visible.

1. **Stage-skipping without reason.** Skipping a stage is fine; doing
   it silently isn't. `skipped_stages: [...]` with reason is required.
2. **Two artifacts for one idea.** Forking in `proposals/` creates
   conflict. One id, one current artifact. Alternatives are recorded
   in the proposal body, not as siblings.
3. **Dead Inbox.** Capturing without ever triaging is rot. Head
   weekly triage is required; if it lapses 2 weeks, surface as friction.
4. **Premature canonicalization.** Calling docs canon before they're
   load-bearing. Canon stage requires evidence (linked usage,
   load-bearing N weeks). Don't promote on vibes.
5. **Retroactive ADR.** Writing ADR after building defeats the gate.
   If build precedes decision, that's a kick-back, not a normal flow.
6. **Frontmatter rot.** id changes, links break, `prior_paths` not
   updated. Head owns frontmatter integrity.
7. **Brainstorm-as-decision.** Using brainstorm output as if it were
   ADR. Brainstorm produces handoffs, not decisions. Always require
   a Proposal + Decision pass.
8. **Ghost owners.** No `owner` field -> no one drives it. Owner is
   required at every stage; on rotation, explicit handoff.
9. **Archive as graveyard.** Using archive to hide rejection without
   recording why. Archive entries require a `reason:` field.
10. **Lifecycle theater.** Going through stages because the system
    says so, not because the idea benefits. The lifecycle serves the
    idea, not the other way around. If a stage adds zero value for
    an idea, skip with reason.
11. **Canon contradiction without contest.** Two canon docs that
    disagree. The contest path is mandatory; silent contradiction is
    forbidden.

## Per-archetype guidance

### Solo indie hacker (1 person, 1-3 repos)

Collapse to 5 stages: Inbox -> Proposal -> Build -> Ship -> Canon.
Skip Brainstorm, Decision (ADR), Plan by default. Brainstorm becomes
a longer Inbox entry; Decision becomes a commit message; Plan
becomes the implementation itself.

One INDEX.md, no per-folder duplication. Most ideas live and die in
Inbox. That's healthy.

### Small team (2-10 people, 1-5 repos)

Full 9 stages, lightweight gates. Decision can be a PR comment for
non-architectural choices; ADR only for cross-cutting changes.
Head role becomes load-bearing here.

Weekly Inbox triage; bi-weekly Proposal review.

### Enterprise (10+ people, many repos)

Add a Compliance gate between Decision and Plan (future config:
optional 10th stage with security/legal/privacy signoff).

Multiple parallel proposals on the same problem are routine; the
merge-or-kill protocol becomes load-bearing.

Per-team INDEXes with org-level rollup. Frontmatter `cost_estimate`
becomes load-bearing for prioritization.

### Open-source maintainer

External Inbox is the default (GitHub Discussions tagged `inbox`).
Proposal = RFC; place in `RFCs/` folder. ADRs are public; canon =
SPEC. Contributor onboarding doc points to lifecycle as the
contribution path.

## Audit trail vs. clean canon

Canon docs are read by people trying to understand the system today.
Full lifecycle history is noise.

Solution: Canon doc is **clean** (no provenance clutter). Provenance
lives in a sibling `<id>.history.md` with the chain: inbox ->
brainstorm -> proposal -> decision -> build -> canon, with
timestamps, owners, and key transitions. History is preserved but
separated.

Frontmatter `history:` field on the canon doc points to the history
file.

## Search and discovery

**v2.0 (manual):** Per-folder `INDEX.md` regenerated by the head
on session close. One line per artifact:
`id | slug | stage | owner | last_touched | one-line summary`. A
global `docs/INDEX.md` aggregates per-folder indexes.

**Future tooling:** CLI commands like `swa lifecycle list --stage proposal --owner head`,
`swa lifecycle resolve <id>`, `swa lifecycle promote <id> --to proposal`.
Spec'd now; built later.

## External input plug-ins

Inbox accepts artifacts from any source if they conform to the
frontmatter shape.

**v2.0 sources:**
- Manual creation (default).
- Friction-log promotion (head-mediated; see [Friction bridge](#friction-log-bridge)).
- GitHub Issues / Discussions tagged `inbox` -- manual mirror via
  copy with `source: github:<repo>#<num>`.

**Future versions:** Slack channel sync, email forward, browser
extension. The plug-in framework is deferred; the `source:` field
convention is the contract.

## Friction-log bridge

The friction-capture pipeline (per-chat rolling logs flowing up to
`_salvage/aggregated-friction.md`) feeds Inbox -- but only through
head judgment, never automatically.

**Three-tier flow:**

1. Per-chat **rolling friction log** (every chat appends as friction
   surfaces; e.g., `_salvage/h1-friction.md`).
2. On rotation/close, the friction file ships with the checkpoint.
3. **Head** aggregates across sessions, looks for patterns, and
   **explicitly promotes** patterns to `docs/inbox/i-<YYYYMMDD>-<slug>.md`
   with `source: friction:<session>:<F#>`.

Promotion is **never automatic**. One-off frictions stay in friction
logs. Pattern recognition forces head judgment, which prevents
Inbox flooding.

When the head promotes a friction pattern to Inbox, the new
artifact's frontmatter `source:` field cites the originating
friction file and entry number. The friction log entry is updated
with `Status: promoted -> lc-YYYYMMDD-slug` so the trail is
two-directional.

## Relationship to AGENTS.md and CLAUDE.md

**Complement, don't duplicate.**

- `AGENTS.md` gets one section: "Idea Lifecycle" -- one paragraph,
  the 9-stage table, link to this spec. No duplication of gate
  details.
- `CLAUDE.md` (or your tool's memory file) gets a behavioral pointer:
  if the user mentions an idea worth keeping, write to
  `docs/inbox/i-<YYYYMMDD>-<slug>.md` with the standard frontmatter.
  Don't promote past Inbox without explicit user direction.

The full lifecycle spec lives **here**. Other docs link to it.

## Modular vs. opinionated

**Opinionated default. Modular escape hatch in a future version.**

Buyers pay for opinion. Configurable-from-day-one is a paralysis
trap; the 9-stage shape is the dogfooded default and customization
comes after people have used it.

**Escape hatch (v2.0, ships now):** Any repo can opt out via
`docs/lifecycle.config.yml`:

```yaml
enabled: false
```

The lifecycle is **not load-bearing for the orchestration layer**.
The package works without it. Repos that don't want lifecycle
discipline can disable it; orchestration continues to function.

**Configurable in a future version:** stage list, TTL per stage,
frontmatter required fields, naming convention prefix scheme.

**Not configurable, ever:** the `id` field convention. That's the
load-bearing primitive; making it pluggable defeats the point.

## Open questions deferred to dogfood

These need real use to answer. Surface findings in your friction
log so the next head session can refine.

1. Per-folder `INDEX.md` regeneration cadence -- every session close,
   or only on stage transition?
2. Frontmatter `links:` field -- bidirectional (linked doc back-references)
   or one-way? Bidirectional adds maintenance burden but enables
   better discovery.
3. `topic:` field for sibling-detection -- freeform string, controlled
   vocabulary, or per-repo tag list?
4. `cost_estimate` units -- low/med/high is a placeholder. Eventually,
   token-counts or human-hours? Premature now.
5. Should canon docs themselves be versioned (canon-v1, canon-v2),
   or always reflect current truth with the history sibling?
   Current lean: current-truth-only, history sibling preserves the
   chain. Trial.

## What this spec is not

- Not a directive on every detail of how to run lifecycle in your
  repo. It's the shape; the texture is yours.
- Not load-bearing for v2.0 orchestration ship. The orchestration
  layer ships without it; lifecycle is a parallel primitive.
- Not a replacement for existing repo doc structures. It extends
  the Divio + ADR pattern with the missing stages (Inbox,
  Brainstorm, Plan as explicit, Canon as explicit promotion gate).

## Pointers

- [`templates/lifecycle/INBOX.md`](../templates/lifecycle/INBOX.md)
- [`templates/lifecycle/BRAINSTORM-HANDOFF.md`](../templates/lifecycle/BRAINSTORM-HANDOFF.md)
- [`templates/lifecycle/PROPOSAL.md`](../templates/lifecycle/PROPOSAL.md)
- [`templates/lifecycle/ADR.md`](../templates/lifecycle/ADR.md)
- [`templates/lifecycle/STATUS-TAXONOMY.md`](../templates/lifecycle/STATUS-TAXONOMY.md)
- [`templates/lifecycle/QUALITY-GATES.md`](../templates/lifecycle/QUALITY-GATES.md)
- Buyer migration: `docs/how-to/first-idea-walkthrough.md`
- Head's role in lifecycle: see `head-prompt.md`
- Existing chaos-recovery pattern: see `templates/proposal.md`,
  `templates/ADR.md`, `templates/evidence-ledger.md`,
  `CHAOS-CODE-RECOVERY-GUIDE.md`. The lifecycle is forward-flow for
  ideas; chaos-recovery is reverse-flow for already-built code.
  Both shapes complement each other.

---

*This spec is the source of truth for the lifecycle. If another doc
contradicts it, the other doc is wrong; surface as friction and update
this spec.*
