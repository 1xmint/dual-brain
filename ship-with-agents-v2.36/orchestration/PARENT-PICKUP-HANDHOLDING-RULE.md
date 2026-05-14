# Parent Pickup Handholding Rule

Use this when a child lane, terminal lane, or visible execution report is
about to hand control back to a live parent manager or supervisor.

## Core Truth

If a live parent lane can already absorb runtime mail, checkpoint truth, or the
current closeout artifact, the buyer should not have to infer that.

The system should say the smallest obvious next human move plainly.

## Default Rule

Before ending a buyer-visible completion or handoff, resolve:

1. is there a live parent or coordination owner
2. can that parent continue from runtime mail or current artifact truth
3. is `done` enough
4. is `read your inbox` the more honest trigger
5. only if neither is enough, what exact bridge must be pasted

Do not answer `yes` to steps 2-4 by assumption. Verify that the parent-facing
mailbox or inbox truth was actually updated, or say it was unavailable and give
the fallback bridge.

If `done` or `read your inbox` is enough, say so directly and name the lane.
If the buyer must first wake a live child or neighboring lane and only later
return to the parent, say both triggers explicitly.
When those triggers are literal words the buyer should say, emit tiny copy
blocks for each trigger instead of prose-only descriptions unless the current
surface truly cannot render them.

If the system can also retrieve the next parent-owned artifact directly
(checkpoint truth, PR state, preview state, inbox truth), do that before
asking the buyer to go fetch it.

## Preferred Buyer Tails

Use these in order:

1. `For you: you can just say done to the active <role/scope> chat.`
2. `For you: you can just say read your inbox to the active <role/scope> chat.`
3. `For you: paste this exact bridge into the active <role/scope> chat.`

When one of the first two is valid, also say:

`You do not need to paste anything from this terminal unless I say so.`

When two-sided handholding is needed, also say:

`For you now: ...`

and

`Later: ...`

If a literal phrase is required, prefer:

```text
Read your inbox and continue.
```

or:

```text
done
```

## When To Prefer `done`

Prefer `done` when the parent lane should simply absorb the new child result
and continue its normal ownership loop.

## When To Prefer `read your inbox`

Prefer `read your inbox` when the real needed action is explicit inbox/update
sync, correction absorption, or a lane repair moment.

## Strong Behavior

- the buyer knows exactly which lane should hear the pickup trigger
- the buyer knows whether `done` or `read your inbox` is enough
- the buyer knows when no terminal copy is needed
- the buyer knows what to say now and what to say later when both moments
  matter
- optional review chores stay secondary

## Weak Behavior

- `Open items for manager` with no pickup instruction
- `Recommended next move:` that still leaves the buyer guessing what to say
- forcing the buyer to relay raw terminal output when runtime mail already
  exists
- assuming a noob will infer that manager or super can just be nudged
- saying the trigger in prose but making the buyer retype or mentally rewrite
  it when a tiny copy block would remove the friction
- telling the buyer `done` is enough when no parent-facing mail or inbox update
  was actually written

## Final Rule

If the buyer could still reasonably ask:

`Do I need to copy anything from this terminal, or can I just tell the parent chat done?`

the handoff is not finished.
