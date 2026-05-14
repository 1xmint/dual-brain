---
argument-hint: [issue]
description: Classify a doctor finding by root cause, severity, and fix layer
---

Classify the finding described by `$ARGUMENTS`.

Return:

- failure class
- severity
- fix layer
- smallest durable fix class
- whether it belongs in local truth, runtime state, shared workflow, or package
