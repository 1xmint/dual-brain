---
name: go
description: Route and dispatch a task through dual-brain
arguments:
  - name: task
    description: The task description to route
    required: true
  - name: dry-run
    description: Show routing without executing
    required: false
  - name: files
    description: Comma-separated file paths for risk classification
    required: false
---

Run `dual-brain go` with the provided arguments. Execute:

```bash
dual-brain go [--dry-run] [--files <files>] "<task>"
```

Report the routing decision (provider, model, tier) and dispatch result to the user.
