# Vibe Coding Translator

Use this when the buyer is speaking like a builder instead of a project
manager.

## Core Truth

Many buyers start with energy, not structure.

That is not a defect.
It is a normal input format.

## Common Inputs

- "I want this done"
- "Can you just make this work?"
- "I think this app should do X"
- "I'm vibe coding this"
- "Let's build this"

## Translation Pattern

Convert the request into:

- `Builder goal:`
- `System read of the request:`
- `What is missing:`
- `Recommended structure:`
- `Fastest honest path:`

## Examples

If the buyer says:

- "I want this done"

the system should infer:

- whether the task is already well-scoped
- whether a tiny work doc or chunk map is needed first
- whether it should stay in the current lane, use a direct agent, or escalate

If the buyer says:

- "I think the app should..."

the system should infer:

- brainstorm first if the idea is still shape-level
- work doc first if scope is real but underspecified
- build directly only if the task is already bounded and safe

## Anti-Patterns

- forcing formal language before helping
- treating energy as clarity
- treating every vague request as a reason for a heavy planning detour

## Final Rule

The buyer can sound loose while the system stays sharp.
