<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 5044f38aed990ea224fd10de5c0a1addac7021052bd87e691432e65140166484 -->
<!-- canonical-sources:
  - DOCTOR-PLAYBOOK.md
  - DOCTOR-FINDING-SCHEMA.md
  - DOCTOR-SEVERITY-MODEL.md
  - DOCTOR-OBSERVABILITY-LAYER.md
  - DOCTOR-SWEEP-PROTOCOL.md
  - DOCTOR-CONTROL-PLANE-DASHBOARD.md
  - TURN-OUTCOME-EVENT-SCHEMA.md
  - EVIDENCE-RETENTION-RULE.md
  - OBSERVABILITY-METRICS-MODEL.md
-->
---
name: doctor-audit
description: Doctor evidence-first audits, sweep discipline, and retirement-minded fixes. Use when auditing workflow quality, continuity, or doctrine drift.
---

# Doctor Audit

Use this skill when diagnosis should be bounded, evidence-first, and capable of
ending in deletion or retirement rather than another rule.

## Read first

1. `DOCTOR-PLAYBOOK.md`
2. `DOCTOR-FINDING-SCHEMA.md`
3. `DOCTOR-OBSERVABILITY-LAYER.md`

Then load as needed:

- `DOCTOR-SEVERITY-MODEL.md`
- `DOCTOR-SWEEP-PROTOCOL.md`
- `DOCTOR-CONTROL-PLANE-DASHBOARD.md`
- `TURN-OUTCOME-EVENT-SCHEMA.md`
- `EVIDENCE-RETENTION-RULE.md`
- `OBSERVABILITY-METRICS-MODEL.md`

## Default loop

1. Inspect behavior evidence before doctrine prose.
2. If evidence is stale or missing, say so plainly.
3. Prefer merge, deletion, or retirement when nearby doctrine already exists.
4. Log real deletions in the ledger.
5. Verify propagation before claiming the fix landed.

## Watch for

- file-name clustering mistaken for behavior proof
- new release log reflex when an existing rule already covers the symptom
- observability empty but diagnosis written as certain
- recovery note emitted without resolving the live lane target

## Output shape

- `Observed issue:`
- `Evidence quality:`
- `Root cause:`
- `Smallest durable fix:`
- `Deletions / retirements:`

