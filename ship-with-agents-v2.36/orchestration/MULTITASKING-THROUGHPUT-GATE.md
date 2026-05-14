# Multitasking Throughput Gate

Use this when deciding whether work should stay sequential, split into child
slices, or fan out into multiple live execution lanes.

This exists because "safe" and "fast" should not be enemies.
The system should not serialize work by habit, and it should not parallelize
just because extra lanes are available.

## Core Truth

All coordination lanes should actively look for safe throughput gains.

That means:

- head looks for safe parallel workstreams and super lanes
- the current review brain looks for safe parent-slice and child-slice
  decomposition
- supers look for safe agent fanout under one supervisory lane
- agents look for safe subagent fanout inside their own bounded slice

The goal is not "maximum lanes."
The goal is "maximum trustworthy throughput."

## Responsibility By Layer

### Head

Head should always ask:

- can this larger effort be split into independent workstreams?
- does one super own this best, or do we need multiple supers?
- are we accidentally forcing serial work that could run safely in parallel?

Head should push for multitasking across:

- independent repos
- independent product tracks
- independent phases with low coupling

Head should not micromanage child-slice choreography inside a live super-owned
lane unless strategy, approval, or escalation actually requires it.

### Review brain

The active review brain should always ask:

- is this still one slice?
- should this become a parent slice plus child slices?
- is the current plan under-parallelized?
- is it over-parallelized and hiding collision risk?

The review brain pressure-tests the fanout plan.

### Super

The super is the default owner of execution fanout.

For a meaningful workstream, the super should ask:

- do I have one execution slice or a parent slice with several child slices?
- which child slices can launch now?
- which must wait for another checkpoint?
- which should go to direct agents?
- which need supervised agent ownership?

One super may own multiple live child slices and multiple live agent lanes when
the collision map is honest.

### Agent

An agent should still look for bounded subagent parallelism when:

- child work is truly disjoint
- the execution lane already owns the implementation slice
- the extra fanout helps more than it fragments context

## Parent Slice Rule

When the work is bigger than one honest execution packet but still belongs to
one operational owner, prefer:

- one parent slice
- several child slices
- one super owning the fanout plan

Do not force head to manage every child packet if one live super already owns
the execution lane.

## Child Slice Rule

A child slice should be the real unit of launch.

A child slice should carry:

- exact owned surface
- dependency status
- verification path
- whether it is parallel-safe now

If that is not clear, the slice is not ready to fan out.

## Collision Checks

Before increasing concurrency, check:

1. repo overlap
2. file overlap
3. shared barrel/index/config surfaces
4. import or build-order dependency
5. test-coupling or migration coupling
6. whether one child slice changes assumptions in another
7. whether the supervision layer can still review all live lanes honestly

If any of those are unclear, do not call the work parallel-safe yet.

## Throughput Decision Order

Ask these in order:

1. is the current work large enough to justify decomposition?
2. are there at least two real child deliverables?
3. are those child deliverables disjoint enough to overlap safely?
4. would extra lanes save wall-clock time after rebuild/context overhead?
5. can the current owner supervise the fanout honestly?
6. if yes, should the fanout stay under one super?
7. if not, does head need a second super lane?

## Default WIP Limits

Use these as safety defaults, not hard law:

- same repo, shared surfaces unclear: `1` live execution child slice
- same repo, disjoint owned files and explicit no-touch rules: `2` live child
  slices
- different repos or very cleanly disjoint surfaces: `2-3` live child slices
  under one super
- beyond `3` live child execution lanes under one super: justify explicitly
  with a collision map and review plan

If the buyer asks for more throughput, that is a reason to inspect the split
harder, not to skip the split analysis.

## When To Stay Sequential

Stay sequential when:

- one slice unlocks the others
- shared hot files make merge friction likely
- the real bottleneck is thinking, not execution
- the same lane would just rebuild the same context in multiple places
- one careful checkpoint will materially change the next packet

## Good Patterns

```text
Head approves one larger phase.
Review brain and super split it into three child slices.
Super launches two disjoint agents now and holds the third behind a dependency.
```

```text
One super owns backend, data, and docs child slices in parallel because the
owned surfaces are explicit and the closeout order is clear.
```

## Bad Patterns

```text
Head and super force one giant slice through a single lane even though two safe
child slices were obvious.
```

```text
The system spawns four parallel agents in one repo without explicit owned-file
boundaries and then calls the merge pain "just multitasking."
```

```text
Head keeps trading detailed slice iterations while a live super could already
own the fanout.
```

## Final Rule

If the user could reasonably ask:

"Why are we still doing this one slice at a time?"

or:

"Why did we open all these lanes without a believable collision map?"

then the throughput decision is probably wrong.
