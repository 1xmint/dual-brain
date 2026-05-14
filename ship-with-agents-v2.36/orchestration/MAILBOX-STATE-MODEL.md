# Mailbox State Model

Use this whenever runtime mail is written, absorbed, escalated, or closed.

## Core Truth

Runtime mail should not be a vague append-only dump.

The system gets much stronger when mail has explicit lifecycle state.

## Mail States

- `unread` - written to the mailbox, not yet absorbed by the target lane
- `absorbed` - target lane read it and incorporated the truth
- `escalated` - target lane used it to route or summarize upward
- `closed` - no further action needed from this mail item

## Expectations

- child lane writes mail as `unread`
- parent lane marks or records it as `absorbed` when picked up
- if the parent forwards the outcome upward, record `escalated`
- when the work item no longer needs attention, record `closed`

## Observability Rule

Doctor should be able to audit:

- which mail items remain unread
- whether a lane keeps failing to absorb child completions
- whether fan-in mail is being synthesized or ignored

## Final Rule

If runtime mail exists but the system cannot tell whether it was ever absorbed,
the mail layer is too weak.
