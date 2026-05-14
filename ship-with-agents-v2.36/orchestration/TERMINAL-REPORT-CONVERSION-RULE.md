# Terminal Report Conversion Rule

Use this when a terminal lane is about to show execution truth directly to the
buyer.

## Core Truth

A good machine-facing completion report is not automatically a good
buyer-facing closeout.

Terminal lanes often know the freshest execution truth, but they are not always
the right control plane for the human. If the intended recipient is a manager,
super, or other coordination lane, the visible output must still be converted
into a buyer-ready closeout shape.

## What Must Be Resolved

Before a terminal lane stops on a meaningful completion, resolve and state:

1. `Visible recipient:` who is actually reading this turn
2. `Intended recipient:` who should own the next coordination step
3. `Current surface:`
4. `Effort level:`
5. `Execution outcome:`
6. `Closeout outcome:`
7. `Next owner:`
8. `Bridge mode:`
9. `What I already routed or updated:`
10. `Buyer action mode:`

If `Visible recipient` and `Intended recipient` are different, the lane must
either:

- route internally and say exactly what was routed, or
- emit the exact bridge artifact in the same turn

If a live parent lane can already absorb runtime mail or current artifact
truth, buyer action mode should usually become a tiny parent pickup trigger
instead of raw terminal relay.
If the visible recipient is not the intended owner and the buyer later pastes
the report into the wrong coordination lane, that lane should reject or reroute
it rather than adopt it as its own completion proof.

## Default Rule For Direct Agents

When a direct agent is visible to the buyer:

- do not stop at a polished execution summary
- do not assume the buyer can infer the manager closeout step
- do not leave `Checkpoint written ...` as the only routing signal

Instead:

- convert the completion into manager-ready closeout truth, or
- give one exact manager bridge first

## Strong Pattern

- execution summary stays concise
- recurring friction stays visible
- manager-owned next decision is explicit
- the first buyer action, if any, is the exact bridge
- if buyer action remains, a short `For you:` block starts with the easiest
  correct action
- if a live parent pickup trigger is enough, the lane says so plainly and says
  no terminal copy is needed

## Weak Pattern

- `Workstream Complete` plus checkpoint path only
- `recommended next move` with no `Next owner`
- `routes back to manager` with no internal routing proof or bridge block
- assuming the buyer is the manager lane
- assuming any lane the buyer pasted into must now be the owner
- leaving the buyer to decide what to paste and where
- model named but no effort or surface context
- `Open items for manager` with no `done` or `read your inbox` guidance even
  though a live parent exists

## Example

`Visible recipient: buyer`

`Intended recipient: Manager - Product`

`Current surface: terminal`

`Effort level: high`

`Execution outcome: batch trial completed; all packet goals done`

`Closeout outcome: manager closeout still required`

`Next owner: the active manager chat for this workstream`

`Bridge mode: buyer-pickup`

`What I already routed or updated: checkpoint refreshed at _agent-system-runtime/checkpoints/product-launch-batch.md`

`Buyer action mode: one tiny pickup trigger`

`For you: you can just say done to the active manager chat for this workstream. You do not need to paste anything from this terminal unless I say so.`

## Final Rule

If the buyer could still reasonably ask "was that for me, for the manager, or
what exactly do I do with it?" or "do I need to copy anything from this
terminal?" the report was not fully converted.
