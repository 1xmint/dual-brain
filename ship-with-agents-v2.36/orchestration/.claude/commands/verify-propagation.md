---
argument-hint: [change-or-update-id]
description: Verify that a doctor-driven change actually propagated
---

Verify propagation for `$ARGUMENTS`.

Check:

- canonical artifact updated
- update-bus entry published if needed
- only affected live lanes were routed notes
- release or fixture coverage added when warranted
- next similar case is less likely to regress

Return:

- what propagated
- what did not
- residual risk
