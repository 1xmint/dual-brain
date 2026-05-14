# Doctor Note Protocol

Use this when doctor should give a compact, actionable correction to a live
lane or to the buyer managing that lane.

## Core Truth

Doctor should not only diagnose.
Doctor should also give small repair notes that get the system moving again.
Before a note targets a live lane by name, doctor must resolve that lane from
runtime truth instead of guessing from memory, stale examples, or a likely
role title.
Before doctor says a note was routed, delivered, or placed for a live lane,
doctor must verify the exact runtime target files were actually written.
If a concrete affected live lane has both runtime update inbox and mailbox
surfaces, doctor should prefer delivering the compact correction to both
surfaces instead of only one.
When a shorter recovery note would work, prefer that shorter note.
If the user surfaced a failure by showing output from one specific live lane,
doctor should treat that lane as an affected target, not only the doctor/head
control-plane lineage around it.

This is the fast recovery format for:

- read your inbox now
- switch behavior now
- repair this lane state now
- stop doing this broken pattern now

## Preferred Shapes

### Doctor note for a live lane

Use when the buyer needs to paste one exact correction into a lane:

`Doctor note for <visible lane title or role/scope descriptor>:`

Then provide one fenced block with:

- the correction
- the expected next move
- what not to do again if necessary

### Reusable doctor note for multiple live lanes

Use when the same inbox-based or behavior correction safely applies to several
already-resolved active lanes.

Shape:

`Reusable doctor note for affected active lanes:`

Then provide one fenced block that can be pasted unchanged into each target.

Outside the block, list the intended targets if needed.
If doctor can edit runtime artifacts directly, route that same note into each
affected lane's runtime inbox and mailbox before telling the buyer it is ready.

Preferred example when inbox truth already exists:

`Read your inbox and continue.`

### Doctor note for the buyer

Use when the buyer needs one minimal control-plane action:

`Doctor note for buyer:`

Then say:

- what is actually broken
- the smallest fix
- the exact paste or command if needed

When inbox absorption is the real repair, prefer:

`Doctor note for buyer:`

`Tell the active <role/scope> chat to: Read your inbox and continue.`

### Internal doctor repair

Use when doctor can route or repair directly:

- do the repair
- then end with `No user action needed:`
- say what was repaired and what is working again

## Target Resolution Rule

Before emitting a doctor note for a live lane:

1. resolve the lane through `ACTIVE-CHAT-MAP.md`
2. cross-check `routing id`, `display name`, and `stable lane`
3. prefer the exact current `display name` from runtime truth
4. if the lane has not rotated yet, do not silently invent the rotated name
5. if no canonical live lane is found, stop and say:
   - `Doctor target unresolved:`
   - attempted identities
   - checked runtime sources
   - smallest repair step

Buyer-facing target references should follow this order:

1. exact current visible display name when verified
2. role plus scope descriptor if that is more robust
3. routing id or stable lane only as supporting metadata when truly needed

Bad:

- inventing `Manager - Vera` when the live chat may still
  only exist as `m5.2r2`
- telling the buyer `paste this into m8` when the visible chat is
  `Manager - Frontend`
- guessing that a lane already rotated because the package rules changed
- giving the buyer a note for a lane that is not actually open

Better:

- resolve the live lane first
- target the current live identity honestly
- phrase the target in the buyer's world, not only the control plane's world
- include a recommendation to rotate naming on the lane's next clean restart if
  needed

## Delivery Truth Rule

Keep these states separate:

- `drafted` = doctor wrote a standalone artifact or note body
- `stored` = doctor wrote a durable file somewhere
- `delivered` = doctor wrote the resolved live lane's runtime inbox target and,
  when the lane had a mailbox, its runtime mail target too

Do not say:

- `I sent it to <lane>`
- `I wrote it into <lane> inbox`
- `the lane has the note now`

unless the resolved runtime target file for that lane was actually updated.

If the note only exists as a standalone artifact, say that plainly and give the
smallest next transport step.
If doctor published the rule change only to doctor/head/meta inboxes but did
not also write the concrete observed failing lane's inbox, say that plainly.
Do not imply that `read your inbox` will repair that lane yet.
If the lane had a mailbox and doctor did not write that mailbox note either,
say that plainly too.

## Minimality Rule

Before emitting a long doctor note, ask:

1. can doctor repair this directly
2. can `read your inbox and continue` safely recover it
3. can one short line plus inbox absorption recover it

If yes, prefer that over a long pasted correction block.
If several active lanes need the same correction and one unchanged note safely
fits them all, prefer one reusable note over multiple bespoke notes.

## Good Use Cases

- "read your inbox and continue"
- "your identity is unresolved; stop and resolve it first"
- "do not treat the buyer as the manager lane"
- "route internally instead of asking for another approval"
- one shared `Read your inbox and continue.` note for several active lanes
  after doctor already routed the needed truth into each inbox

## Anti-Patterns

- long essays when one compact repair note would do
- diagnosis with no exact correction
- a doctor note that still makes the buyer guess what to paste
- vague "let me know if you want me to..." loops
- a doctor note addressed to an assumed live lane name that was never resolved
- a long lane-specific note when inbox-first recovery would have been enough
- four slightly different notes when one safe reusable note would have worked

## Final Rule

A doctor note should feel like a clean rescue tool:

- short
- exact
- confidence-restoring
- immediately usable
- no longer than necessary

Before any meaningful doctor closeout is shown to the buyer, also run
`orchestration/references/FINAL-DELIVERY-ARBITER.md`.


