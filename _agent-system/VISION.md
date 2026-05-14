# Vision

What each project is, what it will become, and how they connect.
This file changes rarely — only when strategic direction shifts.

---

## Soma

**What it is:** The protocol layer. Soma defines identity, trust primitives,
and credential verification. It publishes npm packages (soma-heart and others)
that downstream projects consume. Soma owns the semantics — if something
touches how credentials are issued, verified, or trusted, it lives here.

**Current state:** soma-heart 1.0.0 is published. Credential rotation work
is in progress. Protocol semantics for trust and identity are being specified
through ADRs and proposals. Default branch: master.

**What it becomes:** The canonical identity and trust layer for sovereign AI
agents — stable, versioned, and auditable. All credential lifecycle events
are defined in Soma and consumed by claw-net. Changes are gated by proposals
and ADRs before implementation touches downstream repos.

---

## claw-net

**What it is:** The orchestration runtime and platform. claw-net is a Hono
API on a single-process Node VPS that sits on top of Soma's identity
primitives. It handles agent execution requests, billing (Stripe + USDC/Solana),
auth (Clerk + Phantom), and caching (Redis over SQLite WAL). Callers run sense;
claw-net runs heart.

**Current state:** Running in production. Core API, billing, and auth are live.
Soma credential integration is in progress (shadow-check → cutover path). Several
cleanup items remain: heartbeat redesign, dead markup logic, Stripe vestiges,
container health check. Default branch: main. Deploy via GitHub Actions.

**What it becomes:** The sovereign AI agent execution platform — a secure,
billing-aware runtime that any caller can use to run AI agent workloads with
Soma-verified identity and on-chain or fiat payments. No manual deploy steps.
No dead code. Clean separation between platform (claw-net) and protocol (Soma).

---

## pulse

**What it is:** An X-only social agent and the first product built on claw-net.
pulse is ClawNet's proof-of-concept consumer — it demonstrates the full stack
working end-to-end with a real product use case. Default branch: master.

**Current state:** Early-stage. Some env vars remain unset (ADMIN_PIN,
ADMIN_API_KEY, RESEND_DOMAIN). Not yet in active development.

**What it becomes:** A fully operational social agent for X, running on
claw-net's orchestration layer with Soma identity, deployable and maintainable
without manual intervention. The reference implementation for building products
on top of the platform.

---

## How They Connect

Soma defines the trust model → claw-net enforces it at runtime →
pulse consumes it as a product.

Protocol changes originate in Soma, propagate to claw-net as integration work
(gated by proposals/ADRs), and surface in pulse as product behavior. The repos
are deliberately separated: Soma is upstream and version-locked, claw-net is the
integration and execution point, and pulse is the downstream product consumer.

Cross-repo work follows the idea triage rule: classify by owner, require a
proposal and ADR before implementation if protocol semantics or repo boundaries
are affected, and do not mark downstream work complete while upstream
dependencies remain unresolved.

---

*This file is the source of truth for what we're building and why.
For active work, see TODO.md. For future milestones, see ROADMAP.md.*
