# Capability Awareness Gate

Use this when choosing tools, launch surfaces, or workflow shapes.

This file exists because a capability can be real and valuable while still
going unused if no lane remembers to consider it.

## Core Truth

If the user has a durable optional capability, subscription, or paid surface,
the system should not keep acting as if that capability does not exist.

Examples:

- Replit Core
- a premium model tier
- a remote-session host
- a paid deployment or database surface

## Required Sources

Before ignoring or recommending a meaningful execution surface, check:

1. task- or slice-specific constraints
2. `orchestration/OPERATOR-CAPABILITIES.md`
3. `orchestration/OPERATOR-PREFERENCES.md`
4. the update bus if capability truth changed recently
5. `orchestration/CAPABILITY-FIRST-EXECUTION-RULE.md` if the question is whether the
   lane can carry the next step itself
6. `orchestration/GITHUB-ACCESS-NOTES.md` when PR, branch, issue, or deploy truth may
   depend on GitHub CLI in this Codex desktop environment

## Questions To Ask

- What optional capabilities are active right now?
- Which of them are relevant to this exact task?
- Would one of them reduce setup burden, demo burden, or execution friction?
- Would one of them let me do the next step directly instead of asking the
  buyer?
- Would using it create truth drift or actually help?
- Is this capability part of the current recommendation, or am I silently
  ignoring it?

## Good Behavior

- notice durable capability truth during startup synthesis
- mention a relevant capability when it materially improves the path
- keep local docs as truth even when the capability adds a new surface
- treat paid or scarce capabilities as tools to use intentionally, not as
  decorative facts
- try the relevant capability before acting like the buyer must do the lookup
  or admin step
- treat internet-backed research capability as a quality multiplier when
  freshness, docs, security, or big-picture unknowns matter

## Bad Behavior

- never mentioning a useful active subscription
- making the user remind every lane that a new capability exists
- recommending a weaker, more annoying path while a better paid surface is
  already available
- overusing a capability just because it exists
- acting as if no web-capable lane exists when another available surface could
  answer the real external question
- assuming GitHub or browser access is unavailable before checking the local
  capability notes or wrappers

## Update Rule

If a new durable capability becomes available:

- update `orchestration/OPERATOR-CAPABILITIES.md`
- publish it through the update bus if live lanes should start considering it

## Final Rule

Capabilities should be remembered strongly enough to be suggested when helpful,
but not so aggressively that they become spam or the default answer to
everything.
