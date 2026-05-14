# Checkpoint Event Thresholds

Use this to decide when a transition deserves an append-only checkpoint event.

This exists because a good event log is a gate trail, not a diary.

## Core Rule

Append an event when a future lane would care that the transition happened,
even if the main checkpoint is later overwritten.

Do not append an event for every small implementation step.

## Default Threshold

An event is warranted when at least one of these is true:

1. ownership changed
2. execution state changed materially
3. verification state changed materially
4. continuity state changed materially
5. closeout state changed materially

## Event-Worthy Transitions

Append an event for transitions like:

- slice approved for launch
- execution lane actually launched
- meaningful blocker discovered
- meaningful blocker cleared
- important evidence landed
- review outcome changed
- lane rotated
- lane recovered after crash
- lane paused intentionally
- lane approved for closeout
- closeout escalated because trust is still insufficient

## Usually Not Event-Worthy

Do not append an event for:

- routine file reads
- small implementation substeps
- exploratory notes that did not change routing or confidence
- every single passing test run
- cosmetic rewrites with no continuity impact

## By Assurance Level

### A0

- event log usually unnecessary

### A1

- event log optional
- use it when the lane is longer-lived than normal or has real blocker churn

### A2

- event log recommended
- especially when review, verification, and pause/resume boundaries matter

### A3

- event log strongly recommended by default

## Relationship To The Main Checkpoint

Use:

- checkpoint = latest truth
- event log = transition trail

Bad pattern:

- repeating the whole checkpoint in every event

Better pattern:

- event states what changed
- checkpoint states current truth

## Good Event Shape

```text
Date:
Session:
Transition:
Why it matters:
Evidence:
Next expected move:
```

## Frequency Rule

If the event log is growing faster than the checkpoint is changing, you are
probably logging too much.

If several important state changes occurred and none are in the event log, you
are logging too little.

## Final Rule

Checkpoint events should make a long-running lane easier to audit without
making it feel like bureaucratic journaling.
