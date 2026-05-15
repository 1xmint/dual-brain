# VISION.md — dual-brain Design Bible

> Read this file before making any UI, navigation, or architecture changes.
> This document is authoritative for both human contributors and AI agents.

---

## Identity

**dual-brain** is an AI orchestrator that routes work between Claude and OpenAI subscriptions.

It is a **session manager first**, a router second, and an admin tool never.

The target user is a vibe coder who wants to start a coding session in 10 seconds — not configure things. They have a Claude Pro or Max subscription and optionally a ChatGPT subscription. They want to say "new session" and have the system figure out the rest.

The UX is directly inspired by the data-tools / replit-tools session manager: a single terminal screen, recent sessions front and center, no navigation mazes.

---

## Design Principles

### 1. Sessions first
The main screen IS the session list. A user opening dual-brain wants to resume work, not to inspect provider health. Sessions are rendered above all menus, always.

### 2. Provider invisible
The user says "new session." The system picks the provider. Plan labels (`Max x5`, `Plus`) are shown for context and budget awareness, not to force a choice. Provider routing is automatic via the detect → decide pipeline.

### 3. One screen
There is one primary screen: `mainScreen`. Everything else (settings, subscriptions, sessions manager) is accessed via a letter key and navigated back from. There is no sidebar, no tab bar, no wizard flow in normal use.

### 4. Box everything
All status displays use `box()` from `src/tui.mjs`. The header is always a box. Settings panels are boxes. Auth summaries are boxes. Inline text blocks without boxes are not acceptable for status information.

### 5. 10-second setup
`welcomeScreen` auto-detects CLI login (`detectAuth()`), auto-detects plan tier (`detectPlans()`), and presents a single-Enter fast path. The user can press Enter and be done. Customization is behind `[c]`, not the default.

### 6. Team-friendly
Subscription labels (`"Josh's $100 sub"`) and expiry dates with auto-refresh are first-class features. When a subscription expires the system re-authenticates automatically, without user intervention. This is not optional — it is built into `mainScreen`'s render loop.

### 7. data-tools coexistence
Sessions are imported from replit-tools via `importReplitSessions()`. The `[d]` menu key switches to data-tools (`claude-menu`). These are sibling tools, not competing tools. dual-brain augments the session data with metadata stored in `.dualbrain/sessions.json`.

---

## UX Specification

### Main Screen (the only screen that matters)

Rendered by `mainScreen()` in `bin/dual-brain.mjs`.

```
╔══════════════════════════════════════════════════════════╗
║  🧠 dual-brain v7.1.8                                   ║
║  ✅ Claude: Max x5 ($100/mo) [Josh's $100 sub] (5d left)║
║  ✅ OpenAI: Plus ($20/mo)                               ║
╚══════════════════════════════════════════════════════════╝

  ─── Recent Sessions ─────────────────────────────────────
  [1] 📌 2h ago   security head advisor #1     [security]
  [2]    5h ago   refactor auth module          [refactor]
  [3]    1d ago   add nav component             [ui]

  ─── Sessions ────────────────────────────────────────────
  [c] Continue last session
  [n] New session
  [1-9] Resume numbered above
  [e] Manage sessions
  ─── Tools ───────────────────────────────────────────────
  [d] Switch to data-tools
  ─── Auth ────────────────────────────────────────────────
  [j] Login to Claude
  [k] Login to Codex
  ─────────────────────────────────────────────────────────
  [s] Settings  [q] Exit
```

Key implementation details from the actual code:
- Header is `box(`🧠 dual-brain v${version}`, headerLines)` — always this call, always this emoji.
- Session list is `enrichSessions(importReplitSessions(cwd), cwd).slice(0, 7)` — max 7 sessions.
- Sessions section opens with `separator('Recent Sessions')`.
- Menu is built with `menu(menuOpts)` from `src/tui.mjs` — section grouping via the `section` property.
- Pinned sessions: `sess.pinned ? '📌 ' : '   '` (three spaces when not pinned, for alignment).
- Active sessions: `sess.isActive ? ' ●' : ''` appended to the name.
- Category tags: `sess.category ? \`  [${sess.category}]\` : ''` appended after active indicator.

### Welcome Screen (first-run only)

Rendered by `welcomeScreen()`. Shown when no profile file exists.

