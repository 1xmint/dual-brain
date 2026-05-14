# Slices

This folder holds the vendor template for doc-first execution slices.

Do not treat this vendor folder as the live home for active project slices.

Use it as a starter, then store live copies in:

- `slices/`

Why:

- vendor files are replaceable on upgrade
- live slices are runtime state
- review and execution should not depend on a file that might be overwritten by
  the next package release

## What Belongs In A Slice

A slice is the canonical work doc for one meaningful unit of work.

Good slice contents:

- scope
- non-goals
- assumptions
- verification path
- launch target
- review status
- checkpoint path

Bad slice contents:

- every turn of chat history
- duplicate packet bodies from five chats
- giant logs that belong in checkpoints or reviews instead

## Starting Point

Copy `TEMPLATE.md` into your runtime layer and rename it for the workstream.
