# Strategic Foundation Gate

Use this when a head or manager lane is about to set priorities, route a major
workstream, or pressure-test direction and the strategic foundation may be
missing, stale, or too thin.

The user-facing system should feel alive and self-aware, not like a dumb router
that blindly launches execution without noticing missing direction.

## Why This Exists

Execution quality collapses when the system quietly pretends direction already
exists.

Common failures:

- there is no `VISION.md`, but the lane still speaks as if long-run direction is
  settled
- there is no `ROADMAP.md`, but the lane still starts coordinating milestones
- there is a vague idea, but no clear decision whether the user wants:
  - vision work
  - roadmap work
  - brainstorming
  - or immediate bounded execution
- the lane notices missing direction but says nothing helpful
- the lane turns the gap into process theater instead of one smart suggestion

## What 10/10 Looks Like

If strategic foundations are weak, the lane should:

- notice it early
- explain the gap simply
- recommend one useful next move
- let the user steer with a light `go`, `ok`, or `sounds good`
- then execute the chosen clarification path quickly

The system should help the user decide, not make them discover the missing
structure on their own.

## When To Run

Run this gate when:

- head is setting priorities or deploying a new major lane
- manager is shaping a meaningful workstream and direction feels under-specified
- the user gives an idea but not enough direction to tell whether it wants
  strategy, sequencing, or execution
- the lane is tempted to invent roadmap certainty that does not exist

## What To Check

### Vision

Ask:

- does `VISION.md` exist?
- is it real direction or just a slogan?
- does the current work clearly map to it?

### Roadmap

Ask:

- does `ROADMAP.md` exist?
- does it translate the vision into active tracks or milestones?
- is the current work clearly placed inside it?

### Idea maturity

Ask:

- is this already clear enough for bounded execution?
- does it really want sequencing/planning?
- does it want exploration first?

## Recommended Interpretation

Use the smallest honest diagnosis:

- no vision: direction is too shallow for strategic prioritization
- no roadmap: direction exists, but sequencing is under-specified
- both weak: the system should not pretend the larger plan is settled
- both present: move on and execute without ceremony

## Output Rule

Do not dump a long process menu.

If the foundation is weak, use `Recommended next move:` and make one clear
recommendation such as:

- create or tighten `VISION.md`
- create or tighten `ROADMAP.md`
- launch a brainstorm to shape the idea
- proceed with bounded execution because the gap is not material

## Anti-Patterns

Bad:

- silently launching a super when the user is still deciding what they want
- acting as if roadmap truth exists when it does not
- asking vague questions like "what do you want to do?" after already spotting
  the missing foundation
- turning the fix into a giant planning ritual

Better:

- spot the missing foundation
- recommend one smart next move
- let the user approve lightly
- then move
