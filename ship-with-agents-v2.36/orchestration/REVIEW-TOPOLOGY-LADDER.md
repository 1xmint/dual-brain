# Review Topology Ladder

Use this when deciding how much review structure a workstream deserves.

This is the review-density companion to `ADAPTIVE-ROUTING-LADDER.md`.

## Core Truth

Do not ask only:

- how many lanes should exist?

Also ask:

- how many independent review functions should exist?
- does one manager still have clean context?
- would a second brain actually catch something useful?

The goal is not "maximum review."
The goal is "enough independent judgment for the risk."
Brain count is just one expression of topology. Do not add a second or third
brain unless the extra review function is concrete and valuable.

## T0 - Single-Lane

Use when:

- the task is tiny
- rollback is trivial
- one lane can own execution and self-check honestly

## T1 - Direct Execution Plus Normal Closeout

Use when:

- execution is real
- one durable owner helps
- review overhead would exceed value

Typical shape:

- direct agent
- optional super closeout

## T2 - Supervised Execution

Use when:

- multiple execution steps exist
- checkpoints or sequencing matter
- execution coordination is more important than independent review

Typical shape:

- `super + agent`

## T3 - Standard Dual-Brain

Use when:

- scope quality is still uncertain
- weird-but-test-passing mistakes would matter
- one real review brain should challenge one execution coordinator

Typical shape:

- `manager(review) + super(coordination) + agent(execution)`

## T4 - Audited Dual-Brain

Use when:

- launch mistakes are expensive
- architecture or safety debt matters materially
- the manager/super pair itself deserves independent pressure-testing

Typical shape:

- `super + agent`
- `manager(review brain)`
- `independent audit brain`

The audit brain may be:

- a second manager-style lane
- a bounded doctor audit
- a provider-diverse review lane

Adding a third brain is only justified when it contributes a named independent
function that the first two brains do not already cover. Otherwise, keep the
topology lighter.

## T5 - Portfolio Multi-Cell

Use when:

- multiple repos or customer tracks are active
- one manager would become a bottleneck
- several workstreams deserve independent review density at the same time

Typical shape:

- `head`
- multiple repo- or track-scoped review/execution cells

## Inputs That Matter

Always consider:

- assurance level
- blast radius
- reversibility
- repo count
- live workstream count
- manager load
- provider capability mix
- user budget posture
- user appetite for extra lanes

## Speed Rule

If a heavier topology does not buy:

- better quality
- cleaner context
- more trustworthy independence
- or less buyer busywork

stay one level lighter.

## Final Rule

Do not let one review lane become a hidden bottleneck just because it is
technically still functioning.
Topology should be earned by risk, context purity, and independence value, not
by available subscriptions alone.
