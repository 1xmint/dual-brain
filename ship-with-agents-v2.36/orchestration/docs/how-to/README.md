# docs/how-to/

Goal-oriented tasks: step-by-step guides for accomplishing specific
outcomes with this system.

## Divio role

How-to documentation is task-oriented. It guides a reader through a
concrete goal. The reader has a problem to solve; the how-to gives
them the steps to solve it without requiring them to understand the
full system first. It is practical and directive.

How-to is distinct from explanation (which builds understanding) and
reference (which tabulates facts). A how-to can reference both without
duplicating either. The test: "can a reader follow this guide and
accomplish the goal without reading anything else?" If yes, it belongs
here.

Use this folder for: walkthroughs, step-by-step guides, migration
guides, onboarding sequences, and any "how do I do X?" answer that
requires more than one action.

## What belongs here

Canon-stage (Stage 8) artifacts describing goal-oriented tasks:
- First-idea walkthrough (capture an idea from spark to inbox entry)
- Promote a proposal to a decision (the gate-by-gate checklist)
- Run a head's weekly triage session
- Onboard a new buyer to the lifecycle system
- Migrate an existing project to the lifecycle folder structure
- Recover from a Dead Inbox (anti-pattern 3 remediation)

The spec references one specific how-to: `how-to/first-idea-walkthrough.md`
(buyer migration guide). That is an expected artifact for this folder.

## Frontmatter requirements

Required fields:
- `id` -- `lc-YYYYMMDD-slug`
- `stage: canon`
- `owner`
- `created` -- never changes
- `last_touched`
- `prior_paths`

Optional:
- `links` -- reference and architecture docs this guide depends on
- `history`
- `supersedes` -- if this guide replaces a prior version

## Canon stage requirement

How-to guides rot faster than reference docs because the system
changes. A guide that walks through a UI or a command that no longer
exists misleads instead of helps. Review every 90 days; update or
retire rather than leaving stale steps.

## File naming

`c-YYYYMMDD-slug.md` -- prefix `c` for canon.

## Example entry

```
---
id: lc-20260426-first-idea-walkthrough
stage: canon
owner: head
created: 2026-04-26
last_touched: 2026-05-05
prior_paths:
  - docs/proposals/p-20260426-first-idea-walkthrough.md
links: [lc-20260426-frontmatter-contract, lc-20260426-idea-lifecycle-spec]
---

This walkthrough takes a new buyer from first idea to first inbox
entry in under 10 minutes.

Step 1: identify a spark -- something you noticed that might be worth
improving. It does not need to be fully formed.

Step 2: create docs/inbox/i-YYYYMMDD-slug.md with the standard
frontmatter. Set stage: inbox, owner: you, source: manual.

Step 3: write one sentence for the thesis. That is enough to triage.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
