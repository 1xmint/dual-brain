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

import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

// ── Paths ────────────────────────────────────────────────────────────────────
const WORKSPACE = resolve(new URL(import.meta.url).pathname, '..', '..', '..');
const DUALBRAIN  = join(WORKSPACE, '.dualbrain');
const BUDGET_FILE = join(DUALBRAIN, 'head-context-budget.json');
const AUDIT_DIR   = join(DUALBRAIN, 'audit');
const AUDIT_FILE  = join(AUDIT_DIR, 'head-audit.jsonl');

// ── Context budget helpers ───────────────────────────────────────────────────
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

function loadBudget() {
  try {
    if (existsSync(BUDGET_FILE)) {
      const data = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
      // Reset if the last activity was more than 30 min ago
      if (Date.now() - (data.sessionStart || 0) > SESSION_GAP_MS) {
        return freshBudget();
      }
      return data;
    }
  } catch { /* fall through */ }
  return freshBudget();
}

function freshBudget() {
  return { sessionStart: Date.now(), bytesReceived: 0, toolCalls: 0, warnings: 0 };
}

function saveBudget(budget) {
  try {
    mkdirSync(DUALBRAIN, { recursive: true });
    writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2));
  } catch { /* non-fatal */ }
}

// ── Audit log helper ─────────────────────────────────────────────────────────
function writeAuditEntry(entry) {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
  } catch { /* non-fatal */ }
}

// ── Essential-call classifier (may bypass 100 KB hard limit) ────────────────
// Agent dispatches and hook-script Bash calls are essential; everything else is not.
function isEssentialCall(toolName, toolInput) {
  if (toolName === 'Agent') return true;
  if (toolName === 'Bash') {
    const cmd = (toolInput?.command || '').trim();
    return /^node\s+\.claude\/hooks\//.test(cmd) || /^dual-brain(\s|$)/.test(cmd);
  }
  return false;
}

// ── Break-glass token check ──────────────────────────────────────────────────
// File-based time-limited break-glass: .dualbrain/break-glass.json
// { createdAt: <ms>, ttlMinutes: 5, reason: "..." }
// If file is present and not expired → allow with audit log.
// If expired → delete file and deny normally.
// If missing → deny normally.

const BREAK_GLASS_FILE = join(DUALBRAIN, 'break-glass.json');

function checkBreakGlass() {
  if (!existsSync(BREAK_GLASS_FILE)) return false;
  let token;
  try {
    token = JSON.parse(readFileSync(BREAK_GLASS_FILE, 'utf8'));
  } catch {
    return false;
  }
  const ttlMs = (token.ttlMinutes ?? 5) * 60 * 1000;
  const age   = Date.now() - (token.createdAt ?? 0);
  if (age > ttlMs) {
    // Expired — delete and deny
    try { unlinkSync(BREAK_GLASS_FILE); } catch { /* ignore */ }
    process.stderr.write('[dual-brain] Break-glass token expired and removed.\n');
    return false;
  }
  return token;
}

const breakGlassToken = checkBreakGlass();

// ── Parse stdin FIRST — subagent bypass must happen before any blocking logic ─

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

// ── Subagent bypass — MUST be before manifest check and all other guards ──────
// If this hook is firing inside a subagent, ALLOW — subagents are work agents
// and are permitted to edit/write/bash. A missing manifest must never block a
// work agent (bootstrap deadlock).
if (input.agent_id) {
  process.exit(0);
}

// ── Manifest health check (once per session, PID-based) ─────────────────────

function deny(reason) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

