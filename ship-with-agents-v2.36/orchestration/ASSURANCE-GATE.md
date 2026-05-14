# Assurance Gate

Use this gate when deciding how much collaboration and checking a task
actually needs.

This gate is about assurance, not just complexity.

## Core Question

Do not ask only:

- "How hard is this?"

Ask:

- "How wrong can this go?"
- "How expensive is a false positive?"
- "Who must independently check this before launch or closeout?"

## Assurance Inputs

Evaluate:

1. `Risk`
2. `Ambiguity`
3. `Reversibility`
4. `Blast radius`
5. `Need for independence`
6. `Launch cost if wrong`
7. `Closeout cost if wrong`

## Assurance Levels

### A0 - Self-check enough

Use when the task is tiny, bounded, and low-risk.

### A1 - Supervisor closeout required

Use when the task is normal repo work and a second pair of eyes is useful.

### A2 - Independent closeout required

Use when weird-but-test-passing code would still hurt and one review loop is
not enough.

### A3 - Independent preflight and closeout required

Use when the launch packet itself can be expensive to get wrong, especially in
cross-repo, infra-dependent, auth/signing-sensitive, or verification-ambiguous
work.

## Default Mapping

- `Q0` usually maps to `A0` or `A1`
- `Q1` usually maps to `A1`
- `Q2` usually maps to `A2`
- `Q3` usually maps to `A2` or `A3`

Do not assume Q-lane alone is enough. State the assurance level explicitly.

## Coverage Statement Rule

For `A2` and `A3` work, each reviewer should state:

- `Checked:`
- `Not checked:`
- `Still depends on:`
- `Collaboration status:`

This prevents fake collaboration where each side assumes the other side
handled the critical check.

For `A2` and `A3`, also run `COLLABORATION-LOOP.md` so the second brain is
actually challenging the first brain instead of becoming decorative.

## Output Requirement

When routing meaningful work, say:

- `Assurance level: A0 / A1 / A2 / A3`
- `Execution owner:`
- `Review owner:`
- `Approval owner:`

And at closeout, use `ACTIVE-LANE-CLOSEOUT.md` so the lane state is cleaned up
instead of silently left active.

Then use `ASSURANCE-TO-TOPOLOGY-MATRIX.md` to decide whether the current review
topology should stay light, become standard dual-brain, or escalate into an
audited cell.
