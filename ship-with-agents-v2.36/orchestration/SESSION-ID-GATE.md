# Session ID Gate

Use this gate before naming a new head, manager, super, agent, or brainstorm
chat.

The same naming principle applies everywhere:

- verified active lineage beats first-unused numbering

## Core Rule

Do not choose the next session ID from:

- first unused number
- old checkpoint filenames
- old log filenames
- historical residue alone

Those are secondary evidence, not the source of truth for the next live
session ID.

## What To Verify First

Before choosing a new ID, verify:

1. whether this is a continuation of an existing live lineage
2. whether this is a new workstream under an existing live owner
3. whether this is a genuinely new root lane
4. whether the stable lane key should stay the same and only the continuation
   token should change
5. whether a clearer slug would preserve clarity better than jumping to a new
   root number

## Source-Of-Truth Order

Use this order:

1. `ACTIVE-CHAT-MAP.md`
2. active ownership map or active workstream map
3. current task packet or handoff
4. relevant live checkpoint or session log
5. only if still ambiguous: stop and ask instead of inventing a new
   root number

If a canonical slice or checkpoint explicitly names the current or expected
next session and the active map disagrees, reconcile the map before treating
the older row as authoritative.

## Practical Public Rule

If the work belongs to an existing live lineage:

- preserve the stable lane key
- change only the continuation token for rotation or crash recovery
- add or improve the workstream slug only when the durable work meaning changed
- do not jump to a new root number just because old numbers exist in
  history

If the work is a new child lane under an existing owner:

- create a new role-pure lane key such as `agent-12-cache-fix`
- store the owner in the active map, slice, or checkpoint metadata
- do not encode the owner by pretending the child lane is a super lane

## Legibility Rule

When two valid names are possible, choose the more legible one.

Prefer:

- active verified lineage
- full-word role prefixes
- short readable workstream slugs
- explicit owner/progress fields over packed name segments

Avoid:

- surprising jumps in root numbering
- names derived mainly from stale historical residue
- names that require the user to decode hidden lineage or progress logic

When using rotation or crash-recovery continuations, claim the new live session
in `ACTIVE-CHAT-MAP.md` before using that session ID in routing, updates, or
launch guidance.
