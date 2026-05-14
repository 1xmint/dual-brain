# Evidence Ledger

```
Status: canonical
Owner: <name or role>
Last reviewed: YYYY-MM-DD
```

An evidence ledger is a single document that labels every major surface of the repo so humans and agents can tell what is real without re-reading the whole codebase.

Use this when recovering an AI-coded project. See `CHAOS-CODE-RECOVERY-GUIDE.md` for the full method.

## Labels

Use only these five. Do not invent new ones.

- **shipped** — works, is used, trusted.
- **partial-foundation** — half-built but worth finishing.
- **stale** — written once, not used, not worth finishing.
- **superseded** — replaced by something newer.
- **unknown** — cannot tell yet. Do not guess.

## Rules

- The ledger is **write-only during inventory**. No fixes while labeling.
- Prefer **unknown** over a guess. Unknown is a feature, not a failure.
- One row per surface, not per file. A folder can be a surface. A workflow can be a surface.
- Update the ledger whenever a surface changes label.

## Ledger

| Surface | Path | Label | Why this label | Dependents | Next action | Notes |
|---|---|---|---|---|---|---|
| `<example: login flow>` | `src/auth/` | `partial-foundation` | recent edits, no tests, called from two routes | `src/api/routes.ts`, `src/pages/login.tsx` | finish, add tests, promote | error paths untested |
| `<example: old billing prototype>` | `src/billing/legacy/` | `stale` | no callers, last touched months ago | none | delete in a dedicated PR | confirm no imports with a grep |
| `<example: config loader>` | `src/config/` | `shipped` | used everywhere, has tests, documented | whole app | leave alone | do not "improve" it while here |
| `<example: experimental worker>` | `scripts/worker-v2/` | `superseded` | replaced by `src/jobs/` | none in runtime | move to `archive/` | keep for reference |
| `<example: data importer>` | `tools/import/` | `unknown` | unclear whether anything calls it | ? | investigate before acting | 15-minute follow-up task |
| | | | | | | |
| | | | | | | |

## Surfaces Still To Inventory

List the surfaces you have not labeled yet. This is the "to-do" side of the ledger.

- `<path or folder>`;
- `<path or folder>`.

Rule: you are not done with inventory while this list is non-empty.

## Promotion Log

Record each time a surface moves from one label to another. Helps catch drift and re-labels.

| Date | Surface | From | To | PR / commit | Note |
|---|---|---|---|---|---|
| YYYY-MM-DD | `<surface>` | `partial-foundation` | `shipped` | `<ref>` | added tests, docs |
| | | | | | |

## Retirement Log

Record deletions and archives separately so "where did X go?" has an answer.

| Date | Surface | Action | PR / commit | Note |
|---|---|---|---|---|
| YYYY-MM-DD | `<surface>` | deleted | `<ref>` | stale, no dependents |
| YYYY-MM-DD | `<surface>` | archived | `<ref>` | superseded, kept for reference |
| | | | | |

## Open Investigations

Unknowns that deserve a short timeboxed look.

- `<surface>` — timebox: `<15m / 30m / 1h>` — what to determine: `<question>`.

## Done Check

The ledger is in good shape when:

- every top-level folder has been listed;
- every runtime-path surface has a label;
- remaining unknowns are genuinely unknown, not "I got tired";
- each row's "next action" is one verb: keep, finish, replace, delete, archive, investigate.
