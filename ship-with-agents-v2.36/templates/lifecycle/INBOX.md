# Template: Inbox Entry

Lifecycle stage: **inbox** | Spec: `../../orchestration/IDEA-LIFECYCLE.md`

An Inbox entry is the first durable artifact in the lifecycle. It
converts a spark -- a friction note, a chat message, a passing
observation -- into something with an owner, a thesis, and a status.
If an idea doesn't have an Inbox entry, it isn't in the lifecycle.

Copy this template to `docs/inbox/i-<YYYYMMDD>-<slug>.md`.

---

## Frontmatter (copy this block; fill all required fields)

```yaml
---
# id: NEVER changes once assigned. Format: lc-YYYYMMDD-slug.
#     The lc- prefix is constant. This is the only stable cross-reference.
id: lc-YYYYMMDD-slug

# stage: always "inbox" at this point in the lifecycle.
stage: inbox

# owner: who is responsible for this entry right now.
#        Required. On rotation, explicit handoff; never leave blank.
owner: <agent-or-human>

# created: ISO date this entry was first written. Never changes.
created: YYYY-MM-DD

# last_touched: updated on every meaningful edit (not cosmetic fixes).
last_touched: YYYY-MM-DD

# source: where this idea came from. Use one of the canonical forms:
#   manual                    -- created directly
#   friction:<session>:<F#>   -- promoted from a friction log entry
#   github:<repo>#<num>       -- mirrored from a GitHub issue/discussion
source: manual

# topic: freeform soft tag used for sibling-detection at Decision stage.
#        Two proposals with the same topic may need merge-or-kill treatment.
topic: <freeform-string>

# links: other lifecycle ids (not paths) this entry references.
#        Format: lc-YYYYMMDD-slug. Leave [] if none.
links: []

# skipped_stages: list any stages intentionally skipped, with reason.
#        Empty list is fine for most Inbox entries.
skipped_stages: []

# reason: required only if status is stale, promoted, or archived.
#         Leave blank at creation.
reason: ""
---
```

---

## Body shape

### Thesis

One sentence. What is the idea? Write it so a reader with no context
can understand the core in ten seconds.

> Example: "Friction notes should auto-tag with session id so the
> head can filter them without reading every line."

### Why it matters

One to three sentences. What problem does this solve, or what
opportunity does it open? Be concrete -- reference a specific pain
point, not a general principle.

### Fitness check

Answer these before promoting to Brainstorm. Jot a one-line note
per item; full analysis happens at Brainstorm stage.

- Is this the right repo / project for this idea?
- Is someone willing to own it past this stage?
- Is the thesis specific enough to act on, or does it need sharpening?

### Status

```
status: raw | triaged | stale | promoted | archived
```

- `raw` -- just captured; not yet reviewed.
- `triaged` -- head reviewed; decision made (keep, promote, or park).
- `stale` -- 30 days without a touch; surfaces in weekly triage.
- `promoted` -- moved to Brainstorm or Proposal stage; update `prior_paths`.
- `archived` -- closed without promotion; `reason:` field required.

---

## What "good" looks like

```
id: lc-20260426-friction-aggregation
stage: inbox
owner: head
created: 2026-04-26
last_touched: 2026-04-26
source: friction:h3:F5
topic: friction-tooling
status: triaged

Thesis: Per-chat friction logs should roll up to a single aggregated
file on session close so the head can scan patterns without
opening individual logs.

Why it matters: Across the last three sessions, the same two friction
patterns appeared in three different logs. The head missed one
because it was buried in h2-friction.md. An aggregated view prevents
pattern blindness.

Fitness check:
- Correct repo: yes, this is orchestration tooling.
- Owner willing: head owns aggregation; will assign to next session.
- Thesis sharp enough: yes -- one output artifact, one trigger event.
```

## What "bad" looks like

```
id: lc-20260426-make-it-better
stage: inbox
owner: ???
created: 2026-04-26
last_touched: 2026-04-26
source: manual
topic: ""
status: raw

Thesis: We should improve the system.

Why it matters: Things could be better.
```

Problems: thesis is not actionable; owner is missing; topic is empty;
no fitness check attempted. This entry will go stale immediately.

---

*For the full gate checklist before promoting to Brainstorm, see
`../../templates/lifecycle/QUALITY-GATES.md`.*
