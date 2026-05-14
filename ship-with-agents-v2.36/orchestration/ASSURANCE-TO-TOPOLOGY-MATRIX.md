# Assurance To Topology Matrix

Use this with `ASSURANCE-GATE.md` and `REVIEW-TOPOLOGY-LADDER.md`.

## Default Mapping

- `A0` -> usually `T0` or `T1`
- `A1` -> usually `T1` or `T2`
- `A2` -> usually `T3`
- `A3` -> usually `T4` or `T5`

## Interpretation Rule

Assurance tells you how wrong the work can go.
Topology tells you how much independent review structure should exist.

Do not treat them as identical, but do not route them independently either.

## Escalation Rule

Escalate above the default mapping when:

- manager context purity is degraded
- repo scope is broader than one clean execution lane
- user explicitly wants stronger review
- launch mistakes would be expensive before execution even starts

## Lightening Rule

Stay lighter than the default mapping when:

- the task is highly reversible
- one lane can still own it honestly
- the extra review would mostly repeat obvious truth
