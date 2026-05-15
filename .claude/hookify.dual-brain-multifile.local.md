---
name: dual-brain-multifile-warn
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: regex_match
    pattern: (Edit|Write|MultiEdit).+\n(.|\n)*?(Edit|Write|MultiEdit).+\n(.|\n)*?(Edit|Write|MultiEdit)
---

**[Dual-Brain]** This session included 3+ file edits.

Multi-file work requires prior routing through the dual-brain pipeline. Before starting any batch of 3+ file edits you must:
1. `node .claude/hooks/budget-balancer.mjs` — check provider balance
2. `dual-brain go --dry-run "description"` — classify the task
3. If GPT is recommended: `node .claude/hooks/gpt-work-dispatcher.mjs --task "..." --tier execute`

Claude's role in multi-task work: define acceptance criteria, dispatch agents, review results — not solo-implement everything. Failure to route is itself a bug.
