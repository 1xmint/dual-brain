# dual-brain Roadmap

## Shipped (v7.1.8)

- Session-first dashboard (main screen with recent sessions, resume, new)
- Subscription-first auth (no API keys, auto-detect CLI login, plan detection)
- Team auth (labels, expiry presets, auto-refresh on expired subs)
- Conversation management (rename, pin, categorize, smart auto-labels)
- Head-guard enforcement (read-only Bash allowed, write-intent blocked, fail-closed)
- Shell integration (shell-hook.sh, db alias, data-tools coexistence)
- Data-tools session import (importReplitSessions, welcome screen detection)
- Cost-saver tier fitness (won't route haiku to execute-tier tasks)
- MCP server (4 tools over JSON-RPC 2.0)
- Claude Code plugin (skills, agents, hooks)

## Known Issues

- Native-agent dispatch shows routing but doesn't auto-invoke the Agent tool
- Health/token stats always zero in Claude Code environments (native dispatch path doesn't record)
- Usage logs from dual-brain-think.mjs go to hooks/ not .dualbrain/usage/
- Some model names may be fictional (gpt-5.2, gpt-5.4-mini) — need verification against actual OpenAI models

## Next Up

- [ ] End-to-end testing of the actual user flow (npx dual-brain from scratch)
- [ ] Verify all screens render correctly with box/emoji style
- [ ] Shell hook auto-install on Replit (currently manual)
- [ ] Dual-brain review flow testing (round 1 + round 2 with GPT)
- [ ] Token tracking for native-agent dispatches

## Future Ideas

- Cross-provider session linking (Claude session that spawned Codex work)
- Session search/filter
- Cost dashboard (actual spend tracking across providers)
- Auto-mode learning (track which routing decisions led to good outcomes)
