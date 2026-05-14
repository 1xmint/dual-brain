# Doctor Finding Schema

Use this schema when writing a durable doctor finding, memo, audit note, or
release diagnosis.

## Required Fields

- `Title:` short finding name
- `Observed issue:` what actually happened
- `Why it matters:` cost, risk, or trust impact
- `Evidence quality:` fresh, stale, partial, or missing
- `Root cause:` why it happened
- `Failure class:` use the doctor playbook classes
- `Severity:` use `DOCTOR-SEVERITY-MODEL.md`
- `Fix layer:` local, runtime, shared workflow, or package
- `Smallest durable fix:` exact artifact or change type
- `Deletions / retirements:` exact files, rules, or `none`
- `Propagation:` who or what needs the update
- `Verification:` how we will know the fix worked
- `Residual risk:` what still remains true after the fix

Recommended when available:

- `Evidence refs:` event IDs, quoted evidence entries, or runtime files that
  prove the behavior

## Minimal Short Form

For smaller findings, this compressed shape is enough:

- issue
- root cause
- evidence quality
- severity
- durable fix
- deletions / retirements
- verification

## Exact-Artifact Bias

If a finding clearly maps to:

- one doc update
- one runtime hygiene fix
- one update-bus entry
- one fixture
- one release gate

produce that exact artifact instead of a ceremonial recommendation.
If the cleanest fix is deletion, merger, or retirement, say that plainly
instead of inventing a positive-sounding new rule title.
