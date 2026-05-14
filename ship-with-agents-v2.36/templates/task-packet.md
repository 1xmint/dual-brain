# Task Packet

A task packet is a single-purpose instruction handed to a work chat (Claude,
Codex, or similar). It is small enough to finish in one loop and specific
enough to verify.

Use this as a lightweight transport artifact.
If the same work needs repeated review, approvals, or relaunches, promote it to
a canonical slice doc instead of endlessly rewriting the packet. See
`orchestration/DOC-FIRST-ORCHESTRATION.md`.

Copy this template, fill it in, and paste it into the work chat. Do not give a work chat anything vaguer than this.

---

## Goal

One sentence. Describe the outcome, not the steps.

> Example: "Split the `validate()` function in `src/auth/session.ts` into `validateToken()` and `validateUser()`, keep both exported, and update all callers."

## Context

What the agent needs to know before touching anything. Keep it short.

- what the file / feature is for;
- how it is used today;
- what constraint must not be broken;
- any link to a proposal or ADR that governs this work.

## Inputs

Concrete files, configs, or references the agent should read first.

- `path/to/file-1`
- `path/to/file-2`
- related doc: `docs/explanation/<name>.md`

## Out Of Scope

Things the agent must **not** do in this task, even if it thinks they are improvements.

- no unrelated refactors;
- no dependency upgrades;
- no formatting sweeps across other files;
- no new features;
- `<other project-specific no-gos>`

## Done Criteria

Specific, checkable conditions. If any are vague, fix them before sending.

- [ ] specific file(s) changed as described;
- [ ] tests at `path/to/tests` pass;
- [ ] no other files changed;
- [ ] `<any runtime check>` succeeds;
- [ ] diff reviewed by a human before merge.

## Stop And Ask

The agent must pause and wait for the human if any of the following happen.

- a dependency needs to be added or upgraded;
- a public API or exported signature must change;
- a migration or data change is required;
- a secret / env var is needed;
- something in `AGENTS.md` would need to be updated;
- the task cannot be completed without touching out-of-scope files;
- the agent is unsure whether a prior step actually worked.

## Reporting

When done, the agent reports back with:

- the list of files changed;
- a short summary of the change per file;
- the output of the validation command(s) above;
- any open questions or leftover work;
- anything that surprised it.

"Done" without these is not accepted.
