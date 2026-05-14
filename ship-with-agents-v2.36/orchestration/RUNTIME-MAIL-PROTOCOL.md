# Runtime Mail Protocol

Use this when one live lane needs to send meaningful work truth to another live
lane without making the buyer carry the packet.

## Core Truth

The buyer should not be the default message bus.

Meaningful upward and sideways work truth should usually travel through runtime
mail first, with buyer copy-paste as fallback.
Behavior corrections for concrete affected live lanes should also travel
through runtime mail when that mailbox surface exists, not only through the
shared update bus.

## Mailbox Structure

Use runtime mailbox files:

- `mail/inbox/<routing-id>.md`

Mailbox files are lane-addressable and may contain:

- completion mail from child lanes
- review mail
- pickup triggers
- recovery notices
- compact state acknowledgements
- doctor or control-plane behavior notes for affected live lanes

## Mail Shape

Every meaningful mail item should carry:

- `Mail ID:`
- `Date:`
- `From:`
- `To:`
- `Workstream:`
- `Mail type:` `completion | review | pickup | recovery | note`
- `Status:` `unread | absorbed | escalated | closed`
- `Summary:`

Then only the smallest relevant truth:

- checkpoint path
- slice path
- execution outcome
- friction
- recommendation
- next owner

## Preferred Flow

1. child lane updates canonical truth
2. child lane sends compact runtime mail upward
3. parent lane absorbs unread mail
4. parent lane synthesizes if more than one child completed
5. buyer only says `done`, `continue`, or `read your inbox` when a manual
   pickup nudge is still helpful

For terminal launch flows, prefer return guidance like:

- `Run this, then say done here.`

instead of:

- `paste the full result back here`

## Mail-Back Truth Rule

Do not promise a parent-lane shortcut like `done` or `read your inbox` unless
one of these is true:

- runtime mail was actually written upward
- the parent lane's update inbox was actually updated with the needed truth
- the current lane explicitly says runtime mail was unavailable and gives the
  exact fallback bridge instead

`Should send mail` is not enough. The shortcut is only honest after the mail or
fallback transport really exists.

## Doctor Delivery Rule

If doctor patches a behavior or routing rule because one or more concrete live
lanes were observed failing:

1. publish the shared update
2. write each affected lane's runtime update inbox when that surface exists
3. write each affected lane's runtime mailbox note when that surface exists

Do not describe the note as fully delivered to that lane if only the shared
doctor/head buses were updated.

## Fallback

Use buyer-carried paste blocks only when:

- the current lane cannot write runtime mail
- the target lane has no mailbox
- the target lane is not actually live
- momentum requires a human nudge now and internal pickup is not strong enough

## Final Rule

If two live lanes could have communicated through runtime files and the buyer
had to manually transport the packet anyway, the system probably chose the
wrong transport layer.
