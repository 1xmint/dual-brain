# Doctor Observability Layer

Use this when the doctor lane needs real evidence about how live chats are
behaving, not just what the docs say should happen.

## Core Truth

Doctor gets dramatically stronger when it can inspect:

- what a lane actually told the user
- which delivery mode it chose
- whether the turn progressed work, stalled it, or leaked labor
- what control-plane state changed
- whether runtime mail was sent, absorbed, ignored, or escalated

More logging is not the goal.

Better observability is the goal.

## Three-Layer Model

### 1. Structured turn events

Use `observability/turn-events.jsonl` for compact machine-friendly records of
meaningful user-facing turns.

Each event should capture:

- who spoke
- what workstream it touched
- what delivery mode was used
- what next-owner or bridge truth applied
- whether buyer labor leaked
- whether momentum improved or stalled

### 2. Quoted evidence

Use `observability/evidence.md` only for:

- high-signal failures
- high-signal wins
- release or audit evidence
- behavior examples worth promoting or fixing

Do not turn this into a raw transcript dump.

### 3. Derived metrics

Use `observability/metrics.json` for compact health signals like:

- coverage quality
- top failure patterns
- buyer-labor leakage
- delivery-mode confusion
- recommendation-first compliance
- lane-awareness quality
- heartbeat freshness
- unresolved-issue discipline
- frustration-resolution discipline
- doctor rule-addition versus deletion discipline
- dual-brain evidence coverage

### 4. Focused auxiliary ledgers

Use small sidecar ledgers when they answer one concrete question better than a
general event stream:

- `observability/doctor-deletions.jsonl` for doctrine retirements
- `observability/stop-decisions.jsonl` for stop-hook allow/deny evidence when
  that hook becomes operationally logged

## What To Record

Record a turn event when a response meaningfully changes:

- ownership
- review state
- recommendation state
- approval state
- next owner
- delivery mode
- closeout state
- operator action expectations

Also record:

- repeated failure patterns
- exemplary behavior worth promoting
- doctor findings with clear propagation value
- runtime mail writes and absorptions when a meaningful handoff or fan-in
  happened
- dual-brain handoffs when manager/super approval state changes materially
- lane heartbeats when live-lane freshness materially changes
- unresolved issues when a frustration stays open beyond the turn
- lane-awareness score changes when a lane repeatedly behaves disconnected

Do not log every trivial acknowledgement.

## Event-First Rule

Prefer:

- one short structured event per meaningful turn

over:

- giant transcript archives
- long duplicated summaries
- vague recollection

If doctor is auditing a behavior class with no meaningful recent turn event,
metrics entry, or quoted evidence, the audit should say `Evidence quality:
stale` before it proposes a new rule.

If a doctor finding cites a bad or excellent turn, link the `eventId` first and
quote only the minimum supporting excerpt in `observability/evidence.md`.

## Ownership

- the lane that just produced the meaningful turn should usually log the event
- doctor may backfill or normalize observability when auditing failures
- managers and heads should refresh observability when they own the control
  plane and a meaningful routing or review change just happened

## Refresh Moments

Refresh observability when:

- a recommendation-first turn succeeds or fails
- a buyer-labor leak is observed
- a handoff bridge is missing or excellent
- a workstream moves from review to launch or execution to closeout
- doctor runs a workflow-quality or release audit
- a lane is discovered to be half-born, orphaned, or stale
- the user raises a high-signal frustration that remains unresolved

## Whole-System Survey

Doctor should not rely on one file.
Use:

- `DOCTOR-SWEEP-PROTOCOL.md`
- `DOCTOR-CONTROL-PLANE-DASHBOARD.md`
- `LANE.md`
- `UNRESOLVED-ISSUES-REGISTER.md`
- `ORPHAN-LANE-DETECTOR.md`
- `STATE-FRESHNESS-SLA.md`
- `FRUSTRATION-RESOLUTION-PROTOCOL.md`
- `observability/doctor-deletions.jsonl` when doctrine retirement is relevant

## Final Rule

If doctor keeps rediscovering the same behavior pattern from chat recollection
instead of from structured evidence, observability is too weak.
