# Checklists

Runnable checklists for common situations. Copy the relevant one into a task, doc, or chat and work through it.

These are starting points. Add or remove items based on your project.

---

## 1. New Project Setup

Run this when starting a fresh project before writing any feature code.

### Repo and docs

- [ ] New GitHub repo created
- [ ] `README.md` created: what the project is, who it is for, how to start
- [ ] `AGENTS.md` created from `templates/AGENTS.md`: trunk branch, canonical remote, merge convention, stop-and-ask list
- [ ] `ARCHITECTURE.md` created from template: main components, data flow, known boundaries
- [ ] `ROADMAP.md` created from template: current focus, near-term priorities, what we are NOT building first

### GitHub settings

- [ ] Default branch set (`main` or your chosen trunk)
- [ ] Branch protection enabled on trunk: require PR, require CI, require up-to-date, no force push, no deletions
- [ ] Auto-merge enabled at repo level
- [ ] GitHub security features enabled: Dependabot alerts, secret scanning, vulnerability reporting
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` added

### CI

- [ ] `.github/workflows/ci.yml` created: install, lint, test
- [ ] CI tested with a real push — it ran and passed
- [ ] GitHub Actions pinned to commit SHAs (not just version tags)

### Smoke test

- [ ] Opened a branch, made a trivial change, opened a PR
- [ ] CI ran and passed on the PR
- [ ] PR blocked merge until CI was green (confirms branch protection is actually in effect)
- [ ] Merged via squash merge

---

## 2. Agent Workflow Setup

Run this before starting regular AI-assisted development on a project.

- [ ] `AGENTS.md` exists and answers: trunk branch, canonical remote, merge convention, auto-merge rule, deploy workflow name, SSH/access truth, known operational gotchas
- [ ] Stop-and-ask list is in `AGENTS.md`: covers merge, deploy, force push, delete, secret change, SSH change, strategy/security/pricing
- [ ] You have a designated strategy chat (separate from the work chat — no file access, used for strategy and scope guard)
- [ ] You have a designated work chat (Claude, Codex, Cursor, or similar — has file access)
- [ ] `templates/task-packet.md` available to copy for each unit of work
- [ ] `templates/chat-migration-packet.md` available for when the chat gets long
- [ ] You have closed at least one loop: gave the work chat a task, checked what it did, explicitly confirmed before moving on

---

## 3. VPS First Setup

Run this before treating a server as production-ready or giving an agent any SSH access.

- [ ] Non-root admin user created
- [ ] Key-based SSH auth working from local machine
- [ ] Key auth tested in a second terminal before disabling password auth
- [ ] Root login disabled (`PermitRootLogin no`)
- [ ] Password auth disabled (`PasswordAuthentication no`)
- [ ] Firewall configured: default deny, explicit allow for SSH and app ports only
- [ ] SSH tested in a second terminal after each lockdown step
- [ ] (If Tailscale) Tailscale installed on server and local machine, SSH tested via Tailscale hostname
- [ ] (If Tailscale) Public SSH port closed after Tailscale access confirmed working
- [ ] Separate `deploy-user` created (no sudo) for CI and agent deploys
- [ ] Deploy SSH key added to `deploy-user` only
- [ ] Agent deploy rules written in `AGENTS.md`: what it may and may not do, which account it uses

---

## 4. Pre-Merge Checklist

Run before merging any non-trivial PR. Also in `templates/PR-readiness-checklist.md`.

- [ ] CI is green on the PR branch
- [ ] Branch is up to date with trunk
- [ ] You have read the diff yourself (not just "the agent said it is ready")
- [ ] The PR does one logical thing
- [ ] New user-facing behavior: you have tested it yourself, not just read the agent's description
- [ ] Any security logic (auth, permissions, secrets, input handling): a second set of eyes has seen it
- [ ] `AGENTS.md` updated if this change introduces new workflow rules or operational truth
- [ ] No debug code or commented-out logic left in
- [ ] No secrets, `.env` content, or private paths in the diff

---

## 5. Pre-Deploy Checklist

Run before triggering any production deploy.

- [ ] CI is green on the branch being deployed
- [ ] You know exactly what changed since the last deploy (reviewed diff or PR history)
- [ ] If any secrets or env vars changed: live server `.env` has been updated first
- [ ] If there are database migrations: migration plan and rollback path are understood
- [ ] If the change touches auth, permissions, or user data: explicitly reviewed before deploying
- [ ] Someone will watch logs/monitoring for 10-15 minutes after deploy
- [ ] You know how to roll back if something goes wrong: which commit, which command, which workflow

---

## 6. Existing Chaotic Codebase (Pre-Recovery)

Run this before touching any code in a messy AI-coded project.

### Inventory first

- [ ] Evidence ledger created using `templates/evidence-ledger.md`
- [ ] Every top-level folder is in the ledger with a label (shipped / partial-foundation / stale / superseded / unknown)
- [ ] Every surface that exists in the runtime path is labeled
- [ ] No code has been changed during this phase

### Foundation before features

- [ ] `AGENTS.md` exists (create from template if missing)
- [ ] README is accurate (not a generated placeholder still describing a hypothetical)
- [ ] Basic CI exists and passes
- [ ] You know which branch is the actual live trunk

### Recovery readiness

- [ ] One slice selected for promotion (not five at once)
- [ ] That slice has a clear label in the evidence ledger
- [ ] Done criteria are defined: tests, docs, closed gaps
- [ ] Strategy chat is aware of the recovery plan
- [ ] Work chat has a focused task packet for the slice — not an open-ended "audit everything" instruction

---

## 7. Weekly Repo Health Check

Run once a week during active development.

- [ ] `AGENTS.md` still accurate? (branch, remote, paths, deploy rules)
- [ ] Any open PRs older than a week? Close, merge, or explain the delay.
- [ ] Any failing CI that has been silently ignored? Fix or explicitly defer.
- [ ] Any feature the agent claimed was "done" that you have not tested yourself?
- [ ] Any secrets or env vars manually added to the live server but not documented?
- [ ] Any evidence ledger surfaces that changed state and should be updated?
- [ ] Any decisions made in chat that should be in an ADR, proposal, or `AGENTS.md` instead?

---

## 8. Pack Setup (First Use)

If you just received this pack and want to apply it to a real project, follow this order:

- [ ] Read `START-HERE.md`
- [ ] Read `AGENT-WORKFLOW-GUIDE.md`
- [ ] Copy `templates/AGENTS.md` into your project repo and fill it in
- [ ] Set up two chats (work + strategy) and run one real task through the full loop
- [ ] Copy any other templates you need (ARCHITECTURE, SECURITY, ROADMAP) — skip what you will not actually use
- [ ] If you have an existing messy project: run **Checklist 6 — Existing Chaotic Codebase** above
- [ ] If you are setting up a VPS for the first time: run **Checklist 3 — VPS First Setup** above
- [ ] If you are setting up CI/deploy from scratch: run **Checklist 1 — New Project Setup** above
- [ ] Skim `ADVANCED_REPO_OPERATIONS_PLAYBOOK.md` once for orientation; return to it section by section as specific needs arise
