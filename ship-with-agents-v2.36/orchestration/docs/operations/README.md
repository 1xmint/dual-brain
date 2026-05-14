# docs/operations/

Run, deploy, and oncall: everything needed to keep the system alive
and to act under pressure.

## Divio role

Operations documentation is action-oriented under real conditions --
not a tutorial, not a reference, but a guide for someone who needs
to do something right now with a live system. Operations docs assume
the reader is competent but time-pressured.

Operations is distinct from how-to: how-to is for learning a process;
operations is for executing a known process under production conditions.
A how-to guide teaches; an operations runbook enables. The test: "could
an on-call person follow this at 2am without asking anyone?"

Use this folder for: deployment procedures, rollback runbooks, session
startup sequences, incident response guides, oncall rotation docs,
environment setup for active deployments, and stabilization window
procedures.

## What belongs here

Canon-stage (Stage 8) artifacts describing operational procedures:
- Agent session startup (how to pick up a running workstream)
- head session close checklist (what to do before ending a session)
- Rollback procedure (if Ship gate fails within stabilization window)
- Weekly triage runbook (the head's recurring operational task)
- Cross-session checkpoint recovery (restoring state after a crash)
- How to run `check-cross-refs.sh` and interpret its output
- Stabilization window monitoring (what to watch, when to declare canon)

## Frontmatter requirements

Required fields:
- `id` -- `lc-YYYYMMDD-slug`
- `stage: canon`
- `owner`
- `created` -- never changes
- `last_touched`
- `prior_paths`

Optional:
- `links` -- related how-to guides, reference docs, architecture docs
- `history`
- `supersedes` -- if this runbook replaces a prior version

## Canon stage requirement

Operations docs go stale the moment the system changes. An outdated
rollback procedure is worse than no procedure: it gives false confidence.
Review every 90 days at minimum; review immediately after any significant
system change. If a procedure is no longer accurate, move it to
`../archive/superseded/` immediately and either replace it or leave
the gap visible.

## File naming

`c-YYYYMMDD-slug.md` -- prefix `c` for canon.

## Example entry

```
---
id: lc-20260426-head-session-close
stage: canon
owner: head
created: 2026-04-26
last_touched: 2026-05-02
prior_paths:
  - docs/proposals/p-20260426-head-session-close.md
links: [lc-20260426-layer-model, lc-20260426-frontmatter-contract]
---

head session close -- run before ending every session.

1. Regenerate docs/INDEX.md: one line per active lifecycle artifact.
2. Write checkpoint to orchestration/checkpoints/.
3. Update orchestration/logs/ with this session's decisions.
4. Check for stale inbox entries (> 30 days no-touch); tag `stale`.
5. Promote any brainstorm handoffs that have met the proposal gate.
6. Confirm all in-flight build artifacts have audit entries.
```

## Cross-reference

Full lifecycle spec: [IDEA-LIFECYCLE.md](../../IDEA-LIFECYCLE.md)
