# Friction And Patterns Pattern

Friction is only useful if it becomes data. A pattern library is only useful if
it captures project-specific craft knowledge that the agent can reload later.

## Friction log

Runtime file: `observability/friction.jsonl`

One line per meaningful correction:

```json
{"ts":"2026-05-10T17:40:00-04:00","taskKind":"bug-fix","wrong":"missed input validation on query param","expectedSkill":"error-handling","actualSkill":"truth-and-verification","correction":"validate the boundary and add a failing test first","severity":"medium"}
```

Required fields:
- `ts`
- `taskKind`
- `wrong`
- `correction`

Recommended fields:
- `expectedSkill`
- `actualSkill`
- `severity`
- `notes`

Log friction when:
- the user says the agent missed an edge case
- `/undo-last` was needed because the change was wrong
- the right skill should have been loaded and was not
- a recurring repo-specific pattern had to be re-explained

Do not log:
- ordinary preference differences with no durable lesson
- secrets or customer data
- giant prose transcripts

## Pattern library

Tracked directory: `patterns/`

Purpose:
- capture stable repo-specific craft conventions
- keep them separate from transient checkpoints
- give craft skills local context they can reload on demand

Suggested files:
- `patterns/testing.md`
- `patterns/error-handling.md`
- `patterns/database-access.md`
- `patterns/auth.md`

Each pattern file should answer:
1. what we do here
2. what to avoid here
3. what proof usually matters here

## Doctor relationship

Doctor sweeps should read `observability/friction.jsonl` when present and ask:
- which craft failure repeated?
- which skill should have triggered?
- should a new project pattern be captured?
- should an existing skill description be tightened?

Doctor should not respond to friction by immediately spawning more doctrine.
The preferred repairs are:
1. improve a skill trigger
2. capture a repo-specific pattern
3. tighten one workflow command
4. only then add doctrine if the gap is truly structural

## Commands this enables

- `/log-friction`
- `/capture-pattern`

Those commands should keep the data small, specific, and reusable.
