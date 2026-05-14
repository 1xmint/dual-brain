# Closeout Gate

Use this gate before any work is treated as complete.

This gate exists because "done" and "safe to close" are not the same thing.

## Core Question

Do not ask only:

- "Did the worker finish?"

Ask:

- "Has the required assurance level actually been satisfied?"
- "Did each reviewer say what they checked?"
- "Are we closing with explicit agreement, or drifting into assumed consensus?"

## Closeout By Assurance Level

### A0

Required:

- execution evidence
- self-check

### A1

Required:

- execution evidence
- supervisor review

Fast solo-friendly default:

- checkpoint updated
- lane-state cleanup explicit
- active-map / routing cleanup explicit

### A2

Required:

- execution evidence
- supervisor review
- independent second-brain closeout review
- explicit closeout outcome
- closeout packet strongly preferred

### A3

Required:

- pre-launch review already completed
- execution evidence
- supervisor review
- independent second-brain closeout review
- explicit closeout outcome
- closeout packet required

Use `orchestration/closeouts/TEMPLATE.md`.

## Coverage Statements

For `A2` and `A3`, the supervisor and second brain should each state:

- `Checked:`
- `Not checked:`
- `Still depends on:`
- `Collaboration status:`

Use `orchestration/COLLABORATION-LOOP.md` when the supervisor and second brain need to
turn disagreement or partial trust into an explicit closeout outcome.

## Lane-State Requirement

For meaningful work, closeout should also state:

- `Lane state action: keep active / mark paused / mark rotating / mark closed`
- `Expected next session:` when another session is expected

Use `orchestration/LANE.md`.

If the lane-state action is missing, the work may be reviewed but not actually
closed operationally.

If the work is meaningful enough that a future phase will rely on a trustworthy
summary, write a closeout packet instead of leaving final truth scattered
across slice, checkpoint, and chat messages.

## Allowed Outcomes

- `approved for closeout`
- `continue with fixes`
- `escalate because the brains disagree`

Do not silently collapse disagreement into a weak approval.

## Freshness Rule

Before trusting a checkpoint at closeout time, confirm it still states:

- `Last verified at`
- `Freshness window`
- `Terminal status`
- `Pickup confidence`
- `Resume risk`

If those fields are stale or missing on meaningful work, the closeout read is
weaker than it looks.

## Final Rule

If the assurance level required a review and that review is not explicit, the
work is not closed.


