# Update Bus

Use this when workflow or rule updates need to reach live chats without manual
note-pasting to every lane.

This exists because publish-once, consume-locally scales better than copying
the same update into many active lanes by hand.

## Core Truth

The system should prefer:

- one published update
- routed into the right inboxes
- checked at fixed moments
- acknowledged once

over:

- repeating the same note chat by chat
- relying on memory
- or assuming every active lane somehow already knows

When a concrete live lane is affected and its mailbox exists, the fix should
usually land in both:

- `updates/inbox/<lane>.md`
- `mail/inbox/<lane>.md`

## Delivery Truth Rule

Keep these distinct:

- published in `UPDATE-FEED.md`
- referenced from another durable artifact
- routed into the target lane inbox
- routed into the target lane mail inbox

Do not collapse those into one phrase like `I sent it to the manager` unless
the relevant target files were actually updated.

## Update Bus Structure

Use these runtime files:

- `_agent-system-runtime/updates/UPDATE-FEED.md` = the canonical log of
  published updates
- `_agent-system-runtime/updates/UPDATE-INDEX.md` = compact current index and
  routing summary
- `_agent-system-runtime/updates/UPDATE-WATERMARKS.md` = what each lane last
  saw / acknowledged
- `_agent-system-runtime/updates/inbox/<lane-or-role>.md` = targeted inboxes

## Update Types

Every update should carry:

- `Update ID:`
- `Date:`
- `Severity:` `info | behavior-change | must-read`
- `Scope:` `global | role:<role> | lane:<session-id> | lineage:<root>`
- `What changed:`
- `Why:`
- `Do differently now:`

Keep the body short.

If the update changes what tools, subscriptions, or optional surfaces live
lanes should consider, also treat it as capability truth and update
`_agent-system-local/OPERATOR-CAPABILITIES.md`.

## Routing Rule

Publish once to `UPDATE-FEED.md`.

Then route copies or references into only the relevant inboxes:

- global updates -> broad inboxes
- role updates -> role inboxes
- lane updates -> lane inboxes
- lineage updates -> only the affected lineage

If the triggering evidence is a transcript, screenshot, or pasted output from a
specific still-live lane, that observed lane is automatically an affected lane.
Do not stop at doctor/head/lineage routing alone when the concrete failing lane
is already known and its runtime inbox exists.
If that affected lane also has a runtime mailbox, route the compact note there
too unless the mailbox surface is intentionally unavailable.

Before claiming targeted delivery:

1. resolve the intended live lane from runtime truth
2. confirm which inbox/mail surfaces exist for that lane
3. write the intended target surfaces
4. only then describe the note as routed or delivered

If the finding came from a concrete observed live lane, also verify whether:

5. doctor/head/meta inboxes were updated
6. the concrete failing lane inbox was updated too

Do not treat `published plus lineage note` as sufficient targeted delivery when
the buyer is about to tell a specific live lane to `read your inbox`.

If step 1-3 did not happen, describe the artifact honestly as prepared or
stored, not delivered.

Each lane should usually check its own inbox, not poll every sibling or child
lane constantly.
Each lane should refresh its own runtime mail plus update inbox at the start of
every turn before substantive action or reply. This is a local truth refresh,
not a full sibling scan.

## Internal Routing Rule

If the next substantive owner is another already-live lane and the current lane
can edit runtime artifacts directly, prefer routing through the runtime inbox
or another durable runtime file before asking the buyer to carry a wake.

Preferred order:

1. update the canonical slice or review truth
2. write or refresh the targeted runtime inbox note if needed
3. decide whether waiting for the target lane's next check moment is actually
   acceptable
4. if waiting is acceptable, let the target lane pick it up and report
   `No user action needed:`
5. if waiting is not acceptable and the system cannot actively push the lane
   itself, route internally first and then surface one tiny buyer-carried
   pickup trigger

Use a buyer-carried wake as fallback when:

- the lane cannot write runtime artifacts
- the target lane has no durable inbox/update-bus path
- the situation is urgent enough that waiting for the normal check moment would
  be worse than manual wake transport

## Check Moments

Do not scan the whole update history every response.

Do this every turn:

- refresh the current lane's runtime mail inbox if it exists
- refresh the current lane's runtime update inbox

Do the broader update-bus/watermark checks at these moments:

- startup
- resume
- after a wake ping when another lane may have updated the canonical truth
- after major compact or rotation
- before launch
- before closeout
- before substantive action if watermark truth is stale or unknown

## Inbox Resolution Rule

When a lane is told `read your inbox`, or when one of the check moments above
requires inbox review, treat `inbox` as runtime mail plus runtime updates, in
that order.
That same runtime-mail-plus-update review should also happen automatically at
the start of each turn before the lane answers or acts.

Inbox review should refresh truth, not erase momentum.
If the lane already had one approved prepared move, preserve it across inbox
review unless the newly absorbed inbox truth materially changes, blocks, or
replaces that move.

Use this resolution order:

1. `_agent-system-runtime/mail/inbox/<current-session-id>.md`
2. `_agent-system-runtime/updates/inbox/<current-session-id>.md`
3. `_agent-system-runtime/updates/inbox/<current-root-or-role>.md` when that
   exact inbox file exists and applies
4. `_agent-system-runtime/updates/UPDATE-INDEX.md`
5. `_agent-system-runtime/updates/UPDATE-WATERMARKS.md` when freshness or
   acknowledgement matters

Do not substitute other `inbox` concepts by default.

Examples that are **not** "your inbox" unless the user explicitly asks for
them:

- `_salvage/inbox-*.md`
- `docs/inbox/`
- repo backlog or idea-lifecycle inbox folders

If no runtime mailbox file exists for the current lane, say so plainly and fall
through to the update index instead of free-searching for unrelated `inbox`
files elsewhere in the workspace.

Do not treat `read your inbox` as permission to restate the current plan and
restart the approval loop when no new inbox truth changed the next artifact.

## Watermark Rule

Use `UPDATE-WATERMARKS.md` to record:

- `last_seen_update_id`
- `last_acknowledged_must_read`

This prevents rescanning the whole history every time.

## Must-Read Rule

If a lane has unread `must-read` updates relevant to its scope, it should not
perform high-risk actions until it absorbs them.

Examples:

- launch
- closeout
- ownership or custody mutation
- risky routing change
- capability availability that materially changes recommended surfaces

## Parent Responsibility

Parent lanes are responsible for publishing and routing updates when they own
the system change.

Parent lanes are not responsible for polling every child on every response.

The bus should narrow the work to:

- publish once
- route narrowly
- let each lane check at fixed moments

## Fallback Rule

Manual paste notes are still allowed when:

- the runtime update bus is missing
- the lane has no durable file access
- a one-off urgent correction cannot wait

But treat that as fallback, not the preferred system behavior.

## Momentum Rule

The update bus is a continuity surface, not a guarantee of immediate action.

If a live lane still needs a human nudge before it will read the routed update
soon enough, that is still a real buyer action. Do not claim
`No user action needed:` in that case.

## Final Rule

If the system keeps rediscovering the same update in multiple live lanes and
the buyer has to manually carry it everywhere, the update should probably have
gone through the update bus instead.
