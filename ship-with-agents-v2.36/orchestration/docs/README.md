# docs/

This directory is the durable truth layer for this project. It holds
the full artifact trail of the idea lifecycle -- from first capture
through canon -- plus the canonical reference, architecture, and
operational documentation.

It is not the default home for live execution slices.

Use:

- `docs/` for idea, decision, explanation, architecture, and canon artifacts
- `_agent-system-runtime/slices/` for live execution contracts
- `_agent-system-runtime/checkpoints/` for live execution truth

## What lives here

The folders are split into two shapes that serve different purposes:

**Lifecycle-native folders** track the movement of ideas:

- `inbox/` -- front door for new ideas (Stage 1)
- `proposals/_drafts/` -- brainstorm handoffs, pre-formal (Stage 2)
- `proposals/` -- formal proposals under review (Stage 3)
- `decisions/` -- signed ADRs (Stage 4)
- `audit/` -- build verification artifacts (Stage 6)
- `archive/` -- terminal: rejected, abandoned, or stale artifacts
- `archive/superseded/` -- terminal: canon docs replaced by newer canon

**Divio-shape folders** hold the outputs of the Canon stage (Stage 8):

- `reference/` -- facts: API surfaces, frontmatter contracts, field lists
- `architecture/` -- structure: how the system is shaped and why
- `explanation/` -- reasoning: background, trade-offs, design history
- `how-to/` -- goal-oriented tasks: step-by-step for specific outcomes
- `operations/` -- run/deploy/oncall: keeping the system alive

## How to navigate

If you have an idea to capture: `inbox/README.md`.

If you are trying to run a current workstream: use the runtime slice and
checkpoint system instead of putting live execution control here.

If you are looking for how something works: `reference/` or `architecture/`.

If you want to understand why a decision was made: `decisions/` or
`explanation/`.

If something broke and you need to act now: `operations/`.

## Cross-reference rule

Every artifact in this tree carries a frontmatter `id` field in the
format `lc-YYYYMMDD-slug`. That id is stable across stage promotions.
Path-based cross-references are forbidden -- files move; ids do not.

The full lifecycle spec is at `../IDEA-LIFECYCLE.md`. Start there
if any convention in a subfolder README is unclear.

## Discovery

`docs/INDEX.md` is the searchable index of all lifecycle artifacts.
The head regenerates it on session close. Future tooling will
automate this.
