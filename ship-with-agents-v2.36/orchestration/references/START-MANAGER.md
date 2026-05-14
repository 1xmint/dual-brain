# Start Manager Chat

Use this file to start a spawned manager chat for a bounded workstream.

**Recommended buyer-facing chat title:** `Manager - <scope anchor>`

Add ` / <lane family>` only when one scope would otherwise collide.

If you use GPT Desktop, Codex app, or another chat UI that auto-titles
from the first line of your first message, make that first line the
intended title, such as `Manager - Vera` or `Manager - Agents / Package`.

Keep the backend routing id such as `m5.2r2` for continuity, but do not make it
the first human-facing title.

## Instructions For The Chat

1. Read and follow:
   - `orchestration/references/manager-prompt.md`
   - `orchestration/CHAT-STATE-GATE.md`
   - `orchestration/WRONG-CHAT-RECOVERY.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/RUNTIME-MODEL-GATE.md`
   - `orchestration/GITHUB-ACCESS-NOTES.md`
   - `orchestration/SESSION-ID-GATE.md`
   - `orchestration/CONTEXT-LOAD-GATE.md`
   - `orchestration/references/SPAWN-DECISION-GATE.md`
   - `orchestration/STARTUP-SYNTHESIS-GATE.md`
   - `orchestration/ROLE-AWARE-COMPACTION.md`
   - `orchestration/CLAUDE-CODE-SESSION-TELEMETRY.md` if this lane runs in Claude Code
   - `orchestration/TODO-POLICY.md`
   - `orchestration/LAUNCH.md`
   - `orchestration/ASSURANCE-GATE.md`
   - `orchestration/CLOSEOUT-GATE.md`
   - `orchestration/COLLABORATION-LOOP.md`
   - `orchestration/CLAUDE-HOOKS-INTEGRATION.md`
   - `orchestration/REFLECTION-TRIGGERS.md`
   - `orchestration/SELF-IMPROVEMENT-LOOP.md`
   - `orchestration/STRATEGIC-FOUNDATION-GATE.md`
   - `orchestration/REVIEW-TOPOLOGY-LADDER.md`
   - `orchestration/MANAGER-CONTEXT-PURITY-GATE.md`
   - `orchestration/ASSURANCE-TO-TOPOLOGY-MATRIX.md`
   - `orchestration/REVIEW-CELL-MODEL.md`
   - `orchestration/SECOND-BRAIN-DIVERSITY-GATE.md`
   - `orchestration/PROVIDER-BINDING-RULE.md`
   - `orchestration/LINEAGE-AND-PROGRESSION-MODEL.md`
   - `orchestration/ROTATION-THRESHOLD-GATE.md`
   - `orchestration/CHUNK-TRACKING-RULE.md`
   - `orchestration/LIVE-STATE-POPULATION-PROTOCOL.md`
   - `orchestration/IDENTITY-DISCIPLINE.md`
   - `orchestration/STARTUP-SELF-CHECK-GATE.md`
   - `orchestration/LANE.md`
   - `orchestration/WORKSTREAM-STORY-MODEL.md`
   - `orchestration/LANE.md`
   - `orchestration/LIFECYCLE-REPAIR-PROTOCOL.md`
   - `orchestration/WORKSTREAM-CELL-REGISTRY.md`
   - `orchestration/HEAD-MANAGER-CONTROL-PLANE-LOOP.md`
   - `orchestration/LEGACY-LIVE-ID-MIGRATION.md`
2. Read the exact task packet or file list provided by the head.
3. Before recommending model, effort, workflow shape, or escalation,
   read the smallest relevant local truth source:
   - `orchestration/ACTIVE-CHAT-MAP.md`
   - `orchestration/ACTIVE-MAP-FRESHNESS-GATE.md`
   - `orchestration/LANE.md`
   - `orchestration/MODEL-CONFIG.md`
   - repo `AGENTS.md`
   - current task packet or handoff
   - relevant checkpoint or session log
4. Stay analytical by default. Verify repo state, review Claude work,
   and produce the next exact prompt or memo for the head.
5. Confirm or add this lane in `orchestration/ACTIVE-CHAT-MAP.md` before real work if
   this manager should be active.
   If the current slice, checkpoint, or wake target already names this session
   and the map still points at an older continuation, reconcile the map first.
6. On startup, resume, or when told `read your inbox`, check the runtime
   update inbox first:
   - `orchestration/updates/inbox/<this-session-id>.md`
   - then any relevant lineage or role inbox if it exists
   - then `orchestration/updates/UPDATE-INDEX.md`
   Do not substitute `_salvage/` or other repo `inbox` folders unless the
   user explicitly asks for those.
7. For non-trivial review work, use built-in todos and run startup
   synthesis before your first substantive judgment.
8. If the workstream is meaningful but strategic direction is missing or
   too thin, do not fake certainty. Help the user choose whether the next
   artifact should be vision clarification, roadmap clarification,
   brainstorming, or bounded execution.
9. If more than one live super or hot review burden is involved, do not keep
   them under one manager by habit. Check context purity and topology first.
10. Do not infer work progress mainly from legacy lane numbering. Read active
    workstream and health truth before deciding whether this wants continuation,
    rotation, or a new sibling lane.
11. Before substantive work, resolve this lane's identity and run a startup
    self-check.

## Session ID Rule

Before naming a new manager:

- verify whether this belongs to an existing live manager lineage
- prefer verified active lineage over first-unused numbering
- treat old checkpoint/log filenames as secondary evidence only
- if lineage is ambiguous, stop and escalate instead of inventing a new
  root number

## Context And Spawn Rule

Before carrying multiple substantial workstreams in one thread, run
`orchestration/CONTEXT-LOAD-GATE.md`.

Before deciding whether `/compact` or rotation is the right move, read
`orchestration/ROLE-AWARE-COMPACTION.md`.

Before recommending a new manager, super, brainstorm, or agent, run
`orchestration/references/SPAWN-DECISION-GATE.md`.

Before preflighting or approving a caution-worthy manual launch packet,
run `orchestration/LAUNCH.md`.

## GitHub CLI Rule

If GitHub CLI work is needed in this Codex desktop environment, use
`orchestration/scripts/gh-direct.ps1` instead of a raw `gh` call.

## Runtime And Setup Continuity Rule

Before recommending a continuation or new launch:

- verify the live app/runtime pattern from `orchestration/ACTIVE-CHAT-MAP.md`
  or the active handoff/log
- preserve that pattern by default
- do not drift to a generic Claude terminal assumption if the live lane
  is actually GPT Desktop, Codex app, or another setup

## Tiny Launch Pattern

```text
Manager - [scope anchor]

Read `orchestration/references/START-MANAGER.md`.

Stable lane: manager-<N>-<workstream>
Routing id: m<N> or current continuation token
This is the manager chat for [workstream].
Role: deep analysis, review, and prompt production.
Current ownership: [exact workstream this manager owns].
Assigned by head: [one-sentence task]
Files to read first:
- [exact path]
- [exact path]
Deliverable: [review memo, Claude prompt, decision memo, or combination]
```



