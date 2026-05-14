# New Project Walkthrough

A fictional walkthrough of setting up an AI-assisted software project from scratch.

**Scenario:** A solo builder named Alex is building "Tasker" — a simple task management API with a web front end. Alex can write prompts and understands enough code to review it but has never set up a project with proper repo structure before.

Everything in this example is fictional. Names, details, and code snippets are illustrative only.

---

## Day One: Before Any Code

### Step 1: Alex opens a strategy chat

Alex is about to start building. Instead of asking Claude to "build me a task manager," Alex opens a strategy chat (a separate GPT or second Claude instance) and runs a scope gate.

**What Alex sends:**

> I'm starting a new project. I need you to act as a scope-and-strategy reviewer, not a coder.
>
> Project: A simple task management API with a web front end. Solo project. Tech stack is Node.js, Express, PostgreSQL, and a plain HTML/JS front end to start.
>
> Before I write any code, I want a scope gate. Tell me:
> 1. What is the smallest slice I can ship to prove the core value?
> 2. What should I explicitly NOT build in the first version?
> 3. What decisions will I regret deferring until month two?

**What the strategy chat answers:**

> Smallest slice: create a task, read a list of tasks, mark a task done. No authentication, no teams, no tagging — just those three operations working end-to-end.
>
> Do NOT build in v1: user accounts, teams, real-time updates, tagging, priority levels, recurring tasks.
>
> Do not defer: the data model for tasks (if you get this wrong, migrations are painful). Decide now whether a task is "done/not done" or "has multiple states." Also decide your deploy model before you have users on a server — it is much harder to retrofit.

Alex makes a note: v1 = create, list, complete. No auth, no teams. Decide states and deploy model today.

---

### Step 2: Alex sets up the repo

Alex creates a new GitHub repo called `tasker-api`. Then opens a work chat (Claude) and runs the new project setup prompt:

**What Alex sends:**

> I am setting up a new software project. Before I write any feature code, I want the right structure in place.
>
> Project: A task management API. Node.js + Express backend, PostgreSQL database, plain HTML/JS front end. Deployed to a $5 VPS. Solo project.
> Current state: empty repo, just a blank GitHub repo.
>
> Do the following in order:
> 1. Create AGENTS.md from templates/AGENTS.md. Fill in what you can from the description. Leave TODO for the rest.
> 2. Create a skeleton README.md with the core sections. Use placeholder text for anything you cannot fill in yet.
> 3. Tell me which other templates I should copy next.
>
> Do not add feature code. Do not add dependencies. Report back after those three steps.

**What the work chat produces:**

It creates `AGENTS.md` with:
- trunk branch: `main`
- canonical remote: `origin` (GitHub)
- merge convention: squash and merge
- stop-and-ask list: populated from the template defaults
- several TODOs marked: deploy workflow name (not yet decided), VPS path (not yet provisioned), known gotchas (none yet)

It creates `README.md` with sections for: what it is, how to run locally, how to deploy (placeholder), links to guides.

It recommends copying: `ARCHITECTURE.md` (because it has a database and a front end), `SECURITY.md` (because it will eventually handle user data), and `templates/task-packet.md` for future work sessions.

**Alex's review:**

Alex reads the `AGENTS.md` output carefully. Two of the TODOs are fillable now: Alex knows the VPS will be a DigitalOcean droplet and that deploys will use GitHub Actions. Alex fills those in and commits.

---

### Step 3: Alex copies the architecture template

Alex copies `templates/ARCHITECTURE.md` into the repo and fills in the blanks:

```markdown
# Tasker Architecture

## What This Repo Owns

- REST API (Express + Node.js)
- PostgreSQL schema and migrations
- Static HTML/JS front end (no build step)

## What This Repo Does Not Own

- Database hosting (external, managed by DigitalOcean)
- CDN or static file hosting (served by the Express app in v1)

## Main Components

- `src/api/` — route handlers
- `src/db/` — database connection and query helpers
- `src/models/` — task data model and validation
- `public/` — static front end

## Data Flow

Browser → Express → PostgreSQL → Express → Browser
```

Alex commits this. The repo now has three files that give any future agent (or future-Alex) a clear picture of what the project is before opening a single source file.

---

## Day Two: First Feature

### Step 4: Alex writes a task packet

