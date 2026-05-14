# Active Map Freshness Gate

Use this gate before routing to a specific live session, waking a lane,
publishing targeted update notes, or recommending a continuation ID.

This exists because a stale active map can make the system confidently target
the wrong chat.

## Core Truth

`ACTIVE-CHAT-MAP.md` is a live registry, not a history scrapbook.

It is trustworthy only when:

- the current live lane is actually listed
- superseded sessions are no longer treated as active
- `Last verified` is current enough for the routing decision being made

## Trust Order

When session-specific truth disagrees, use this order:

1. canonical slice / review memo / closeout that names the current lane
2. `ACTIVE-CHAT-MAP.md`
3. latest checkpoint or closeout packet that explicitly names
   `Expected next session`
4. older logs, filenames, and memory as historical evidence only

Do not let a stale active map outrank a newer canonical artifact that clearly
names the live continuation.

## Freshness Failure Signals

Treat the map as stale and reconcile it first when any of these are true:

- a canonical slice says `execution_lane: <session>` but the map does not list
  that session as current
- a wake target or approved next session exists, but the map still points at
  the superseded lane
- `Active Child Chats` contains rows already marked `closed`
- more than one session appears to be the current live owner of the same stable
  lane without an explicit handoff or rotation explanation
- `Last verified` is older than the newer artifact you are relying on
- the buyer names a clearly live visible chat that is missing from the map or
  lacks runtime inbox/mail surfaces

## Required Lane-Claim Step

Before a new continuation is treated as the live lane:

1. add or update the current row in `ACTIVE-CHAT-MAP.md`
2. move the superseded session out of the active section
3. update `Last verified`
4. only then route notes, wakes, or launches by that session ID

One stable lane should have one current live session.

## Routing Rule

If the map is stale:

- say that explicitly
- avoid confident session-ID routing from memory
- prefer doc-path targeting or stable-lane language temporarily
- reconcile the map before broad propagation, launch guidance, or update notes
- if the missing lane is visibly live to the buyer, classify it as incomplete
  registration, not ordinary ambiguity

## Final Rule

If a lane is active in practice but invisible in `ACTIVE-CHAT-MAP.md`, the
system should treat that as a real continuity bug, not a cosmetic miss.
If head or manager launched a lane but the map was never updated, treat that as
an incomplete launch transaction, not just stale bookkeeping.
