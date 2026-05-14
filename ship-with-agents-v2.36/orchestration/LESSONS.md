# LESSONS — Institutional Memory

Add distilled principles here as you discover failure patterns in your
own use of this system. Not a log — a living document of patterns that
prevent repeated mistakes. Every prompt file reads this on startup.

## How to use this file

When an agent or super fails in a way that could repeat:
1. Identify the failure class (not just the symptom)
2. Write a principle that covers the class
3. Add it here under a short heading
4. Every future session will have it in context from the start

## Example format

**L1: [Short principle name]**
[1-3 sentences describing the failure class and the rule that prevents it.]
*Source: [what triggered this rule]*

---

Start here and add your own principles as you go.

**L1: Local operating truth beats generic super advice.**
Before a super recommends model, effort, naming, workflow shape,
escalation, or startup posture, it should read the smallest relevant
local source first. If local truth exists, it overrides generic system
guidance.
*Source: trust-lane deployment friction where a super could recommend a
stronger worker posture without first anchoring on repo-specific
defaults and budget posture*

**L2: Q-lane does not replace budget posture.**
Calling something `Q3` explains risk, not spending authority. Before a
super escalates an implementation agent above the normal execution
default, it should name the budget posture and justify the escalation.
*Source: trust-lane escalation review*

**L3: Default execution norms should be written down.**
If your real operating pattern is "stronger models do reasoning and
control, cost-effective models do most implementation," write that into
durable prompt memory. Otherwise teams will drift toward stronger-worker
recommendations just because the task feels important.
*Source: trust-lane orchestration hardening*

**L4: Current runtime, project default, and recommendation are
different things.**
A chat should not guess what model or effort it is currently on. If the
runtime is visible, state it. If it is not visible, say it is unknown
and anchor recommendations on project defaults instead.
*Source: runtime-drift hardening*

**L5: Action-boundary gates beat passive recall.**
If a rule "already exists" but the chat still misses the moment to use
it, the system probably needs a gate at the decision boundary rather
than another reminder buried in prompt text.
*Source: context-load, spawning, and lineage misses that survived role-file knowledge alone*

**L6: Context overload should be detected before visible quality drop.**
If a head or super chat is carrying multiple substantial workstreams,
system surgery, and routing decisions in one thread, that is already a
signal to compact or rotate soon.
*Source: live compaction friction during package and multi-project routing work*

**L7: Spawning should be justified, not assumed.**
Before creating a new durable chat, decide whether the current owner can
safely continue, whether a bounded helper would do, and whether exact
runtime control or durable ownership is the real need.
*Source: repeated ambiguity over when to spawn, rotate, or simply update the live owner*

**L8: Preserve live brainstorm lineage and runtime pattern by default.**
If a brainstorm lane already exists, preserve both its verified lineage
and its actual runtime/setup unless local truth explicitly justifies a
change. Do not drift to a generic terminal launch just because that
pattern is common elsewhere.
*Source: brainstorm continuation drift where verified lineage and live desktop setup were not preserved strongly enough*

**L9: Active lanes need runtime/setup truth in durable state, not just
chat memory.**
If the system needs to preserve whether a lane is using GPT Desktop,
Codex app, Claude terminal, or another setup, that truth should live in
the active map or handoff/log context.
*Source: repeated risk that active desktop/app usage could drift back to a generic terminal assumption*

**L10: Catch launch-packet flaws before the user launches the worker.**
If a packet is cross-repo, infra-dependent, auth-sensitive, ambiguous on
verification, or expensive to get wrong, route it through launch-readiness
review before launch instead of waiting for closeout to catch preventable
mistakes.
*Source: high-quality audit hardening after a pre-launch packet review immediately found contradictions and blocked verification paths*

**L11: Explicit assurance ownership prevents lazy collaboration.**
When meaningful work needs review, the system should name the assurance level,
execution owner, review owner, and approval owner. Otherwise each side can
assume the other "probably checked it," and dual-brain collaboration turns into
confidence theater.
*Source: assurance architecture hardening after repeated concern that one side might get lazy if ownership is not explicit*

**L12: Big context changes the compaction threshold, not the need.**
Large-context Claude lanes still need compaction once clarity pressure becomes
the real problem. The right move is later compaction with better focus
instructions, not pretending huge context means one chat should carry
everything forever.
*Source: Claude-native hardening after pressure-testing how 1M context really affects compaction*

**L13: Native workflow features beat prompt folklore when the need is repeated.**
If a Claude-native workflow keeps recreating the same guardrail in prompt text,
the package should prefer native features such as built-in todos, role-aware
compaction, startup synthesis, or hooks when those features solve the failure
more directly.
*Source: package upgrade to make Claude Code's own features a first-class workflow path*

**L14: Live telemetry beats guessing for Claude-native session health.**
When Claude Code exposes current model, effort, context usage, and window size
through `/status`, the status bar, or a configured statusline, the package
should route compaction and runtime awareness from that live telemetry instead
of asking buyers to guess from session feel alone.
*Source: final telemetry pass after pressure-testing how Claude should know when to compact instead of acting like a smart brain with weak body awareness*
