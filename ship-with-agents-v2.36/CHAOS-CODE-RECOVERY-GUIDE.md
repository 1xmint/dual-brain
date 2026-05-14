# Chaos Code Recovery Guide

How to rescue an existing AI-coded project without starting over and without wasting a week on a doomed "audit everything" sweep.

This guide is for anyone staring at a repo that Claude, Codex, Cursor, ChatGPT, or a previous agent helped generate — and who has lost track of what is real, what is half-built, and what is dead weight.

## The Core Idea

You do not need to understand every file in your repo to make progress. You need to **label** every file honestly, then promote or replace one slice at a time.

The fastest way to waste a week is to ask an agent to "audit the codebase and tell me what to fix." You will get a 40-item list, most of it wrong, and you will not be closer to shipping.

The slow-looking but fast-working method is: inventory first, work second.

## Vocabulary You Need

Use these labels. Do not invent synonyms.

- **Shipped.** This surface works, is used, and is trusted. You would defend keeping it.
- **Partial-foundation.** This surface is half-built but worth finishing. It has enough of the right shape that it will become real with scoped work.
- **Stale.** Written at some point, not currently used, not worth finishing. A candidate for deletion.
- **Superseded.** Replaced by something newer. Keep as reference if useful, otherwise archive.
- **Unknown.** You cannot tell yet. Do not guess. Investigate later.

Every file, folder, or feature in the recovery area should end up in exactly one of these buckets.

The key move is distinguishing *shipped* from *partial-foundation*. Partial-foundation is the honest label for "the agent gave me something that looks finished but is not." Calling it shipped is a lie. Calling it stale throws away work. Call it what it is.

## Pre-System Code

Everything written before you had:

- a clean `AGENTS.md`,
- a proposal / ADR habit,
- PR discipline,
- a two-chat agent workflow,

is **pre-system code**. Pre-system code is not evil. It just was not produced under a system that tracks what is real.

Treat pre-system code as guilty until labeled. It gets the benefit of inspection, not the benefit of the doubt.

## Why Broad Audits Fail

When you ask an agent to "go through the whole codebase and tell me what's wrong," you get:

- a long list of style nits;
- a few real bugs mixed in;
- confident claims about functions it did not actually read;
- invented file paths;
- no structure for acting on any of it.

The problem is not that the agent is stupid. The problem is that "audit everything" is not a task. It is a mood. Tasks have inputs, outputs, and done criteria. Audits of this shape have none of those.

Instead, do two things in sequence: **inventory** (covered next), then **one slice at a time** (covered after that).

## The Evidence Ledger

An evidence ledger is a single document that labels every major surface of the repo. It is cheap to produce and pays for itself within one session of cleanup work.

Use `templates/evidence-ledger.md`.

### What to include

For each surface (file, folder, feature, or workflow), record:

- **path** — where it lives;
- **label** — shipped / partial-foundation / stale / superseded / unknown;
- **why this label** — two sentences of evidence (git log, tests, references, observed behavior);
- **dependents** — what else in the repo touches this;
- **next action** — keep, finish, replace, delete, archive, investigate;
- **notes** — anything the next agent or the next-you needs to know.

### How to produce it

1. List the top-level folders. For each, list the first level of contents that matters.
2. For each entry, ask: is this called from anywhere? Are there tests? When was it last changed? Does it match current product direction?
3. Assign a label. Prefer **unknown** over a guess. Unknown is a feature, not a failure.
4. Move on. Do not fix anything yet.

Rule: the ledger is write-only during inventory. Fixes come later.

### When to stop inventorying

Stop when:

- every top-level folder has been listed;
- every surface that exists in the runtime path is labeled;
- remaining unknowns are genuinely unknown, not "I'm tired."

You do not need every file labeled. You need every *surface* labeled.

## One Slice At A Time

Once the ledger exists, do not fix everything. Pick one slice.

A **slice** is a single surface small enough to finish in one or two focused sessions: one feature, one module, one page, one workflow.

### Decide what to do with the slice

Based on its label:

- **shipped:** leave alone. Do not "improve" it just because you are here.
- **partial-foundation:** promote it to shipped. This usually means finishing the missing pieces, adding tests, writing the one doc that was missing, and making the boundaries match what the rest of the repo expects.
- **stale:** delete it, in a PR that explains why.
- **superseded:** move it to an `archive/` folder or delete it, depending on whether it is worth keeping as reference.
- **unknown:** investigate just that slice. Upgrade its label. Then act.

### How to promote partial-foundation to shipped

Each promotion should produce one small PR that:

