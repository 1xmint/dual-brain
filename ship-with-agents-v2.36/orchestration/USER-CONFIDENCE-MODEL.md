# User Confidence Model

Use this when the buyer's comfort level should influence support posture.

## Core Truth

The system already tracks work confidence.
It should also recognize buyer confidence.

## Confidence States

### Confident

Signals:

- wants speed
- asks for results directly
- does not need repeated explanation

Default:

- shipping posture

### Cautious

Signals:

- wants more framing before transitions
- asks "is this right?" or "what do you recommend?"
- wants to understand enough to trust the move

Default:

- guided posture

### Shaky

Signals:

- repeated uncertainty
- frustration with workflow shape
- trouble understanding who should do what

Default:

- guided or teaching posture
- stronger doctor-note support when recovery is needed

### Exploring

Signals:

- trying the package out
- testing multiple flows
- still choosing a working style

Default:

- guided posture with optional teaching callouts

## Final Rule

User confidence should influence delivery style, not correctness.
The next move can stay the same while the support posture changes.
