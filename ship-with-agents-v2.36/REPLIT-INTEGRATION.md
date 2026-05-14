# Replit Integration

Use this when you want Replit as an optional cloud execution surface.

Do not treat Replit as the main orchestration brain of this package.

## Core Truth

For this package:

- local docs are truth
- Replit is an optional execution, demo, auth, database, or publish surface
- important truth must come back into your local checkpoint / slice / closeout
  system

Replit is best as an accelerator, not as the place where your whole operating
system lives.

## Best Uses

Use Replit when you want one of these:

- fast cloud sandbox for a bounded spike
- import a GitHub repo and test quickly without local environment cleanup
- easy demo or publish surface
- auth or database setup acceleration
- rollback-friendly experimentation

## Bad Uses

Do not use Replit as the default answer for:

- long-lived canonical orchestration memory
- replacing local slice/checkpoint/closeout truth
- every tiny task just because cloud tools are available
- multi-lane strategy ownership

If the real need is review, routing, or durable multi-chat truth, stay in the
package's local doc-first workflow.

## The Three Honest Replit Modes

### 1. Sandbox mode

Use this when you want to prove or falsify something quickly.

### 2. Demo / publish mode

Use this when the main goal is a live URL, not local depth.

### 3. Accelerator mode

Use this when Replit shortens the setup burden for auth, secrets, database, or
lightweight hosting.

## Recommended Workflow

1. Keep the package's local docs as truth.
2. Open one bounded Replit task.
3. Define exactly what Replit is allowed to prove or build.
4. Run the work.
5. Bring results back into:
   - slice
   - checkpoint
   - closeout
   - local lessons if needed

Do not leave important truth trapped in a Replit chat transcript.

## How Replit Should Fit The Package

Cleanest package role mapping:

- local slice = planning and approval truth
- Replit workspace = bounded execution surface
- local checkpoint = returned execution truth
- local closeout = final lane truth when the work matters enough

If you already have a head, review lane, or super locally, keep that structure.
Do not let Replit silently become a second orchestration brain.

## Why Replit Is Useful

Replit is strongest when the cloud surface itself creates leverage:

- clean import from GitHub
- easy publish path for demos and previews
- built-in secrets handling
- built-in database tooling
- automatic checkpoints and rollbacks for Agent-led work
- workspace workflows that can run sequential or parallel command sequences

That makes it especially good for:

- fresh-environment testing
- cloud repros
- publishable proof apps
- auth or database acceleration
- setup-heavy bounded experiments

## How Updates Come Back Into The System

Replit does not automatically update your package truth.

The expected return path is:

1. Replit run completes or blocks
2. one local checkpoint is updated
3. closeout is updated if the lane is meaningful
4. update bus is used only if the result changes workflow or lane behavior

If a Replit run changes what other active lanes should do next, publish that as
local package truth instead of assuming the other chats somehow know.

## Good Replit Outputs

Strong Replit outputs are:

- fresh-environment boot proof
- live demo URL
- auth wiring proof
- database schema / query proof
- bounded blocker report
- exact "works in Replit, still missing locally" note

Weak Replit outputs are:

- vague chat summaries
- "it mostly works"
- uncheckpointed environment knowledge
- a deployment URL with no explanation of what it proves

## What Should Come Back From Replit

At minimum, record:

- what repo or branch was used
- what goal was attempted
- what changed
- what ran successfully
- what secrets or services were required
- whether a live deployment now exists
- rollback or revert notes if relevant
- what still must happen locally

If publishing happened, also record:

- deployment type
- live URL
- whether the URL is private preview, public demo, or candidate production

If auth or database setup happened, also record:

- what provider or surface was used
- what secrets were required
- whether the dependency is now part of the real product path or only the
  experiment path

## Replit And Future Remote Sessions

If you later use a remote-session tool to run long-lived Claude Code or Codex
lanes inside Replit, do not invent a second orchestration model.

Use:

- `REMOTE-SESSION-BRIDGE.md`
- `templates/REMOTE-SESSION-HANDOFF.md`

That keeps remote cloud sessions inside the same slice, checkpoint, closeout,
and update-bus discipline as the rest of the package.

## Decision Rule

Use Replit when it reduces real setup or demo friction.

Do not use Replit when it only adds another place for truth to drift.

Also read:

- `REPLIT-COST-GATE.md`
- `START-REPLIT-SANDBOX.md`
- `templates/REPLIT-HANDOFF-TEMPLATE.md`
