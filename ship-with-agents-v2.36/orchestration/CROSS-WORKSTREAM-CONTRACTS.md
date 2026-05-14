# Cross Workstream Contracts

Use this when multiple cells touch the same surface or assume the same truth.

## Core Truth

Some workstreams are independent.
Some are only independent until they touch the same contract.

## Contract Types

Treat these as cross-workstream contracts:

- shared API shape
- shared schema or migration assumption
- shared config or environment rule
- shared release promise
- shared naming or routing truth
- shared deployment or publish boundary

## What To Record

For each meaningful shared contract, keep:

- `contract name`
- `owning workstream`
- `dependent workstreams`
- `risk if drift occurs`
- `how drift is detected`

## Final Rule

If two active workstreams touch the same contract and the contract is only
implicit, conflict risk is already too high.
