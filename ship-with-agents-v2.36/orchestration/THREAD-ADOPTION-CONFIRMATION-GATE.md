# Thread Adoption Confirmation Gate

Use this when a live desktop/app chat wants to continue under a new lane
identity such as a fresh manager, super, or doctor routing id.

## Core Truth

Writing down a new lane name is not the same as proving that the current thread
has actually adopted that identity.

The system must keep these separate:

- recommended new lane
- declared new lane
- adopted current thread
- separate launched thread

## Adoption Is Confirmed Only When

At least one of these is true:

- the buyer explicitly agrees that this current chat is now the new lane
- the current chat starts self-presenting as that lane and the control-plane
  record matches
- a separate thread or terminal lane was actually launched and confirmed

Plus all of these must also be true:

- active-map row matches the adopted thread or launched lane
- lane capsule exists
- inbox path exists
- startup self-check can be described honestly

## Strong Behavior

- if the current chat is only proposing a new manager identity, keep it
  `planned` or `attention-needed`
- if a child lane packet exists but runtime has not started, keep it
  `packet_ready`
- if a separate launch was attempted but not confirmed, keep it
  `launched_unverified`
- if the current thread has not clearly adopted the new role/id, say that
  adoption is still unverified

## Final Rule

No lane should become `active` just because the same thread declared it so.
