# Todo Policy

How to use Claude Code's built-in todo tracking without turning every session
into ceremony.

## Default Rule

Use built-in todos for non-trivial work. Skip them for tiny one-shot tasks.

The point is not productivity theater. The point is drift control.

## Required Triggers

Use todos when any of these are true:

- the work has 3 or more meaningful steps
- the task is cross-repo
- auth, infra, migrations, or audits are involved
- the workstream is long-running
- the chat owns routing or coordination, not only one tiny edit
- the user gave a multi-part list

## Good Uses

- super deployment and review work
- agent execution with multiple deliverables
- recovery or salvage passes
- migrations
- packaging or release passes
- audit or review lanes

## Usually Skip For

- one-file typo fixes
- tiny documentation edits
- single-command lookups
- one obvious bounded change with no meaningful branching

## Role Guidance

### Head

Use todos for meaningful routing or multi-step planning.

### Super

Use todos for most non-trivial lanes. Supers coordinate enough moving pieces
that explicit tracking usually helps.

### Agent

Use todos when the workstream is larger than one quick slice or when verification
has multiple steps.

### Worker

Use todos for medium and large tasks, but not for every tiny implementation.

### Brainstorm

Usually skip todos during open-ended ideation. Add them once the brainstorm has
converged into a structured comparison or handoff.

## Hygiene Rules

- keep one item `in_progress` at a time when possible
- close completed items instead of leaving them hanging
- rewrite the todo list if the scope changes materially
- do not let the todo list become a giant speculative backlog

The todo list should reflect the current execution reality, not every possible
future thought.

## Relationship To Other Gates

- use `STARTUP-SYNTHESIS-GATE.md` to decide what kind of task this really is
- use `ROLE-AWARE-COMPACTION.md` if the session is drifting even with todos
- use `REFLECTION-TRIGGERS.md` to capture durable lessons at work boundaries