function hashString(s) {
  return createHash('sha256').update(s).digest('hex');
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryAutoCreateManifest(workspace, dualbrain) {
  // Attempt to auto-create the manifest from the current settings.json so that
  // a missing manifest never blocks HEAD (non-strict mode).
  try {
    const settingsPath = join(workspace, '.claude', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const hooks = settings.hooks || {};

    const preHooks = (hooks.PreToolUse || []).flatMap(entry =>
      (entry.hooks || []).map(h => hashString(h.command || ''))
    );
    const postHooks = (hooks.PostToolUse || []).flatMap(entry =>
      (entry.hooks || []).map(h => hashString(h.command || ''))
    );
    const settingsHash = hashString(JSON.stringify(hooks));

    const manifest = {
      generatedAt: new Date().toISOString(),
      autoCreated: true,
      expectedHooks: { PreToolUse: preHooks, PostToolUse: postHooks },
      settingsHash,
    };

    mkdirSync(dualbrain, { recursive: true });
    writeFileSync(join(dualbrain, 'hook-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    process.stderr.write('[dual-brain] INFO: Hook manifest auto-created from current settings.json.\n');
    return manifest;
  } catch {
    return null;
  }
}

function runManifestCheck() {
  // Resolve workspace from this hook's location (.claude/hooks/head-guard.mjs → project root)
  const workspace = resolve(new URL(import.meta.url).pathname, '..', '..', '..');
  const dualbrain = join(workspace, '.dualbrain');
  const markerPrefix = '.manifest-checked-';
  const markerPath = join(dualbrain, `${markerPrefix}${process.pid}`);

  // If marker for this PID already exists, skip check (already passed this session)
  if (existsSync(markerPath)) return;

  // Clean up stale PID markers from dead processes
  try {
    for (const name of readdirSync(dualbrain)) {
      if (!name.startsWith(markerPrefix)) continue;
      const stalePid = parseInt(name.slice(markerPrefix.length), 10);
      if (!Number.isNaN(stalePid) && !pidIsAlive(stalePid)) {
        try { unlinkSync(join(dualbrain, name)); } catch { /* ignore */ }
      }
    }
  } catch { /* .dualbrain may not exist yet */ }

  // Determine whether strict-manifest mode is opted in
  const strictMode = existsSync(join(dualbrain, 'strict-manifest'));

  // Read manifest — attempt auto-creation if missing
  const manifestPath = join(dualbrain, 'hook-manifest.json');
  let manifest;
  if (!existsSync(manifestPath)) {
    process.stderr.write('[dual-brain] WARNING: Hook manifest missing — attempting auto-creation.\n');
    manifest = tryAutoCreateManifest(workspace, dualbrain);
    if (!manifest) {
      process.stderr.write('[dual-brain] WARNING: Auto-creation failed. Run node install.mjs to restore enforcement integrity.\n');
      if (strictMode) {
        deny('[dual-brain] Hook manifest missing. Run node install.mjs to restore enforcement integrity.');
      }
      // Non-strict: warn but allow
      return;
    }
  } else {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      process.stderr.write('[dual-brain] WARNING: Hook manifest unreadable. Run node install.mjs to restore enforcement integrity.\n');
      if (strictMode) {
        deny('[dual-brain] Hook manifest unreadable. Run node install.mjs to restore enforcement integrity.');
      }
      // Non-strict: warn but allow
      return;
    }
  }

  // Read current settings.json hooks section
  const settingsPath = join(workspace, '.claude', 'settings.json');
  let currentHooks;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    currentHooks = settings.hooks || {};
  } catch {
    process.stderr.write('[dual-brain] WARNING: Cannot read settings.json for manifest verification. Run node install.mjs to restore.\n');
    if (strictMode) {
      deny('[dual-brain] Hook configuration cannot be verified. Run node install.mjs to restore.');
    }
    // Non-strict: warn but allow
    return;
  }

  // Compute current settings hash (same algorithm as install.mjs)
  const currentSettingsHash = hashString(JSON.stringify(currentHooks));

  if (currentSettingsHash !== manifest.settingsHash) {
    process.stderr.write('[dual-brain] WARNING: Hook configuration has drifted from manifest. Run node install.mjs to restore.\n');
    if (strictMode) {
      deny('[dual-brain] Hook configuration has drifted from manifest. Run node install.mjs to restore.');
    }
    // Non-strict: warn but allow
    return;
  }

  // Hashes match — write PID marker so we skip on subsequent calls this session
  try {
    mkdirSync(dualbrain, { recursive: true });
    writeFileSync(markerPath, String(Date.now()));
  } catch { /* non-fatal — marker is a performance optimisation */ }
}

// Run the manifest check after subagent bypass but before enforcement logic.
// Skipped when break-glass is active (it bypasses everything anyway).
if (!breakGlassToken) {
  runManifestCheck();
}

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

// Break-glass: allow everything, log to audit trail
if (breakGlassToken) {
  const minsLeft = Math.ceil(
    ((breakGlassToken.ttlMinutes ?? 5) * 60 * 1000 - (Date.now() - breakGlassToken.createdAt)) / 60000
  );
  process.stderr.write(
    `[dual-brain] ⚠️  BREAK-GLASS ACTIVE (${minsLeft}m left, reason: ${breakGlassToken.reason ?? 'none'}) — bypassing HEAD guard for: ${toolName}\n`
  );
  writeAuditEntry({
    ts: new Date().toISOString(),
    event: 'break-glass-bypass',
    tool: toolName,
    reason: breakGlassToken.reason ?? 'none',
    minsLeft,
    sessionId: input.session_id ?? null,
  });
  process.exit(0);
}

// ── PostToolUse: accumulate context bytes, write audit entry ─────────────────
// NOTE: hookEvent is read here; input and toolName are already set above.
if ((input.hook_event_name || 'PreToolUse') === 'PostToolUse') {
  if (!input.agent_id) {
    const outputStr = typeof input.tool_output === 'string'
      ? input.tool_output
      : JSON.stringify(input.tool_output ?? '');
    const bytes = Buffer.byteLength(outputStr, 'utf8');
    const budget = loadBudget();
    budget.bytesReceived += bytes;
    budget.toolCalls     += 1;
    saveBudget(budget);
    writeAuditEntry({
      ts:            new Date().toISOString(),
      tool:          toolName,
      event:         'PostToolUse',
      allowed:       true,
      reason:        'post-tool accumulation',
      bytesContext:  budget.bytesReceived,
      bytesThisCall: bytes,
    });
  }
  process.exit(0);
}

// ── Shared audit helpers for PreToolUse ──────────────────────────────────────
function auditDeny(reason) {
  const budget = loadBudget();
  writeAuditEntry({
    ts:           new Date().toISOString(),
    tool:         toolName,
    event:        'PreToolUse',
    allowed:      false,
    reason,
    bytesContext: budget.bytesReceived,
  });
  const out = {
    hookSpecificOutput: {
      hookEventName:            'PreToolUse',
      permissionDecision:       'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(2);
}

function auditAllow(reason) {
  const budget = loadBudget();
  writeAuditEntry({
    ts:           new Date().toISOString(),
    tool:         toolName,
    event:        'PreToolUse',
    allowed:      true,
    reason,
    bytesContext: budget.bytesReceived,
  });
}

// ── Budget check (called after allowlist grants access) ───────────────────────
function checkBudgetOrDeny() {
  const budget = loadBudget();
  if (budget.bytesReceived >= 100 * 1024) {
    if (!isEssentialCall(toolName, input.tool_input)) {
      budget.warnings += 1;
      saveBudget(budget);
      auditDeny(
        `[dual-brain] Context budget exceeded 100 KB (${Math.round(budget.bytesReceived / 1024)} KB). Non-essential HEAD calls blocked. Dispatch a work agent.`
      );
    }
    // Essential calls pass through
  } else if (budget.bytesReceived >= 50 * 1024) {
    budget.warnings += 1;
    saveBudget(budget);
    process.stderr.write(
      `[dual-brain] WARNING: HEAD context budget at ${Math.round(budget.bytesReceived / 1024)} KB (50 KB threshold). Consider dispatching work agents to conserve context.\n`
    );
  }
}

// ── Decision artifact check ───────────────────────────────────────────────────
// Advisory only — warns when a sensitive area is touched without a valid decision artifact.
// Never blocks. Silently skips if .dualbrain/decisions/ doesn't exist.

const SENSITIVE_AREAS = [
  {
    patterns: [/\brouting\b/, /\bdecide\b/, /\bdispatch\b/],
    artifact: 'routing-decisions',
    hint: 'Run dual-brain think before implementing changes to routing logic',
  },
  {
    patterns: [/\bdetect\b/, /\bclassif/],
    artifact: 'task-detection',
    hint: 'Run dual-brain think before implementing changes to detection/classification logic',
  },
  {
    patterns: [/\bprofile\b/, /\bprovider\b/, /\bcapabilit/],
    artifact: 'provider-detection',
    hint: 'Run dual-brain think before implementing changes to provider/profile logic',
  },
  {
    patterns: [/\bonboard\b/, /\bwizard\b/, /\bsetup\b/],
    artifact: 'onboarding-flow',
    hint: 'Run dual-brain think before implementing changes to onboarding/setup flow',
  },
  {
    patterns: [/\bbudget\b/, /\bsubscription\b/, /\bquota\b/, /\busage\b/],
    artifact: 'budget-system',
    hint: 'Run dual-brain think before implementing changes to budget/subscription logic',
  },
];

function checkDecisionArtifact(taskDescription, filePaths, cwd) {
  // Skip silently if decisions directory doesn't exist
  const decisionsDir = join(cwd || WORKSPACE, '.dualbrain', 'decisions');
  if (!existsSync(decisionsDir)) return null;

  const haystack = [taskDescription, ...(filePaths || [])].join(' ').toLowerCase();

  for (const area of SENSITIVE_AREAS) {
    const matched = area.patterns.some((re) => re.test(haystack));
    if (!matched) continue;

    const artifactPath = join(decisionsDir, `${area.artifact}.json`);
    if (!existsSync(artifactPath)) {
      return { needed: true, area: area.artifact, status: 'missing', hint: area.hint };
    }

    let artifact;
    try {
      artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
    } catch {
      return { needed: true, area: area.artifact, status: 'missing', hint: area.hint };
    }

    if (artifact.expires_at && Date.now() > new Date(artifact.expires_at).getTime()) {
      return { needed: true, area: area.artifact, status: 'expired', hint: area.hint };
    }

    return { needed: true, area: area.artifact, status: 'valid', hint: area.hint };
  }

  return null; // no sensitive area matched
}

// ── Agent tool: always allow (dispatching is HEAD's primary job) ─────────────
if (toolName === 'Agent') {
  checkBudgetOrDeny();

  // Decision artifact advisory check
  const agentInput = input.tool_input || {};
  const taskDesc   = agentInput.prompt || agentInput.task || agentInput.description || '';
  const filePaths  = Array.isArray(agentInput.files) ? agentInput.files : [];
  const artifactResult = checkDecisionArtifact(taskDesc, filePaths, WORKSPACE);
  if (artifactResult && artifactResult.needed && artifactResult.status !== 'valid') {
    process.stderr.write(
      `[dual-brain] ⚠ doctor: sensitive area "${artifactResult.area}" — no decision artifact ${artifactResult.status === 'expired' ? '(expired)' : 'found'}\n` +
      `  ${artifactResult.hint}\n`
    );
  }

  auditAllow('agent-dispatch');
  process.exit(0);
}

// ── Bash tool: allowlist-only ─────────────────────────────────────────────────
if (toolName === 'Bash') {
  const cmd = (input.tool_input?.command || '').trim();
  const allowed = BASH_ALLOWLIST.some((pattern) => pattern.test(cmd));
  if (allowed) {
    checkBudgetOrDeny();
    auditAllow('bash-allowlist');
    process.exit(0);
  }
  auditDeny('[dual-brain] HEAD cannot run arbitrary commands. Dispatch a work agent instead.');
}

// ── Read tool: deny ───────────────────────────────────────────────────────────
if (toolName === 'Read') {
  auditDeny('[dual-brain] HEAD cannot read files directly. Dispatch an Explore agent for investigation.');
}

// ── Edit / Write / NotebookEdit: deny (existing behaviour preserved) ──────────
if (['Edit', 'Write', 'NotebookEdit'].includes(toolName)) {
  auditDeny(`[dual-brain] HEAD cannot use ${toolName} directly. Dispatch via: dual-brain go "task description"`);
}

// ── MCP filesystem write tools: deny (existing behaviour preserved) ───────────
if (toolName.startsWith('mcp__') && /write|create|delete|remove|move|rename/i.test(toolName)) {
  auditDeny('[dual-brain] HEAD cannot use MCP write tools. Dispatch via: dual-brain go "task description"');
}

// ── Allow everything else (ToolSearch, WebSearch, MCP read tools) ─────────────
checkBudgetOrDeny();
auditAllow('default-allow');
process.exit(0);
