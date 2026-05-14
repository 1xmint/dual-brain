# Checkpoint Event Logs

Use this when a long-running or high-assurance workstream needs more history
than one overwritten checkpoint file can hold.

The pattern is:

- checkpoint = latest execution truth
- checkpoint event log = append-only major gate trail

Use event logs when:

- the lane will run for a while
- multiple gates matter
- auditability matters
- a solo operator wants both fast pickup and readable history

Store them in:

- `_agent-system-runtime/checkpoint-events/<workstream-slug>.md`

Do not turn them into full diaries.
Only append meaningful transitions.

Use `../CHECKPOINT-EVENT-THRESHOLDS.md` for the exact threshold.
