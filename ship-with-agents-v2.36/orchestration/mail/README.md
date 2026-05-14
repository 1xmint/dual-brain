# Runtime Mail

This directory holds lane-to-lane runtime mail.

Use it for compact internal communication that should not require the buyer to
copy packets between already-live lanes.

Primary structure:

- `mail/inbox/<routing-id>.md`

Use runtime mail for:

- child completion reports
- upward review notes
- pickup triggers
- recovery notes
- compact coordination truth

Pair this with:

- `RUNTIME-MAIL-PROTOCOL.md`
- `DONE-ABSORPTION-RULE.md`
- `FAN-IN-SYNTHESIS-RULE.md`
- `MAILBOX-STATE-MODEL.md`

Keep mail short, structured, and stateful.
