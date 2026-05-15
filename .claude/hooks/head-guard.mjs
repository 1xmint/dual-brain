#!/usr/bin/env node
// head-guard.mjs — Strict default-deny enforcement for HEAD session.
// Reads Claude Code hook stdin JSON protocol (PreToolUse event).
//
// Protocol (Claude Code sends this on stdin):
//   { session_id, hook_event_name, tool_name, tool_input,
//     tool_use_id, agent_id?, agent_type? }
//
// Exit behaviour:
//   exit 0                     → allow
//   exit 2 + stdout JSON       → block (permissionDecision: "deny")
//
// Key insight: `agent_id` is present when the hook fires inside a spawned
// subagent (work agent). If absent we are in the HEAD session.
//
// HEAD is default-deny. Allowed:
//   - Agent tool (dispatching is HEAD's primary job)
//   - Bash: only hook scripts, dual-brain CLI, budget-balancer, metadata git, release npm
//   - Everything else: DENY

import { readFileSync } from 'fs';

// Break-glass: if set, allow everything with a warning
const BREAK_GLASS = process.env.DUAL_BRAIN_BREAK_GLASS === '1';

// Bash commands that HEAD is permitted to run (checked in order, first match wins)
const BASH_ALLOWLIST = [
  // Hook scripts
  /^node\s+\.claude\/hooks\//,
  // dual-brain CLI
  /^dual-brain(\s|$)/,
  // git metadata only (not git diff with full content)
  /^git\s+status(\s|$)/,
  /^git\s+log\s+--oneline(\s|$)/,
  // npm release ops
  /^npm\s+(version|publish)(\s|$)/,
];

// Read stdin JSON payload
let input;
try {
  const raw = readFileSync('/dev/stdin', 'utf8');
  input = JSON.parse(raw);
} catch {
  // If we can't read / parse input, fail open — don't break sessions
  // that aren't using dual-brain at all.
  process.exit(0);
}

const toolName = input.tool_name || '';

// If this hook is firing inside a subagent, ALLOW — subagents are work agents
// and are permitted to edit/write/bash.
if (input.agent_id) {
  process.exit(0);
}

// Break-glass: allow everything but warn loudly to stderr
if (BREAK_GLASS) {
  process.stderr.write(
    `[dual-brain] ⚠️  BREAK-GLASS MODE ACTIVE — HEAD restrictions bypassed for tool: ${toolName}\n`
  );
  process.exit(0);
}

// ── Agent tool: always allow (dispatching is HEAD's primary job) ────────────
if (toolName === 'Agent') {
  process.exit(0);
}

// ── Bash tool: allowlist-only ───────────────────────────────────────────────
if (toolName === 'Bash') {
  const cmd = (input.tool_input?.command || '').trim();
  const allowed = BASH_ALLOWLIST.some((pattern) => pattern.test(cmd));
  if (allowed) {
    process.exit(0);
  }
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        '[dual-brain] HEAD cannot run arbitrary commands. Dispatch a work agent instead.',
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// ── Read tool: deny ─────────────────────────────────────────────────────────
if (toolName === 'Read') {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        '[dual-brain] HEAD cannot read files directly. Dispatch an Explore agent for investigation.',
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// ── Edit / Write / NotebookEdit: deny (existing behaviour preserved) ────────
if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `[dual-brain] HEAD cannot use ${toolName} directly. Dispatch via: dual-brain go "task description"`,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// ── MCP filesystem write tools: deny (existing behaviour preserved) ─────────
if (toolName.startsWith('mcp__') && /write|create|delete|remove|move|rename/i.test(toolName)) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        '[dual-brain] HEAD cannot use MCP write tools. Dispatch via: dual-brain go "task description"',
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// Allow everything else (e.g. ToolSearch, WebSearch, other MCP read tools)
process.exit(0);
