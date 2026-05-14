# Capability Matrix

Use this file before promising that a tool can spawn helpers, pin a
different model, or behave like another platform.

The principles in this package are portable. The mechanics are not.

Pair this file with:

- `OPERATOR-ORCHESTRATION-PROFILE.md`
- `SURFACE-CAPABILITY-PROFILE.json`

## How To Read This

- `Documented` = the platform clearly documents the capability
- `Likely but verify` = the capability may exist in practice, but do not
  rely on it until you test it in your environment
- `Manual fallback` = use the package through paste/manual flow instead
  of assuming native orchestration

## Runtime Shape Categories

Reason from runtime shape before you reason from branding.

- `Desktop/app lane` = persistent app chat, often good for long-running review,
  planning, and durable lane ownership
- `Terminal lane` = explicit command-driven execution with the strongest exact
  launch control
- `IDE agent lane` = repo-connected execution inside an editor, but advanced
  orchestration is tool-specific
- `Web/manual lane` = copy-paste and explicit handoff flow matter more

## Conservative Matrix

| Environment | Repo-connected execution | Helper spawning | Exact per-helper runtime control | Best exact-control path |
|---|---|---|---|---|
| Claude Code terminal | Documented | Documented | Likely but verify | Manual terminal launch |
| Desktop/app strategy lane | Depends on app | Depends on app | Unknown | Separate manual work chat or terminal |
| ChatGPT / Codex desktop chat | Manual fallback unless repo/tool access is proven | Not the default assumption | Unknown | Manual work chat or separate terminal |
| Codex terminal | Documented | Do not assume Claude-style local helper orchestration | Unknown | Manual terminal launch |
| Cursor | Repo-connected | Tool-specific | Unknown | Manual launch or explicit task routing |
| Copilot Chat | Repo-connected | Tool-specific | Unknown | Manual launch or explicit task routing |
| Windsurf | Repo-connected | Tool-specific | Unknown | Manual launch or explicit task routing |
| Gemini CLI / IDE agent mode | Documented or tool-specific | Tool-specific | Unknown | Manual terminal launch or explicit task routing |
| Local-model IDE / terminal | Depends on stack | Depends on stack | Unknown | Manual terminal launch |
| Web-only | Manual fallback | No | No | Separate browser chats and copy-paste packets |

## Research-Backed Public Truth

At the time of this package cut:

- Claude Code clearly documents subagents with separate context windows
  and configurable tools.
- Claude Code should still be treated conservatively for exact
  per-helper model pinning unless you have locally verified that
  behavior in your environment.
- OpenAI clearly documents the Codex app and Codex CLI, so desktop/app and
  terminal Codex lanes are both real runtime shapes.
- Codex clearly supports strong local execution and OpenAI documents
  parallel agent work in Codex cloud/app flows.
- Do not assume Codex terminal is a drop-in equivalent to Claude Code's
  helper-orchestration model unless you have verified that locally.
- Google clearly documents Gemini CLI and Gemini Code Assist IDE/agent mode.
  Treat those as real CLI/IDE lanes, but do not invent a standalone desktop
  app capability unless the product documentation actually shows it.

If a Claude desktop lane, Codex app lane, or another app lane has real repo and
tool access in your environment, preserve it as an app lane. Do not downgrade
it to "just web chat" because another provider brands its product differently.

This package stays conservative on purpose. It is better to underclaim
than to route buyers into a fragile workflow.

## Durable Rules

1. If exact model or effort control matters, prefer a manual terminal
   agent chat.
2. If a worker needs its own logs, checkpoints, migration path, or
   subagent orchestration, prefer a manual terminal agent chat.
3. Use directly spawned helpers for bounded convenience slices:
   - short review
   - focused investigation
   - disjoint safe implementation
4. If the runtime cannot prove a capability, route to the manual
   fallback instead of guessing.
5. Treat surface capability as structured truth, not as lore carried in one
   chat.

## What To Tell Buyers

- `Claude Code native`: strongest orchestration path in this package
- `Desktop/app lane`: preserve it if it already owns planning/review or another
  durable role; route by actual capabilities, not product snobbery
- `GPT/Desktop + terminal execution`: strong hybrid path when roles stay
  strict
- `Codex terminal`: good execution path, but do not promise the full
  Claude helper model without local verification
- `Cursor / Copilot / Windsurf`: strong repo-connected tools, but treat
  advanced orchestration features as tool-specific rather than universal
- `Local models`: keep them bounded unless the stack has proven deeper
  orchestration strength
- `Web-only`: use the lightweight/manual path
