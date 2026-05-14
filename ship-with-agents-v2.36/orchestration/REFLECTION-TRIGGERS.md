# Reflection Triggers

Use this file to decide when a chat must stop and capture friction,
wins, drift, repeated work, or durable pattern updates.

The system should not rely on a heavy gate every response.

## Core Truth

Use a hybrid:

- light always-on posture during normal work
- mandatory reflection at natural work boundaries
- immediate event-triggered reflection when something unusual happens

## Light Always-On Posture

Every role should keep watching for:

- repeated user restatements
- wrong-chat contamination
- stale assumptions
- duplicated work
- model or budget drift
- scope creep
- a pattern that worked notably well
- session naming or lineage confusion
- update-targeting confusion about which chats are actually active
- context overload that should have triggered compaction earlier

Do not stop the flow every turn just to ask about those. Notice them and
capture them at the next required reflection point unless they need
immediate correction.

## Mandatory Reflection Triggers

Reflection is required at:

1. checkpoint writes
2. handoffs
3. migration packets
4. resume packets
5. rotation recommendations
6. completion reports
7. model-routing corrections
8. trust-lane escalations
9. spawn-routing corrections
10. context-load or compaction corrections

## Immediate Event Triggers

Reflect immediately when:

- the user has to restate the same operating truth twice
- a chat is about to act on the wrong repo, wrong workstream, or wrong role
- current runtime and project default are materially out of sync
- a task packet is missing critical truth that forced rediscovery
- a win is strong enough that future chats should reuse it deliberately
- a new session ID would be chosen from historical residue instead of
  verified live lineage
- work was treated as closed but the active map still shows the lane as live
- the lane can clearly articulate "I should have..." while the work is still
  recoverable

## What To Capture

At each trigger, capture only what matters:

- `Friction:` what went wrong, what failure class it belongs to, what it cost
- `Wins:` what worked unusually well, why it worked, when to reuse it
- `Task packet gaps:` what truth was missing from the original packet
- `Cross-workstream patterns:` what should become durable system memory
- `Self-correction:` what the lane changed immediately instead of only noting
  the miss

## Where It Goes

- checkpoint: current workstream truth
- completion report: summary for the super
- `LESSONS.md`: durable prevention patterns
- `WINS.md`: durable repeatable success patterns
- `prompt-change-log.md`: actual prompt/template changes after approval

## Decision Rule

If the issue changes the current workstream only, keep it in the
checkpoint or completion report.

If the issue should change future behavior across chats, promote it into
`LESSONS.md` or `WINS.md`.

If the issue should change durable files, propose the file edits and log
them in `prompt-change-log.md` after approval.
