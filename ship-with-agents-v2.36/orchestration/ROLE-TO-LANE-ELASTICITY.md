# Role To Lane Elasticity

Use this when deciding whether work should stay in the current lane or split
into a new role-owned lane.

## Core Truth

- roles are logical functions
- lanes are deployed containers
- not every role function deserves its own new chat

10/10 orchestration earns extra lanes. It does not spawn them by reflex.

## Keep Work In The Current Lane When

- the task is tiny
- the scope is already clear
- there is no meaningful follow-up chain
- another lane would cost more than it saves

## Use A Direct Agent When

- the work is bounded
- execution is real and repo-connected
- one durable execution owner helps
- full supervision would be wasteful

## Use A Super-Owned Execution Lane When

- several packets need coordination
- sequencing or fanout matters
- checkpoints, pickup, and closeout need a durable owner
- the same live workstream already has a healthy super that should keep owning
  dev-sized follow-on work

## Use Manager Or Current Super Instead Of A Fresh Super When

- the question is one more bounded same-workstream trial
- the review boundary did not materially change
- a direct agent or hot-lane reuse would preserve quality with less startup
  cost

## Add Manager-Style Challenge When

- scope quality is still uncertain
- launch readiness deserves pressure-testing
- the user wants stronger review before execution ramps
- one clean review brain would materially improve quality

Manager is optional, not mandatory.

## Use Multi-Lane Portfolio Routing When

- multiple repos are active
- one owner would become the bottleneck
- one lane would otherwise carry unrelated coordination duties

## Anti-Patterns

- opening a super for tiny one-shot work
- opening a second super for the next seam of a hot workstream when the current
  super could stay hot
- opening a fresh super for a tiny same-workstream review question that manager
  could answer directly
- forcing a direct agent to carry a multi-stage workstream that wants
  supervision
- treating every meaningful task as full ceremony
- assuming a role function automatically means a separate chat

## Final Rule

Ask:

"What is the lightest honest structure that still preserves quality?"

Use that answer instead of defaulting to either one-chat heroics or multi-chat
theater.

Then ask:

"Is the chosen container honestly compatible with the lane role I'm about to
name?"
