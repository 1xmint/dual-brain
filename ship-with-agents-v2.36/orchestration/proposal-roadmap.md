# Proposal: Persistent Roadmap

## Problem

When the orchestrator rotates sessions, it reads checkpoints
(point-in-time workstream snapshots) and session logs (what happened
last session). Neither provides the full picture: what's done across
all repos, what's next, what's blocked, what's deferred, and what
"production-ready" means for each repo and the system as a whole.

Overarching goals live in the user's head or scattered across
checkpoints. The orchestrator can't advocate for them because it
doesn't know they exist.

## Design Decisions

### 1. One file, one location

**File:** `_agent-system/ROADMAP.md`

One file. Not per-repo, not a directory of files. Reasons:
- Cross-repo goals are first-class and don't belong to any single repo
- The orchestrator reads one file on startup, not five
- Repo-specific sections live inside the file as H2 headers
- If it gets too long, the system has too many goals (that's a
  planning problem, not a format problem)

### 2. Format: markdown sections, not tables

Tables break when cells contain links, multi-line notes, or status
changes. Sections with consistent structure are easier to scan, easier
to diff, and easier for the orchestrator to update.

Each item uses this structure:

```
### <goal name>
Status: done | in-progress | next | blocked | deferred
Repo: <repo-name> | cross-repo
Depends on: <other goal name, or "none">
Refs: <checkpoint, ADR, proposal, PR — whatever exists>
Notes: <one line of context — what's left, what's blocking, etc.>
```

Rules for items:
- Goal-level, not task-packet-level. "Lineage ceremony shipped with
  CLI" not "write fork-ceremony.ts"
- One status per item. If a goal has sub-parts at different statuses,
  it's either multiple goals or the status is the least-complete part
- `Depends on` only lists items that are also in this roadmap. External
  blockers go in Notes
- `Refs` uses relative paths from `_agent-system/` for checkpoints and
  proposals, full PR URLs or numbers for PRs

### 3. Sections

<!-- CUSTOMIZE: Replace with your project/repo names -->
```markdown
# Roadmap

## Production Definition
<what 10/10 means for each repo and the system>

## Cross-Repo Goals
<goals that span multiple repos>

## [Project A]
<project-A-specific goals>

## [Project B]
<project-B-specific goals>

## Deferred
<parked ideas — not dead, not prioritized>
```

The **Production Definition** section is a short prose block per repo
defining what "done" looks like. Not a checklist — a paragraph that
the orchestrator can test goals against. Example: "[Project A] is
production-ready when: all spec'd features are implemented with full
test coverage, CLI tools work end-to-end, and the package is published
at 1.0 with no known gaps."

The **Deferred** section prevents stale items from cluttering active
sections. Items move here with a one-line reason. They're still
visible so nothing gets forgotten.

### 4. Who updates it

**Orchestrator only.** Reasons:
- Single writer prevents merge conflicts and inconsistent status
- The orchestrator already reads checkpoints and verifies
  completions — updating the roadmap is a natural extension
- Task agents and work agents don't have the bird's-eye view needed
  to assess cross-repo impact

**Update triggers:**
- On startup: read the roadmap alongside checkpoints. Flag any stale
  items (checkpoint says done but roadmap says in-progress)
- After a workstream completes: update the relevant item's status
  and refs
- When brainstorm produces a new goal: add it to the appropriate
  section
- When the user states a new priority: add it

### 5. Interaction with checkpoints

Checkpoints and the roadmap serve different purposes and stay separate:

| Aspect       | Checkpoint                        | Roadmap                    |
|------------- |---------------------------------- |--------------------------- |
| Scope        | One workstream                    | All goals, all repos       |
| Granularity  | Task-level (next step, blockers)  | Goal-level (what, status)  |
| Lifespan     | Lives while workstream is active  | Persistent across sessions |
| Updated by   | Task agent at each gate           | Orchestrator             |

The roadmap *references* checkpoints (`Refs: checkpoints/foo.md`) but
never duplicates their content. When a checkpoint is archived, the
roadmap item's status changes to `done` and the ref stays as a record.

### 6. Cross-repo goals

Cross-repo items live in the `## Cross-Repo Goals` section and use
`Depends on` to point to per-repo items that must complete first:

