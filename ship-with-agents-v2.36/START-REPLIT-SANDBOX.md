# Start Replit Sandbox

Use this when you want one bounded Replit lane without turning Replit into the
main operating system.

## Before You Start

Read:

1. `REPLIT-INTEGRATION.md`
2. `REPLIT-COST-GATE.md`
3. your current canonical slice or task packet

Do not launch the sandbox until the goal is bounded enough to explain in one
short paragraph.

## Minimum Handoff Shape

When you start a Replit lane, include:

- repo or import source
- exact goal
- non-goals
- whether publishing is allowed
- whether auth or database setup is allowed
- what must come back into the package checkpoint

Use `templates/REPLIT-HANDOFF-TEMPLATE.md`.

## Example Startup Body

```text
Replit sandbox for <short goal>

Use this as a bounded cloud execution lane.

Source repo:
<repo or import source>

Exact goal:
<one short paragraph>

Non-goals:
- do not redesign the product
- do not widen scope beyond the stated experiment
- do not treat Replit chat history as canonical truth

Allowed surfaces:
- publish: yes/no
- auth setup: yes/no
- database setup: yes/no

Return artifacts required:
- what changed
- what ran
- live URL if any
- services or secrets required
- exact checkpoint summary for local package truth
```

## After The Run

Write the result back into:

- checkpoint
- closeout if meaningful
- update bus only if the run changes what other lanes should do
- local lessons only if the pattern is reusable

## Final Rule

Replit should return one clear result to the package.

If you later run long-lived Claude Code or Codex sessions inside Replit through
a separate remote-session tool, also read `REMOTE-SESSION-BRIDGE.md`.
