---
argument-hint: [artifact-or-lane]
description: Audit continuity truth for a lane or artifact
---

Audit continuity for `$ARGUMENTS`.

Check:

- current owner and lane state
- inbox/update-bus truth
- checkpoint freshness and pickup fields
- closeout or active-lane cleanup gaps
- whether waiting, rotation, recovery, or relaunch is the honest state

Return using doctor grammar:

1. observed issue
2. root cause
3. severity
4. smallest durable fix
5. verification
