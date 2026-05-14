# Doc Update Protocol

Use this when the next move is changing a canonical slice, review memo,
checkpoint, active map, or other orchestration/runtime doc.

This exists because `Update this doc:` is still too vague unless the system
also decides:

- who should edit it
- whether the current lane can edit it directly
- what artifact format is right if it cannot

Read `_agent-system/ARTIFACT-CUSTODY-GATE.md` first when the doc defines an
active workstream's scope, launch state, or next execution lane.

When the edit is larger system/package/doc surgery rather than one local
runtime-artifact change, also read `_agent-system/STAGED-EDIT-PROTOCOL.md`.

## Core Truth

Tiny coordination-doc edits should not create worker theater.

If the work is only:

- tightening a slice
- adding review notes
- updating active-lane state
- fixing a checkpoint, memo, or runtime artifact

then the nearest tool-capable coordination lane should usually do it directly.

Do not spin up a super, worker, or extra handoff just to edit a small runtime
artifact unless there is a real ownership or tool boundary.

That direct-edit shortcut only applies after artifact custody is valid.
Tool capability alone is not enough.

## Runtime Artifact Exception

For this system, orchestration/runtime artifacts are not the same as product
source code.

Examples:

- `_agent-system-runtime/slices/*.md`
- `_agent-system-runtime/reviews/*.md`
- `_agent-system-runtime/checkpoints/*.md`
- `_agent-system/ACTIVE-CHAT-MAP.md`
- `_agent-system/logs/*.md`

These can be directly edited by head/super and any extra review layer you add
for yourself when:

- the lane is tool-capable
- the change is local and bounded
- no product source code needs to move

Being read-only on product code does not automatically mean being read-only on
runtime coordination artifacts.

## Decision Order

When a canonical doc needs to change, decide in this order:

1. does `_agent-system/ARTIFACT-CUSTODY-GATE.md` allow this lane to mutate the
   artifact directly?
2. can the current lane edit the doc directly and honestly?
3. if yes, edit it directly
4. if not, is there an existing named lane that should own the edit?
5. if yes, give that lane one exact update artifact
6. only launch a new lane if neither current nor existing lanes can honestly
   own the update

If the edit touches several shared files or mirrored files, do not assume one
large patch is the cleanest move. Stage and verify by risk boundary.

## Preferred Formats

### A. Direct edit

Use when the current lane can edit the doc.

Best for:

- small slice refinements
- review memo updates
- closeout state cleanup
- active map maintenance

Response shape:

- say the doc was updated
- summarize only the important changes
- do not emit a fake copy block

### B. Exact replacement block

Use when the current lane cannot edit, but the target human or chat can replace
one named section.

Best for:

- app-lane or read-only-lane doc refinements
- human-facing copy flow
- section-scoped updates

Response shape:

- exact file path
- exact section name
- one replacement block

### C. Exact append block

Use when the update is additive and section placement is obvious.

Best for:

- adding review notes
- adding one new state note
- appending checkpoint truth

### D. Exact patch block

Use only when the target lane/tool is expected to understand patch syntax or
apply patches directly.

This is not the default human-facing format.

If the target is a user or a chat that is likely to reason in prose, prefer a
replacement or append block over raw patch hunks.

## Human-Facing Rule

If the user is the transport layer, avoid raw hunk syntax like:

- `@@`
- `*** Begin Patch`

unless the target explicitly wants patch format.

For human-facing copy, prefer:

- `Replace this section with:`
- `Append this under <heading>:`

## Small Task Rule

If the doc change is tiny and belongs entirely to orchestration/runtime truth,
prefer:

- direct edit by the current tool-capable coordination lane

over:

- sending the user to another lane
- generating a launch
- producing a long review artifact with no direct action

Exception:

- if the canonical artifact is still owned by another live coordination lane,
  route the update back to that custodian unless custody has been explicitly
  reclaimed

## Empty Block Rule

Do not emit:

- empty code blocks
- placeholder copy blocks
- a `Claude prompt` section when no Claude launch or Claude-targeted paste is
  actually next

If the next move is a direct doc edit or a same-chat continuation, omit the
Claude prompt section entirely.

## Final Rule

If a doc update is so small that the current coordination lane could have done
it directly, but the system instead created more transport work, the system
chose the wrong owner.

If a higher layer directly edits another live owner's canonical slice just
because it is tool-capable, the system chose the wrong custodian.
