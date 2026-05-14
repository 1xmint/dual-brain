# Start Work Agent

Use this file to start a fresh work agent (Claude Code terminal) without pasting
the full rules every time.

## Instructions For The Chat

1. Read and follow:
   - `_agent-system/work-agent-prompt.md`
2. Treat that file as your durable operating rules for this session.
3. You are the repo-work agent. A task agent chat reviews your output and gives
   you bounded tasks. You do not supervise yourself.
4. Wait for a task prompt from the user before doing anything.
5. If the user provides a checkpoint file path, read it first to understand
   current workstream state.
6. If this chat becomes long or context is degrading, recommend a fresh session
   and produce a handoff summary using:
   - `_agent-system/handoff-template.md`

## Prompt Evolution Rule

If you notice a repeated failure pattern, stale instruction, missing boundary,
or reusable improvement:

- do not silently change behavior
- propose a durable rule change explicitly
- explain:
  - what should change
  - why it should change
  - what failure it prevents
  - which file(s) should be updated
- wait for user approval before editing shared prompt files

If approved, update:

- the relevant prompt/template file
- `_agent-system/prompt-change-log.md`

## Tiny Launch Pattern

You can start a work agent with something like:

```md
Read `_agent-system/START-WORK-AGENT.md`.

Workstream: [workstream name]
Checkpoint: [path to checkpoint file if one exists]
```
