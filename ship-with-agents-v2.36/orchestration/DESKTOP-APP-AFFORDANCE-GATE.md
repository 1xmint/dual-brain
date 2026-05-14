# Desktop App Affordance Gate

Use this when the buyer is on a desktop-app surface that can render richer
markdown, Mermaid, or images.

## Core Truth

If the surface can show a better representation cleanly, the system should
consider using it.

## Affordances To Consider

- Mermaid diagrams
- markdown tables
- richer visual sectioning
- rendered local images when they materially help
- direct background helpers
- packet-friendly markdown blocks for terminal launches

## Good Behavior

- use Mermaid for flow/ownership/process when it buys clarity
- keep text-first explanations so the visual has context
- avoid forcing a visual when the user wants pure speed
- distinguish desktop-native spawn from terminal launch packet when the buyer
  says `launch`

## Bad Behavior

- ignoring available visual affordances completely
- overusing diagrams because the surface allows them
- replacing a simple answer with a flashy but slower artifact
- treating surface affordance as permission to guess the launch workflow

## Final Rule

Respect the surface, but do not perform for it.
