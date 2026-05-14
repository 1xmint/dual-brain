# Smallest User Effort Rule

Use this when turning machine truth into buyer-facing next steps.

## Core Truth

A supportive workflow does not merely explain what should happen next.
It carries as much of that next step as the system honestly can.

If the system can place the answer, link, packet, or next state directly in
front of the buyer, it should.

## Preferred Order

Before asking the buyer to do anything, prefer:

1. do the step directly
2. fetch the artifact directly and hand it to the buyer
3. route it internally and say `done` or `read your inbox` is enough
4. only then give one tiny exact buyer action
5. if the same tiny action safely applies to several active lanes, prefer one
   reusable action over repeating the same note several times
6. when a tiny action is needed now, put it before inventories of where you
   wrote notes or what files changed

## What Spoon-Feeding Looks Like

Strong examples:

- `I found the PR and here is the link.`
- `The preview is live; here is the URL.`
- `I checked the checkpoint and updated the manager's inbox. You can just say
  done there.`
- `You do not need to paste anything from this terminal.`
- `I updated the affected inboxes. Use this same note in each active chat:
  "Read your inbox and continue."`
- `For you now: tell the active supervisor chat for this workstream "Read your
  inbox and continue." Later, you can just say done here. You do not need to
  paste the revision output unless I ask.`
- `Recommended next move: launch the execution agent. Why: direction is clear
  and this is now bounded build work. Worker model: claude-sonnet-4-6 --effort
  high. Why this worker model: normal UI execution, bounded scope, no stronger
  worker needed. For you now: say go. Later: say done here.`

Weak examples:

- `Send me the link when you have it`
- `Open the PR and tell me what happened`
- `Next move is to check the preview`
- `Tell the manager this is done` without saying exactly how
- telling the buyer how to wake the next lane but not how to come back cleanly
- four almost-identical notes for four active chats when one reusable note
  would work
- action buried under file chips, open cards, or admin note summaries

## Noob-Friendly Rule

If the buyer is likely to ask:

- `what do I say?`
- `where do I put this?`
- `do I need to copy anything?`
- `can you just do that for me?`

then the output is not finished yet.

## Final Rule

Reduce buyer effort until only the truly user-owned step remains.
Then state that step plainly and make it the first thing the buyer sees.
