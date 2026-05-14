# Fan-In Synthesis Rule

Use this when more than one child lane or agent reports completion into the
same parent lane.

## Core Truth

Three raw child completions are not a good user experience.

The parent lane should absorb and synthesize them before speaking, unless the
buyer explicitly asked for the raw reports.

## Default Rule

If two or more unread completion mails touch the same workstream or same parent
decision:

1. absorb all unread child mails first
2. update canonical slice/checkpoint/workstream truth
3. synthesize one parent-level status
4. surface one recommendation or one next action shape

## Synthesis Shape

Parent synthesis should usually answer:

- what completed
- what stayed blocked
- what changed in the workstream
- what friction repeated across children
- what the next owner is
- whether the buyer actually needs to do anything now

## Final Rule

If the parent lane has enough mail to know the answer, do not force the buyer
to read three separate child completions to reconstruct it.
