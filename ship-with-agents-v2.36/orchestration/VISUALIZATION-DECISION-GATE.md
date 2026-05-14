# Visualization Decision Gate

Use this before deciding whether a buyer-facing response should stay plain text
or include a visual.

## Core Truth

Visuals are not decoration.
They are a clarity tool.

Use them when they materially reduce cognitive load.

## When A Visual Is Worth It

Prefer a visual when the response is about:

- branching process
- multi-lane orchestration
- chunk decomposition
- staged roadmap or timeline
- decision tradeoffs
- ownership or dependency flow

## Preferred Visual Types

- flowchart for multi-step or branching process
- table or matrix for tradeoffs and comparisons
- timeline for staged roadmap
- lane map for orchestration ownership
- chunk map for build decomposition

## When To Stay Text-Only

Stay text-only when:

- the answer is tiny
- the next move is obvious
- the visual would repeat what one sentence already makes clear
- the buyer is in pure speed mode and the visual would slow them down

## Surface Rule

If the surface can render Mermaid or richer markdown cleanly, treat that as an
available tool, not a novelty.

If the surface is plain terminal text, compress the same structure into a table
or compact bullets instead.

## Final Rule

Choose the lightest representation that materially improves clarity.
