# Surface Compaction And Resume

Use compaction, rotation, and resume according to the surface you are actually
running on.

Do not assume desktop/app chats behave like terminal chats just because the
underlying model is strong.

## Big Rule

Use the strongest native continuity primitive the surface actually gives you.

- terminal with documented compact/resume support: automate and use it
- desktop/app with strong thread continuity but weak documented compact control:
  preserve the thread longer, then rotate with a migration packet
- surface with weak continuity: rotate earlier and rely on durable artifacts

The goal is:

- lower cost
- cleaner context
- less user babysitting
- fewer "this chat should have rotated earlier" failures

## Four Surface Families

### 1. Claude Code terminal

Documented native primitives:

- `/compact`
- auto-compact
- `--resume`, `--continue`, `/resume`
- `PreCompact` hooks
- `SessionStart` hooks for resume/compact/startup
- `/status` and statusline telemetry

Operational truth:

- this is the most automatable compaction surface in the system
- use `/compact` before clarity is gone, not after
- use statusline and `/status` instead of guessing model, effort, or context
- use hooks and autocompact settings when you want the lane to self-manage

Recommended posture:

- head / super lanes: review compaction early
- agent / worker lanes: compact when execution is still coherent but the thread
  is getting noisy
- if the workstream changes meaningfully, rotate instead of repeatedly
  compacting

### 2. Claude desktop / claude.ai / Claude app lanes

Documented native primitives:

- project memory / memory features
- usage and length limits
- explicit new-chat behavior

Current conservative truth:

- do not assume Claude desktop/app gives the same documented compaction control
  as Claude Code terminal
- prefer explicit rotation packets and migration summaries over pretending the
  app has a terminal-style `/compact` workflow unless you have locally verified
  that behavior

Recommended posture:

- preserve a coherent planning/review thread while it is still clean
- once the thread is mixed, burying too many decisions, or changing phase,
  rotate to a fresh chat with a migration packet
- if you are stopping for the night or intentionally closing the lane, leave a
  clean pickup artifact

### 3. Codex terminal

Documented native primitives:

- `/compact`
- `/new`
- `/resume`
- `/fork`
- `/side`
- configurable `model_auto_compact_token_limit`
- configurable `model_context_window`

Operational truth:

- this is a strong terminal surface for automatic or semi-automatic context
  management
- use explicit configuration when you want earlier compaction for quality or
  budget reasons
- use `/side` or `/fork` for bounded detours instead of polluting the main lane

Recommended posture:

- use `/compact` and token-limit settings for long-running coding lanes
- use `/resume` for clean pickup instead of rebuilding context manually
- if you need a different role or a different workstream, use a new thread
  instead of endlessly widening one lane

### 4. Codex desktop app

Documented native primitives:

- durable threads organized by project
- `/status`
- thread automations
- shared history/configuration with Codex CLI and IDE extension

Current conservative truth:

- do not assume a documented app `/compact` command just because the CLI has
  one
- treat the app as thread-centric first
- preserve thread continuity while the thread still matches the job
- rotate to a fresh thread when the workstream or phase meaningfully changes

Recommended posture:

- head / manager / brainstorm lanes can often stay in-thread longer than a
  terminal execution lane because the app is built around durable threads
- rotate when the thread stops being one coherent problem, not only when it
  feels "long"
- use `/status` and thread identity instead of guessing current state
- use thread automations for recurring work that should revisit the same lane

## Money Rule

The best compaction strategy is not always "compact as late as possible."

That can increase cost when:

- a bloated thread keeps re-reading irrelevant context
- you have to restate the same state repeatedly
- the lane burns turns re-deriving old decisions

Good defaults:

- surfaces with native auto-compact and resume:
  tune them earlier when quality matters
- surfaces without documented native compact controls:
  rotate earlier with durable migration packets

## Rotation Rule

Rotate when:

- the next phase is materially different
- the chat is carrying too many resolved branches
- the surface lacks a strong documented compact primitive
- the lane's role would become clearer in a fresh thread

Do not rotate only because a chat is "old."
Do rotate when the chat is no longer the cleanest container.

## Resume Rule

For terminal lanes with documented resume:

- prefer the native resume command first
- then reload the minimum durable truth if needed

For desktop/app lanes:

- continue the existing thread when it still matches the job
- otherwise start a fresh thread from a migration packet or checkpoint summary

## User-Experience Goal

The buyer should not have to remember all of this manually.

The system should teach:

- what the current surface can actually do
- when that surface should compact
- when that surface should rotate
- how that surface should resume cleanly

If the surface has strong native automation, use it.
If it does not, use durable artifacts and a clean pickup pattern.

Use `orchestration/COMPACTION-CADENCE-LOOP.md` if you want the package's
canonical compact / rotate / checkpoint / closeout rhythm in one place.
