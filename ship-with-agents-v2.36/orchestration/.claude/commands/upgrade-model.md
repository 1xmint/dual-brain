---
description: Escalate the current session to Opus and document the reason
---

Escalate the current session to `claude-opus-4-6` when a documented trigger
warrants it.

`$ARGUMENTS` — optional reason for escalation (e.g., "auth refactor",
"architectural ADR", "deep root cause needed")

## What this command does

1. **Logs the escalation intent** to `observability/turn-events.jsonl` with
   `eventType: "model-upgrade"`, the current role, the reason from `$ARGUMENTS`
   (or `"unspecified"` if none), and the current timestamp.

2. **Checks current model** — if this session is already running on
   `claude-opus-4-6`, confirm that and skip the re-launch guidance.

3. **If on Sonnet:** Reminds the user that Claude Code does not support
   live mid-session model switching. Provides the exact re-launch command
   with the Opus override so the user can restart immediately.

4. **Reminds how to revert** — after the Opus session finishes, future
   spawns of this role will return to the Sonnet default automatically
   (the role card default is Sonnet). No cleanup needed.

## Escalation log entry

Write to `observability/turn-events.jsonl`:

```json
{
  "eventType": "model-upgrade",
  "role": "<current role name>",
  "from": "claude-sonnet-4-6",
  "to": "claude-opus-4-6",
  "reason": "<$ARGUMENTS or 'unspecified'>",
  "trigger": "<which trigger from MODEL-DEFAULTS-PATTERN.md fired, or 'user-requested'>",
  "ts": "<ISO 8601 timestamp>"
}
```

## Valid escalation triggers (from MODEL-DEFAULTS-PATTERN.md)

- `trust-sensitive-code` — auth, credentials, payments, crypto
- `architectural-decision` — cluster merge, role redefinition, cross-workstream contract
- `deep-root-cause` — non-obvious failure mode needing deeper reasoning
- `user-requested` — user explicitly said "use Opus" or ran this command
- `systemic-analysis` — systemic root-cause analysis, not a routine sweep
- `durable-pattern` — output becomes a pattern file, ADR, or gate
- `irreversible-decision` — hard-to-reverse recommendation

## Re-launch command (if on Sonnet)

```
claude --agent <role> --model claude-opus-4-6 --effort high -n <chat-name>
```

Replace `<role>` with manager / super / doctor / agent as appropriate, and
`<chat-name>` with the current chat name.

## Reverting

No action needed. The role card defaults to Sonnet. The next ordinary spawn
of this role will use Sonnet automatically.

## Return

1. `Model-upgrade logged:` yes / no
2. `Current model:` claude-opus-4-6 / claude-sonnet-4-6 (inferred from role card)
3. `Action needed:` re-launch with Opus / already on Opus, continue
4. `Reason recorded:` <reason or "unspecified">
