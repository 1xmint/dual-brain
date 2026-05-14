---
argument-hint: [version-or-scope]
description: Run a doctor-style release audit focused on trust, drift, and buyer-facing workflow quality
---

Audit the release scope `$ARGUMENTS`.

Focus on:

- buyer-facing naming and clarity
- workflow and continuity truth
- route / launch / closeout reliability
- fixture and doctor coverage
- whether the package teaches the intended behavior, not just the philosophy

Return:

- top findings by severity
- smallest durable fixes
- whether the release is honestly launch-ready
