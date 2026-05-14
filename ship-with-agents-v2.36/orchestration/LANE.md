# Lane

Use this as the canonical lane doctrine.

It replaces the old split guidance for lane choice, ownership, birth, capsule
state, inbox provisioning, welcome/orientation, heartbeat/awareness, lifecycle
events, map visuals, and closeout.

Also read `ARTIFACT-CUSTODY-GATE.md` when the next move involves mutating the
canonical slice, review memo, or launch tail itself.

## Core Truth

Lane behavior should feel like one coherent control-plane model, not a grab bag
of tiny docs.

Lane creation, ownership, visibility, and closeout are lifecycle mutations.
Treat them as one connected system.

## Lane Shapes

Ask in this order before adding structure:

1. Can the current lane do this honestly without spawning?
2. Is this a tiny bounded packet that wants a direct agent?
3. Is there already a hot execution owner that should be reused?
4. Does this need a fresh supervisor because the coordination boundary changed?
5. Does this need manager review or dual-brain review?
6. Does this actually want brainstorm or doctor instead of execution?

Return:

- `Recommended structure:`
- `Why:`
- `Rejected alternatives:`
- `Expected payoff:`
- `Context cost:`
- `Coordination cost:`

Available shapes:

- `stay here`
- `direct agent`
- `reuse current super`
- `new super`
- `manager review cell`
- `doctor audit`
- `brainstorm`

If a lane choice cannot explain why lighter alternatives were rejected, the
system is probably adding unnecessary structure.

## Ownership

Name these separately when the work is meaningful:

- `Strategic owner:`
- `Operational owner:`
- `Execution owner:`

Default rule:

- head keeps strategic authority
- manager keeps operational ownership of manager-owned workstreams
- super keeps operational ownership of super-owned child lanes
- agent keeps execution ownership of its own bounded task

Approval alone does not automatically reclaim a workstream, authorize a
grandparent layer to launch the next child lane, or erase the current
operational owner.

If ownership changes, say it plainly:

- `Ownership change: operational owner <old lane> -> <new lane>`

After reclaiming:

- update the active map
- say who now owns launch, closeout, next routing, and artifact custody

Child lanes should normally be closed, paused, rotated, or replaced by their
immediate parent owner. If a higher layer wants to do that instead, it should
first reclaim ownership explicitly.

Before emitting `Launch this:` or final child-lane closeout, ask:

1. who currently owns this workstream operationally?
2. am I that owner?
3. if not, has ownership been explicitly reclaimed?

If not, route the next exact artifact back to the operational owner.

## Birth Transaction

Lane creation is one logical transaction, not a loose pile of actions.

Required birth outputs:

- resolved `display name`
- resolved `stable lane`
- resolved `routing id`
- active-map row
- inbox file
- lane brain capsule
- workstream or parent-lane linkage
- startup self-check
- lifecycle event
- launch state

Each meaningful lane should also get:

- `mission`
- `scope`
- `non-goals`
- `next move`

Do not announce a meaningful lane as launched until the container and the
control-plane registration both exist.

## Capsule And Inbox

Recommended lane-local capsule path:

- `lanes/<stable-lane>/STATE.md`

Minimum fields:

- `display name`
- `stable lane`
- `routing id`
- `role`
- `parent lane`
- `repo scope`
- `workstream id`
- `mission`
- `scope`
- `non-goals`
- `mailbox path`
- `inbox path`
- `current slice`
- `current checkpoint`
- `review state`
- `next owner`
- `next move`
- `lifecycle state`
- `last synced`

Default inbox rule for active meaningful lanes:

- `mail/inbox/<routing-id>.md`
- `updates/inbox/<routing-id>.md`

Only skip inbox provisioning when the lane is explicitly ephemeral, has no
durable file access, or the user explicitly wants a one-off disposable lane.

## Welcome And Clarity

A new lane should not feel like a random extra chat.

Minimal welcome shape:

- `Role:`
- `Mission:`
- `How I'll help:`
- `Interaction style:`

When multiple live lanes exist and a visual will reduce confusion, prefer a
Mermaid flowchart or a tiny owner table showing:

- lane
- mission
- next owner
- current state

Only draw the lane map when it reduces confusion about ownership or current
flow.

## Heartbeat And Awareness

A heartbeat is not "the chat exists."

Heartbeat evidence includes:

- meaningful turn logged
- inbox read or sync performed
- lane capsule refreshed
- workstream state confirmed

Required heartbeat fields:

- `routingId`
- `displayName`
- `stableLane`
- `workstreamId`
- `lastMeaningfulTurnAt`
- `lastInboxReadAt`
- `lastStateSyncAt`
- `lastVerifiedBy`
- `heartbeatStatus`
- `notes`

Heartbeat status values:

- `healthy`
- `quiet`
- `stale`
- `half-born`
- `closed`
- `unknown`

Awareness score dimensions:

- identity awareness
- inbox awareness
- workstream awareness
- next-owner clarity
- buyer/lane boundary discipline
- self-correction discipline
- closeout discipline

Score with:

- `green`
- `yellow`
- `red`

Persistent yellow/red awareness is structural quality debt, not just phrasing.

## Lifecycle Events And Closeout

Lane lifecycle events:

- `lane-created`
- `lane-registered`
- `lane-inbox-provisioned`
- `lane-startup-self-check`
- `lane-paused`
- `lane-closed`
- `lane-superseded`
- `lane-repaired`

Minimum event fields:

- `eventId`
- `timestamp`
- `eventType`
- `displayName`
- `stableLane`
- `routingId`
- `role`
- `workstreamId`
- `lifecycleState`
- `summary`

Required closeout outputs:

- final checkpoint or closeout truth
- lifecycle state change
- active-map mutation
- successor link if applicable
- final inbox/handoff note if needed
- lifecycle event

If a lane is done but still looks active everywhere, closeout did not finish.

## Adjacent Docs

Use these alongside `LANE.md` when needed:

- `LANE.md` for active-map mutations during real closeout
- `LANE.md` for keeping the visible lane map honest
- `STARTUP-SELF-CHECK-GATE.md` for first-turn lane self-validation
- `LIFECYCLE-REPAIR-PROTOCOL.md` for repairing half-born or confused lanes
- `WORKSTREAM-STORY-MODEL.md` for the lane-to-workstream narrative link

