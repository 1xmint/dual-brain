# Quality Gates

Lifecycle reference | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

This document is the full per-transition checklist with rationale for
each item. The spec (`IDEA-LIFECYCLE.md`) contains the short version;
this document is the authoritative expansion. When a gate fails, the
final section of this document is the troubleshooting guide.

Print this. Pin it. Work through it linearly at each stage boundary.
A gate item that "almost" passes does not pass.

---

## INBOX -> BRAINSTORM

The Inbox entry is the first durable artifact. The gate to Brainstorm
confirms the entry is specific enough to explore productively.

- **[ ] Thesis is stated in one sentence.**
  Rationale: If you cannot state the idea in one sentence, the
  brainstorm will produce wide exploration with no landing point.
  Brainstorm time is expensive; an unclear thesis wastes it.

- **[ ] Owner is assigned and has acknowledged.**
  Rationale: Ghost owners are an anti-pattern (IDEA-LIFECYCLE.md #8).
  If no one owns the brainstorm, it stalls in `_drafts/` indefinitely.
  "Head will find someone" does not count as acknowledged.

- **[ ] Fitness check: is this the right repo / project for this idea?**
  Rationale: Cross-repo ideas need a home decision before exploration.
  Discovering the wrong home at Proposal stage wastes a full brainstorm
  session and produces an orphaned artifact.

- **[ ] Frontmatter fields: `id`, `stage`, `owner`, `created`,
  `last_touched`, `source` are all present and non-empty.**
  Rationale: Frontmatter rot starts here. The `id` field is the
  load-bearing primitive; a missing id means no stable cross-reference
  for everything downstream.

- **[ ] Source provenance recorded (`source:` field).**
  Rationale: Knowing where an idea came from (friction log, GitHub
  issue, manual observation) determines how to weight the evidence at
  Brainstorm. An unattributed thesis is harder to pressure-test.

---

## BRAINSTORM -> PROPOSAL

The Brainstorm Handoff document gates to a formal Proposal. The gate
confirms exploration was thorough enough to support a decision.

- **[ ] Coherent thesis written -- matches or sharpens the Inbox thesis.**
  Rationale: Brainstorming often clarifies or reframes the original
  thesis. The Proposal must reflect the post-exploration understanding,
  not the original spark. A Proposal with a thesis identical to the
  Inbox entry probably didn't explore deeply enough.

- **[ ] Evidence cited for all major claims (not just asserted).**
  Rationale: Brainstorm outputs without evidence are opinions, not
  findings. The Proposal critiqued at Decision stage will be asked
  "how do you know this?" -- evidence must be in the handoff or the
  Proposal will fail critique.

- **[ ] Open questions list is exhaustive and each is resolved or
  explicitly deferred with reason.**
  Rationale: Unresolved questions that are not named are not deferred
  -- they are hidden. Hidden open questions surface later as
  contradictions in the ADR or as build kick-backs. Named deferral
  with reason is a feature; silent omission is a defect.

- **[ ] Dead ends documented.**
  Rationale: Without a record of what was explored and rejected,
  the next stage or the next person will re-explore the same dead
  ends. Documentation of failures is not overhead -- it is scope
  protection for the Proposal critique.

- **[ ] Recommended next stage is explicit: promote, revisit, or archive.**
  Rationale: A brainstorm handoff without a recommendation forces
  the head to make a judgment without the context the brainstorm
  chat had. The brainstorm chat is in the best position to know
  whether the idea is ready; requiring a recommendation surfaces that
  knowledge.

- **[ ] `open_questions_count` in frontmatter is 0 or all non-zero
  items have `deferred (reason: ...)` inline.**
  Rationale: Machine-checkable proxy for the open questions gate.
  Prevents the handoff from silently advancing with unresolved
  questions buried in prose.

- **[ ] `prior_paths` updated to include the `_drafts/` path.**
  Rationale: `prior_paths` is the manual audit trail until future
  tooling exists. Missing entries make it impossible to reconstruct
  the artifact's history without grepping every folder.

---

## PROPOSAL -> DECISION

The Proposal enters Decision review. The gate confirms it is ready for
a binding choice. This is the last opportunity to reject before an ADR
is written.

- **[ ] Critique pass completed by head or peer reviewer.**
  Rationale: Self-reviewed proposals have blind spots. A critique
  pass by someone other than the author is the minimum bar for a
  binding decision. The critique does not need to be adversarial --
  it needs to be thorough.

- **[ ] At least two alternatives considered, honestly.**
  Rationale: A proposal with one alternative is a proposal that picked
  its alternative to lose. Two genuine alternatives force the author
  to articulate why the recommendation is better than real options,
  not strawmen.

- **[ ] `adr_needed:` flag set to `yes` or `no` with one-sentence
  reason.**
  Rationale: The Decision reviewer needs to know upfront whether to
  write a full ADR or whether a lighter decision record (e.g., PR
  comment) is sufficient. Leaving this unset forces the reviewer to
  make the call without the proposal author's context.

- **[ ] Cost estimate present (`cost_estimate: low|med|high`).**
  Rationale: Decisions made without effort signal can produce Plans
  that are impossible to staff. Cost estimate is not a commitment --
  it is a planning signal. Even a rough calibration prevents the
  worst mismatches.

- **[ ] No unresolved open questions remain in the proposal body.**
  Rationale: Open questions in a Proposal that enters Decision review
  become the Decision's open questions. A Decision with open questions
  is not a decision.

- **[ ] `topic:` field set; head has checked for sibling proposals
  on the same topic (concurrent proposals check).**
  Rationale: Silent forks are forbidden (IDEA-LIFECYCLE.md). The
  merge-or-kill protocol only works if siblings are detected. This
  check is manual in v2.0; failing to do it produces Decision-stage
  contradictions.

- **[ ] `links:` field lists all related lifecycle ids referenced
  in the proposal body.**
  Rationale: Links in frontmatter enable index-based discovery and
  are the foundation for future resolution tooling. Links only in
  body prose are invisible to any tooling or manual index scan.

---

## DECISION -> PLAN

The ADR is signed. The gate to Plan confirms the decision is
actionable and the planning artifacts can be created.

- **[ ] ADR is signed by head (and by user if sensitive).**
  Rationale: An unsigned ADR is a proposed decision, not a decision.
  The signature is the moment of commitment; anything downstream of
  an unsigned ADR is premature.

- **[ ] ADR `status:` field updated to `accepted`.**
  Rationale: Frontmatter must match reality. An accepted ADR with
  `status: proposed` is frontmatter rot from day one.

- **[ ] ADR links to the proposal id in `proposal_id:` field.**
  Rationale: The decision record must be traceable to the proposal
  it closes. Without this link, the history chain breaks and the
  "why did we decide this?" question cannot be answered from the ADR
  alone.

- **[ ] No contradicting canon doc exists for the same topic.**
  Rationale: Advancing to Plan when a contradicting canon doc exists
  means the Plan will produce work that conflicts with existing truth.
  The contest path (canon -> re-proposal -> decision) must resolve
  the contradiction before Plan is created.

---

## PLAN -> BUILD

The plan is in place. The gate to Build confirms the implementation
can begin without orphaning the work.

- **[ ] Sub-issues are created in GitHub and sized (estimate or
  t-shirt: S/M/L/XL).**
  Rationale: Unsized work cannot be staffed or scheduled. A parent
  issue without sub-issues is a plan in name only -- it cannot be
  tracked or distributed.

- **[ ] Each sub-issue has an assigned owner.**
  Rationale: Ghost owners at the sub-issue level produce zombie WIP
  (see Build TTL). Every unit of work needs a name attached.

- **[ ] Roadmap entry exists in `docs/proposals/roadmap.md`.**
  Rationale: The roadmap is the head's planning surface. Work that
  exists only as GitHub issues is invisible to the lifecycle layer and
  to anyone reading docs rather than the issue tracker.

- **[ ] Parent issue links back to the lifecycle `id` (in issue body
  or label).**
  Rationale: The link from GitHub issue to lifecycle id is how the
  build's progress is observable from the lifecycle layer in v2.0.
  Without it, the two systems are disconnected.

---

## BUILD -> SHIP

Implementation is complete. The gate to Ship confirms the work is
ready to release and meets the quality bar.

- **[ ] Code is merged to the main branch (or release branch).**
  Rationale: Unmerged code is not done. A PR that "just needs review"
  is still in-progress. The gate is merge, not "merge pending."

- **[ ] Tests pass (unit, integration, and any required system tests).**
  Rationale: Tests are the minimum evidence that the implementation
  matches the proposal. Shipping without passing tests means the
  Decision gate's intent has not been verified.

- **[ ] Audit is clean (head signoff on `docs/audit/` artifact
  if required by the ADR).**
  Rationale: Some decisions require an audit artifact (security,
  compliance, performance). If the ADR flagged an audit requirement,
  it must be closed before ship. Skipping this is a retroactive ADR
  violation in reverse.

- **[ ] Documentation updated for any user-facing or developer-facing
  changes.**
  Rationale: Shipped code without updated docs produces canon
  contradiction -- the code says one thing, the docs say another.
  This is the most common path to premature canonicalization.

- **[ ] `kicked_back_from:` field is clear (or properly set if this
  is a re-ship after kick-back).**
  Rationale: A build that was kicked back and re-worked must have its
  frontmatter updated to reflect the kick-back. This is the lifecycle's
  record that the path was non-linear.

---

## SHIP -> CANON

The release has stabilized. The gate to Canon is the most important
gate in the lifecycle -- it is the moment a shipped thing becomes
durable truth.

- **[ ] Released with no rollback within the stabilization window.**
  Rationale: A feature that was rolled back is not stable. Canon must
  be built on stability. Default stabilization window is 2 weeks from
  ship; adjust per project.

- **[ ] Load-bearing for >= N weeks without contradiction (default N=4).**
  Rationale: "Load-bearing" means other systems, docs, or decisions
  are built on top of this artifact. Time under load is evidence of
  stability. N=4 weeks is the default; shorter periods require
  justification in the Canon artifact's frontmatter.

- **[ ] No contradicting canon doc exists on the same topic.**
  Rationale: Canon contradiction without a contest is explicitly
  forbidden (IDEA-LIFECYCLE.md anti-pattern #11). Before promoting
  to Canon, scan existing canon docs for conflict. If found, initiate
  the contest path first.

- **[ ] Canon artifact is clean (no lifecycle provenance clutter).**
  Rationale: Canon docs are read by people trying to understand the
  system today. Full lifecycle history is noise to that reader. All
  provenance moves to a sibling `<id>.history.md`.

- **[ ] `history:` field in frontmatter points to the history sibling.**
  Rationale: The history sibling preserves the full chain (inbox ->
  brainstorm -> ... -> canon) with timestamps and owners. Without the
  pointer, the history file is an orphan.

- **[ ] `stage:` updated to `canon` in frontmatter.**
  Rationale: Obvious, but frontmatter rot starts with skipped updates.
  Verify this explicitly.

---

## ANY -> ARCHIVED

Any artifact at any stage can be archived. The gate ensures archiving
is a deliberate act, not a silent abandonment.

- **[ ] `reason:` field is set with a one-sentence explanation.**
  Rationale: "Archive as graveyard" (anti-pattern #9) means hiding
  rejection without recording why. The reason field is the minimum
  accountability record. Future triage asks "why was this archived?"
  -- the answer must be findable.

- **[ ] All active references to this artifact are updated or de-referenced.**
  Rationale: An archived artifact with active inbound links creates
  confusion: readers following a link land in archive and cannot tell
  if the thing was rejected, replaced, or simply old. Update or remove
  the links.

- **[ ] If the artifact had a GitHub issue or PR, it is closed with
  a comment linking to the archived artifact.**
  Rationale: GitHub issues are separate from the lifecycle layer.
  Closing without context leaves the issue tracker disconnected from
  the lifecycle record.

---

## CANON -> SUPERSEDED

A newer canon document replaces an existing one. The gate ensures the
handoff between old and new canon is clean and traceable.

- **[ ] Newer canon document exists and is fully canonicalized
  (has passed the Ship -> Canon gate).**
  Rationale: A canon doc cannot be superseded by a proposal or a
  draft. The successor must itself be canon before the old doc is
  retired.

- **[ ] Old doc's `superseded_by: <new-id>` field is set.**
  Rationale: The old doc must point forward. Readers who find the
  old doc need to know where the current truth lives.

- **[ ] New doc's `supersedes: <old-id>` field is set.**
  Rationale: The new doc must point back. This makes the supersession
  bidirectional and auditable.

- **[ ] Old doc moved to `docs/archive/superseded/` (if required
  by the new ADR or by project convention).**
  Rationale: Superseded docs that remain in their original location
  confuse discovery. Moving them makes the archive state visible to
  anyone browsing the docs tree.

---

## BUILD -> PROPOSAL (kick-back)

Implementation reveals the proposal was wrong. This is not a failure
-- it is a normal lifecycle feature. The gate confirms the kick-back
is handled explicitly rather than silently.

- **[ ] Branch is preserved (not deleted) until the revised proposal
  is re-approved.**
  Rationale: WIP code represents real information about the problem.
  Deleting it wastes that signal. Preserve until the revised proposal
  either validates or invalidates the approach.

- **[ ] Proposal gets `kicked_back_from: build` in frontmatter.**
  Rationale: The kick-back is a lifecycle event; it must be in the
  frontmatter so the next head session can see the history without
  reading the full artifact.

- **[ ] `reason:` field explains what the build revealed.**
  Rationale: The reason is the signal. Without it, the kick-back is
  recorded as an event but not as a lesson.

- **[ ] Revised proposal re-enters the Proposal -> Decision gate
  (not a shortcut directly back to Build).**
  Rationale: A build kick-back means the decision was made on wrong
  premises. A new decision is required. Retroactive ADR (building
  then writing the ADR) is anti-pattern #5.

---

## CANON -> RE-PROPOSAL (contest)

A canon document is contradicted by new evidence. The gate for
initiating a contest.

- **[ ] Contradiction is documented with evidence (not just assertion).**
  Rationale: "I think this canon doc is wrong" is not a contest.
  Evidence of the contradiction -- data, changed conditions, new
  information -- must be present before the contest can begin.

- **[ ] New proposal created with a new id and `supersedes: <old-id>`.**
  Rationale: The contest creates a new artifact, not an edit of the
  old one. Editing canon in place without a decision record is the
  "canon contradiction without contest" anti-pattern.

- **[ ] Old canon doc is flagged `in-review` (status flag) until
  the contest is resolved.**
  Rationale: Readers must know that a canon doc is under contest.
  A doc that is both canon and in an unresolved contest is ambiguous
  truth -- the in-review flag signals that ambiguity.

- **[ ] Contest follows the full Proposal -> Decision gate before
  re-canonicalization.**
  Rationale: The same scrutiny that created the original canon is
  required to replace it. No shortcuts because "we all know this
  is outdated."

---

## What to do when a gate fails

A gate failure is not a procedural error -- it is the lifecycle doing
its job. Use this guide to diagnose and resolve.

### The item is incomplete but the artifact should advance anyway

**Option A: Skip with reason.** If the missing gate item is
genuinely not applicable (e.g., the project has no audit requirement),
use `skipped_stages: [...]` or note the skip in the frontmatter
`reason:` field. Skipping is allowed; silent skipping is the
anti-pattern.

**Option B: Complete the item.** Prefer this. A gate item that seems
skippable often prevents a real problem later.

### The thesis is not specific enough (Inbox -> Brainstorm)

Return the Inbox entry to the author with a one-sentence note on what
is missing. Do not start a brainstorm on an unclear thesis -- the
brainstorm will produce a wide exploration with no landing point.
Sharpen first; explore second.

### Open questions are unresolved (Brainstorm -> Proposal)

Do not advance. Either: (a) schedule a second brainstorm session to
resolve them, or (b) explicitly defer with rationale in the handoff
document. "We decided not to decide this now because `<reason>`" is
a valid and honest answer. Implicit deferral is not.

### The proposal has fewer than two alternatives (Proposal -> Decision)

Do not advance. Return the proposal to the author. One real alternative
is required in addition to the recommendation. If the author genuinely
cannot find an alternative, that is a signal the problem space has not
been explored enough -- revisit the Brainstorm stage.

### The ADR is unsigned (Decision -> Plan)

Do not create sub-issues or a roadmap entry. An unsigned ADR means
the commitment has not been made. Creating a plan against an unsigned
decision is premature and produces orphaned GitHub issues when the
decision changes.

### Tests fail (Build -> Ship)

Do not ship. Investigate the failure. If the failure reveals a problem
in the proposal, initiate a kick-back (Build -> Proposal). If the
failure is a test environment issue unrelated to the proposal, fix
the environment and re-run -- do not adjust the test to pass.

### A contradicting canon doc exists (Ship -> Canon)

Do not canonicalize. Initiate the contest path: document the
contradiction with evidence, create a new proposal with
`supersedes: <old-id>`, and run the full Proposal -> Decision gate.
Only after the contest is resolved can either document advance to
(or remain at) canon.

### A gate item keeps failing across multiple attempts

Surface it as friction. A gate item that cannot be satisfied after
two serious attempts is a signal that the gate item itself may be
miscalibrated for this project or archetype. Record the friction,
note which gate item and why it is failing, and route to the head
for a spec refinement decision. Do not permanently ignore the gate
item -- either fix the artifact or fix the gate.

---

*This document is the authoritative expansion of the short checklist
in `../../orchestration/IDEA-LIFECYCLE.md`. If they conflict, surface
as friction and update both.*
