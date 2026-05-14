---
argument-hint: "<what went wrong>"
description: Log a meaningful agent correction or recurring craft miss to observability/friction.jsonl
---

# /log-friction

Capture a real correction so the system can learn from it later.

## When to use

- the user had to say "that's wrong" or undo the change
- the right craft skill should have loaded and did not
- the same edge case or local convention keeps getting missed

## Required fields

1. `taskKind:` bug-fix / feature / refactor / review / other
2. `wrong:` one sentence on what the agent missed
3. `correction:` one sentence on the right move

## Optional fields

- `expectedSkill:`
- `actualSkill:`
- `severity: low|medium|high`
- `notes:`

## Write shape

Append one JSON line to `observability/friction.jsonl`:

```json
{"ts":"<ISO-8601>","taskKind":"<kind>","wrong":"<miss>","correction":"<fix>","expectedSkill":"<skill?>","actualSkill":"<skill?>","severity":"<level?>"}
```

Keep it specific. No transcript dumps. No secrets.

## Return

- `Friction logged:` yes / no
- `Expected skill next time:`
- `Pattern capture needed:` yes / no
