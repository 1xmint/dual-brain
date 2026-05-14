# Start Agent Chat

Use this file to start a fresh agent chat.

**Recommended buyer-facing chat title:** `Agent - <scope anchor>`

Add ` / <lane family>` only when needed.

Examples:

- `Agent - Auth Fix`
- `Agent - Query Cache`

If you still keep a compact lineage key in your own runtime files, treat that as
secondary. The buyer-facing title should explain the role directly.

## Instructions For The Chat

1. Read and follow:
   - `orchestration/references/agent-prompt.md`
   - `orchestration/CHAT-STATE-GATE.md`
   - `orchestration/WRONG-CHAT-RECOVERY.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/RUNTIME-MODEL-GATE.md`
   - `orchestration/GITHUB-ACCESS-NOTES.md`
   - `orchestration/REFLECTION-TRIGGERS.md`
   - `orchestration/STARTUP-SYNTHESIS-GATE.md`
   - `orchestration/ROLE-AWARE-COMPACTION.md`
   - `orchestration/CLAUDE-CODE-SESSION-TELEMETRY.md` if this lane runs in Claude Code
   - `orchestration/TODO-POLICY.md`
   - `orchestration/CLAUDE-HOOKS-INTEGRATION.md`
   - `orchestration/SELF-IMPROVEMENT-LOOP.md`
2. Also read the reference file:
   - `orchestration/references/agent-reference.md`
3. If this lane is expected to stay active long enough to matter, read:
   - `orchestration/ACTIVE-CHAT-MAP.md`
   - `orchestration/ACTIVE-MAP-FRESHNESS-GATE.md`
   - `orchestration/LANE.md`
4. Ask for or use a current task packet when repo, PR, or workstream
   facts matter. Prefer `orchestration/task-packet-template.md`.
5. If pasted context appears to belong to another chat, warn
   immediately.
   If the role, session ID, or ownership clearly does not match this
   chat, stop and run `orchestration/WRONG-CHAT-RECOVERY.md`.
6. If this chat becomes long, stale, or moves to a new workstream,
   recommend a fresh chat and produce a migration packet using
   `orchestration/chat-migration-template.md`.
7. Before spawning a helper subagent or asking for a fresh durable chat,
   run `orchestration/references/SPAWN-DECISION-GATE.md`.
8. Confirm or add this lane in `orchestration/ACTIVE-CHAT-MAP.md` before real work if
   this agent should stay active long enough to matter.
   If the packet, slice, or checkpoint already names this session and the map
   still points at an older continuation, reconcile the map first.
9. If the task is meaningful rather than tiny, run startup synthesis and
   decide whether built-in todos are required before doing the work.

## GitHub CLI Rule

If GitHub CLI work is needed in this Codex desktop environment, use
`orchestration/scripts/gh-direct.ps1` instead of a raw `gh` call.

## Tiny Launch Pattern

```text
Agent - [scope anchor]

Read `orchestration/references/START-AGENT.md`.

Internal session ID: s<N>-<workstream> or a<N>-<slug>
This is s<N>-<workstream> or a<N>-<slug>.
Role: bounded execution.
Current ownership: [exact slice this agent owns].
Current workstream: [name]
```

When the current lane can write a shared workspace file, prefer saving this
startup body as a durable prompt file only when the chosen runtime or a
verified operator-specific adapter can ingest that file cleanly. Otherwise use
one startup body block and one launch command block in the resolved runtime
sequence. For interactive-launch-first runtimes like manual
`claude --agent ...`, emit the launch command first and the startup body
second as the next paste into the launched session. Do not improvise
shell-specific glue by habit just to preserve a one-command shape.



