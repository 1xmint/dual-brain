# Observed Live Chat Registration Gate

Use this when the buyer clearly refers to a currently visible live chat, but
the control plane cannot resolve that chat in `ACTIVE-CHAT-MAP.md` or the
runtime inbox/mail surfaces.

## Core Truth

If a chat is visibly live to the buyer but missing from the active map, that is
not "no lane found."

It is a control-plane registration bug.

Do not treat the lane as imaginary just because the registry is stale or
incomplete.

## Strong Signals

Treat this gate as active when one or more are true:

- the buyer names a visible live chat title directly
- the buyer says "this current manager/super chat"
- the buyer shows fresh output from a chat that the map cannot resolve
- the buyer expects doctor to route a note to a chat that obviously exists in
  practice

## What To Do

1. Say the control-plane registration is missing or unresolved.
2. Do not pretend the lane does not exist.
3. Do not claim targeted delivery happened.
4. Prefer the smallest honest bridge for the buyer right now.
5. Treat the missing active-map/runtime-surface registration as a real doctor
   finding.

## Preferred Output Shape

- `Observed live chat unresolved in control plane:`
- what the buyer called it
- which runtime surfaces were missing
- the smallest safe bridge right now
- that doctor should reconcile registration next

## Weak Behavior

- "I could not honestly route it" with no classification of the deeper bug
- acting like the chat probably is not live
- silently dropping the issue after giving the buyer a manual paste note
- treating visible live chat resolution as optional bookkeeping

## Final Rule

If the buyer can obviously point at the chat and the system still cannot route
to it, the bug is incomplete lane registration, not user ambiguity.
