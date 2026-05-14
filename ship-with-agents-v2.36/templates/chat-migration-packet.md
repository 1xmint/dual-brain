# Chat Migration Packet

Use this template when a chat has gotten too long, is losing context, or has started repeating itself. Instead of pushing through, migrate.

A migration packet is a short hand-off from the old chat to a fresh chat. You throw the history away. You keep only what the next chat needs.

Copy, fill in, paste as the first message of the new chat.

---

## Project One-Liner

`<what this project is, in one sentence>`

## Current Workstream

What we are actually doing right now, in one sentence.

> Example: "Replacing the inline validation logic in `src/auth/session.ts` with a shared helper, without changing any public surface."

## Why We Are Migrating

Short note so the new chat understands the hand-off is a reset, not a continuation.

- chat was getting long and drifting;
- earlier context had become unreliable;
- starting fresh is cheaper than fixing it;
- `<other reason>`

## What Is Already Done

Concrete. Prefer file paths over prose.

- `path/to/file-1` — what changed;
- `path/to/file-2` — what changed;
- PR / branch: `<name-or-n/a>`;
- last verified passing command: `<command>`.

## What Is Not Done

Specific items remaining.

- `<item>` — next step: `<what>`;
- `<item>` — next step: `<what>`;
- `<item>` — blocked by: `<what decision or input>`.

## Decisions Still In Force

Anything the previous chat agreed to that the new chat must respect.

- scope boundary: `<what is in vs out>`;
- design constraint: `<the rule>`;
- architecture rule: `<the rule>`;
- pending decision waiting on you or the strategy chat: `<what>`.

## Open Loops To Check

Things the previous chat claimed were done but were never verified. The new chat should confirm these first, before doing new work.

- `<claim>` — how to verify: `<file / test / command>`;
- `<claim>` — how to verify: `<file / test / command>`.

## Known Traps

Mistakes the previous chat made or nearly made. Stated so the new chat does not repeat them.

- `<trap, and the correct behavior>`.

## Ground Truth Pointers

Files the new chat should read first before writing anything.

- `AGENTS.md`;
- `README.md`;
- `<specific doc>`;
- the main files for the current workstream.

## Stop And Ask List

Short version. Full list lives in `AGENTS.md`.

- before merge or deploy;
- before any delete, force push, or migration;
- before touching anything outside the current workstream;
- before answering a strategy / pricing / scope question;
- whenever unsure whether a prior step actually worked.

## First Action For The New Chat

Be explicit. Do not leave it to guess.

> Example: "Open `src/auth/session.ts`, confirm the current state of `validate()` matches the 'what is already done' list above, then report back before editing anything."
