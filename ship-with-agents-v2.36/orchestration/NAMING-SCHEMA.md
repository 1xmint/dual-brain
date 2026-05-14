# Naming Schema

Use this file when you want the durable naming rule for the public
orchestration package.

The package naming system has five layers. Each layer has one job.

## 1. Visible Chat Title

This is what the buyer sees in a sidebar or app thread list.

Pattern:

`<Role> - <product / repo> / <mission>`

Examples:

- `Head - Portfolio / Priorities`
- `Doctor - Repo Ops / Quality Audit`
- `Supervisor - App Core / Checkout Rollout`
- `Agent - App Core / Checkout API`
- `Worker - App Core / Auth Test Fixes`
- `Brainstorm - Portfolio / Pricing Options`

Rule:

- visible titles should explain themselves without decoding shorthand
- numbers should be optional in user-facing titles, not the main identity
- the title should communicate mission and scope before lineage

## 2. Stable Lane Key

This is the durable internal lane identity.

Pattern:

`<role>-<number>` or `<role>-<number>-<slug>`

Examples:

- `head-1`
- `doctor-1-package-audit`
- `super-1-checkout-rollout`
- `agent-12-checkout-api`
- `agent-13-checkout-ui`
- `worker-4-auth-test-fixes`
- `brainstorm-3-pricing-options`

Rules:

- use full role words, not single-letter codes
- the lane key identifies ownership, not progress
- do not put phase, chunk count, rotation count, or crash count in the
  stable lane key
- super ownership does not get encoded into an agent lane key

If you need to know who owns an agent lane, store that in the owner field of
the active map, slice, checkpoint, or closeout.

## 3. Repo Scope Metadata

Repo identity belongs in explicit fields, not hidden inside one overloaded
token.

Use fields such as:

- `repo slug`
- `repo root`
- `workspace root`
- `worktree id`
- `customer / portfolio slug` when relevant

Examples:

- repo slug: `repo-ops`
- repo root: `C:\repos\repo-ops`
- stable lane: `super-4-release-preflight`

If two live lanes would otherwise look confusing, surface repo identity in the
visible title or stable slug:

- `Supervisor - repo-ops / Release Preflight`
- `super-4-repo-ops-release-preflight`

## 4. Progress Metadata

Progress belongs in explicit fields, not inside the lane key.

Use fields such as:

- `owner lane`
- `workstream`
- `phase`
- `milestone`
- `chunk`
- `state`
- `last verified`

Bad:

- `s5.1 -> s5.2` to show chunk progress

Better:

- stable lane: `super-1-checkout-rollout`
- phase: `p2`
- chunk: `c02`

## 5. Session Continuation Token

Session continuity is separate from ownership and progress.

Patterns:

- healthy original session: `<stable lane key>`
- planned rotation: `<stable lane key>--run2`
- crash recovery: `<stable lane key>--recover1`
- combined: `<stable lane key>--run2--recover1`

Examples:

- `head-1--run2`
- `super-1-checkout-rollout--run2`
- `agent-13-checkout-ui--recover1`
- `agent-13-checkout-ui--run2--recover1`

Rules:

- continuation counters reset per lane
- continuation tokens never rename checkpoint files
- continuation tokens do not carry project meaning

## Practical Rule

If a name is trying to tell you:

- role
- owner hierarchy
- progress
- phase
- rotation history

all from one compact token, the naming system is overloaded.

Split that meaning across:

- visible title
- stable lane key
- repo scope metadata
- progress fields
- continuation token

## Legacy Note

Older artifacts may still contain compact IDs, single-letter role shorthands,
or bare recovery counters from older generations of the system.

Treat those as legacy or compatibility shorthand, not as the default public
schema for new package docs and examples.
