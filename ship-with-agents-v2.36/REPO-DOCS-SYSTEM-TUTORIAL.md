# Repo Docs System Tutorial

How to make a repo feel clear, modern, fast to onboard into, and hard to misunderstand.

This tutorial is a reusable system you can paste into a new project repo or share with other teams. It is designed for product repos, protocol repos, tools, internal platforms, and fast-moving agent/code projects.

## What Problem This Solves

Most repos rot in the same way:

- the README tries to do everything
- architecture docs mix shipped truth, ideas, and history
- old plans stay next to current rules
- repo boundaries get blurry
- new contributors cannot tell what is real
- good ideas get deleted or preserved in the wrong place

The goal of this system is:

- faster onboarding
- stronger delegation
- less architectural drift
- fewer duplicate truths
- easier AI-agent and human collaboration

## Core Principles

### 1. One repo, one role

Every repo needs a one-sentence identity.

Examples:

- "This repo is the production orchestration platform."
- "This repo is the canonical protocol/spec repo."
- "This repo is the X.com marketing product built on the platform."

If you cannot say what the repo is in one sentence, the repo boundary is probably weak.

### 2. README is the front door, not the whole building

The README should answer:

- what this repo is
- who it is for
- how to start
- where the real docs live

It should not try to contain the entire architecture, roadmap, runbook, and design philosophy.

### 3. Separate current truth from future ideas

You need three lanes:

- `canonical`: true now
- `proposed`: serious future candidate
- `archived`: worth keeping, not current truth

Without this split, teams either:

- preserve too much in canonical docs
- or delete useful thinking during cleanup

### 4. Name docs by function, not by vibe

Bad:

- `spine.md`
- `master-plan.md`
- `thoughts.md`
- `architecture.md` when it is really a roadmap + rationale + config reference

Good:

- `overview.md`
- `context.md`
- `runtime.md`
- `billing.md`
- `release.md`
- `spec-index.md`
- `proposal-*.md`

### 5. Record decisions separately from explanations

Architecture docs explain structure.

Decision records explain why a choice was made.

Reference docs state facts.

How-to docs explain how to do tasks.

Do not dump all four into one file.

## Recommended Repo Structure

Use this as the default:

```text
repo/
  README.md
  AGENTS.md
  .github/
    CODEOWNERS
    PULL_REQUEST_TEMPLATE.md
    ISSUE_TEMPLATE/
      bug-report.md
      proposal.md
      docs-change.md
      config.yml
  docs/
    overview.md
    architecture/
      context.md
      runtime.md              # or product-model.md, containers.md, etc.
    decisions/
      README.md
      ADR-0001-*.md
    reference/
      README.md
      config.md
      api.md
      packages.md
      spec-index.md
    how-to/
      local-dev.md
      release.md
    explanation/
      vision.md
      security-model.md
    operations/
      deploy.md
      runbook.md
      recovery.md
    proposals/
      README.md
      some-future-design.md
    archive/
      README.md
      old-design.md
```

You do not need every file in every repo.

Examples:

- a protocol repo may need `reference/`, `explanation/`, and `proposals/` more than `operations/`
- a production app repo may need `operations/` and `how-to/` more than `vision.md`

## What Each Top-Level Doc Should Do

### `README.md`

Use for:

- repo identity
- quick start
- doc map
- core boundaries

Do not use for:

- full runbooks
- full architecture deep dives
- speculative plans

### `AGENTS.md`

Use for:

- repo memory
- branch/release/deploy truth
- non-negotiable workflow rules
- stack constraints

This is the repo-operating memory file, not the public product explainer.

### `docs/overview.md`

This is the repo contract.

It should answer:

- what this repo exists to do
- what it owns
- what it does not own
- how it relates to neighboring repos or systems
- how the docs are organized

If a new person reads only one doc after the README, this should be it.

### `docs/architecture/context.md`

Use for:

- system context
- major internal surfaces
- where this repo sits in the larger architecture

Keep this high-level and stable.

### `docs/decisions/`

Use ADRs for things people will ask "why?" about later:

- why this repo is separate
- why deployment works this way
- why the product is X-only for now
- why protocol truth stays in another repo

### `docs/reference/`

Use for facts:

- APIs
- schemas
- config
- package surfaces
- protocol indexes
- boundary/source-of-truth matrices

This folder should contain the least opinionated docs in the repo.

### `docs/how-to/`

Use for tasks:

- how to run locally
- how to cut a release
- how to perform a common workflow

How-to docs are action-oriented, not conceptual.

### `docs/explanation/`

Use for:

- rationale
- conceptual models
- philosophy
- trust model explanations
- why the system is shaped the way it is

This is where deeper thinking belongs.

### `docs/operations/`

Use for runtime truth:

- deploy steps
- runbooks
- security posture
- recovery
- production verification

Only use this folder if the repo actually runs somewhere or has real release/ops concerns.

### `docs/proposals/`

Use for serious future work:

- design proposals
- rollout plans
- product expansion concepts
- architecture ideas not yet adopted

This is the safest place to preserve good ideas without lying about current reality.

### `docs/archive/`

Use for:

- historical plans
- displaced old docs
- useful but superseded material

Archive is for preservation, not current guidance.

## Canonical / Proposed / Archived Status Model

Add a small status block at the top of docs that are not obvious:

