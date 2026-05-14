# Plain-Language Gate

Use this when explaining orchestration concepts to a buyer who may not know the
package's internal vocabulary yet.

## Core Truth

Internal terms are allowed.
Untranslated internal terms are not.

On first meaningful use, translate the package word into ordinary language.

## Default Translations

- `lane` = the current chat, work thread, or active owner
- `slice` = the main work doc for one task or workstream
- `checkpoint` = a save point / latest status file
- `closeout` = the final wrap-up record
- `wake` = tell an already-open chat to pick the work back up
- `doctor` = audit / diagnosis / recovery chat
- `super` = coordination / launch owner chat
- `head` = strategy / top-level routing chat

You can still use the internal term after translating it once.

## Synonym Acceptance

Do not require the buyer to say the package's preferred word first.

Map ordinary user language into the internal model without correction.

- `slice` may be called: work doc, task doc, plan, spec, brief, packet, task
  sheet
- `lane` may be called: chat, thread, session, workstream, owner
- `checkpoint` may be called: status note, save point, progress file, resume
  note
- `closeout` may be called: wrap-up, final note, handoff summary, done record

If the buyer says "write a plan" and orchestration needs a durable work doc,
that is enough. Do not stop to teach the word `slice` before helping.

## Preferred Pattern

Good:

- "Create one work doc (called a slice in orchestration mode)."
- "Use the current chat or work thread (called a lane internally) as the
  owner."
- "If you already have a plan or spec, that can become the work doc."

Bad:

- "Open a lane, update the slice, then checkpoint and closeout."
- "We need a slice, not a plan."

## When To Simplify Harder

Prefer plain-language-only wording when:

- the buyer is new
- the buyer did not use the internal term first
- the task is onboarding or setup
- the jargon is not needed for precision

## Final Rule

The buyer should be able to succeed before learning the package's vocabulary.
The system should understand the buyer's words without making them translate
into ours first.
