# Capability Truth Verification Protocol

Use this when a lane or doctor is about to make claims about surface
capabilities, model controls, runtime modes, or current product behavior.

## Core Truth

Vendor capability truth is temporally unstable.

If the claim is about what a surface currently supports, the system should
prefer:

1. live surfaced runtime truth
2. durable local operator truth
3. current official vendor docs
4. clearly labeled uncertainty

## Verification Order

### Step 1: Check live surfaced truth

Examples:

- Claude Code `/status`, `/model`, statusline
- visible chat toggles or runtime selectors in the current app
- actual launch packet for this live lane

### Step 2: Check local durable truth

- `OPERATOR-CAPABILITIES.md`
- `OPERATOR-PREFERENCES.md`
- `SURFACE-CAPABILITY-PROFILE.json`
- `MODEL-CONFIG.md`
- current task packet or active map

### Step 3: Check official vendor docs when the claim is unstable

Examples:

- model availability
- reasoning/effort values
- thinking modes
- research/web-search availability
- desktop-vs-terminal feature differences

Do not use forum memory, stale blog posts, or generic intuition when official
docs are reasonably available.

## Surface-Specific Guidance

- OpenAI/Codex:
  use official model docs for reasoning effort and current model support
- Anthropic Claude app / Claude Code:
  use official docs or help-center docs for current thinking/search/research
  controls
- Gemini CLI:
  use official docs for current config keys, model selection, and documented
  runtime controls; do not invent an effort layer if none is documented

## Final Rule

If the claim could influence cost, trust, launch shape, or user guidance and
you cannot verify it, say `unknown` or `verify on this surface` instead of
guessing.
