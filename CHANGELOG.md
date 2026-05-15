# Changelog

## 7.1.15
- Timestamp fix for session import (stale dates no longer overwrite correct ones)
- isRealPrompt filter to exclude system/hook noise from session index
- Head-guard tightened to allowlist-only (fail-closed on unrecognized commands)
- All 40 self-tests passing (node .claude/hooks/test-orchestrator.mjs)

## 7.1.14
- Design-review gate: designImpact detection triggers dual-brain review for visual changes
- Background agent blocking to prevent runaway parallel dispatches
- VISION.md added to document long-term architecture intent

## 7.1.13
- HEAD auto-search: cross-session context lookup triggered when user references past work
- MCP tools: dual_brain_search and dual_brain_session_context available to all agents
- CLAUDE.md updated with cross-session context protocol

## 7.1.12
- Session index system: all sessions indexed for fast lookup
- Cross-session search via dual-brain search "keyword"
- Smart resume preview shows prior context before continuing a session
- Usage sparkline in status screen

## 7.1.11
- Deep replit-tools integration: OAuth auto-refresh, session archive mirror sync
- Persistence settings surfaced in onboarding
- Session filter to exclude replit-internal noise from session list

## 7.1.10
- Data-tools visual style matching: rounded boxes, help box, branding, cld/cdx labels
- Full session scan in session manager
- Steve Moraco credited in UI

## 7.1.9
- Subscription-first auth separation: manage subscriptions screen decoupled from chat creation
- Multi-sub team roster: link multiple subscriptions, view all in one screen

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