```md
Status: canonical
```

or

```md
Status: proposed
```

or

```md
Status: archived
Superseded by: docs/architecture/context.md
```

Optional metadata:

```md
Status: proposed
Owner: platform
Last reviewed: 2026-04-13
```

This one habit prevents huge amounts of confusion.

## The Source-Of-Truth Rule

If you have multiple repos, define exactly where truth lives.

Create a simple matrix like this:

```md
| Topic | Canonical Repo | Notes |
|---|---|---|
| Protocol semantics | protocol-repo | Normative specs live here |
| Runtime deploy truth | app-repo | Deploy/runbook/recovery docs live here |
| Product behavior | product-repo | User-facing product logic lives here |
```

Then enforce these rules:

- protocol truth stays in the protocol repo
- runtime truth stays in the runtime repo
- product truth stays in the product repo
- downstream repos may document usage, not redefine upstream truth

## Modern GitHub Layer To Add

Good repo systems are not just folders. Add lightweight governance.

### `CODEOWNERS`

Use it to protect high-risk areas:

```text
* @your-org
/docs/ @your-org
/.github/ @your-org
/src/ @your-org
```

### `PULL_REQUEST_TEMPLATE.md`

Use a template like this:

```md
## What Changed

- 

## Why

- 

## Source Of Truth Check

- [ ] I verified this change matches the repo boundary rules.
- [ ] If current behavior changed, canonical docs were updated.
- [ ] If upstream truth changed, it was updated in the right repo.

## Risk

- 

## Validation

- 
```

### Issue Templates

Create:

- `bug-report.md`
- `proposal.md`
- `docs-change.md`

This keeps future work from entering as mush.

## A Good Default Migration Process

If you already have a messy repo, do this in order:

### Step 1. Define the repo role

Write one sentence:

- what this repo is
- what it owns
- what it does not own

Do not skip this.

### Step 2. Build the skeleton

Add:

- `docs/overview.md`
- the main docs folders
- `.github/` templates

### Step 3. Triage current docs

For each existing doc, decide:

- keep as canonical
- move to proposal
- move to archive
- split into multiple docs
- retire if worthless

### Step 4. Rewrite the front doors

Update:

- `README.md`
- `AGENTS.md`
- `docs/overview.md`

These three files set the tone of the whole repo.

### Step 5. Fix stale links

This is boring and essential.

Any reorg that leaves broken links feels fake and low-quality.

### Step 6. Add the first ADRs

Good first ADRs:

- repo boundaries
- deployment model
- scope constraints
- source-of-truth rules

## When To Use `vision.md`

Use `vision.md` only if the repo genuinely needs a durable direction/rationale doc.

Good candidates:

- protocol repos
- foundational platform repos
- long-lived product repos with strong product doctrine

Do not create `vision.md` just because it sounds important.

If `overview.md` already does the job, skip it.

## What To Avoid

- one huge `architecture.md` that mixes everything
- vague doc names like `spine.md`
- putting roadmaps in canonical reference folders
- keeping old plans next to current truth without status labels
- duplicating the same truth in multiple repos
- presenting future ambition as current product reality

## A Short Example

Imagine three repos:

- `protocol-repo`
- `platform-repo`
- `product-repo`

The clean shape is:

- `protocol-repo` owns specs and security model
- `platform-repo` owns runtime, billing, deploy, runbooks
- `product-repo` owns product behavior and operator workflows

Not this:

- all three repos describe the protocol differently
- the product repo contains deploy truth for the platform
- the platform repo contains speculative product expansion docs as if shipped

## Copy-Paste Starter Files

### `docs/overview.md`

```md
# Repo Overview

Status: canonical

## Purpose

This repo exists to ...

## This Repo Owns

- 

## This Repo Does Not Own

- 

## Related Systems Or Repos

- 

## Doc Map

- `docs/architecture/`
- `docs/reference/`
- `docs/how-to/`
- `docs/explanation/`
- `docs/operations/`
- `docs/proposals/`
- `docs/archive/`
```

### `docs/proposals/README.md`

```md
# Proposals

Status: canonical

This folder is for future-facing work that should not be mistaken for shipped truth.

Use it for:

- design proposals
- roadmap candidates
- structural ideas under evaluation
```

### `docs/archive/README.md`

```md
# Archive

Status: canonical

This folder preserves useful but non-current material.

Archived docs are not current truth.
```

### `docs/decisions/README.md`

```md
# Decisions

Status: canonical

Use this folder for ADR-style records of important structural and product decisions.
```

## The Standard I Recommend

If you want the shortest useful rule set, use this:

1. Every repo gets a one-sentence role.
2. Every repo gets `README.md`, `AGENTS.md`, and `docs/overview.md`.
3. Separate canonical docs, proposals, and archive.
4. Put facts in `reference`, tasks in `how-to`, rationale in `explanation`, ops in `operations`.
5. Use GitHub templates and CODEOWNERS to keep the structure real.
6. Define source-of-truth boundaries across repos explicitly.

That gets you most of the benefit without turning the repo into process theater.

## Final Thought

The best repo systems feel boring in the right ways:

- you know where to look
- you know which file to trust
- you know which ideas are current vs future
- you know which repo owns what

That clarity compounds. It makes humans faster, agents safer, onboarding easier, and architecture drift much harder.
