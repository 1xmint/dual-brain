# Prompt Pack

Copy-paste prompts for common workflows in AI-assisted development. Fill in the bracketed fields before sending — the blanks are where your project context goes.

Prompts are grouped by workflow and role:

- **Strategy chat** — the strategy/review chat with no file access (GPT, a second Claude instance, or similar).
- **Work chat** — the agent with hands on your repo (Claude, Codex, Cursor, or similar).

These are starting points, not scripts. Adapt them to your project. Remove sections that do not apply.

---

## 1. Starting a New Project

### Strategy chat — scope gate before first code

Run this before writing any feature code.

```
I am starting a new project. I need you to act as a scope-and-strategy reviewer, not a coder.

Project summary: [2-3 sentences on what the project does and who it is for]

Before I touch any code, I want to run a scope gate. Tell me:
1. What is the smallest slice I can ship to prove the core value?
2. What are the two or three things I should explicitly NOT build in the first version?
3. What decisions will I regret deferring until month two?

Do not write any code or file contents. I will take your answers and create a task packet for the work chat.
```

### Work chat — new project setup

Use when you want to put structure in place before writing feature code.

```
I am setting up a new software project. Before I write any feature code, I want the right structure in place.

Project: [describe the project — what it does, who it is for, the core stack]
Current state: [empty repo / has some files / has a README only]

Do the following in order:
1. Create AGENTS.md from the template at templates/AGENTS.md. Fill in everything you can infer from the project description. Leave a clear TODO: comment for anything you cannot confirm.
2. Create a skeleton README.md with the core sections. Do not invent content — use placeholder text for anything you cannot fill in yet.
3. Tell me which other templates I should copy next based on the project type.

Do not add feature code. Do not add dependencies. Stop after those three steps and report back.
```

---

## 2. Delegating Work to an Agent

### Work chat — standard task packet

Use this when handing a specific unit of work to an agent. Fill in all fields before sending.

```
Here is a task packet for this session.

GOAL: [state the outcome, not the method — e.g. "Users can log in with email and password and get a session token back"]

INPUTS:
- Files to read: [list the relevant files]
- Constraints: [things the agent must not change, APIs that must stay stable, etc.]

DONE CRITERIA:
- [what does done look like? be specific — tests pass, file exists, endpoint returns X, etc.]

STOP AND ASK BEFORE:
- Merging any PR
- Deploying or publishing anything
- Deleting any file or directory
- Changing any auth, permission, or secrets logic
- Modifying how any external service is called
- Anything that costs money or affects paying users

Do not add anything not in this task. Report back when the done criteria are met.
```

### Work chat — bounded file edit

Use when you want a precise, contained change.

```
Make one bounded change:

TARGET FILE: [file path]
CHANGE: [exact description — what to add, remove, or modify, and why]
DO NOT TOUCH: [files or areas off-limits]

Done when: [the file matches X, test Y passes, function signature looks like Z]

If the change requires touching anything outside the target file, stop and tell me before proceeding.
```

---

## 3. Loop Closure

### Work chat — verify what just happened

Use after any agent output claiming to have done something.

```
Before we move on, close the loop on what just happened.

Tell me specifically:
1. Which files were changed? (exact paths)
2. What was the before-state and after-state of each? (brief summary or diff excerpt)
3. Did any tests run? What were the results?
4. Is there anything you said you would do that you did not do?
5. Any assumptions you made that I should know about?

Do not add anything new. Just report on what just happened.
```

### Work chat — scope drift check

Use when a session is getting long or the agent seems to be adding unasked-for changes.

```
Stop and audit scope.

Original goal for this session: [paste the original task or goal]

Report:
1. What have we actually done so far? (file paths and changes)
2. Did we do anything NOT in the original goal?
3. What is still in progress?
4. What should we do next to close this session cleanly?

Do not make any more changes until I respond.
```

---

## 4. Recovery Mode (Existing Messy Project)

### Strategy chat — recovery strategy gate

Use before touching any code in a chaotic codebase.

```
I have an existing AI-coded project that has gotten messy. I need a recovery strategy before I touch anything.

Project: [what the project is]
Current state: [describe the chaos — dead code, no docs, unclear what is shipped, etc.]

I am not asking you to fix anything. I need strategy.

Tell me:
1. What is the main risk if I start changing code before I have a clear inventory?
2. What should I do in the first hour before making any code changes?
3. What is the most dangerous thing I might accidentally break or delete during cleanup?

Do not write code. This is a strategy conversation.
```

### Work chat — start an evidence ledger

Use to kick off a recovery inventory session.

```
I need to build an evidence ledger for this codebase.

Rules for this session:
- Read files. Do not change anything.
- Label every major surface (file, folder, or feature) as: shipped / partial-foundation / stale / superseded / unknown.
- Do not try to fix anything.
- Do not guess labels. If you are not sure, use "unknown."

Start with the top-level folders. For each folder, list its contents and give each item a label plus a two-sentence reason.

Output to templates/evidence-ledger.md.

Stop after covering the top-level. Wait for me to tell you whether to go deeper into any section.
```

