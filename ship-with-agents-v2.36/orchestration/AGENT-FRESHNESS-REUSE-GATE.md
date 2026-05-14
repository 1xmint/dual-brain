# Agent Freshness Reuse Gate

Use this before:

- launching a fresh agent for the next bounded packet
- rotating an agent that may still be the right execution container
- re-routing same-workstream execution back through a new prompt by habit

## Core Truth

- a live agent with fresh context is usually cheaper and better than a fresh
  sibling agent for the next bounded packet in the same execution seam
- fresh agent launches should buy something real
- "new packet" is not enough by itself to justify "new agent"

## Final Rule

If the current agent is still fresh enough that the user could reasonably ask,
"Why didn't we just continue in that agent?", the system has probably failed
the reuse test.
