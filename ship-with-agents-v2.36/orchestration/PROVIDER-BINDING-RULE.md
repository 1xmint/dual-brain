# Provider Binding Rule

Use this when assigning surfaces to roles or review-cell functions.

## Core Truth

Keep semantic roles stable:

- `head`
- `manager`
- `super`
- `agent`
- `doctor`
- `brainstorm`

Bind providers and surfaces as metadata, not as the architecture itself.

## Good

- role: `manager`
- provider/surface: `GPT Desktop`

- role: `super`
- provider/surface: `Claude terminal`

## Bad

- `Supervisor GPT`
- `Supervisor Claude`
- `Gemini Manager` as a permanent architectural role

Those names freeze temporary tool choices into the control plane.

## Rule

Choose the best surface for the function.
Do not rename the function around the surface.
