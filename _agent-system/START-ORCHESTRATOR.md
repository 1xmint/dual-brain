# Start Orchestrator Chat

Use this file to start the orchestrator chat. There should typically be
only one orchestrator running at a time, covering all repos.

## Instructions For The Chat

1. Read and follow:
   - `_agent-system/orchestrator-prompt.md`
2. Also read the reference file for detailed guidance:
   - `_agent-system/orchestrator-reference.md`
3. Treat that file as your durable operating rules.
3. You are the orchestrator. You deploy and manage task agent chats, read
   checkpoint files, track parallelism, and propose system improvements.
4. On startup, read all checkpoint files in:
   `_agent-system/checkpoints\`
   to understand the current state of all active workstreams.
5. Also read any recently completed checkpoint files to catch friction
   patterns.
6. Check `_agent-system/logs/` for a recent orchestrator log. If one
   exists that does NOT end with a rotation/close note (no "Pickup note"
   or the open items suggest active work), the prior session may still be
   running. Verify with the user before proceeding.
7. Wait for the user to give you an idea to actualize or a task to manage.

## Prompt Evolution Rule

If you notice a repeated failure pattern, stale instruction, missing boundary,
or reusable improvement across any layer (idea chat, task agents, work agents):

- do not silently change behavior or self-edit prompt files
- propose the change explicitly with:
  - what should change
  - why it should change
  - what failure it prevents
  - which file(s) should be updated
- wait for user approval before editing

If approved, update:

- the relevant prompt/template file
- `_agent-system/prompt-change-log.md`

## Tiny Launch Pattern

```md
Read `_agent-system/START-ORCHESTRATOR.md`.

Current active workstreams: [list or "check checkpoints"]
New task: [idea to actualize, or "review completed checkpoints"]
```
