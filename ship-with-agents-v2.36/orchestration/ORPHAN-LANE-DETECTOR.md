# Orphan Lane Detector

Use this when a lane may exist in practice but not in the runtime system.

## Orphan Signals

A lane is likely orphaned when:

- the user references a live chat that is not in `ACTIVE-CHAT-MAP.md`
- a lane has no inbox file
- a lane has no capsule
- a workstream mentions an execution or review owner with no active row
- observability events mention a lane with no registered control-plane identity

## Doctor Action

1. verify whether the lane is real
2. classify it as:
   - half-born
   - stale
   - closed but not marked
   - true orphan
3. repair if ownership is clear
4. escalate one explicit blocker if ownership is ambiguous

## Final Rule

Do not let a lane stay "real to the user but invisible to the system."
