# Start Brainstorm

Use this file to start a fresh brainstorm/strategy chat without pasting the
full durable prompt every time.

**Recommended buyer-facing chat title:** `Brainstorm - <scope anchor>`

Add ` / <lane family>` only when needed.

If you use ChatGPT Desktop, Codex app, or another chat UI that auto-titles
from the first line of your first message, start that message with the title
you want in the sidebar, such as `Brainstorm - Pricing`.

Use a full-word title so the role is obvious without decoding shorthand.

Use the model and effort from your `orchestration/MODEL-CONFIG.md` research
layer, unless `orchestration/OPERATOR-PREFERENCES.md` sets a stronger or
different baseline for brainstorm lanes.

Adapt to your platform if using GPT Desktop or another tool - see
`MODEL-CONFIG.md`.

## Instructions For The Chat

1. Read and follow:
   - `orchestration/references/brainstorm-prompt.md`
   - `orchestration/references/OPERATOR-PREFERENCE-MEMORY.md`
   - `orchestration/CHAT-STATE-GATE.md`
   - `orchestration/WRONG-CHAT-RECOVERY.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/RUNTIME-MODEL-GATE.md`
   - `orchestration/SESSION-ID-GATE.md`
   - `orchestration/CONTEXT-LOAD-GATE.md`
   - `orchestration/references/SPAWN-DECISION-GATE.md`
   - `orchestration/STARTUP-SYNTHESIS-GATE.md`
   - `orchestration/ROLE-AWARE-COMPACTION.md`
   - `orchestration/TODO-POLICY.md`
2. Also read the reference file for detailed guidance:
   - `orchestration/references/brainstorm-reference.md`
3. Treat that file as the durable operating prompt for this chat.
4. Ask for or use a current task packet when temporary facts, current repo
   state, or bounded goals matter.
5. Treat pasted current-state facts as snapshots until verified.
   If the role, session ID, or ownership clearly does not match this
   chat, stop and run `orchestration/WRONG-CHAT-RECOVERY.md`.
6. If the topic needs current external/platform/market/security facts, decide
   whether the brainstorm should research before moving forward.
7. If this chat becomes long, stale, or shifts workstreams, recommend a fresh
   chat and produce a migration packet using:
   - `orchestration/chat-migration-template.md`
8. Preserve the live lane shape by default. If the brainstorm already
   lives in an app/desktop chat, do not relaunch it as a generic terminal
   flow without a concrete reason.
9. Use built-in todos only when the brainstorm has converged into a
   structured comparison or handoff, not for open-ended ideation.
10. If the brainstorm matures into repeatable reviewed work, prefer creating or
    updating a canonical slice doc instead of relying on repeated packet
    rewrites.

## Continuity Rule

Before recommending a brainstorm continuation or a new brainstorm:

- verify whether a live brainstorm lineage already exists
- preserve that verified lineage by default
- preserve the live runtime or app setup pattern by default
- do not drift to a generic terminal-launch assumption unless local
  truth explicitly justifies the change

If the user already has an active GPT desktop, Codex app, or other
non-terminal brainstorm pattern, inherit that setup first and only
recommend a different launch path with explicit justification.

## Prompt Evolution Rule

If you notice a repeated failure pattern, stale instruction, missing boundary,
or reusable improvement to the brainstorm system:

- do not silently change behavior and do not self-edit prompt files
- explicitly propose a durable prompt change
- explain:
  - what should change
  - why it should change
  - what failure it prevents
  - which file(s) should be updated
- wait for user approval before editing shared prompt files

If approved, update:

- the relevant prompt/template file
- `orchestration/prompt-change-log.md`
- `orchestration/prompt-smoke-tests.md` if the change affects durable behavior

## Tiny Launch Pattern

You can start a chat with something like:

```md
Brainstorm - [scope anchor]

Read `orchestration/START-BRAINSTORM.md`.

Internal session ID: b<N>
This is b<N>, the brainstorm chat for [topic].
Role: exploration, strategy, and decision support.
Current ownership: pressure-test the topic and produce the next useful handoff.
Current topic: ...
Canonical slice doc: slices/[optional-if-already-exists].md
```

## Launch Command (terminal)

Use the launcher that matches the chosen runtime for this operator. These
`claude` commands are current live-system examples, not universal package law.

Example (if using Claude Opus):

```bash
claude --model claude-opus-4-6 --effort high -n b<N>
```

Example (if using Claude Sonnet):

```bash
claude --model claude-sonnet-4-6 --effort high -n b<N>
```


