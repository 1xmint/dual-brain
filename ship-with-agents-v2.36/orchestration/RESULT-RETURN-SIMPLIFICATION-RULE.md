# Result Return Simplification Rule

Use this when a launched child lane is expected to report back to its parent.

## Core Truth

The buyer should rarely have to paste raw results back manually.

For normal supervised flows, the buyer should usually be able to do one of:

- `done`
- `read your inbox`
- `continue`

and let the parent lane absorb the result.

That shortcut is only valid when the child actually sent runtime mail upward,
updated the live parent's inbox truth, or explicitly states that runtime mail
was unavailable and a different fallback bridge is required.

When that is the case, name the parent lane explicitly and say when no raw
terminal copy is needed.
If the buyer explicitly says the launch packet was already pasted and the child
lane is already running, do not keep talking like launch is still pending.
Switch immediately to the return-path contract:

- acknowledge it is already in motion
- do not ask for another paste into the child lane
- do not make the buyer bring back the full child result by default
- if runtime mail/upward inbox truth should carry the result later, say the tiny
  later trigger plainly
If the buyer must also wake a live child or sibling lane before this return
path matters, give both halves explicitly:

- what to say now to the live child/sibling
- what to say later to the parent/review lane

When those are literal phrases, emit tiny copy blocks for both halves unless
the current surface truly cannot render them.
If the child lane has already been updated and only a wake is needed, do not
spend most of the reply narrating the update before showing the wake.

## Strong Behavior

- child lane writes checkpoint truth
- child lane sends runtime mail upward when available
- parent lane treats `done` as mailbox/inbox absorption first
- buyer-facing launch packets say the simplest valid return action
- visible completions say exactly which lane can hear `done` or `read your
  inbox`
- if two different live lanes are involved, visible completions say which
  lane hears the `now` trigger and which lane hears the `later` trigger

## Weak Behavior

- `paste the full result back here` as the default
- raw completion reports treated as the normal buyer transport layer
- giving the buyer a terminal packet and then making them do manual packet
  return too
- telling the buyer to paste the future result back by default when a parent
  lane could simply absorb it after `done`
- making the buyer guess whether the manager or supervisor can just be nudged
- "when it replies, paste it here" used as a generic default instead of a tiny
  return trigger
- promising `done` or `read your inbox` even though no upward mail or inbox
  update was actually sent
- after the buyer says the child is already pasted/launched, still talking as if
  the buyer must paste it now or later manually courier the result back

## Final Rule

If internal mail plus `done` would work, do not require raw result relay by
default.
If internal mail was not actually sent, do not pretend that `done` will work.