Alex wants to build the first API endpoint: `POST /tasks` to create a task. Alex writes a task packet before going to the work chat.

**The task packet Alex sends to the work chat:**

> Here is a task packet for this session.
>
> GOAL: A POST /tasks endpoint exists. It accepts { title: string } in the request body, writes a row to a `tasks` table in PostgreSQL, and returns the created task as JSON with { id, title, done: false, created_at }.
>
> INPUTS:
> - Files to read: src/api/, src/db/, src/models/ (all currently empty scaffolding)
> - Constraints: use pg (postgres npm package), not an ORM. Keep it simple.
>
> DONE CRITERIA:
> - The endpoint exists at POST /tasks
> - Sending { "title": "Buy groceries" } returns { id: 1, title: "Buy groceries", done: false, created_at: "..." }
> - There is at least one test that would fail if the endpoint were removed
>
> STOP AND ASK BEFORE:
> - Merging any PR
> - Adding any dependency not already listed
> - Changing the database schema after creating it
> - Adding any endpoint not described in this packet
>
> Do not build GET /tasks or DELETE /tasks yet. That is a separate session.

**What the work chat produces:**

It creates `src/models/task.ts`, `src/db/connection.ts`, `src/api/tasks.ts`, a migration file, and a test file. It reports back with a specific file list and confirms the endpoint exists.

**Alex's loop closure:**

Alex reads the diff. The endpoint looks right. Alex runs the test locally to confirm. One test fails — the work chat used a slightly wrong response shape (`createdAt` instead of `created_at`). Alex sends a one-line correction task. Loop closed on the second round.

---

### Step 5: Alex opens a PR

Alex pushes the branch and asks the work chat to draft a PR description:

> Draft a PR description for this branch before I open the PR.
>
> Include: what changed, why, how to test, edge cases or risks.

The work chat produces:

> **feat: add POST /tasks endpoint**
>
> **What changed:**
> - `src/models/task.ts` — Task model with create() method
> - `src/db/connection.ts` — pg pool initialization
> - `src/api/tasks.ts` — POST /tasks route handler
> - `migrations/001_create_tasks.sql` — initial schema
> - `tests/api/tasks.test.ts` — two tests covering happy path and missing title
>
> **Why:** First working API endpoint. Unblocks the front end and the GET /tasks endpoint.
>
> **How to test:** Run `npm test`. Tests use a local test database. See README for setup.
>
> **Risks:** Migration must be run before the endpoint works. Not handled automatically in v1 — document in OPERATIONS.md.

Alex reads this and agrees. Alex opens the PR using `gh pr create`. CI runs, both tests pass. Alex reviews the diff one more time, then merges via squash.

---

### Step 6: Alex updates AGENTS.md

After the first real feature is shipped, Alex adds one line to `AGENTS.md`:

```
## Known Operational Gotchas

- Database migrations are manual. Run migrations/xxx.sql before deploying any change that adds a table or column.
```

This means every future agent session starts with that fact visible instead of re-discovering it.

---

## What This Example Shows

- **Scope gate before code.** Alex used the strategy chat to define v1 boundaries before touching a file. This prevents scope creep on day one.
- **Structure before features.** AGENTS.md, README, and ARCHITECTURE all existed before the first endpoint. Any future session has context without re-reading the codebase.
- **Task packets.** The "POST /tasks" task was scoped, had done criteria, and had a stop-and-ask list. The agent did not add GET /tasks because it was not in the packet.
- **Loop closure.** The response shape bug was caught in the same session because Alex actually ran the test, not just read the agent's report.
- **PR description before merge.** Alex read the diff and confirmed the PR description matched reality before merging.

None of this took long. The AGENTS.md took ten minutes. The task packet took five. The loop closure took two. The habits are the payoff.

---

## What Comes Next (For Alex)

- GET /tasks endpoint (a new task packet, separate session)
- PATCH /tasks/:id/done (same)
- Static front end that calls the API (same pattern)
- VPS setup before first deploy (see `VPS-SSH-TAILSCALE-GUIDE.md`)
- CI/deploy workflow before first public release (see `GITHUB-PR-CI-DEPLOY-GUIDE.md`)
- SECURITY.md filled in when user data is introduced

Each step follows the same pattern: scope gate → task packet → loop closure → PR → merge.

The project is fictional. The workflow is real.
