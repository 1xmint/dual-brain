# TODO — Active Work Queue

The orchestrator reads this on every startup. Items are organized
by priority. Move items here from ROADMAP.md when they're scoped and
ready to work. Remove items when completed.

---

## P0 — Blocking Production

*Nothing currently blocking.*

## P1 — Next Up

### Newcomer documentation + remaining audit findings (cross-repo)
Status: ready — genericization complete, rule collapse complete
What: Create all buyer-facing documentation (START-HERE, QUICK-START,
HOW-IT-WORKS, CUSTOMIZATION), smoke tests, concept explanations. Covers
audit Packet 2 findings plus Packets 3-4 (dual-system resolution, model
future-proofing). Also covers F3.8 (missing promised files).
Ref: _agent-system/logs/idea-chat-handoff-2026-04-21-3-pass-audit.md

### repo-ops-starter-pack audit (cross-repo)
Status: ready — dependency for combined product build
What: Audit repo-ops-starter-pack for project-specific content, same as
the 3-pass audit did for _agent-system. Required before the combined
product can ship (F3.17).

## P2 — After P1 Clears

### Shadow-check cutover proposal (ClawNet)
Status: ready after shadow-check validates
What: Flip checkApiKey to use rotation backend as primary auth path.

### WebAuthn co-sign unwiring (ClawNet)
Status: unblocked (soma-heart 1.0.0 published)
What: Wire the co-sign stub in the ceremony to the real
./supply-chain export from soma-heart 1.0.0.

### heartbeat.ts redesign (ClawNet)
Status: ready
What: Currently chaos code — self-calls auth-protected orchestrate
endpoint with hardcoded Solana rug-pull query. Redesign properly.

### Soma heart wiring (ClawNet)
Status: ready
What: Heart exists but isn't wrapping actual data or LLM calls.

## P3 — Backlog

### Markup logic removal (ClawNet)
What: MARKUP_PERCENT set to 0. Remove dead markup calculation logic.

### Stripe vestige cleanup (ClawNet)
What: Remove dead stripe_session_id column, stale dist/payments/ files.

### Orchestrator container UNHEALTHY (ClawNet)
What: Container health check failing. Needs investigation.

### site/ untracked production files (ClawNet)
What: 46+ HTML files in /var/www/claw-net/ not in git repo.

### Scripts build inclusion (ClawNet)
What: Dockerfile runner stage doesn't copy scripts/ into container.

### Architecture doc reconciliation (ClawNet)
What: runtime.md describes a system 10x larger than what exists.

### Pulse .env remaining TODOs
What: ADMIN_PIN, ADMIN_API_KEY, RESEND_DOMAIN still unset. Non-critical.

---

*Items move here from ROADMAP.md when scoped. Items leave when done.
For vision, see VISION.md. For future milestones, see ROADMAP.md.*
