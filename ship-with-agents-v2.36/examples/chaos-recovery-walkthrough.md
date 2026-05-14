# Chaos Recovery Walkthrough

A fictional walkthrough of rescuing an AI-coded project that has gotten out of control.

**Scenario:** A solo builder named Sam is working on "Notely" — a personal notes API built over four sessions with Claude over the past two months. Sam came back to the project after three weeks away and can no longer tell what actually works, what was half-built and abandoned, and what the agent said was done but never actually was.

Everything in this example is fictional. Names, details, and code snippets are illustrative only.

---

## The Situation

Sam opens the repo and looks around. There is code in five different areas:

- `src/api/notes.ts` and `src/models/note.ts` — the core notes API, which Sam remembers working at some point
- `src/db/` — database connection and migrations
- `src/api/tags.ts` and `src/models/tag.ts` — a tags feature the agent built in session 2, which Sam cannot remember using
- `src/search/index.ts` — the start of a search feature from session 3 that was never finished
- `scripts/seed.js` — a seed script of unknown origin
- `src/middleware/auth.ts` — an authentication middleware the agent said was done but Sam is not sure about

There is no `AGENTS.md`. There is no README. Tests exist for the notes API but not for anything else. The commit history is a mess of "progress," "fix," "update," and "wip" messages.

Sam's first instinct is to open a work chat and ask: "Look through the codebase and tell me everything that needs to be fixed."

---

## The Anti-Pattern (What Not To Do First)

Sam tries the broad audit anyway.

**What Sam sends:**

> Read through the whole codebase and give me a list of everything that's broken or needs improvement.

**What the work chat produces:**

> Here's what I found:
>
> 1. Missing input validation in `src/api/notes.ts` (line 34)
> 2. No rate limiting on any endpoint
> 3. The tags feature has no tests
> 4. `src/search/index.ts` references `better-search-lib` which isn't in package.json
> 5. Auth middleware doesn't actually verify tokens (just logs them)
> 6. No error handling middleware
> 7. Database queries are not parameterized (potential SQL injection risk)
> 8. No CORS configuration
> 9. `scripts/seed.js` uses a hardcoded database URL
> 10. Missing indexes on the `tags` table
> 11. The `findByTag` method in `src/models/note.ts` is never called
> 12. No .env.example file
> 13. Missing pagination on GET /notes
> 14. Console.log statements left in production code
> 15. No graceful shutdown handling

Sam stares at this list. It is fifteen items long. Some of them are real problems. Some of them are nits. Item 7 may or may not be true — Sam cannot tell without checking each query. Item 11 says `findByTag` is never called, but Sam is not sure whether this is because tags are broken or because that method just has not been wired up yet.

There is no priority, no structure, and no way to tell which items would actually break users versus which are just things the agent noticed while reading. Sam has no idea where to start and, worse, no way to know if acting on all fifteen would make things better or accidentally break what is currently working.

Sam closes the chat and starts over.

---

## Step 1: Inventory First

Sam reads `CHAOS-CODE-RECOVERY-GUIDE.md` and understands the problem: "audit everything" is not a task. A task has inputs, outputs, and done criteria. A 15-item list has none of those.

The method is: **label every surface first, fix nothing during labeling.**

Sam opens a fresh work chat and sends a focused inventory prompt:

**What Sam sends:**

> I need to build an evidence ledger for this codebase. Rules for this session:
> - Read files. Do not change anything.
> - Label every major surface as one of: shipped / partial-foundation / stale / superseded / unknown.
> - Do not try to fix anything.
> - Do not guess. If you are not sure, use "unknown."
>
> Start with the top-level folders and the files that matter. For each one, give a label and two sentences of evidence.
>
> Stop after covering the top level. Wait for me to say whether to go deeper.

**What the work chat produces:**

