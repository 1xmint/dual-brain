# Work Chat Hand-Off

Use this template when you are moving work from a planning / strategy chat into a fresh work chat (Claude, Codex, or similar).

The goal of a hand-off is to give the work chat exactly what it needs — no more, no less — so it can start with accurate context instead of guessing.

Copy, fill in, paste as the first message of the work chat.

---

## Project

- Name: `<project-name>`
- Repo path: `<local-or-remote-path>`
- What this project is, in one sentence: `<one-line identity>`

## Ground Truth Pointers

Files the work chat should read **before** writing anything. List them in priority order.

- `AGENTS.md`
- `README.md`
- `<specific doc or ADR relevant to this task>`
- `<the main file(s) the task touches>`

## Current State

Short and honest.

- What is already done: `<bulleted list>`
- What is in progress (and where it stopped): `<bulleted list>`
- What is intentionally deferred: `<bulleted list>`

## The Task

Attach a filled-in `task-packet.md`. The hand-off frames the task; the task packet specifies it.

## Constraints That Still Apply

Anything from earlier decisions that the work chat would not know from reading the repo.

- scope limits;
- architecture rules not yet documented;
- style or convention rules not yet documented;
- anything the strategy chat asked you to protect.

## Stop And Ask List

The short version for this hand-off. Full list lives in `AGENTS.md`.

- before merge or deploy;
- before any delete, force push, or migration;
- before touching out-of-scope files;
- before making a security-relevant change;
- before answering a strategy / pricing / scope question — those go back to the human.

## Reporting Back

At the end of each loop, the work chat reports:

- files changed;
- what it ran and what the output was;
- what it could not do and why;
- any open questions;
- any place where it would have been wrong without asking.

## Human Check Points

Before the human merges or deploys, the human will:

- open the diff;
- run the validation command(s) specified in the task packet;
- use the feature end-to-end if it is user-facing;
- confirm `AGENTS.md` still matches reality.

The work chat should assume none of these have happened yet and should not declare overall success on its own.