```markdown
### Production deployment end-to-end
Status: blocked
Repo: cross-repo
Depends on: Feature A shipped, Project B auth, Project C integration
Refs: none yet
Notes: Can't deploy until all repos have their required features complete
```

This makes the dependency chain explicit. The orchestrator can scan
cross-repo goals and immediately see which per-repo items are blocking
progress.

### 7. Preventing staleness and bloat

Three rules:
1. **Done items get one session of visibility, then move to a
   `## Completed` section at the bottom.** This keeps active sections
   short while preserving the record. The completed section is append-
   only and never read on startup unless the user asks.
2. **Max ~15 active items.** If the roadmap has more than 15 non-
   deferred, non-completed items, something is wrong — either goals
   aren't scoped tightly enough or too many things are in-progress.
   The orchestrator flags this to the user.
3. **Deferred items need a reason.** "Deferred" without context
   becomes "forgotten." One line explaining why.

## Integration with Existing System

### Orchestrator prompt changes

Add to `orchestrator-prompt.md`, Rule 2 (currently "Read checkpoints
on startup"):

> **2. Read roadmap and checkpoints on startup.** Read
> `_agent-system/ROADMAP.md` first for the bird's-eye view, then
> read all checkpoint files. If context compacts, re-read both.
> Update the roadmap when workstreams complete, new goals are scoped,
> or items become blocked/unblocked.

### Brainstorm prompt changes

Add to `brainstorm-prompt.md`, Rule 1 (handoffs):

> When producing a handoff, also state where the goal should appear
> on the roadmap: which section (cross-repo or per-repo), suggested
> status, and dependencies.

### Session log template

No changes needed. The session log's "Open items for next session"
is the session-specific view. The roadmap is the persistent view.
They're complementary, not redundant.

## Starter Roadmap

Below is a sample roadmap showing the format. Customize it with your
own projects, goals, and current state when creating
`_agent-system/ROADMAP.md`.

---

<!-- CUSTOMIZE: Replace all example projects and goals with your own -->
```markdown
# Roadmap

## Production Definition

**[Project A]:** Production-ready when all spec'd features are
implemented with full test coverage, CLI tools work end-to-end, and
the package is published at 1.0 with no known gaps.

**[Project B]:** Production-ready when the core service is running
in production, auth is implemented, and the system handles real
data end-to-end.

**System-wide:** All repos use shared conventions. Deployment is
documented and repeatable. No manual steps between "git push" and
"running in production" except operator-gated secrets.

## Cross-Repo Goals

### Shared feature integrated across all repos
Status: in-progress
Repo: cross-repo
Depends on: Feature shipped (Project A), Project B integration
Refs: checkpoints/feature-implementation.md
Notes: Project A in progress. Project B waiting on Project A.

### Production deployment end-to-end
Status: blocked
Repo: cross-repo
Depends on: Shared feature integrated, Project B auth
Refs: none
Notes: Blocked on multiple upstream items.

## [Project A]

### Core feature shipped with CLI
Status: in-progress
Repo: project-a
Depends on: none
Refs: checkpoints/feature-implementation.md
Notes: Implementation in progress.

### 1.0 publish
Status: blocked
Repo: project-a
Depends on: Core feature shipped
Refs: none
Notes: After feature ships and no known gaps remain.

## [Project B]

### Auth enrollment
Status: next
Repo: project-b
Depends on: none
Refs: none
Notes: Not started. Blocks production deployment.

## Deferred

### Example deferred item
Status: deferred
Repo: project-a
Depends on: none
Refs: none
Notes: Parked — not prioritized. Revisit after 1.0.

## Completed

### Example completed item
Completed: 2026-04-01
Refs: checkpoints/example.md, PR #42
```

---

## Summary of Changes Required

1. **Create** `_agent-system/ROADMAP.md` with your project-specific content
2. **Edit** `orchestrator-prompt.md` Rule 2: add roadmap to startup
   reading and update triggers
3. **Edit** `brainstorm-prompt.md`, Rule 1: add roadmap placement
   to handoff requirements

Total new files: 1. Total edits: 2 rules tightened. No new process,
no new chat types, no new templates.
