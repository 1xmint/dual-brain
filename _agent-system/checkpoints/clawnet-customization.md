# Checkpoint: clawnet-customization
Date: 2026-04-22
Gate passed: All CUSTOMIZE blocks filled in; VISION.md populated; TODO.md and ROADMAP.md verified current
Evidence: grep for CUSTOMIZE returns only CUSTOMIZATION.md (expected)

## What was done

### CUSTOMIZE blocks filled in
- `.claude/agents/orchestrator.md` — [your projects] → Soma, claw-net, and pulse
- `orchestrator-prompt.md` — [your projects] → Soma, claw-net, and pulse
- `task-agent-prompt.md` — project names + full repo boundaries (2 blocks)
- `.claude/agents/task-agent.md` — project names + full repo boundaries (2 blocks)
- `idea-discussion-prompt.md` — project names + full repo boundaries (2 blocks)
- `README.md` — [your projects] → Soma, claw-net, and pulse
- `task-packet-template.md` — repo boundary placeholders → claw-net/Soma/pulse ownership
- `proposal-roadmap.md` — section structure + starter roadmap (2 blocks)
- `QUICK-START.md` — removed "edit CUSTOMIZE blocks" step; replaced with pre-filled note
- `VISION.md` — full project vision written for all three repos

### VISION.md
Written from scratch with vision, current state, and long-term direction for:
- Soma (protocol/identity layer, upstream truth)
- claw-net (orchestration runtime, billing, auth, production)
- pulse (X-only social agent, first product consumer)
Plus "How They Connect" section describing upstream/downstream flow.

### TODO.md + ROADMAP.md
Already matched the parent _agent-system at copy time. No changes needed.
Content reflects actual ClawNet P1-P3 items:
- P1: Newcomer docs + audit, repo-ops-starter-pack audit
- P2: Shadow-check cutover, WebAuthn co-sign, heartbeat redesign, Soma heart wiring
- P3: Markup removal, Stripe cleanup, container health, untracked site/ files

## Repo boundaries captured
- claw-net: Hono, SQLite, Redis, Clerk, Stripe/USDC. Default branch: main.
- Soma: Protocol truth, npm packages. Default branch: master.
- pulse: X-only social agent. Default branch: master.
- Source of truth: AGENTS.md → live GitHub → local git → accepted ADRs/specs/proposals → pasted context

Next task: none — task complete
Open decisions: none
Blockers: none
Friction: none
