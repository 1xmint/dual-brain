# Done Absorption Rule

Use this when the buyer says `done`, `continue`, or `read your inbox` after
child work may have completed.

## Core Truth

`done` should default to meaning:

- read unread runtime mail
- absorb new completions
- update the current control-plane truth
- continue normal ownership

It should not require the buyer to summarize what the child lane already wrote.
It should also reduce the need for raw pasted terminal result reports when
runtime mail or checkpoint truth already exists.
It should also avoid acting like inbox review is a soft reset of the lane's
already-approved next move.

If no child-result absorption is needed and the current lane still owns one
obvious bounded next step, `continue` should usually advance that step instead
of producing another small encouragement loop.

If a child lane's result is visible to the buyer first, that child lane should
say plainly when `done` or `read your inbox` to the parent is enough.

## Default Rule

When a live coordination lane hears a short return signal such as `done`,
`continue`, `what's next`, or `read your inbox`, it must first check in this
order before answering from memory:

1. its runtime mailbox
2. its runtime update inbox
3. the smallest current checkpoint/slice/workstream truth implicated by unread
   mail

If unread completion mail exists, absorb it before asking the buyer what
happened or what they want next.
If no unread completion mail or relevant inbox update exists, do not fake a
successful absorption. Say the transport is missing and ask for the smallest
honest fallback instead.
If there is no new inbox truth that changes the already-approved next move,
continue that approved move instead of falling back to "the plan still stands"
plus another request for approval.
Short buyer replies are not an exception to this rule. A terse return signal is
usually a request to resume the live loop, not permission to skip the mailbox
check.
If the buyer also pasted a completion report manually, do not absorb that
report as current-lane truth until report custody is verified against runtime
mail, update truth, or clear workstream ownership.

## Strong Behavior

- "done" triggers inbox/mailbox absorption
- one or more child completions are synthesized
- canonical truth is updated
- the lane continues with its real role
- visible child completions tell the buyer which parent lane can simply hear
  `done` or `read your inbox`
- inbox review preserves the already-approved promised artifact unless the new
  inbox truth actually changes or blocks it

## Weak Behavior

- asking the buyer to paste the child completion manually
- making the buyer explain which child finished
- re-reading only updates but not runtime mail
- replying with "nothing actionable" even though unread completion mail exists
- child lane says `Open items for manager` but never tells the buyer that
  `done` or `read your inbox` to the manager is enough
- replying as if `done` should have worked when the child never sent runtime
  mail upward in the first place
- rereading inbox, saying "the plan still stands," and then re-offering the
  same promised artifact instead of producing it
- answering `done` or `what's next` from memory without first checking runtime
  mail and update truth
- treating a tiny buyer return signal as too small to justify the sync pass
- absorbing a pasted completion from another lane just because it sounds
  plausible and there was no unread runtime mail to contradict it

## Final Rule

If the buyer says `done` and the lane's next question is basically "okay, what
did the child say?", the lane is under-using the runtime system.
