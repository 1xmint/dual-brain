---
argument-hint: [slice-path] [session-id]
description: Produce a tiny startup stub from an approved slice
---

Use the slice at `$1` to produce a launch-ready startup stub for session `$2`.

Rules:
- Treat the slice as canonical truth.
- Keep the startup body small.
- Put the launch command in its own code block at the end.
- If the slice is not approved, refuse to produce a launch stub and explain why.
