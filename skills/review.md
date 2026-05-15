---
name: review
description: Dual-brain code review — two-round Claude + GPT review of the current diff
arguments: []
---

Run the dual-brain review flow (2 rounds) on the current git diff:

**Round 1** — get GPT's independent review:
```bash
node hooks/dual-brain-review.mjs
```

Review the same diff independently, then run **Round 2** — share your findings and get GPT's response:
```bash
node hooks/dual-brain-review.mjs --round 2 --claude-review "<your findings>"
```

Synthesize both rounds into a final review verdict: shared findings, unique catches from each side, and any items that need human attention.
