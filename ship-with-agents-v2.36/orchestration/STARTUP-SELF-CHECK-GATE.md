# Startup Self-Check Gate

Run this before a lane begins real work after startup, resume, or recovery.

## Core Truth

Reading many docs is not enough.
A lane should prove that it has actually synchronized.
That synchronization is not startup-only; already-running lanes should do a
lighter inbox/mail sync at the start of each turn too.
Short buyer return signals are not an exemption from that turn-start sync.

If this is not a fresh launch but an already-running thread, do not forget to
use current-thread continuity as part of identity proof.

## Required Checks

Confirm:

- identity resolved
- current-lane certainty classified when the lane is already mid-thread
- continuation source known when this is a resume, rotation, or fresh pickup
- active-map row found or intentionally created
- inbox path found
- lane lifecycle state known
- current workstream linked
- current slice or checkpoint linked
- mission and scope known
- non-goals known

## Output Shape

Keep it compact:

- `Identity resolved:` yes/no
- `Current-lane certainty:` C0/C1/C2/C3
- `Continuation source:` path / in-thread note / none
- `Inbox found:` yes/no
- `Map row found:` yes/no
- `Lifecycle state:` active/paused/closed/unknown
- `Workstream linked:` yes/no
- `Current artifact:` path or `none`
- `Missing runtime surfaces:` list or `none`

## Repair Rule

If a critical runtime surface is missing:

- repair it if safe and ownership is clear
- otherwise escalate before doing real work
- if identity itself is unresolved, stop and report `Lane identity unresolved:`
  instead of pretending startup succeeded with an empty inbox

If the repair is small, safe, and clearly subordinate to owned repo work:

- repair it quietly
- keep the buyer-facing focus on the actual workstream
- only foreground the runtime gap if it blocks progress, changes trust, or
  requires buyer action

Critical missing surfaces:

- no inbox
- no active-map row
- no clear identity
- no continuation source when the lane claims to be a resumed or rotated
  continuation
- no workstream or artifact linkage when the lane is meaningful

## Final Rule

Do not treat "I read the prompt" as proof that startup succeeded.
Do not treat "no inbox files" as proof of sync if the lane record itself was
never resolved.
Do not answer `done`, `continue`, or `what's next` from memory when runtime
mail/update truth has not been refreshed first.
