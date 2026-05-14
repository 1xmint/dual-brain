# Start Idea Chat

Use this file to start a fresh idea/strategy chat without pasting the full
durable prompt every time.

## Instructions For The Chat

1. Read and follow:
   - `_agent-system/idea-discussion-prompt.md`
2. Also read the reference file for detailed guidance:
   - `_agent-system/idea-discussion-reference.md`
3. Treat that file as the durable operating prompt for this chat.
3. Ask for or use a current task packet when temporary facts, current repo
   state, or bounded goals matter.
4. Treat pasted current-state facts as snapshots until verified.
5. If the topic needs current external/platform/market/security facts, decide
   whether the idea chat should research before moving forward.
6. If this chat becomes long, stale, or shifts workstreams, recommend a fresh
   chat and produce a migration packet using:
   - `_agent-system/chat-migration-template.md`

## Prompt Evolution Rule

If you notice a repeated failure pattern, stale instruction, missing boundary,
or reusable improvement to the idea-chat system:

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
- `_agent-system/prompt-change-log.md`
- `_agent-system/prompt-smoke-tests.md` if the
  change affects durable behavior

## Tiny Launch Pattern

You can start a chat with something like:

```md
Read `_agent-system/START-IDEA-CHAT.md`.

This is idea chat #N.
Current topic: ...
```
