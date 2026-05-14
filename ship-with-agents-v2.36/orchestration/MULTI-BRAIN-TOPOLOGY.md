# Multi-Brain Topology

Use this when deciding whether the work wants one brain, two brains, or three.

## Core Truth

More brains are not automatically better.

The goal is:

- enough independence for the risk
- enough speed for the task
- enough context purity for real quality

## Default Shapes

- `single-lane`: tiny, reversible, honest self-check possible
- `direct-agent`: bounded execution, low review overhead value
- `T2`: `super + agent`
- `T3`: `manager + super + agent`
- `T4`: `manager + super + agent + audit brain`
- `T5`: multiple review/execution cells under head

## Escalate Brain Count When

- weird-but-test-passing mistakes matter
- launch mistakes are expensive
- one manager has lost context purity
- multiple repos or customer tracks are active
- a provider-diverse review would likely catch different failure modes

## Stay Lighter When

- rollback is cheap
- the task is small
- the added brain would mostly restate obvious truth
- copy overhead would dominate the value

## Final Rule

Topology should be earned by risk, not by available subscriptions alone.
