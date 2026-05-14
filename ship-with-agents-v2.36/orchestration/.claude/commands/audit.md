---
argument-hint: "[scope hint]"
description: Bounded one-shot system audit — live state, observability, hooks, skill drift, top-3 risks
---

# /audit

Run a bounded, read-only system audit. `$ARGUMENTS` is an optional scope hint
(e.g., "observability only", "hooks", "skills"). Default: full pass.

Use the doctor-audit skill throughout. Inspect evidence before prose.

## Steps

1. **Hook rail status** — check that `.githooks/pre-commit` is wired and that
   `scripts/live-surface-check.ps1` and `scripts/skills-drift-check.ps1` both exist.
   Note any missing or disconnected hooks as a finding.

2. **Skill drift** — run `scripts/skills-drift-check.ps1` (read-only output). Flag any
   skills whose canonical-hash comment no longer matches the source files.

3. **Live surface check** — run `scripts/live-surface-check.ps1` (read-only output).
   Report any broken surface references.

4. **Observability state** — read:
   - `observability/doctor-deletions.jsonl` — ratio of deletions to total entries.
   - `observability/turn-events.jsonl` — last 5 entries; note if stale.
   - `observability/evidence.md` — last update date.
   If evidence is older than 7 days or empty, flag as yellow.

5. **Health snapshot** — read `health/summary.json` if it exists. Note any red or yellow
   signals without attempting repairs.

6. **Scope filter** — if `$ARGUMENTS` names a specific area, skip steps outside that area
   and say so explicitly.

## Output format

```
Audit pass: <date>
Scope: <full | scoped to: $ARGUMENTS>

Hook rail:        <pass | fail | partial — detail>
Skill drift:      <clean | N drifted — names>
Live surface:     <pass | fail — detail>
Observability:    <fresh | stale | empty — detail>
Health signals:   <green | yellow | red — summary>

Top 3 risks:
1. <risk — evidence — severity>
2. <risk — evidence — severity>
3. <risk — evidence — severity>

Recommended next pass: <one bounded action>
```

## Stop conditions

- Report produced → done. This command does not apply repairs.
- If `$ARGUMENTS` is empty, run all steps.
- If a step's source file does not exist, note it as a finding and continue.

No user action needed: audit report above is the complete output.