### Work chat — promote one slice

Use after the ledger is complete and you have chosen one slice to promote to shipped.

```
I want to promote one slice from partial-foundation to shipped.

SLICE: [file path or feature name]
WHAT IS MISSING: [what the agent originally left incomplete — tests, error paths, docs, etc.]

Done criteria:
- Feature works end-to-end for the primary use case
- At least one test would fail if this slice regressed
- Docs are updated to reflect current reality
- AGENTS.md is updated if this slice introduces durable operational truth
- Evidence ledger entry updated to "shipped"

Do not touch any other slice this session. One at a time.
```

---

## 5. Chat Migration

### Work chat — generate a migration packet

Use when a work chat is getting long and you need to start fresh.

```
This chat is getting long. Before I migrate, give me a migration packet.

Include:
1. Project summary in one sentence.
2. Current workstream in one sentence.
3. What is done — list file paths and what changed.
4. What is NOT done and what to do next — be specific.
5. Decisions and constraints that still apply.
6. Open loops, traps, or unresolved questions I need to know about.

Format as a block I can paste into a new chat without losing context.
```

### New chat — onboard from migration packet

Use at the start of a fresh work chat.

```
Here is a migration packet from my previous session. Read it carefully before doing anything.

[paste migration packet here]

Before you take any action:
1. Read the files listed under "what is done" and confirm the current state matches the packet.
2. Tell me what you are going to do next.
3. Wait for me to confirm before starting.

Do not start work until I confirm.
```

---

## 6. PR Review

### Work chat — draft a PR description

Use before opening a PR.

```
Before I open the PR for this branch, draft a PR description.

Include:
1. What changed — two or three bullet points, with file paths.
2. Why — the reason for the change.
3. How to test — one sentence a reviewer could follow.
4. Edge cases or risks to flag.
5. Whether AGENTS.md needs updating.

Do not open the PR yet. Just write the description.
```

### Strategy chat — review a PR before merge

Use when you have a diff or PR description and want a second opinion.

```
I am about to merge this change. Here is the diff / PR description:

[paste diff or PR description]

Review for:
1. Scope creep — does this do more than one thing?
2. Risks I might be underestimating.
3. Anything that should go in a follow-up PR instead.
4. Whether the description matches what actually changed.

Do not approve or reject. Flag concerns and I will decide.
```

---

## 7. AGENTS.md Setup

### Work chat — fill in AGENTS.md from existing code

Use when a project exists but has no repo memory file.

```
I need to fill in AGENTS.md for this project using templates/AGENTS.md as the starting point.

Read these files to understand the project:
[list key files — README, main config, entry points, CI workflow]

Fill in as much of the template as you can confirm from the code. Mark anything you cannot confirm as "TODO — fill in manually."

Do not invent anything. If you find the answer in the code, write it. If you do not, leave a clear TODO.

After filling in the template, tell me:
1. Which fields you filled in with confidence.
2. Which fields you left as TODO and why.
3. Any questions the template raised that suggest I should document something I have not yet documented.
```

---

## 8. Deploy Gate

### Work chat — pre-deploy report

Use before triggering any deploy.

```
Before I trigger the deploy, run a pre-deploy check.

Report:
1. What changed since the last known-good deploy? (file list)
2. Are any tests currently failing?
3. Does anything in the diff touch security, secrets, auth, or user data?
4. Is the current branch up to date with main?
5. Is there anything to watch in logs or monitoring immediately after deploy?

Do not trigger the deploy. This is a report only.
```

### Strategy chat — deploy decision gate

Use when you are uncertain whether to deploy.

```
I am deciding whether to deploy a change. Summary:

[paste change summary or diff]

Give me a go / no-go recommendation based on:
1. Is the scope of the change clear and bounded?
2. Are there obvious rollback concerns?
3. Is there anything here that warrants a staged rollout or test deploy first?

This is not a security audit. I want a second opinion on timing and risk before I push the button.
```

---

## Orchestration Prompts

The `orchestration/` folder contains structured durable prompts for a full multi-layer agent system — super (supervisor), agent, worker, and idea chat — with structured handoffs, checkpoints, and scope guarding. If you need prompts beyond the single-chat workflows in this file, start with `orchestration/QUICK-START.md`.

## Prompt Hygiene

A few habits that make prompts work better:

1. **One thing at a time.** A prompt that asks for five things gets five shallow answers. Ask for one and confirm before continuing.
2. **State done criteria.** Without it, the agent decides what done looks like. You will usually not like what it decides.
3. **Include a stop-and-ask list.** Without it, the agent will proceed past the point you wanted it to stop.
4. **Fill in the blanks before sending.** Prompts left with `[placeholder]` text produce off-target responses.
5. **Migrate before the chat gets unreliable.** Context decays. Use the migration prompts above before quality drops, not after.
6. **Do not use the work chat for strategy.** If you find yourself making product, scope, or direction decisions inside a work chat, move those to the strategy chat first.
