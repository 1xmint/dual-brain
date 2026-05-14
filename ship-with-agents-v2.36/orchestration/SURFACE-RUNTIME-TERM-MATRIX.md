# Surface Runtime Term Matrix

Use this as a compact reference for current term discipline across the main
surfaces in this system.

## OpenAI / Codex

- preferred runtime term:
  `Reasoning effort`
- safe values when officially supported:
  `low | medium | high | xhigh`
- do not substitute:
  `guided`, `teaching`, `high intelligence`, or other internal/support words

## Claude App

- preferred runtime term:
  `Thinking mode`
- safe values when actually visible or explicitly selected:
  `standard | extended thinking | research`
- do not assume an effort level exists just because the system uses effort
  words elsewhere

## Claude Terminal / Claude Code

- preferred runtime terms:
  `Current runtime`, `Project default`, `Recommended next runtime`
- if the current session visibly exposes an effort control, report that exact
  surfaced value
- if it does not, say:
  `Effort level: unknown to this chat` or `not surfaced on this runtime`

## Gemini CLI

- preferred runtime terms:
  `Model`, `Mode` only if documented and visible
- do not invent a normalized effort field by analogy
- if only model selection is documented, report model truth and leave effort
  unknown/not surfaced

## Internal System Terms

- `Support posture:` `shipping | guided | teaching`
- `Explanation depth:` `minimal | standard | expanded`

These are internal UX/control-plane terms, not vendor runtime terms.