```
╔══════════════════════════════════════════════════════════╗
║  🧠 Dual-Brain v7.1.8 — Setup                          ║
║  ✅ Claude CLI ready (Max x5 ($100/mo))                 ║
║  ✅ Codex CLI ready (Plus ($20/mo))                     ║
║  ✅ data-tools detected                                  ║
║  ✅ 12 sessions found from data-tools                   ║
╚══════════════════════════════════════════════════════════╝

  [Enter] Save and go
  [c]     Customize plan tier
  [i]     Import 12 sessions from data-tools
```

Key implementation details:
- Status emoji: `✅` when found, `⚠️ ` (with trailing space) when not logged in.
- Fast path: pressing Enter calls `autoSetup(cwd)` and goes straight to `main`.
- The `[i]` import option is only shown when `importReplitSessions(cwd).length > 0`.

### Settings Screen (compact panel)

Rendered by `settingsScreen()`. Accessed via `[s]` from main. Not a navigation target in normal flow — a quick config panel. It uses `box('Settings', settingsLines)` and shows mode switcher, subscription status, and enforcement guard count in one view.

```
╔══════════════════════════════════════════════════════════╗
║  Settings                                               ║
║                                                         ║
║  Mode:                                                  ║
║    [1] cost-saver                                       ║
║    [2] balanced (active)                                ║
║    [3] quality-first                                    ║
║                                                         ║
║  Subscriptions:                                         ║
║    Claude: logged in — Max x5 ($100/mo) [Josh's sub]   ║
║    OpenAI: logged in — Plus ($20/mo)                    ║
║                                                         ║
║  Enforcement: 4/4 guards active                        ║
╚══════════════════════════════════════════════════════════╝
```

### Subscription Status Display

Provider lines follow this exact format (from `subLine()` in `mainScreen`):

| State | Format |
|-------|--------|
| Not logged in | `⚠️  Claude: not logged in — run: claude login` |
| Expired | `🔴 Claude: Max x5 ($100/mo) expired [Josh's sub] — will re-auth` |
| Expiring soon (≤7 days) | `✅ Claude: Max x5 ($100/mo) [Josh's sub] (5d left)` |
| Normal | `✅ Claude: Max x5 ($100/mo) [Josh's sub]` |

Plan labels map exactly to these strings (from `CLAUDE_PLAN_LABELS` / `OPENAI_PLAN_LABELS`):
- `pro` / `$20` → `Pro ($20/mo)`
- `max5` / `$100` → `Max x5 ($100/mo)`
- `max20` / `$200` → `Max x20 ($200/mo)`
- `plus` / `$20` → `Plus ($20/mo)`
- `pro` / `$100` → `Pro ($100/mo)`
- `pro200` / `$200` → `Pro ($200/mo)`

---

## Visual Rules — NEVER Violate These

1. **Header always uses `box()`** — `box(`🧠 dual-brain v${version}`, lines)` is the canonical header call. The 🧠 emoji is mandatory. The version is mandatory. Do not print the header as plain text.

2. **Provider status always shows emoji** — ✅ logged in, ⚠️ not logged in, 🔴 expired. No exceptions. No plain-text-only status lines.

3. **Provider status always shows plan name** — `Max x5 ($100/mo)`, not just `max5` or `$100`. Use the label maps.

4. **Sessions section always uses `separator('Recent Sessions')`** — the exact string, before the session list.

5. **Menu always uses `menu()` from `src/tui.mjs`** — with the `section` property for groupings. Do not hand-roll the menu rendering.

6. **Pinned sessions show 📌** — three spaces when unpinned, for column alignment.

7. **Active sessions show ●** — appended to the session name with a preceding space.

8. **Category tags show in [brackets]** — two spaces before the opening bracket.

9. **`box()` width defaults to 56 inner characters** — do not change the default width in `src/tui.mjs` without auditing every call site.

10. **ASCII fallback is automatic** — `src/tui.mjs` checks `DUALBRAIN_ASCII=1` and `process.stdout.isTTY`. Do not hard-code box characters anywhere outside `tui.mjs`.

---

## Architecture Rules

### Four-module pipeline — never bypass

```
profile.mjs  →  detect.mjs  →  decide.mjs  →  dispatch.mjs
```

- `profile.mjs`: loads provider config, subscription plan, preferences, auth state
- `detect.mjs`: classifies intent, risk, complexity, tier from the prompt and file list
- `decide.mjs`: routes to provider/model/tier; handles dual-brain threshold and budget pressure
- `dispatch.mjs`: executes via Claude subagent, Codex CLI, or dual-brain flow

**There is no shortcut into dispatch.** Every task goes through detect → decide first.

### HEAD never implements

The HEAD session (the main Claude Code conversation) is the orchestrator. It:
- Defines acceptance criteria
- Dispatches work to agents
- Reviews results

