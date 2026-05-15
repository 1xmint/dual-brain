#!/usr/bin/env node
// head-guard.mjs — Blocks HEAD from using mutation tools.
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

import { readFileSync } from 'fs';

const BLOCKED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash']);

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

// HEAD session: block direct mutation tools
if (BLOCKED_TOOLS.has(toolName)) {
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

// Also block MCP filesystem write tools (any mcp__ tool with write/create/
// delete/remove/move/rename in the name).
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

// Allow everything else (Read, Agent handled by enforce-tier, etc.)
process.exit(0);