> | Surface | Path | Label | Evidence |
> |---|---|---|---|
> | Notes API | `src/api/notes.ts` | shipped | Has route handlers for GET, POST, DELETE. Tests exist in `tests/api/notes.test.ts` and appear to pass (4 passing, 0 failing based on test file structure). |
> | Notes model | `src/models/note.ts` | shipped | Used by the notes API, has a complete-looking set of methods with parameter binding. Tested. |
> | Database layer | `src/db/` | shipped | Two migrations in `src/db/migrations/`, connection pool setup in `src/db/connection.ts`. These are called from models that appear to work. |
> | Tags feature | `src/api/tags.ts`, `src/models/tag.ts` | partial-foundation | Route handlers exist for CRUD on tags. No tests. The `note.ts` model has a `findByTag()` method that would use tags, but it is not called from any route handler. Tags exist but nothing connects notes to tags yet. |
> | Search integration | `src/search/index.ts` | stale | Imports `better-search-lib` which is not in package.json. The file exists but cannot run. No callers. Appears to be an abandoned attempt. |
> | Auth middleware | `src/middleware/auth.ts` | partial-foundation | File exists and is imported in `src/api/notes.ts`. On inspection, it only logs the Authorization header — it does not validate or reject. Any request passes through regardless of token. |
> | Seed script | `scripts/seed.js` | unknown | Contains database inserts but has a hardcoded connection string pointing to `localhost:5432/notely_dev`. Cannot tell if it was ever run against a real database or just a dev artifact. |

Sam reads this carefully. This is useful. Not a list of things to fix — a map of what exists and what it is.

---

## Step 2: Sam Updates the Evidence Ledger

Sam copies `templates/evidence-ledger.md` into the repo as `evidence-ledger.md` and fills it in from the inventory session:

```markdown
| Surface | Path | Label | Why this label | Dependents | Next action | Notes |
|---|---|---|---|---|---|---|
| Notes API | `src/api/notes.ts` | shipped | Tests pass, used in production | notes model, db layer | leave alone | do not "improve" while here |
| Notes model | `src/models/note.ts` | shipped | Used, tested, working | notes API | leave alone | findByTag() exists but is currently unused |
| DB layer | `src/db/` | shipped | Migrations ran, connection works | all models | leave alone | |
| Tags feature | `src/api/tags.ts`, `src/models/tag.ts` | partial-foundation | Routes exist, no tests, not wired to notes | notes model (partially) | finish, add tests, wire to notes | the most complete unfinished feature |
| Search | `src/search/index.ts` | stale | Broken import, no callers, not installable | none | delete in dedicated PR | confirm no remaining imports first |
| Auth middleware | `src/middleware/auth.ts` | partial-foundation | Imported but does not validate | notes API | do not touch without supervisor sign-off — security surface | this needs real review before promotion |
| Seed script | `scripts/seed.js` | unknown | Hardcoded dev DB string, unknown if ever run | ? | investigate — 15 min timebox | probably harmless, want to confirm |
```

Sam also adds a "Surfaces Still To Inventory" note: `src/config/` (a small config loader that appeared during inventory but was not fully checked). Sam schedules a follow-up.

---

## Step 3: Sam Picks One Slice

Looking at the ledger, Sam has two partial-foundation items and one unknown.

The auth middleware is tempting to fix — it is clearly wrong. But Sam makes a deliberate choice to **not** start there. Auth is a security surface. It needs careful review, probably a second set of eyes, and a clear spec for what "done" actually means. Rushing it would just swap "logs headers but does nothing" for "validates incorrectly and looks like it works."

Sam picks the **tags feature** instead. The logic for it is already there. The database table exists. All that is missing is tests and the wire-up from notes to tags. It is bounded, low-risk, and completing it will make the app genuinely more useful.

Sam makes a note in `AGENTS.md` (which did not exist and must be created first):

```markdown
## Recovery Status

Currently recovering from pre-system code. See evidence-ledger.md for surface labels.

## What Is Off-Limits Until Further Notice

- `src/middleware/auth.ts` — partial-foundation, security surface.
  Do NOT touch or "improve" without supervisor sign-off. It does not validate tokens.
  This is a known-broken item, not an invitation to rewrite it solo.
```

---

## Step 4: Sam Writes a Task Packet for the Tags Feature

Sam writes a specific task packet before opening a work chat for the promotion:

**The task packet Sam sends:**

> Here is a task packet for this session.
>
> GOAL: Promote the tags feature from partial-foundation to shipped.
>
> CURRENT STATE (from evidence ledger):
> - `src/api/tags.ts` and `src/models/tag.ts` exist with CRUD routes and model methods.
> - `src/models/note.ts` has a `findByTag()` method that is not called from any route.
> - No tests exist for tags.
>
> DONE CRITERIA:
> - Tags CRUD works: create, read, update, delete tags via API.
> - Notes can be associated with tags: POST /notes/:id/tags and GET /notes?tag=:tagId work.
> - At least two tests exist that would fail if the tags feature were removed.
> - The evidence ledger is updated to "shipped" for the tags surfaces.
>
> STOP AND ASK BEFORE:
> - Touching `src/middleware/auth.ts` for any reason.
> - Touching `src/search/` for any reason.
> - Merging any PR.
> - Deleting any file.
> - Adding any dependency.
>
> FILES IN SCOPE: `src/api/tags.ts`, `src/models/tag.ts`, `src/models/note.ts` (for findByTag wiring only), `tests/api/tags.test.ts` (new).
> FILES OUT OF SCOPE: everything else.