1. writes or updates the doc that describes the slice (in plain language);
2. adds the minimum tests that would fail if the slice regressed;
3. closes the gaps the agent originally left (error cases, cleanup paths, missing branches);
4. updates `AGENTS.md` if the slice introduces any durable operational truth;
5. leaves the slice labeled **shipped** in the ledger.

If you cannot finish those five steps inside the PR, the slice is not ready to promote. Return it to partial-foundation and try a smaller scope next time.

### How to retire stale / superseded code

One PR per retirement when possible. Explain in the PR description:

- what is being removed;
- what label it had and why;
- what used to call it and what calls it now (or "nothing");
- how you confirmed nothing important depends on it.

Retirements are easier to review than promotions. Keep them small and obvious.

## Order Of Operations

If you have both shipped-ish work and piles of unknown/stale code, work in this order:

1. **Label everything.** Ledger first, always.
2. **Retire obvious dead weight.** Stale and superseded code that has no dependents. This reduces noise and makes the next steps clearer.
3. **Add missing foundations.** If `AGENTS.md`, README, or basic CI do not exist, add them before touching feature code. The agent needs the system in place to do useful work.
4. **Promote the slice that matters most to the product.** Whichever partial-foundation surface is closest to the money / users.
5. **Repeat** with the next slice.
6. **Re-label.** Ledgers drift. Update it as you go. If you touched a surface, confirm its label is still right.

## When To Stop And Ask

During recovery, the agent must stop and wait for you when any of these appear:

- **Strategy questions.** "Should this product do X?" belongs to you and the strategy chat, not to the work chat. Stop.
- **Repo boundaries.** "Should this live in a different repo?" — stop, this is an architecture decision.
- **Security surfaces.** Auth, secrets, permissions, rate-limiting, input validation, user data handling — stop. Do not let an agent rewrite these alone.
- **Migrations.** Any change that touches real user data or existing rows — stop.
- **Deletions at scale.** Removing more than one slice in a single PR — stop. One slice at a time means one slice.
- **Anything pricing, contracts, licensing, legal.** Stop immediately. These are not agent work.
- **"This probably works."** If the agent is not sure, that is a stop. Unknown-to-the-agent needs to become known-to-you before you proceed.

Put this list in `AGENTS.md` so the rule is durable, not remembered.

## Anti-Patterns To Avoid

- **"Audit the whole repo."** See above. Not a task.
- **Promoting a slice without tests.** Then it is still partial-foundation, with a nicer hat.
- **Deleting code you do not understand.** Investigate first, even briefly. The ledger exists so this is cheap.
- **Fixing the architecture during a slice promotion.** Architecture changes are their own PRs, with their own ADRs. Do not sneak them in.
- **Trusting the agent's "nothing depends on this."** Verify with a grep or a build. Dependents get missed.
- **Treating the ledger as done once.** It is a living document. Update it as slices move through states.

## Salvage Before Restart

If the repo state is wrong, stale, partially recovered, or clearly off the
intended workflow lane, do not jump straight to "start over."

First classify the situation:

- **Invalid state.** The current workspace cannot be trusted as-is.
- **Recoverable work.** Some files, commits, diffs, or slices may still be
  worth preserving.
- **Unrecoverable work.** The state is too broken, too unclear, or too
  contaminated to salvage safely.

Then choose the least wasteful recovery path:

1. **Transfer recovered work.**
   - copy or diff valid files into the correct repo/branch
   - preserve known-good work before rebuilding process around it
2. **Partially replay work.**
   - keep the useful design or implementation shape
   - rebuild only the uncertain parts in a clean lane
3. **Full restart.**
   - use this only after the salvage check fails or the work is genuinely not
     trustworthy

Wrong state does not automatically mean worthless work.
Salvage first. Restart second.

## What Good Recovery Looks Like

A week after you start:

- the ledger exists and covers every surface that matters;
- a chunk of obvious dead code is gone;
- `AGENTS.md` and the basic docs exist;
- one or two real slices have been promoted to shipped with tests and docs;
- the repo looks smaller and clearer than it did, even if the line count is barely different;
- you know, without opening a file, what state each major surface is in.

That is what "under control" looks like. You are not done. You are no longer drowning.

## One-Page Summary

- Label every surface: shipped / partial-foundation / stale / superseded / unknown.
- Pre-system code is guilty until labeled.
- Use an evidence ledger. Do not fix during inventory.
- Do not run broad audits. Do one slice at a time.
- Promote partial-foundation to shipped only with tests, docs, and closed gaps.
- Retire stale and superseded code in small explicit PRs.
- Stop and ask on strategy, security, migrations, deletions at scale, and "probably works."
- The goal is a repo where you know the state of every surface, not a repo that is perfect.

You can recover even a very messy AI-coded project this way. It will not be glamorous. It will work.
