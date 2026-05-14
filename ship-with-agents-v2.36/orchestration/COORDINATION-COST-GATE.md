# Coordination Cost Gate

Use this before opening a fresh lane, rotating a hot lane, or wrapping a small
same-workstream question in a new review container.

## Core Truth

Every new lane has a cost:

- startup tokens
- identity and inbox risk
- update-bus sync cost
- repeated context summary cost
- more chances for drift in naming, ownership, and tails

If a new lane does not buy enough quality, clarity, or throughput to justify
that cost, it is waste.

## What Counts As Coordination Cost

Count these explicitly:

- fresh prompt/startup overhead
- lane-birth/runtime registration work
- repeated workstream recap
- extra review tail and handoff tail
- another checkpoint/closeout chain
- another chance to lose live rule updates

## Fresh-Lane Test

Before opening a fresh lane, answer:

1. what quality gain does the new lane buy?
2. what clarity gain does the new lane buy?
3. what parallelism gain does the new lane buy?
4. what is the startup/context cost?
5. is the gain larger than the cost?

If those answers are weak, stay lighter.

## Default Bias

Prefer this order:

1. stay in the current lane
2. direct agent
3. reuse the hot execution owner
4. only then open a fresh supervisor or review lane

## Same-Workstream Trial Rule

If the question is:

- one more bounded trial
- one more bounded proof
- one more bounded real-use pass
- one small follow-on seam in the same hot workstream

then default against a fresh supervisor unless:

- the coordination boundary truly changed
- the current execution owner is no longer healthy
- or manager review quality would clearly improve from a separate lane

## Anti-Patterns

- new supervisor for every new seam name
- review lane for a tiny same-workstream question the manager can already
  answer
- treating "fresh chat" as automatically better than "hot lane reuse"
- relaunching because the new packet is narratively neat, not operationally
  necessary

## Output Discipline

When this gate matters, state:

- `Coordination cost: low / medium / high`
- `Why a fresh lane is worth it:` or `Why it is not worth it:`

## Final Rule

If a buyer could reasonably ask:

"Why did this need a whole new lane?"

and the system has no strong answer, it should not have spawned it.