It does NOT edit production files directly. This is enforced by `head-guard.mjs` (PreToolUse hook on Edit, Write, Bash) and `enforce-tier.mjs` (PreToolUse hook on Agent).

### Subscription-based auth, not API keys

Authentication is subscription login via `claude login` and `codex login`. There are no API key fields, no `.env` secrets for provider credentials. The auth model is:
- `detectAuth()` checks for CLI credential files
- `detectPlans()` reads plan tier from CLI config files
- Expiry is tracked in `.dualbrain/profile.json` and auto-refresh is triggered in `mainScreen`

### Session metadata overlay

Sessions come from replit-tools (`importReplitSessions()`). dual-brain adds metadata (pin state, category, custom name) via `enrichSessions()`, stored in `.dualbrain/sessions.json`. Do not attempt to write back to replit-tools session storage.

### Screen state machine

Screens are pure async functions returning `{ next: 'screen-name', ...ctx }`. The router is `runScreens()` in `bin/dual-brain.mjs`. Adding a screen means:
1. Write the function
2. Register it in `SCREENS`
3. Add a navigation key in the appropriate existing screen

Do not add top-level entry points that bypass `runScreens()`.

---

## What NOT to Change Without Discussion

- **Main screen layout and rendering style** — any change to `mainScreen()` that alters the box header, the session list format, or the menu sections requires review.
- **The box/emoji/separator visual language** — `src/tui.mjs` primitives are the contract. Do not add new rendering approaches alongside them.
- **The session-first navigation model** — sessions appear before menus. Do not reorder this.
- **The subscription-based auth model** — no API key flows, no `.env` credential injection.
- **The head-guard enforcement model** — hooks in `.claude/settings.json` are installed by `dual-brain install`. Do not remove or weaken them.
- **The four-module pipeline order** — detect before decide before dispatch, always.
- **Plan label strings** — `CLAUDE_PLAN_LABELS` and `OPENAI_PLAN_LABELS` in `bin/dual-brain.mjs` are the canonical source. Keep them in sync with what `detectPlans()` returns.

---

## Agent Instructions

If you are an AI agent editing this codebase, follow these rules without exception:

1. **Read this file before making any UI change.** Not skimming — reading.

2. **Preserve the visual style.** Every status display uses `box()`. Every section break uses `separator()`. Every menu uses `menu()`. If you are adding output, use these primitives.

3. **Add to existing screens, do not replace them.** If you need a new feature visible from the main screen, add a menu key and a new screen function. Do not rewrite `mainScreen`.

4. **Verify the main screen still renders after your changes.** Run `node bin/dual-brain.mjs` in a TTY (or with a piped mock) and confirm the header box, session list, and menu are all present.

5. **Do not bypass the pipeline.** If you are dispatching a task, it goes through `detectTask()` → `decideRoute()` → `dispatch()`. Do not call `dispatch()` directly with a hand-crafted decision object unless you are writing a test.

6. **Do not add API key flows.** Authentication is `claude login` and `codex login`. If a feature requires a credential that does not fit this model, raise it for discussion before implementing.

7. **Minimal change wins.** If you were asked to change one thing, change one thing. Do not refactor adjacent functions you were not asked to touch.

8. **Run the quality gate before finishing.** `node .claude/hooks/session-report.mjs` then `node .claude/hooks/quality-gate.mjs`. A `pass` status is required before ending a session with code changes.

---

## File Map (key files for UI work)

| File | Purpose |
|------|---------|
| `bin/dual-brain.mjs` | All screen functions and the screen state machine |
| `src/tui.mjs` | `box()`, `bar()`, `badge()`, `separator()`, `menu()` primitives |
| `src/profile.mjs` | Provider config, auth detection, plan detection, preferences |
| `src/detect.mjs` | Task classification (intent, risk, complexity, tier) |
| `src/decide.mjs` | Routing decision and model selection |
| `src/dispatch.mjs` | Execution via Claude/Codex CLI or dual-brain flow |
| `src/session.mjs` | Session import, enrich, pin, rename, categorize |
| `src/health.mjs` | Provider health tracking (hot/healthy/degraded) |
| `.claude/hooks/head-guard.mjs` | Blocks write-intent in HEAD session |
| `.claude/hooks/enforce-tier.mjs` | Validates agent tier before dispatch |
| `.dualbrain/sessions.json` | Metadata overlay for replit-tools sessions (gitignored) |
| `.dualbrain/profile.json` | Active profile and subscription config (gitignored) |
