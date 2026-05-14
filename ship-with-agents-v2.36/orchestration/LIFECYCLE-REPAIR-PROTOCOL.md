# Lifecycle Repair Protocol

Use this when a live lane is half-born, stale, or missing runtime surfaces.

## Core Truth

Some failures are not strategy failures.
They are runtime hygiene failures.
If the failure is recoverable, the goal is not a diagnosis memo. The goal is a
working lane again.

## Common Repair Cases

- live lane missing inbox file
- live lane missing active-map row
- active workstream points to a lane that is not registered
- lane closed in practice but still active in control-plane state
- successor lane exists but predecessor still looks current

## Safe Repairs

When ownership is clear, repair directly:

- add or refresh inbox file
- add or refresh active-map row
- add or refresh lane brain capsule
- update lifecycle state
- write a lifecycle or observability event

Then verify the lane can resolve identity, find its inbox, and continue normal
work without the same stall.

If the repair is minor and non-blocking, do not turn it into the headline of
the buyer-facing reply. Repair it, verify it, and return to the main work.

## Escalate Instead Of Guessing

Escalate when:

- two live rows both claim to be current
- routing id and display name resolve to different real lanes
- ownership is contested
- you cannot tell whether a lane is paused or closed

## Final Rule

Prefer a small repair to a vague apology.
Prefer an explicit ambiguity notice to a guessed repair.
Do not stop at "this lane is broken" if you can still make it operable.
Do not make routine runtime hygiene feel like the buyer's new primary task when
the lane can repair it safely on its own.
