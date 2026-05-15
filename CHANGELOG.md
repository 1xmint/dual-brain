# Changelog

## 7.1.8
- Restored boxed UX with emoji status indicators on main screen
- Provider login status always visible

## 7.1.7
- Conversation management: rename, pin, categorize, smart auto-labels
- Session metadata overlay in .dualbrain/sessions.json
- Session manager screen with full management options
- Team auth UX: expiry presets, auto-refresh, label display
- Subscription-first auth, shell integration, data-tools session import

## 7.1.6
- Session-first dashboard (replaced 5-screen admin panel)
- Single main screen with recent sessions
- Provider-invisible routing via [n] New session

## 7.1.5
- Head-guard rewrite: Bash allowlist (read-only allowed), fail-closed on errors
- Native-agent dispatch fixed (returns completed status)
- Auto-install hooks during onboarding
- Cost-saver respects tier fitness
- Deleted 4,181 lines of dead code (7 orphan hooks)
- Fixed all doc drift (CLAUDE.md v6→v7, paths, commands)
- Added missing model capabilities

## 7.1.4
- Audit remediation: provider state consistency, security hardening, package cleanup

## 7.1.3
- Fix session import path, remove useless Go menu option

## 7.1.2
- UX round 2: 1-click auto-setup, session import, actionable diagnostics

## 7.1.1
- Audit fixes: stale refs, missing exports, version consistency

## 7.1.0
- TUI overhaul: screen state machine, rich dashboard, multi-key auth
