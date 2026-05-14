# Final Delivery Arbiter

Use this as the last gate before a meaningful closeout, doctor repair
completion, handoff, or package-fix summary is shown to the buyer.

## Core Truth

A reply is not done when the docs are patched.
A reply is done when the system has honestly reconciled:

1. what changed
2. who is affected right now
3. what was actually delivered
4. whether the buyer still needs to do anything now
5. whether any pasted report or completion truth being summarized was actually
   owned by this lane

Do not let package truth, control-plane truth, live-lane delivery truth, and
buyer next-action truth blur together.

## The Four Truths

Keep these separate:

1. `Package truth`
   - shared docs, prompts, package files, release artifacts changed
2. `Shared control-plane truth`
   - update feed, update index, doctor/root/role inboxes changed
3. `Affected live-lane delivery`
   - the actually affected currently live chats got the note in their runtime
     inbox and mailbox when those surfaces exist
4. `Buyer next action`
   - whether the user still needs to wake a lane, paste a note, or do nothing

Do not imply that `1` or `2` automatically means `3`.
Do not imply that `1`, `2`, or `3` automatically means `4 = no user action`.

## Required Questions

Before finalizing the reply, answer these in order:

1. `What scope did I change?`
   - package
   - shared control plane
   - live-lane runtime surfaces
   - product/repo work

2. `Which concrete live lanes are affected right now?`
   - resolve from runtime truth
   - if unresolved, say so plainly

3. `Which surfaces were actually written for each affected lane?`
   - runtime update inbox
   - runtime mailbox
   - neither

4. `Can those lanes pick the fix up without the buyer?`
   - yes, safely
   - maybe, but momentum would stall
   - no

5. `Does the buyer need an action now?`
   - if yes, emit the smallest exact copy-ready block
   - if no, say `No user action needed:` and why waiting is acceptable
6. `If I am summarizing a pasted completion or report, did I verify its
   ownership first?`
   - runtime truth
   - workstream ownership
   - explicit target match

## Output Rule

The final reply should make these explicit:

- what changed
- what did not get routed or delivered
- whether any live-lane delivery actually happened
- whether any pasted completion/report was verified or rejected as foreign
- the easiest next buyer action, if any

If a live lane is affected and momentum still depends on a wake, do not end
with `No user action needed:`.

If affected live lanes were not actually delivered, do not talk as if they
"have the note now."

## Doctor Rule

Doctor should treat this file as mandatory before any of these lines:

- `No user action needed:`
- `zip built`
- `system fixed`
- `the lane has the note now`

Doctor must not stop at package repair if the buyer-facing question is still
"what do I tell the live chat right now?"

## Good Outcomes

- package fixed, affected lanes delivered, waiting acceptable
  - `No user action needed:`
- package fixed, affected lanes delivered, wake still needed now
  - small copy block
- package fixed, affected lanes not delivered
  - say that plainly
  - small copy block or explicit blocker

## Anti-Patterns

- `zip built` with no delivery truth
- `No user action needed:` when a wake is still obviously required
- saying `I routed it` when only the shared doctor/update bus changed
- making the buyer guess whether to paste something into the live lane
- speaking as if a foreign pasted completion belonged here without first
  verifying custody
- answering like a release engineer when the active role is doctor on a live
  incident

## Final Rule

If the buyer could still reasonably ask:

"Okay, but did the live chats actually get this, and what do I do now?"

the reply is not ready.
