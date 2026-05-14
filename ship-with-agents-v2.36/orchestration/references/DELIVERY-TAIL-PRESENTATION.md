# Delivery Tail Presentation

Use this after choosing the correct delivery mode and before sending the final
response.

This exists because a response can choose the right artifact and still feel bad
to use if the user has to scroll back up or visually hunt for the real next
action.

## Core Truth

The action tail is the part the user must act on.

So it should appear at the end of the response, not buried near the top.
Run `orchestration/references/COPY-BLOCK-DECISION-RULE.md` first when any human-facing block may
be needed.

## End-Weighted Rule

If the response contains a copy block, startup body, or launch command:

- keep explanation first
- keep the action artifact last
- keep the artifact order matched to the resolved runtime sequence

Do not force the command to be last when the runtime is interactive-launch-first.

## Visual Clarity Rule

Use explicit labels for copyable artifacts.

Preferred patterns:

- `Copy this into the active <role/scope> chat:`
- `Update this doc with:`
- `Launch this:`
- `No user action needed:`
- `Recommended next move:`
- `Run this last:`

Do not make the user infer which block is the one that matters.

## Block Framing Rule

If a human-facing copy block is important, visually separate it.

Acceptable options:

- a clear label plus one fenced code block
- or a clear label plus simple divider lines above and below

Example:

```text
Copy This and paste into s5.2-w6-r3 (super):
--------------------------------------------
[startup body here]
--------------------------------------------
```

The exact divider characters can vary, but the block should stand out.

If the buyer is supposed to say exact words in another live chat, those words
should appear in a fenced copy block by default. Do not make the buyer extract
the trigger from prose when a one-line block would fit.
Keep explanation outside the block. Inside the block, prefer only the exact
words or exact bounded instruction the buyer should copy.

## Launch Ordering Rule

For manual launch flows:

1. explanation
2. then order the artifacts to match the resolved runtime sequence from
   `LAUNCH.md`

For file-ingest launch paths:

1. prompt-file path note if needed
2. final command block

For interactive launch-first paths:

1. launch command block
2. startup prompt block labeled as the next paste into the launched session

If a prompt file was written and the command reads that file, prefer one
command block only and do not emit a second competing prompt block.
But do not force that shape when it requires ugly setup-specific shell glue.
One buyer action does not mean one semicolon-chained shell blob.

## Same-Chat Rule

If the next move stays in the same chat:

- do not generate fake copy blocks
- do not bury the actual next steps in the middle of the response
- end with the exact continuation tail

If the correct outcome is state awareness only:

- use a short `No user action needed:` tail
- say what changed and where truth lives
- do not add a decorative copy block after that
- if the lane quietly repaired minor runtime hygiene on the way, compress that
  to one short line or omit it unless it materially affects trust or next
  action

If the correct outcome is collaborative steering:

- use `Recommended next move:`
- keep the recommendation short
- keep the acceptance lightweight
- say what the lane will do after `go`
- do not bury the actual recommended move inside analysis above

If `Steps for you:` is genuinely needed:

1. first step = easiest recommended action
2. if a live parent pickup trigger is enough, that first step should usually
   be `You can just say done to the active <role/scope> chat.` or
   `You can just say read your inbox to the active <role/scope> chat.`
3. if another lane is the real next owner, that first step should usually be
   the exact paste/wake bridge
4. optional review, commit, or closeout chores come after the main bridge

Do not put `review the checkpoint` first when the real intended move is
`paste this into manager`.
Do not make the buyer guess whether raw terminal copy is unnecessary when the
system can already carry the result.

## Anti-Patterns

- command appears before the startup body
- command appears before the startup body when the runtime is prompt-first
- startup body appears before the command when the runtime is launch-first
- forcing `command last` even when the runtime truth is launch-first
- copy block appears near the top and the user must scroll back to find it
- multiple copy blocks compete for attention
- a prompt file was already prepared, but the response still pastes the whole
  prompt body again by default
- a supposedly "clean" launch command is really several hidden setup steps
  compressed into one brittle shell line
- the visually strongest block is not the actual next action
- `Steps for you` starts with optional chores instead of the main bridge
- a `No user action needed:` tail still smuggles in a hidden ask
- the response ends with commentary after the command block, which weakens the
  final action cue
- the reply says what the buyer should tell another chat, but the exact words
  only exist in prose
- the reply foregrounds a small self-repaired mailbox/inbox/plumbing fix even
  though the user really cares about the product work or next action

## Final Rule

If the user could reasonably ask:

"Which block am I actually supposed to copy?"

or:

"Why is this launch ordered differently from what the runtime actually needs?"

the delivery tail presentation is not finished.

Before finalizing the tail of a meaningful closeout, also run
`orchestration/references/FINAL-DELIVERY-ARBITER.md`.


