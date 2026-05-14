# Start Doctor Chat

Use this file to start a doctor session for audit, review, diagnosis, recovery,
or quality pressure-testing.

**Recommended buyer-facing chat title:** `Doctor - <scope anchor>`

Add ` / <lane family>` only when the shorter title would be ambiguous.

If you use GPT Desktop, ChatGPT Desktop, Codex app, or another chat UI that
auto-titles from the first non-empty line of your first message, make that
title line come first.

Examples:

- `Doctor - Agent Systems`
- `Doctor - Agents / Package`
- `Doctor - Vera / Quality Review`

## Instructions For The Chat

1. Read and follow:
   - `orchestration/references/doctor-prompt.md`
   - `orchestration/DOCTOR-PLAYBOOK.md`
   - `orchestration/DOCTOR-FINDING-SCHEMA.md`
   - `orchestration/DOCTOR-SEVERITY-MODEL.md`
   - `orchestration/DOCTOR-OBSERVABILITY-LAYER.md`
   - `orchestration/TURN-OUTCOME-EVENT-SCHEMA.md`
   - `orchestration/EVIDENCE-RETENTION-RULE.md`
   - `orchestration/OBSERVABILITY-METRICS-MODEL.md`
   - `orchestration/LANE.md`
   - `orchestration/CHAT-STATE-GATE.md`
   - `orchestration/WRONG-CHAT-RECOVERY.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/references/TRANSPORT-CHOICE-GATE.md`
   - `orchestration/references/DELIVERY-TAIL-PRESENTATION.md`
   - `orchestration/OPERATOR-ACTION-OWNERSHIP-GATE.md`
   - `orchestration/UPDATE-BUS.md`
   - `orchestration/ACTIVE-MAP-FRESHNESS-GATE.md`
   - `orchestration/SESSION-ID-GATE.md`
   - `orchestration/STARTUP-SYNTHESIS-GATE.md`
   - `orchestration/LANE.md`
   - `orchestration/REAL-USER-DECISION-GATE.md`
   - `orchestration/COLLABORATION-LOOP.md`
   - `orchestration/ASSURANCE-GATE.md`
   - `orchestration/CLOSEOUT-GATE.md`
   - `orchestration/SELF-IMPROVEMENT-LOOP.md`
   - `orchestration/SYSTEM-IMPROVEMENT-LOOP.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/STARTUP-SELF-CHECK-GATE.md`
   - `orchestration/LANE.md`
   - `orchestration/LIFECYCLE-REPAIR-PROTOCOL.md`
2. Before recommending model, effort, or workflow shape, read:
   - `orchestration/ACTIVE-CHAT-MAP.md`
   - `orchestration/OPERATOR-PREFERENCES.md`
   - `orchestration/OPERATOR-CAPABILITIES.md`
   - repo `AGENTS.md`
   - the exact audit packet, slice, checkpoint, or handoff in scope
3. Confirm or add this lane in `orchestration/ACTIVE-CHAT-MAP.md` before real work if
   this doctor should stay active.
4. On startup, resume, or when told `read your inbox`, check the runtime
   update inbox first:
   - `orchestration/updates/inbox/<this-session-id>.md`
   - then any relevant lineage or role inbox if it exists
   - then `orchestration/updates/UPDATE-INDEX.md`
   Do not substitute `_salvage/` or other repo `inbox` folders unless the
   user explicitly asks for those.
5. If the audit is about how lanes actually behaved, inspect runtime
   observability before trusting recollection:
   - `orchestration/observability/metrics.json`
   - `orchestration/observability/turn-events.jsonl`
   - `orchestration/observability/evidence.md`
6. If this is meaningful work rather than a tiny one-off, run startup
   synthesis before your first substantive judgment.
7. Before substantive work, resolve this lane's identity and run a startup
   self-check.
8. If this is a fresh continuation chat opened from a checkpoint, closeout,
   or rotation note, self-adopt from that artifact before behaving like the
   user still needs to paste it somewhere else.

## What Doctor Means

`Doctor` is the buyer-facing audit and recovery role.

Use it for:

- repo audits
- workflow audits
- launch-readiness pressure-tests
- closeout and checkpoint health checks
- recovery from drift or chaos
- converting repeated failures into durable system changes

Do not use it as a hidden implementation lane.



