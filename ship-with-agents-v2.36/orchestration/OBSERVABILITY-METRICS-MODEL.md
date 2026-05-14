# Observability Metrics Model

Use this with `observability/metrics.json`.

## Goal

Turn raw event evidence into compact signals doctor and top-layer lanes can
trust quickly.

## Core Fields

- `lastUpdated`
- `updatedBy`
- `coverageStatus`
- `evidenceQuality`
- `eventFreshness`
- `topFailurePatterns`
- `topWins`
- `recommendedNextMove`

## Recommended Status Fields

- `deliveryModeDiscipline`
- `buyerLaborLeakage`
- `recommendationFirstDiscipline`
- `pickupClarity`
- `closeoutObservability`
- `frustrationHandling`
- `frustrationResolution`
- `bridgeDiscipline`
- `topChainQuality`
- `budgetRoutingClarity`
- `closeoutTransitionQuality`
- `laneAwarenessQuality`
- `heartbeatFreshness`
- `unresolvedIssueDiscipline`
- `doctorSweepFreshness`
- `selfCorrectionDiscipline`

Use `green`, `yellow`, or `red`.

## What Good Looks Like

- meaningful turns are event-logged reliably
- failure examples are quoted selectively
- top failure patterns are visible without opening transcripts
- doctor can tell whether a fix changed live behavior
- doctor can see when user frustration is repeatedly raised but not resolved
- doctor can see whether live lanes actually know who they are and what they
  own
- doctor can see whether self-aware misses became corrections or only comments

## What Bad Looks Like

- metrics are green but evidence is stale
- events exist but do not name next owner or delivery mode
- frustration keeps appearing but no metric moves
- evidence file becomes a transcript graveyard
- doctor has to reconstruct behavior from memory

## Refresh Rule

Refresh `metrics.json` when:

- a doctor audit finishes
- a workflow fix lands
- a repeated failure pattern appears or disappears
- coverage quality meaningfully changes

## Final Rule

Observability metrics are only useful if they compress real evidence, not if
they decorate uncertainty.
