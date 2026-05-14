# Runtime Term Separation Rule

Use this when a lane is about to describe model, effort, thinking mode,
support posture, or capability truth to the buyer.

## Core Truth

The system must not mix:

- internal UX terms
- vendor runtime terms
- local package defaults
- recommended future settings

Those are different truth classes.

## Keep These Separate

1. `Support posture`
   - internal buyer-experience words:
   - `shipping | guided | teaching`
   - never present these as runtime effort or model intelligence

2. `Reasoning effort`
   - only use when the current surface explicitly exposes one
   - examples:
     - OpenAI/Codex reasoning effort: `low | medium | high | xhigh`
     - local Claude terminal effort only when surfaced by the current runtime
       or local launch truth

3. `Thinking mode`
   - use for surfaces that expose mode-style runtime controls instead of effort
   - examples:
     - Claude app: `standard | extended thinking | research` when actually
       visible or explicitly selected

4. `Project default`
   - what the package or local config says this lane should normally use

5. `Recommended next runtime`
   - a suggestion for a future lane or restart

## Forbidden Mixes

- `Effort level: guided`
- `Runtime mode: high intelligence` unless that exact term is the surfaced
  product control for the current surface
- `Current runtime: <project default>` when the current runtime is not visible
- `Thinking mode:` guessed from a message style

## Final Rule

If a runtime/control label is not surfaced, verified locally, or grounded in
official current docs, say `unknown` or `not surfaced on this runtime`.
