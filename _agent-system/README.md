# Agent System Prompts

This folder stores cross-repo operating prompts and handoff templates for
Soma, claw-net, and pulse.

These files are operating aids. They do not override repo-local `AGENTS.md`,
accepted ADRs/specs/proposals, live GitHub state, package registry state, CI
state, deploy state, or local Git state.

## Files

- `START-IDEA-CHAT.md`: tiny launcher for fresh idea/strategy chats that points
  at the durable idea prompt.
- `START-TASK-AGENT.md`: tiny launcher for fresh task agent /
  Claude-handler chats.
- `START-WORK-AGENT.md`: simple router/launcher for work-related chats.
- `idea-discussion-prompt.md`: first message for strategy, architecture,
  proposal-design, and idea-to-actualization chats.
- `task-agent-prompt.md`: first message for chats that review Claude's
  plans, PR summaries, assumptions, and proposed next steps.
- `task-packet-template.md`: reusable packet for current task facts,
  constraints, and expected output.
- `chat-migration-template.md`: reusable packet for moving long or stale chats
  into a fresh chat without losing context.
- `handoff-template.md`: reusable handoff block for sending a bounded task to a
  work agent.
- `prompt-smoke-tests.md`: small manual test cases for checking whether prompt
  edits preserve the intended behavior.
- `prompt-change-log.md`: record of durable changes to these shared prompts.

## Operating Model

Use these prompts in three layers:

1. Paste the durable prompt for the chat type.
2. Paste a current task packet.
3. Paste Claude output, a proposal draft, or the work item to review.

If you want a smaller launch instruction, start with one of the `START-*.md`
files instead. They tell the chat which durable prompt to read and how to use
the templates without pasting the full prompt text every time.

Current task packets carry temporary facts. Durable prompt files carry stable
behavior and boundary rules.

Task agent chats are Claude-handler chats by default. Claude does the
heavy repo work; the task agent chat reviews Claude output, guards scope,
decides research/verification gates, and gives the exact reply or instruction
to send Claude. If the task agent should directly edit files or run local checks in a
task agent chat, say so explicitly in the task packet.

Task agent chats should close the loop. After Claude output, PR status,
merge status, checks, or task completion, the task agent should provide the
next exact prompt/task, the next verification step, a migration/pause/archive
packet, or a clear terminal stop. The user should not need to ask "what now?"
after every status update.

Task agent chats should also route work to the right resource. If a
problem needs user judgment, idea-chat reframing, research, a proposal/ADR/spec,
an evidence ledger, a migration packet, or Claude implementation, the task agent
should say so and provide the smallest concrete next packet or question.

Research ownership must be explicit. The handoff or task packet should say
whether the task agent researches before Claude continues, Claude researches
official coding docs during implementation, no online research is needed, or
live repo/GitHub verification is required.

When pasting large task context or Claude output, wrap it in clear delimiters so
the model does not confuse context with instructions:

```text
<current_task_packet>
...
</current_task_packet>

<claude_output>
...
</claude_output>
```

Do not hide live-state requirements inside prose. Put them in the task packet's
verification fields.

## Update Rule

Do not casually self-edit these shared prompt files during implementation work.
Work chats may recommend changes, but prompt-doc edits should be deliberate.

Update these files only when:

- a repeated failure pattern appears
- a stale instruction is identified
- a boundary rule needs clarification
- a better reusable template is created
- a repo-system decision changes how chats should operate

Every update should also update `prompt-change-log.md` with:

- what changed
- why it changed
- what failure it prevents
- whether it is durable or temporary

The `START-*.md` files should also follow this rule. They are durable launch
files, not disposable scratch notes.

## Prompt Quality Check

Before using or updating a prompt, check that it has:

- a clear role
- a concrete goal
- success/done criteria
- explicit non-goals or no-touch areas
- source-of-truth and verification rules
- Claude/execution ownership when using task agent chats
- research ownership when external facts may matter
- loop-closure expectations for status, merge, and completion responses
- escalation/collaboration paths for user decisions, idea chats, research, and
  repo decision artifacts
- expected output format
- effort/model guidance when risk varies
- current facts separated from durable instructions

For material prompt edits, run the relevant examples in
`prompt-smoke-tests.md` mentally or in a fresh chat before treating the change as
durable.

## Chat Freshness

Long chats can become lower quality when stale context, old assumptions, or too
many completed subtasks remain in scope. When a chat is long, confused, or
starting a new workstream, migrate into a fresh chat using
`chat-migration-template.md`.

Migration is a continuity tool. It should preserve durable decisions, active
constraints, current blockers, and the next task. It should not carry every
detail, stale branch fact, or completed tangent.
