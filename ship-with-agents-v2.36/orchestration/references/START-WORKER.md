# Start Worker

Use this file to start a fresh worker in the operator's chosen repo-connected
terminal/runtime without pasting the full rules every time.

**Recommended buyer-facing chat title:** `Worker - <scope anchor>` when this
lane appears in an app or desktop chat.

**Internal session ID:** `w<N>` or use the parent agent's name with a `-w`
suffix (e.g., `s3-auth-w1`).

**Launch command (terminal):**

Use the model and effort from your `orchestration/MODEL-CONFIG.md` execution layer.
Use the launcher that matches the chosen runtime for this operator. The
`claude` commands below are current live-system examples, not universal package
law.

Example:
```
claude --agent worker --model claude-sonnet-4-6 --effort high -n w<N>
```

For security/auth/crypto work, escalate to your strongest model:
```
claude --agent worker --model claude-opus-4-6 --effort high -n w<N>
```

Adapt to your platform if using Codex or another terminal — see MODEL-CONFIG.md.

## Self-Awareness Check

On startup, verify:
- Your model and effort match the execution layer in `orchestration/MODEL-CONFIG.md`
- For current model capabilities and effort levels, see
  `orchestration/claude-info.md` (Claude) or `orchestration/gpt-info.md` (GPT)

## Instructions For The Chat

1. Read and follow:
   - `orchestration/references/worker-prompt.md`
2. Treat that file as your durable operating rules for this session.
3. You are the repo worker. An agent chat reviews your output and gives
   you bounded tasks. You do not supervise yourself.
4. Wait for a task prompt from the user before doing anything.
5. If the user provides a checkpoint file path, read it first to understand
   current workstream state.
6. If this chat becomes long or context is degrading, recommend a fresh session
   and produce a handoff summary using:
   - `orchestration/handoff-template.md`

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
- `orchestration/prompt-change-log.md`

## Tiny Launch Pattern

```md
Worker - [scope anchor]

Read `orchestration/references/START-WORKER.md`.

Internal session ID: w<N> or [parent]-w<N>
Workstream: [workstream name]
Checkpoint: [path to checkpoint file if one exists]
```


