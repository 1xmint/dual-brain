# Buyer Handholding Completion Rule

Use this when a lane is about to present meaningful completion, closeout, or
handoff truth to the buyer.

## Core Truth

A correct completion report is not automatically a supportive completion
experience.

When the buyer sees the output, the system should make the easiest correct next
move obvious.

If a live parent lane can already absorb runtime mail or checkpoint truth, the
system should say that plainly instead of assuming the buyer will infer it.

## Default Shape

If the buyer may still need to do anything at all, the completion output should
carry a short `For you:` block.

That block should start with the easiest recommended action first:

1. `You can just say done to the active <role/scope> chat.`
2. `You can just say read your inbox to the active <role/scope> chat.`
3. `Paste this into the active <role/scope> chat:` with the exact bridge.
4. Only then any optional deeper actions like reviewing a checkpoint or
   reading a diff.

If there is one clear next move, do not turn the completion into a small menu
of equal-weight options before the primary action.

When a live parent pickup trigger is valid, also say plainly whether the buyer
does not need to copy anything from the terminal.
When the buyer needs one tiny trigger now and a different tiny trigger later,
say both plainly. Do not spoon-feed only half of the loop.
Supportive completion often means stepping down to the first buyer-usable
artifact, not stopping at the highest internal artifact that was just created.

If the current lane can still fetch the next artifact directly, do that before
turning the completion into a buyer homework list.

If the lane only prepared a note or artifact for another live lane but did not
actually route it into that lane's runtime inbox/mail, say that plainly and
surface the smallest honest next bridge instead of pretending the target
already has it.
If the lane just finished an architecture packet or launch brief and the next
artifact is obviously the executable bridge or launch packet, surface that next
artifact instead of making the buyer ask for it.
If the buyer confirms that executable bridge or launch packet was already pasted
and the child lane is already running, stop spoon-feeding the launch and switch
to spoon-feeding only the smallest valid later return trigger.

## Strong Behavior

- the user knows whether the next owner is already live
- the user knows whether `done` is enough
- the user knows when terminal copy is unnecessary
- the user knows where the next action belongs
- optional review chores are clearly secondary

## Weak Behavior

- polished completion report with no buyer guidance
- `Open items for manager` but no clue how the buyer should trigger manager
  pickup
- terminal-visible result that never says whether `done` or `read your inbox`
  is enough
- a live-lane handoff that says how to wake the next owner now but says
  nothing about how the buyer should return later
- optional chores listed before the primary bridge
- forcing the buyer to infer whether to say `done`, `continue`, `read your
  inbox`, or paste a packet
- "what's next" answered with a broad frontier list before the exact
  recommended trigger
- claiming a manager or supervisor already has a note when only a standalone
  file was created
- stopping at `the brief is ready` when the buyer really needs the launch
  packet or wake trigger next
- continuing to talk about launch after the buyer already said the child is in
  motion, instead of switching to the later `done`/`read your inbox` return path

## Final Rule

If the buyer could still reasonably ask "okay, but what do I actually do now?"
or "do I need to copy anything from this terminal?" the completion experience
is incomplete.

Before ending a meaningful closeout with either `No user action needed:` or a
copy block, also run `orchestration/references/FINAL-DELIVERY-ARBITER.md` so package truth,
delivery truth, and buyer next-action truth do not get blurred together.


