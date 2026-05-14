# Pattern Library

Project-specific craft knowledge lives here.

Use this directory when the same repo-specific coding lesson keeps recurring
and the generic craft skills are not enough on their own.

## What belongs here

- testing conventions that are unique to this repo
- error-handling expectations that generic guidance would miss
- database or API usage patterns that are specific to this codebase
- auth or trust boundaries that deserve a local reminder

## What does not belong here

- session summaries
- open-task state
- secrets or credentials
- generic advice that already belongs in the craft skills

## File format

Each file should stay short and practical:

```markdown
# <Pattern name>

## When it applies
- one or two signals

## Do this
- concrete preferred move

## Avoid this
- concrete mistake pattern

## Proof
- what test, typecheck, or review evidence usually matters
```

## Index

- Add one file per durable repo-specific pattern.
- Prefer a few strong files over many thin ones.
- Update the relevant craft skill or `/capture-pattern` output when a new file
  would materially help future sessions.