---

## Step 5: The Loop-Closure Session

The work chat produces changes to `src/api/tags.ts` (wires up the `findByTag` route), `src/models/note.ts` (minor update to the existing `findByTag` method signature), and a new `tests/api/tags.test.ts`.

Sam does not accept "done" on the work chat's say-so.

**What Sam does:**

1. Reads the diff. `src/api/tags.ts` has a new route `GET /notes?tag=:tagId`. Sam traces through it: routes to `findByTag` in `note.ts`, which queries the join table. Looks right.
2. Runs the tests locally: `npm test`. Two new tests in `tags.test.ts` — one passes, one fails. The failing test tries to associate a note with a tag that was just created and gets a foreign key error.

Sam sends a correction:

> One test is failing. The tag association test fails with a foreign key constraint error. Here is the output:
>
> ```
> Error: insert or update on table "note_tags" violates foreign key constraint
> Detail: Key (note_id)=(99) is not present in table "notes"
> ```
>
> The test is creating a tag and then trying to associate it with note id 99 which doesn't exist. Fix the test setup to create a real note first, then associate it.

The work chat fixes it. Sam runs the tests again: all pass. Sam reads the diff one more time and merges.

---

## Step 6: Sam Updates the Ledger and AGENTS.md

After the merge, Sam does two things before moving on.

**Update the evidence ledger:**

Sam changes the tags rows from `partial-foundation` to `shipped` and adds a promotion log entry:

```markdown
## Promotion Log

| Date | Surface | From | To | PR / commit | Note |
|---|---|---|---|---|---|
| 2026-04-16 | Tags feature | partial-foundation | shipped | #12 | tests added, note-tag wiring complete |
```

**Update AGENTS.md:**

Sam adds one operational fact:

```markdown
## Known Operational Gotchas

- Tags require a note to exist before association. Creating a tag and immediately associating it
  without a valid note_id will fail with a foreign key error. Tests must create a note first.
```

Now any future agent session starts knowing this. Sam will not have to re-discover it in a debugging session three weeks from now.

---

## What Sam Does Not Do

Sam does not:

- Ask the work chat to "also fix the search integration while we're here." The search feature is labeled stale — it gets its own PR, not a side-effect in this one.
- Touch the auth middleware. It is labeled partial-foundation with a security flag. That one gets a proper review, not a quick fix.
- Run the seed script to see what happens. It is labeled unknown. Sam schedules a 15-minute investigation and moves on.
- Update the ledger for the stale search feature just because it came up during the tags session. Ledger updates happen when something actually changes, not when it was noticed.

One slice at a time.

---

## What This Example Shows

- **The broad audit is not a task.** Sam's first instinct produced a 15-item list with no priority, no scope, and some hallucinated issues. The evidence ledger approach produced a map Sam could actually act on.
- **Pre-system code is guilty until labeled.** The auth middleware was "imported and active" — which sounds fine until the label revealed it does not actually validate anything.
- **Deferred does not mean ignored.** Sam did not fix the auth middleware, but Sam also did not pretend it was fine. The ledger and AGENTS.md both record the problem so it cannot be forgotten or accidentally shipped as-is.
- **Loop closure on the test failure.** The work chat produced a test that failed. Sam ran it, caught the failure, sent a specific correction, and confirmed the fix before merging. That is the loop.
- **One slice at a time is not slow.** Sam shipped a real feature (tags), updated repo memory (AGENTS.md), and left the codebase in a cleaner, more documented state — in one focused session.

A messy project is not unfixable. It just requires inventory before action, and one slice per PR instead of one sweep of everything.

---

## What Comes Next (For Sam)

- Delete the stale search integration in a dedicated PR (one-liner: delete `src/search/`, confirm no imports, explain in the PR description)
- Investigate the seed script (15-minute timebox: is it safe to run? does it still work? should it be documented or deleted?)
- Auth middleware review — proper, not rushed. Sam will go to the strategy chat first and define what "done" actually means for auth before any agent touches it
- `src/config/` investigation (the surface from "still to inventory")
- Once foundation is clean: new features can go through a proper task packet workflow

The project is fictional. The method is real.
