# Context Tax Heuristic

Use this when a lane is not obviously broken, but still feels more expensive,
slower, or noisier than it should.

This exists because quality often degrades before token pressure looks scary.

## Core Idea

Context tax is the low-grade penalty from carrying too much irrelevant residue
in one lane.

Examples:

- too many resolved branches still in the lane
- too much launch-packet drafting residue
- broad exploration now outweighs the real task
- repeated user restatements of already-decided truth
- mixed routing and execution cleanup in one chat

## Tax Levels

### `CT0 Clean`

- one coherent active problem
- little residue
- no visible re-derivation

Response:

- continue

### `CT1 Noticeable`

- some resolved branches still present
- packet or review residue is starting to dominate
- the lane is still coherent, but less efficient than before

Response:

- review compaction soon

### `CT2 Costly`

- several resolved branches remain active in the lane
- repeated re-derivation or user restatement is visible
- broad exploration or logs are burying the active work

Response:

- compact now if the lane is still the right container
- otherwise rotate

### `CT3 Contaminating`

- the lane is carrying several different jobs
- routing mistakes or naming drift are showing up
- the user can feel the lane is too mixed

Response:

- stop adding work
- rotate or migrate now

## Score The Lane

Add one point for each true statement:

- two or more resolved branches still dominate the lane
- broad logs or exploration now outweigh the active task
- packet-drafting residue is crowding execution
- the user recently restated truth the lane should have retained
- routing plus implementation plus review are all mixed together
- there are several open decisions that belong to different phases

Suggested read:

- `0-1` points = `CT0-CT1`
- `2-3` points = `CT2`
- `4+` points = `CT3`

## Relationship To Other Gates

- use `CONTEXT-LOAD-GATE.md` for heavier structural overload
- use this heuristic for earlier salience and efficiency drift
- use `ROLE-AWARE-COMPACTION.md` once the tax level says the lane needs action

## Final Rule

Do not wait for context collapse.

If the lane is paying a visible context tax, intervention is already due even
if the model can technically still hold more tokens.
