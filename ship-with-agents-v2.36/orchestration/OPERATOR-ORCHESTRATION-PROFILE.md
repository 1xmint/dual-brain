# Operator Orchestration Profile

Durable orchestration profile for this live system.

Treat provider/runtime names here as live-operator truth, not universal
package defaults. A different operator may use Codex terminal, Gemini CLI, or
another repo-connected runtime and should resolve that explicitly instead of
inheriting `Claude terminal` by habit.

Use this before recommending workflow shape, extra lanes, model routing, or
cross-surface handoffs.

Pair this with `SURFACE-CAPABILITY-PROFILE.json`.

## Operator Summary

- operator style:
  `solo builder who wants high-quality multitasking without unnecessary ceremony`
- wants lightweight steering on ownership moves:
  `yes`
- prefers minimal busywork:
  `yes`
- comfortable with direct internal routing:
  `yes`
- comfortable parallel live lanes:
  `2 to 3 when the collision map is honest`
- preferred review density:
  `adaptive; light by default, heavier when risk justifies it`
- manager WIP appetite:
  `one hot cell, maybe one light secondary cell`
- audit-brain appetite:
  `yes when A3 or architecture-sensitive`

## Repo Posture

- typical shape:
  `multi repo / portfolio`
- default head scope:
  `portfolio`
- default manager scope:
  `per repo or per major workstream`
- preferred repo memory file:
  `AGENTS.md`

## Budget Posture

- subscription or budget posture:
  `standard to pro`
- primary concern:
  `balanced with strong quality bias`
- premium escalation permission:
  `ask first`
- cross-provider review posture:
  `on request or when clearly justified`
- provider-diverse audit posture:
  `use when it buys real independence, not by ritual`

## Strategy And Review Surface

- preferred strategy surface:
  `GPT/Codex desktop app lanes`
- durable review lane preferred:
  `yes`
- direct repo mutation from strategy lane preferred:
  `no by default`
- desktop background helpers:
  `useful, but do not assume they are terminal-equivalent supervisors`
- desktop `launch` wording:
  `ambiguous unless packet vs spawn vs terminal injection is made explicit`

## Coordination Surface

- preferred coordination surface:
  `operator-chosen repo-connected coordination surface; currently Claude
  terminal in this live setup`
- exact launch control matters:
  `yes`
- desktop launch default for terminal-first lanes:
  `packet only; do not auto-open or inject into a PC terminal unless the buyer
  explicitly asked for that exact mode`
- launch packet formatting preference:
  `prefer setup-resolved clean launch shapes; do not compress prompt-file
  loading plus launcher invocation into ad hoc shell glue unless a verified
  operator-specific adapter is already the standard path`
- launch cwd posture:
  `in this live setup, the repo-connected terminal is usually already rooted at
  <user-home>\the operator\Desktop\GitHub; prefer bare launcher commands over prepended
  cwd boilerplate unless a narrower cwd is actually required`
- durable named coordination lanes preferred:
  `yes for meaningful workstreams`

## Execution Surface

- preferred execution surface:
  `operator-chosen repo-connected execution surface; currently Claude terminal
  in this live setup`
- direct spawned helper acceptable:
  `yes, only when short and bounded`
- exact per-agent runtime control matters:
  `yes for meaningful execution work`
- separate visible execution lanes preferred:
  `yes for medium and larger work`
- shell-specific launch glue preferred:
  `no by default; use only when the operator setup explicitly supports that as
  the clean standard path`
- bare launch command preference:
  `yes when the terminal root is already correct; keep cwd reminders outside
  the code block if they are needed at all`

## Surface Notes

- Claude Code available:
  `yes`
- Codex app available:
  `yes`
- Codex terminal available:
  `available when intentionally chosen`
- Gemini CLI available:
  `not currently assumed active for this live setup`
- external research and docs browsing preferred:
  `yes when freshness, security, compatibility, or big-picture uncertainty matters`
- IDE agent surface available:
  `not primary for this live setup`
- remote or cloud workspace available:
  `Replit Core available for bounded spikes`

## Working Implications

### Stay in current lane

Default for:

- tiny work
- doc clarification
- one-file or one-decision tasks
- work that does not need a durable extra owner

### Direct agent

Default for:

- bounded repo execution where a separate durable owner helps
- work that is bigger than a tiny fix but does not yet want a super lane

### Desktop background helper

Prefer this when:

- the work is bounded and additive
- the main need is light review or synthesis
- the helper is not pretending to be the primary coordination owner

Do not default this to a full supervisor substitute when durable
repo-connected coordination is the real need.

### Terminal launch packet

Default for:

- meaningful terminal-first supervisors
- durable execution agents
- any launch where the buyer likely means "give me the exact command and prompt
  for terminal"
- desktop/app requests like `launch the supervisor` unless the buyer explicitly
  asked for helper spawn or current-terminal injection

Prefer this over direct injection when the target terminal is not uniquely
resolved.

### Super plus agents

Default for:

- meaningful execution work with checkpoints, fanout, or likely follow-ups

### Manager-style challenge

Default for:

- scope shaping
- launch readiness
- review-pressure work
- work where the user wants stronger quality without doing the review labor by
  hand

### Portfolio routing

Default for:

- multiple repos
- multiple customer tracks
- cross-stream prioritization

Use `REPO-SCOPE-GATE.md`, `ROLE-TO-LANE-ELASTICITY.md`, and
`ADAPTIVE-ROUTING-LADDER.md` before escalating structure.

If repeated launch/setup friction appears, also use
`references/PREFERENCE-ONBOARDING-RULE.md`.


