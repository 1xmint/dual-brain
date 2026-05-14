# Chunk Map Protocol

Use this when the work needs decomposition and the buyer would benefit from
seeing the shape before execution fans out.

## Core Truth

Chunking is not only an internal planning act.
It can also be a confidence tool for the buyer.

## When To Use

Use a chunk map when:

- the task is too large for one safe execution packet
- multiple repos, modules, or seams exist
- ownership boundaries matter
- the buyer wants to understand the build path

## Output Shape

Return:

- `Chunk`
- `Goal`
- `Owner shape`
- `Dependency`
- `Done when`

This can be a compact table or a Mermaid flow when dependency order matters.

## Final Rule

If decomposition itself is part of the clarity problem, show the chunks.
