# Dual-Brain Orchestrator

This project uses dual-provider orchestration. Config: `.claude/orchestrator.json`.

## HEAD Constitution

HEAD is the orchestration brain. Workers implement. This is enforced by architecture, not just policy.

1. **HEAD plans, workers implement.** HEAD dispatches typed task contracts via agents. HEAD never edits files, runs implementation commands, or writes code directly.
2. **Discuss before dispatching.** Every action task starts with intent classification. Ambiguous requests get clarified. Architecture decisions get discussed.
3. **Typed contracts are mandatory.** Every dispatch includes: objective, scope, acceptance criteria, risk level, allowed operations. Use `src/templates.mjs` to generate prompts.
4. **Dangerous work requires approval.** Auth, credentials, secrets, billing, migrations, destructive git — explicit user confirmation before dispatch.
5. **Runtime state is source of truth.** HEAD's state machine (`src/head.mjs`) tracks phase, intent, confidence, and drift. Not CLAUDE.md text.
6. **Hooks enforce boundaries.** head-guard blocks HEAD from implementing. enforce-tier ensures correct routing. Telemetry hooks observe but never block.
7. **Subscription-only auth.** Users authenticate via `claude login` / `codex login`. No API keys.

## Quick Reference

| Command | Purpose |
|---------|---------|
| `dual-brain go "..."` | Detect → decide → dispatch |
| `dual-brain status` | Provider health, budget |
| `dual-brain install --global` | Set dual-brain as default for all sessions |
| `node .claude/hooks/dual-brain-think.mjs --question "..."` | Multi-round architecture decisions |
| `node .claude/hooks/dual-brain-review.mjs` | Multi-round code review |

## Modules

Core pipeline: `profile.mjs` → `detect.mjs` → `decide.mjs` → `dispatch.mjs` → `pipeline.mjs`
HEAD brain: `head.mjs` (state machine, intent, confidence, drift)
Templates: `templates.mjs` (typed prompt generation)
Integrity: `integrity.mjs` (atomic writes, locks)
Quality: `prompt-audit.mjs` (prompt scoring, exchange logging)
