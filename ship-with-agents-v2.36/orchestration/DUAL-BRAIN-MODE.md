# Dual-Brain Mode

Use this guide when you want more than "strategy chat plus execution."

This is the optional premium-quality mode for buyers who have both:

- a primary execution environment
- a separate strong review or audit brain

You do not need this on day one. Many repos do not need it at all.

## Core Truth

Dual-brain mode is not "two chats for the sake of two chats."

It is:

- one brain does the implementation work
- one brain can preflight high-risk launch packets before the worker starts
- one brain independently challenges the quality of that work
- closeout happens only after that review loop is satisfied

If the second brain is not actually challenging the first brain, you do
not have a real dual-brain system. You just have extra overhead.

## Three Levels

### 1. Single-brain lightweight mode

Use when:

- the task is bounded
- one execution environment plus normal self-review is enough
- the review overhead would exceed the value

### 2. Standard dual-brain mode

Use when:

- you want execution and review in separate contexts
- architecture or quality matters enough to justify a second pass
- you have a useful second tool or second model

Typical shape:

`strategy/review brain -> execution brain -> strategy/review brain -> closeout`

### 3. True dual-brain audited mode

Use when:

- the work is quality-sensitive
- the work is expensive to reverse
- the execution brain might pass tests while still producing weird, fragile,
  unsafe, or architecturally off-pattern code
- you want a real closeout loop instead of a shallow "looks fine"

Typical shape:

`execution brain -> super deep review -> independent second-brain challenge -> closeout or continue`

The important quality rule:

- the supervisory layer should not act like a worker carrying out the review
  brain's orders
- the review brain should not act like a decorative approver

Real dual-brain mode means both review layers exercise independent judgment.

## Role Pattern

In package-safe terms:

- `Execution brain`
  - does the repo work
  - owns implementation progress
- `Supervisory review layer`
  - deeply reviews the workstream it owns
  - checks quality, weirdness, safety, architecture fit, and hidden debt
- `Second-brain audit layer`
  - independently pressure-tests the supervisory review
  - asks what the first review may have missed

If you are using Claude plus GPT:

- Claude Code or your main coding tool often makes sense as the execution brain
- GPT/Desktop often makes sense as the independent audit brain

The brand does not matter. The role separation does.

## What The Audit Brain Actually Checks

The audit brain should not just ask, "Did it finish?"

It should ask:

- Is the code actually correct?
- Is the implementation weird, brittle, or overcomplicated?
- Is it secure enough for the surface it touches?
- Does it match the intended architecture and vision?
- Did the execution brain quietly trade quality for speed?
- Are there hidden follow-up risks that the tests would not catch?

## Audited Closeout

In true dual-brain audited mode, work does not close just because the
execution brain says "done."

Closeout should require:

1. implementation evidence
2. supervisory review
3. second-brain challenge
4. one of:
   - `approved for closeout`
   - `continue with fixes`
   - `escalate because the brains disagree`

Use `COLLABORATION-LOOP.md` when the supervisory layer and second-brain review
need an explicit challenge-response loop before launch or closeout.

## Pre-Launch Audit

In caution-worthy work, do not wait until closeout to involve the second brain.

Before the worker is launched, the review brain can preflight the packet for:

- contradictory instructions
- blocked verification paths
- stale repo-state claims
- auth/signing ambiguity
- expensive setup mistakes

Use `LAUNCH.md` to decide when that preflight is worth it.

## When Not To Use This

Do not use true dual-brain audited mode when:

- the task is small
- the task is reversible and low-risk
- you only have one tool and the copy-paste overhead would dominate
- the second brain would only repeat the first brain's obvious conclusions

This mode is for quality leverage, not ritual.

Use `REVIEW-TOPOLOGY-LADDER.md` and `ASSURANCE-TO-TOPOLOGY-MATRIX.md` to decide
whether the work really wants `T3`, `T4`, or `T5`.

## Good Fits

- auth and trust-adjacent implementation
- architecture-backed feature work
- refactors where quality matters more than speed
- release-prep or merge-prep on important work
- anything where "passes tests" is not enough

## Decision Rule

Ask:

- Would a weird but test-passing implementation hurt here?
- Would hidden architectural or safety debt matter here?
- Would a second brain probably catch something useful?

If yes, use dual-brain audited mode.

Then use `ROUTING-MATRIX.md` to decide whether the work only needs a
stronger closeout loop or whether it also wants a separate super-owned
execution lane.
