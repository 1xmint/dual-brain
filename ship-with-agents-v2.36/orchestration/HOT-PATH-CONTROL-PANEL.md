# Hot Path Control Panel

Use this as the compact operating kernel for live turns.

If a detailed gate says something useful but this panel already resolves the
turn cleanly, prefer this panel and keep moving. Cold docs are support, not the
main steering wheel.

## 1. Sync First

Before a substantive reply:

- refresh runtime mail if it exists
- refresh runtime update inbox
- preserve approved momentum unless the new truth changes or blocks it

Short buyer replies are not exceptions:

- `done`
- `continue`
- `what's next`
- `read your inbox`

## 2. Check Live State

Ask:

1. Did the buyer just say something is already running, already pasted, or
   already done?
2. Is the current lane the real owner of the next step?
3. Is there a real blocker, ownership change, or buyer decision?
4. Is any missing runtime surface minor and safe to repair quietly?
5. Did the buyer just paste a completion report, final summary, or test result
   that may belong to another lane?
6. Is the buyer asking to wake an already-open lane, or to relaunch a lane
   that was killed/closed and should resume from checkpoint?
7. Is the buyer pointing at a visibly live chat that the control plane still
   cannot resolve?
8. Is this lane claiming `production`, `readiness`, `integration`, or `live`
   while drifting into rehearsal or local-only proof?

## 2b. Prove A Pasted Report Belongs Here

Before absorbing a pasted completion or summary as current-lane truth, verify at
least one strong ownership signal:

- runtime mail or update truth says this lane was expecting that result
- the report's repo, workstream, files, and mission match this lane
- the report explicitly names this lane or one of its owned child lanes

If those signals do not exist:

- do not summarize the report as if it were yours
- do not let it silently mutate mission or ownership
- say `Possible foreign completion report:` and give the smallest safe recovery

## 2c. Visible But Unresolved Is A Registration Bug

If the buyer names a clearly live chat and the control plane cannot resolve it:

- classify that as incomplete lane registration
- do not act like the chat probably is not real
- do not claim targeted routing happened
- give the smallest honest bridge now and treat registration repair as a real
  next doctor action

## 2d. Production Lanes Need A Real Seam

If a lane is speaking as a production, production-readiness, integration, or
live owner:

- name the real seam it is supposed to advance
- prefer direct movement on that seam over fresh rehearsal containers
- treat sandbox or local-only proof as secondary unless it removes a blocker
  for the live seam

If you cannot name the seam, you do not have enough truth to recommend the
next production move yet.

## 3. Repair Quietly When Safe

If a mailbox/inbox/runtime surface is missing but:

- ownership is clear
- repair is safe
- it does not change the buyer's decision

then repair it quietly and keep the user-facing focus on the actual work.

Only foreground the repair if it:

- blocks progress
- changes trust
- requires user action

## 4. Do Not Duplicate Motion

If the buyer says a child lane was already pasted/launched and is already in
motion:

- acknowledge it
- do not give the launch again
- switch to the later return-path contract

If a child result can travel through runtime mail/update truth:

- do not make the buyer courier the full result back manually
- prefer the smallest valid later trigger, usually `done` or
  `read your inbox`

## 5. Carry Approved Momentum

If the buyer already gave lightweight approval such as:

- `go`
- `ok`
- `sounds good`
- `continue`

and there is one clear owned next move:

- do that move
- do not restate it
- do not stop at `next slice is clear`

If one bounded loop iteration already succeeded and the next step is one more
iteration of that same owned loop, lightweight approval should usually carry
that next iteration too.

## 6. Buyer Output Modes

Use exactly one mode from `OUTPUT-MODES.md`.

If the buyer must say literal words, give a tiny fenced copy block.
If no human action is needed, do not smuggle one in.

## 7. Keep The Buyer Out Of The Plumbing

The buyer should not be:

- the launcher twice
- the courier by default
- the person who keeps pushing one obvious loop forward
- the person who has to decode routing ids or control-plane trivia

Name chats in the buyer's world first:

- exact visible title when verified
- otherwise role + scope descriptor
- routing id only as supporting metadata

## 8. Leave A Turn Receipt

If this turn meaningfully changes state, absorbs a child result, rejects a
foreign result, emits a bridge, or says `No user action needed:`, leave a
compact observability receipt instead of relying on memory alone.

## Final Check

Before sending, ask:

1. Am I replying from refreshed truth instead of memory?
2. Am I surfacing the real work instead of internal admin drama?
3. Am I making the buyer do transport, planning, or repeated nudging that the
   system should own?
4. If the buyer says `what do I do now?`, is the answer already obvious from my
   tail?
5. If I just absorbed or rejected a pasted report, did I prove custody first?
6. If this was a meaningful final/summary turn, did it leave a compact receipt?
7. If this lane claimed production or readiness, did I anchor the answer to a
   real product seam instead of a rehearsal loop?

If any answer is bad, fix the turn before sending it.
