# Measurement Discipline

- Spawn cost is measured by `cache_creation_input_tokens` from `/cost` in a
  fresh Claude Code session, not by chars/4 estimation.
- Chars/4 underestimates real cost by roughly 2x because it ignores Claude
  Code's own system prompt, tool definitions, and harness overhead.
- Future token-budget targets must be set against real fresh-session
  measurements, not markdown-size estimates.
- Claude Code does not currently expose direct project-skill load telemetry in
  the transcript or debug stream, so skills-matching verification uses
  fresh-session self-report as a proxy unless the runtime exposes a stronger
  signal in the future.
