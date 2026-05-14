# Routing Matrix

Use this file when you are deciding what mode fits a task.

Do not route by instinct alone. Route by the shape of the work.

Also read:

- `REPO-SCOPE-GATE.md`
- `ROLE-TO-LANE-ELASTICITY.md`
- `ADAPTIVE-ROUTING-LADDER.md`
- `OPERATOR-ORCHESTRATION-PROFILE.md`

## The Five Dials

Score the task informally on these five dials:

1. `Task size`
   - tiny
   - medium
   - large
2. `Blast radius`
   - low
   - medium
   - high
3. `Reversibility`
   - easy to undo
   - annoying to undo
   - expensive to undo
4. `Parallelism value`
   - little benefit
   - some benefit
   - strong benefit
5. `Review value`
   - normal self-review is enough
   - separate review helps
   - independent challenge is worth it

Also note the current runtime shape:

- desktop/app lane
- terminal lane
- IDE agent lane
- web/manual lane

Do not pick a workflow that assumes capabilities the live lane cannot prove.

## Recommended Modes

| Situation | Best mode | Typical shape |
|---|---|---|
| Tiny, reversible, low-risk | Lightweight shared-repo | Strategy chat + one execution chat |
| Medium, bounded, clear spec | Direct standalone agent | `agent-<N>-<workstream>` |
| Medium, multi-step, needs coordination | Super + one or more agents | `super-<N>-<slug>` -> `agent-<N>-<workstream>` |
| Large, separable workstreams | Multiple supers | `head-<N>` -> multiple `super-<N>-<slug>` lanes |
| High review value or expensive to reverse | True dual-brain audited mode | Execution -> super review -> second-brain challenge |
| Short helper slice inside active work | Helper subagent | Spawned helper under the owning chat |

## Helper Vs Manual Terminal Agent

Use a helper subagent when:

- the slice is bounded
- the result can come back quickly
- exact runtime control does not matter
- the helper does not need its own visible lifecycle

Use a manual terminal agent chat when:

- exact model or effort control matters
- the worker needs its own checkpoint and migration path
- the workstream may last a while
- the worker may need to orchestrate its own helpers
- the human should be able to see a durable named owner for the work
- the current app or IDE lane should stay in its durable owner role while a
  separate execution lane does the repo work

## Adaptive Routing Rules

### Stay Lightweight

Stay lightweight when:

- one person is still the clear primary operator
- the collaborator is bounded
- the work is still understandable through repo-local docs and task
  packets
- orchestration overhead would exceed the value

### Use A Direct Standalone Agent

Use a direct standalone agent when:

- the task is medium-sized but not broad enough to justify a super lane
- the user wants one durable execution owner
- you do not need another live coordination layer yet

Naming:

- `agent-<N>-<workstream>` for standalone direct agents
- example: `agent-12-auth`, `agent-13-query-cache`

### Use A Super

Use a super when:

- several work packets need coordination
- sequencing matters
- parallelism needs to be managed deliberately
- checkpoints and workstream routing need a durable owner

### Use Multiple Supers

Use multiple supers when:

- the project has clearly separable major lanes
- one super would become a bottleneck
- the user wants real parallel throughput across distinct workstreams

Do not create multiple supers just because the project is important.
Create them when coordination itself needs to scale.

### Use True Dual-Brain Audited Mode

Use audited mode when:

- weird but test-passing code would hurt
- the work touches trust, architecture, release, or precedent
- one review loop is not enough
- the second brain can contribute real independent challenge

## Closeout Rules

- Low-risk work can close with normal execution plus review.
- Quality-sensitive work should use audited closeout.
- If the brains disagree in audited mode, surface the disagreement
  explicitly instead of pretending there is consensus.

## Fallback Rule

If the right mode is not obvious:

1. Start one level lighter.
2. Write a clean task packet.
3. Escalate only when a real failure or coordination need appears.

This package is designed to earn complexity, not assume it.

That also means roles are logical functions first. Use separate lanes only
when they buy quality, speed, or clarity.
