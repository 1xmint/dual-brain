# Agent Workflow Guide

How to use Claude (or any primary coding agent) alongside a strategy chat
without letting your project turn into chat-history soup.

This guide is written for solo builders and small teams. It is practical, not
academic. If you are not already using two separate chats, you will be by the
end of this document.

## The Core Idea

There are two jobs an AI can do in a software project, and they fight each
other:

1. **Work.** Read files, edit code, write docs, open PRs, follow instructions
   carefully.
2. **Strategy.** Decide what to build, question scope, review direction, do
   research gates, catch when the work is heading somewhere wrong.

If one chat tries to do both, it will drift. It will talk itself out of scope,
accumulate half-finished ideas, and forget what shipped versus what was
suggested. The fix is mechanical: use two chats.

- **Work chat.** Hands on the repo. Reads real files. Writes real edits. Owns
  implementation.
- **Strategy chat.** No hands. Reads summaries, challenges direction, guards
  scope, runs research gates. Owns strategy.
- **You.** The only entity allowed to make decisions that cross between the
  two. You own the loop.

You do not need GPT specifically. Any second, separate chat works. Strategy chat
is a role, not a brand.

The strongest version of this pattern is not just "strategy plus execution."
It is "execution plus independent challenge before closeout."

## Lightweight First, Orchestration Later

Most users should start with the lightest workflow that honestly fits the job.

For many repos, this is enough:

- `AGENTS.md`
- one execution chat
- one strategy/review chat
- task packets and migration packets as needed

You do not need to install the full `orchestration/` system on day one just
because it ships in the package.

Move to orchestration when:

- multiple workstreams need routing
- handoffs between chats are frequent and messy
- one strategy chat plus one work chat stops being enough
- you need layered ownership, checkpoints, or more durable migrations

## Why One Chat Is Not Enough

A single chat running both roles will, sooner or later:

- lose track of which files are canonical and which were proposed
- invent progress without verifying
- add features you did not ask for
- forget a constraint you stated hours earlier
- answer a strategy question with more code instead of with a decision

Splitting the roles gives each chat a cleaner job and gives you a place to
stand when they disagree.

For important work, the stronger pattern is:

- execution chat builds
- strategy/review chat shapes and critiques
- an audit chat pressure-tests the result before closure

## The Three Chat Shapes

Use whichever you need for the work you are doing. You do not always need all
three.

### 1. Idea chat

For: brainstorming, exploring a concept, thinking out loud, comparing options.

Rules:

- no code edits
- no file reads
- output is ideas, tradeoffs, and open questions
- findings get distilled into a proposal before any work chat sees them

### 2. Strategy chat

For: reviewing work output, guarding scope, doing research gates, turning
proposals into task packets.

Rules:

- reads plans, summaries, diffs, and reports
- does not get treated as the source of repo truth
- does not execute code
- pushes back when scope creeps
- owns research that needs the open web

### 3. Work chat

For: the actual build.

Rules:

- reads real files from the repo
- makes real edits
- asks before merge, deploy, force push, delete, secret rotation, SSH change,
  or anything touching production
- reports back in small loops
- never invents facts about the repo

### 4. Audit chat

For: independent challenge before closeout on quality-sensitive work.

Rules:

- does not execute code
- reviews the result of the work chat and the judgment of the review layer
- asks what may still be weird, unsafe, fragile, or off-architecture
- can force one more refinement loop before the work is treated as done

## Loop Closure

A **loop** is one round of: you give instruction, the agent acts, you check the
result, you accept or correct.

A loop is **closed** when you have actually checked the result.

Rule: close every loop before opening the next.

Symptoms of open loops:

- half-finished work from old sessions
- the agent refers to prior work you cannot find
- tests fail for reasons nobody remembers introducing
- the agent confidently says "done" about something that was not done

Do not accept "done" alone as proof.

## Research Ownership

Research is where work chats cause the most damage, because they confidently
invent URLs, versions, prices, and APIs.

**Research that belongs to the strategy chat and you:**

- market, pricing, and positioning
- framework choice
- library maintenance status
- security or standards questions
- current external docs, specs, or vendor facts

**Research that belongs to the work chat:**

- what a repo file currently contains
- what a local test failed with
- what imports a module uses
- what a local error log says

The work chat is allowed to read files and run local commands. It is not your
source of truth about the outside world.

## Migration Packets

When a chat gets long, it gets worse.

You will notice:

- context starts to decay
- earlier instructions get forgotten
- the agent repeats prior steps
- outputs get longer and less useful

Rule: when a chat starts to rot, migrate. Do not push through.

Use `templates/chat-migration-packet.md`.

## Task Packets

A **task packet** is a single-purpose instruction, small enough to finish in
one loop.

Use `templates/task-packet.md`.

A good task packet has:

- a clear goal
- concrete inputs
- clear done criteria
- an explicit stop-and-ask list

## When The Agent Must Stop And Ask

The agent must pause and wait for you before:

- merging a PR
- deploying or publishing
- force-pushing
- deleting files, branches, tags, or database rows
- rotating secrets or keys
- any SSH change
- any database migration against real data
- any change to paying-customer surfaces
- any strategy, product, pricing, legal, or compliance decision
- any security-boundary decision
- any step where the agent is unsure whether the prior step really worked

Put this list in `AGENTS.md` so the rule is durable.

## Hybrid Setup Truth

If you are using Claude plus GPT plus a local model, keep the roles strict:

- GPT/Desktop = strategy, review, pressure-testing
- Claude Code or your main coding tool = primary execution
- local model = bounded, cheap, or private helper unless proven stronger

Do not run all three as interchangeable lead brains.

## True Dual-Brain Mode

If you have two strong subscriptions or two genuinely useful review tools,
there is a stronger optional pattern:

- execution brain does the work
- supervisory review brain deeply reviews the workstream
- independent second brain challenges that review before closeout

That is the premium-quality mode. It is optional. Use it when quality,
safety, or architecture fit matter enough that one review loop is not enough.

## Team Onboarding (2-5 People)

Working with a small team or a first-time collaborator?

Start with repo-local truth first:

- `START-HERE.md`
- this guide
- `templates/AGENTS.md`
- whatever core docs the repo actually needs

For many teams, that is enough. A collaborator using Aider, Codex, Cursor,
Windsurf, or a local model often does not need the full orchestration system on
day one. Use `LIGHTWEIGHT-COLLABORATION-GUIDE.md` when the collaborator is
bounded and the workflow is still simple.

Move to `orchestration/` only when the work really needs multi-layer routing.

## Advanced: Multi-Layer Orchestration

If your workflows involve multiple workstreams, cross-repo coordination, or you
want automated scope guarding, checkpoints, and layered chat roles, see
`orchestration/HOW-IT-WORKS.md`.

It builds on the two-chat method described here. It is an escalation path, not
the default starting point for every buyer or every collaborator.

For the strongest expression of the optional audited review loop, also read
`orchestration/DUAL-BRAIN-MODE.md`.
