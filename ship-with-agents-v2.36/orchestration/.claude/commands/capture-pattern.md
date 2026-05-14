---
argument-hint: "<pattern name>"
description: Capture a repo-specific craft convention in patterns/ so future sessions can reload it
---

# /capture-pattern

Promote a repeated local lesson into `patterns/`.

## Use when

- the same repo-specific correction has happened more than once
- a craft skill is too generic for this codebase's real rule
- the user says "we always do it this way here"

## Steps

1. Turn `$ARGUMENTS` into a short slug, e.g. `error-handling`.
2. Create `patterns/<slug>.md` with:

```markdown
# <Pattern name>

## When it applies
- signal 1
- signal 2

## Do this
- preferred move

## Avoid this
- known local mistake

## Proof
- what test / check / review evidence matters
```

3. If the file already exists, update it instead of creating a duplicate.
4. Keep the guidance repo-specific and durable.
5. If this pattern should affect one of the craft skills, say which one.

## Return

- `Pattern file:` path
- `Why now:` one line
- `Skill that should consult it:` <name or none>
