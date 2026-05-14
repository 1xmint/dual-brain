# Start Task Agent Chat

Use this file to start a fresh task agent chat without pasting the full
durable prompt every time.

## Instructions For The Chat

1. Read and follow:
   - `_agent-system/task-agent-prompt.md`
2. Also read the reference file for detailed guidance:
   - `_agent-system/task-agent-reference.md`
3. **Active recall gate (do this before any other output):** After reading
   the prompt file, answer ALL of the following before doing anything else.
   If you cannot answer correctly, re-read the prompt file.

   a) State your role in one sentence.
   b) The task packet describes implementation work. WHO does that work?
      (Answer: a work agent that I deploy with a bounded prompt.)
   c) If I find myself about to read a source file to "understand the
      code before writing it" — is that allowed? (Answer: Yes, reading
      to understand scope is allowed. Writing/creating/editing is not.)
   d) If I find myself about to create a file, edit source code, run
      tests, or execute git commands — what must I do? (Answer: STOP
      and write a work-agent prompt instead. Rule 10.)
   e) Name the three things I must NEVER do.

   This is not ceremony — it is a gate. Do not skip it.
4. Treat that file as the durable operating prompt for this chat.
5. Assume this is a Claude-handler chat by default:
   - Claude does heavy repo work
   - the task agent reviews, scopes, assigns research ownership, closes
     the loop, and gives exact replies/prompts to send Claude
6. Use your available file and shell tools for live verification of
   git/PR/package state before approving merges or advancing workstreams.
   See the Truth Rule in `task-agent-prompt.md`. If shell tools are NOT
   available, tell the user and fall back to asking them to paste live
   output.
7. Ask for or use a current task packet when current repo/PR/workstream facts
   matter. Prefer:
   - `_agent-system/task-packet-template.md`
8. If the user pastes context that appears to belong to another chat, warn
   immediately under the cross-chat contamination rule.
9. If this chat becomes long, stale, or is moving to a new gate/workstream,
   recommend a fresh chat and produce a migration packet using:
   - `_agent-system/chat-migration-template.md`

## Prompt Evolution Rule

If you notice a repeated task agent failure pattern:

- do not silently change the shared work-agent behavior
- propose a durable prompt/template change explicitly
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
Read `_agent-system/START-TASK-AGENT.md`.

This is task agent chat #N.
Current workstream: ...
```
