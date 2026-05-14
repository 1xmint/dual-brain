# System Improvement Loop

Use this when you want a real, durable self-improvement practice for your own
setup instead of relying on memory or ad hoc fixes.

This is the buyer-safe companion to `SELF-IMPROVEMENT-LOOP.md`.

## Big Rule

Do not push every lesson straight into the replaceable vendor layer.

First decide whether the finding is:

- local only
- runtime/state only
- a local override
- a candidate package improvement

That is how you improve without clobbering your own setup on the next upgrade.

## The Four Buckets

### 1. Local quirk

Use when the finding depends on:

- your shell
- your app surface
- your IDE
- your repo
- your model access
- your team's habits

Store in:

- `OPERATOR-PREFERENCES.md`
- `OPERATOR-CAPABILITIES.md`

### 2. Local lesson or win

Use when the pattern is valuable for your setup but still project-specific.

Store in:

- `LESSONS.md`
- `WINS.md`
- `OPERATOR-PREFERENCES.md` when the lesson changes durable operator defaults

### 3. Runtime/state issue

Use when the problem is not really a prompt or rule problem, but live-state
hygiene.

Examples:

- active map not updated
- checkpoints left stale
- logs not closed out
- wrong lane still marked active

Fix in:

- `updates/`
- `lanes/`
- `checkpoints/`
- `closeouts/`
- `health/`
- `observability/`
- runtime hygiene docs

### 4. Candidate vendor improvement

Use when the pattern is broad enough that future buyers would likely benefit.

Examples:

- a cross-surface continuity rule
- a better launch-packet rule
- a durable collaboration or recovery gate

Promote into:

- shared root doctrine in `orchestration/`
- your own fork
- or a future upstream package release

## Promotion Ladder

Do not promote too early.

Use this ladder:

1. one-off incident
2. local quirk
3. repeated local quirk
4. cross-project or cross-surface pattern
5. vendor package guidance

If a pattern has not earned step 4 yet, keep it local.

## Upgrade-Safe Rule

Your buyer-specific self-improvement should survive upgrades.

That means:

- keep shared defaults in the live `orchestration/` root docs
- keep operator truths in `OPERATOR-PREFERENCES.md`,
  `OPERATOR-CAPABILITIES.md`, and `OPERATOR-ORCHESTRATION-PROFILE.md`
- keep live operating state in `updates/`, `lanes/`, `checkpoints/`,
  `closeouts/`, `health/`, and `observability/`

Do not edit vendor files first if a local override is enough.

## Optional Improvement Lane

If you want a dedicated self-improvement chat:

- treat it as a bounded retro / system-improvement lane
- do not let it casually rewrite vendor defaults
- make it classify findings into the four buckets above

Good outputs from that lane:

- update `LOCAL-QUIRKS.md`
- update `LOCAL-LESSONS.md`
- update `LOCAL-WINS.md`
- recommend a runtime hygiene fix
- propose a package/vendor change for a future release

Bad output:

- rewriting the shipped package every time something annoying happens once

## What A Good Buyer Workflow Looks Like

1. incident happens
2. classify it
3. store the truth in the smallest safe layer
4. keep operating
5. only later decide whether the pattern deserves vendor promotion

That gives you a whole system instead of a pile of overwritten prompts.

## Self-Correction Rule

If a lane can already see its own miss while the work is still live, prefer:

1. immediate correction
2. runtime repair
3. exact routing repair
4. then durable promotion if the pattern is broad enough

Do not confuse "we learned something" with "the live problem is fixed."
