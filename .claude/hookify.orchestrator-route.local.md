---
name: orchestrator-routing
enabled: true
event: prompt
action: warn
conditions:
  - field: user_prompt
    operator: regex_match
    pattern: .+
---

**[Tier Router]** Route work across both providers (config: `.claude/orchestrator.json`):

**Primary entry point (v6):** `dual-brain go "task description"` — runs detect→decide→dispatch pipeline automatically.

**Claude lane** (fast, interactive):
- Search (`model: "haiku"`): Read-only lookups, grep, explore. Agent must return: files found, line refs, confidence.
- Execute (`model: "sonnet"`): Edits, tests, git ops. Agent must return: files changed, tests run, edge cases.
- Think (main session): Architecture, review, planning. Agent must return: decision, alternatives, risks.

**GPT lane** (parallel, isolated work):
- Use `node .claude/hooks/gpt-work-dispatcher.mjs --task "..." --tier execute` for isolated execution
- Use `node .claude/hooks/dual-brain-think.mjs --question "..."` for dual-perspective decisions

**Routing:** Tasks <3min → Claude. Isolated tasks >3min → check balance first (`node .claude/hooks/budget-balancer.mjs`). High-risk → dual-brain. Think > execute > search when task spans tiers.
