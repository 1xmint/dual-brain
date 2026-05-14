# Turn Outcome Event Schema

Use this schema for `observability/turn-events.jsonl`.

Write one JSON object per line.

## Required Fields

- `eventId`
- `timestamp`
- `role`
- `displayName`
- `routingId`
- `workstreamId`
- `repoSlug`
- `turnKind`
- `deliveryMode`
- `reviewState`
- `recommendationState`
- `approvalState`
- `nextOwner`
- `bridgeMode`
- `buyerSteerRequired`
- `buyerLaborRequired`
- `bridgeProvided`
- `userFrustration`
- `frustrationResolved`
- `momentumOutcome`
- `qualitySignal`
- `summary`

## Strongly Recommended Fields

- `reviewTopology`
- `reviewCellId`
- `assuranceLevel`
- `executionOwner`
- `reviewOwner`
- `approvalOwner`
- `auditOwner`
- `executionProvider`
- `reviewProvider`
- `approvalProvider`
- `auditProvider`
- `diversityType`
- `topologyVerified`
- `providerBindingVerified`
- `pickupRequired`
- `closeoutState`
- `formatDrift`
- `artifactRefs`
- `evidenceRef`
- `doctorAttention`
- `notes`
- `identityResolved`
- `ownershipVerified`
- `foreignReportStatus`
- `selfCorrectionTriggered`
- `selfCorrectionApplied`
- `unresolvedIssueIds`

## Recommended Value Sets

- `turnKind`:
  - `status`
  - `review`
  - `launch`
  - `handoff`
  - `execution-complete`
  - `closeout`
  - `audit`
  - `dual-brain-handoff`

- `deliveryMode`:
  - `continue-here`
  - `update-doc`
  - `wake`
  - `buyer-paste`
  - `launch`
  - `no-user-action`
  - `decision-needed`
  - `recommended-next-move`
  - `stop-here`

- `bridgeMode`:
  - `continue-here`
  - `internal-route`
  - `internal-route-plus-pickup`
  - `buyer-paste`
  - `launch-here`
  - `none`

- `momentumOutcome`:
  - `progressed`
  - `stalled`
  - `leaked`
  - `blocked`
  - `closed-clean`

- `qualitySignal`:
  - `clean`
  - `mixed`
  - `failure`
  - `win`

- `doctorAttention`:
  - `none`
  - `watch`
  - `audit-now`

- `identityResolved`:
  - `yes`
  - `no`

- `ownershipVerified`:
  - `yes`
  - `no`

- `foreignReportStatus`:
  - `none`
  - `accepted`
  - `rejected`
  - `rerouted`

- `selfCorrectionTriggered`:
  - `yes`
  - `no`

- `selfCorrectionApplied`:
  - `yes`
  - `no`

- `topologyVerified`:
  - `missing`
  - `declared-only`
  - `observed`

- `providerBindingVerified`:
  - `missing`
  - `declared-only`
  - `observed`

- `diversityType`:
  - `single-lane`
  - `prompt-diverse`
  - `provider-diverse`
  - `unknown`

## Example

```json
{"eventId":"evt-2026-05-03-appcore-flow-001","timestamp":"2026-05-03T21:45:00Z","role":"super","displayName":"Supervisor - App Core / CLI Delivery","routingId":"super-2-appcore-cli","workstreamId":"appcore-live-flow","repoSlug":"appcore","turnKind":"review","deliveryMode":"recommended-next-move","reviewState":"challenge_active","recommendationState":"ready","approvalState":"buyer_steer","nextOwner":"manager-2-appcore","bridgeMode":"buyer-paste","buyerSteerRequired":true,"buyerLaborRequired":false,"momentumOutcome":"progressed","qualitySignal":"clean","artifactRefs":["slices/appcore-live-flow.md"],"evidenceRef":"observability/evidence.md#2026-05-03","summary":"Supervisor produced one clear recommendation and the ready manager bridge in the same turn."}
```

## Writing Rules

- keep summaries short
- log the observable turn outcome, not your feelings about it
- prefer `mixed` over fake confidence
- if the user explicitly raised frustration, log whether it was resolved or is
  still open
- if a handoff should have included a bridge, record whether one was actually
  provided
- for `dual-brain-handoff`, record the review cell, approval owner, provider
  binding, and whether the handoff is only declared or actually observed
- if a pasted completion or summary was involved, record whether ownership was
  verified and whether a foreign report was rejected or rerouted
- if a turn violated a rule, set `doctorAttention` to `watch` or `audit-now`
- if the lane recognized a live miss and corrected it, capture the
  self-correction fields explicitly
- if no workstream exists yet, use a temporary descriptive `workstreamId`

## Final Rule

If another reader cannot tell what happened next from the event alone, the
event is too vague.
