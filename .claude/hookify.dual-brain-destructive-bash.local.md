---
name: dual-brain-destructive-bash-warn
enabled: true
event: bash
action: warn
pattern: rm\s+-rf|git\s+(reset|clean)\s+--(hard|force)|drop\s+table|truncate\s+table|DROP\s+TABLE|TRUNCATE\s+TABLE|git\s+push\s+--force|>\s*/dev/|dd\s+if=
---

**[Dual-Brain]** Destructive bash command detected.

Destructive operations should be routed through the dispatch pipeline rather than run directly by HEAD:

- For isolated execution tasks: `node .claude/hooks/gpt-work-dispatcher.mjs --task "..." --tier execute`
- For high-risk decisions: use dual-brain think flow before running
- For git destructive ops: ensure quality gate passed first (`node .claude/hooks/quality-gate.mjs`)

If you must run this directly, verify you have a backup and the path/target is correct.
