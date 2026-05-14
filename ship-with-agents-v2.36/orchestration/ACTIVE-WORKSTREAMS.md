# Active Workstreams

Use this as the super's first read instead of scanning every checkpoint from
scratch.

Update it whenever a workstream starts, closes, blocks, migrates, changes
owners, or changes review state materially.

Pair this with `ACTIVE-CHAT-MAP.md`:

- `ACTIVE-WORKSTREAMS.md` = workstream routing index
- `ACTIVE-CHAT-MAP.md` = live chat lineage and ownership index

## Current Active Workstreams

- `<workstream>` - owner: `<chat>` - lane: `<stable lane id>` - repo slug:
  `<repo-ops / app-core / none>` - repo root or worktree: `<root / wt-a / none>`
  - phase: `<p1 / p2 / day0 / w3>` - chunk: `<chunk / seam / half>` - state:
  `<draft / in_review / approved / in_progress / blocked / paused / done>` -
  review topology: `<T0 / T1 / T2 / T3 / T4 / T5>` - review cell id:
  `<cell-id>` - execution owner: `<lane>` - review owner: `<lane>` - audit
  owner: `<lane / none>` - upstream dependencies: `<ids / none>` - downstream
  consumers: `<ids / none>` - sibling neighbors: `<ids / none>` - shared
  contracts: `<contracts / none>` - review state:
  `<scoping / challenge_active / recommendation_ready / execution_active>` -
  recommendation state: `<not_needed / drafting / ready / routed>` - approval
  state: `<not_needed / internal / buyer_steer / approved / blocked>` - next
  owner: `<lane>` - pickup required: `<yes / no>` - buyer steer required:
  `<yes / no>` - provider roles:
  `<review=surface; coordination=surface>` - last change event:
  `<event-id / none>` - impact radius:
  `<local / same-cell / same-repo / cross-repo / top-chain>` - last verified:
  `<timestamp>` - pickup confidence: `<high / medium / low>` - health id:
  `<workstream-id>` - slice: `slices/<file>.md` - checkpoint:
  `checkpoints/<file>.md`

## Recently Closed

- `<workstream>` - phase: `<phase>` - closed by: `<chat>` - final evidence:
  `<PR / commit / note>` - closeout: `closeouts/<file>.md` - archive:
  `<path or none>`

## Attention Queue

- `<item>` - why it needs super attention

## Notes

- Keep this compact.
- Link out to slices for plan truth and checkpoints for execution truth.
- Keep the active routing index aligned with `health/workstreams.json` and
  `health/DASHBOARD.md`.
- If the work is meaningful, keep review topology, review state,
  recommendation state, next owner, and buyer-steer state honest here too.
- If one workstream materially affects another, keep dependency and impact
  truth explicit here instead of assuming the reader will infer it.
- In multi-repo work, keep repo slug and worktree identity explicit enough that
  two similar workstreams cannot be confused.
- Use closeout packets for final closure truth on meaningful lanes.
- Treat this as the active routing index, not the deep historical record.
- Use stable lane IDs and explicit phase tags if the project is long-lived.
- If the checkpoint's freshness or resume confidence changed materially, update
  this index too.
- Once meaningful work exists, replace placeholders with real workstream truth
  instead of leaving this as a starter scaffold.
