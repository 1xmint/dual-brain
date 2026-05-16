#!/usr/bin/env node
/**
 * diagnostic-companion.mjs — PostToolUse hook for the Dual-Brain orchestrator.
 *
 * Observes ALL tool calls (HEAD + subagents) and detects inefficient patterns:
 * - Sequential dispatches that could be parallel
 * - Re-reading files without edits between
 * - Assumption leaps (dispatching work without prior research)
 * - Scope creep beyond declared plan
 * - Ceremony (excessive config reads without dispatching)
 * - Stuck loops (same tool called repeatedly with similar inputs)
 *
 * Output: JSON to stdout. High-severity issues for HEAD get a systemMessage.
 * Subagent observations are logged silently (never interfere with workers).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), '.dualbrain', 'diagnostic');
const STATE_FILE = join(STATE_DIR, 'current.json');

const MAX_TOOL_CALLS = 100;
const MAX_NOTICINGS = 50;
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function freshState() {
  return {
    sessionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    startedAt: Date.now(),
    toolCalls: [],
    noticings: [],
    stats: {
      totalCalls: 0,
      readCount: 0,
      dispatchCount: 0,
      uniqueFiles: [],
    },
  };
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      // Reset if session gap > 30 minutes
      if (Date.now() - (data.lastActivity || data.startedAt || 0) > SESSION_GAP_MS) {
        return freshState();
      }
      return data;
    }
  } catch {}
  return freshState();
}

function saveState(state) {
  state.lastActivity = Date.now();
  // Cap arrays
  if (state.toolCalls.length > MAX_TOOL_CALLS) {
    state.toolCalls = state.toolCalls.slice(-MAX_TOOL_CALLS);
  }
  if (state.noticings.length > MAX_NOTICINGS) {
    state.noticings = state.noticings.slice(-MAX_NOTICINGS);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// Record a tool call
// ---------------------------------------------------------------------------

function recordToolCall(state, toolName, toolInput, agentId) {
  const meta = {};

  // Extract relevant metadata based on tool type
  if (toolName === 'Read' || toolName === 'Edit' || toolName === 'Write') {
    meta.file = toolInput?.file_path || toolInput?.path || null;
  }
  if (toolName === 'Agent') {
    meta.tier = toolInput?.tier || toolInput?.mode || 'unknown';
    meta.prompt = (toolInput?.prompt || toolInput?.message || '').slice(0, 100);
  }
  if (toolName === 'Bash') {
    meta.command = (toolInput?.command || '').slice(0, 100);
  }
  if (toolName === 'Grep' || toolName === 'Glob') {
    meta.pattern = (toolInput?.pattern || toolInput?.query || '').slice(0, 60);
  }

  const entry = {
    ts: Date.now(),
    tool: toolName,
    agentId: agentId || null,
    meta,
  };

  state.toolCalls.push(entry);

  // Update stats
  state.stats.totalCalls++;
  if (toolName === 'Read') state.stats.readCount++;
  if (toolName === 'Agent') state.stats.dispatchCount++;
  if (meta.file && !state.stats.uniqueFiles.includes(meta.file)) {
    state.stats.uniqueFiles.push(meta.file);
  }

  return entry;
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

function detectSequentialDispatch(state) {
  const dispatches = state.toolCalls
    .filter(c => c.tool === 'Agent' && !c.agentId) // HEAD-level dispatches only
    .slice(-5);

  if (dispatches.length < 2) return null;

  // Check if last 2+ dispatches happened within 30s with no dependency signals
  for (let i = dispatches.length - 1; i >= 1; i--) {
    const curr = dispatches[i];
    const prev = dispatches[i - 1];
    if (curr.ts - prev.ts < 30_000) {
      // Check if prompts reference each other (crude dependency check)
      const currPrompt = (curr.meta.prompt || '').toLowerCase();
      const prevPrompt = (prev.meta.prompt || '').toLowerCase();
      // If neither references the other's key terms, likely independent
      const prevWords = prevPrompt.split(/\s+/).filter(w => w.length > 5);
      const hasOverlap = prevWords.some(w => currPrompt.includes(w));
      if (!hasOverlap) {
        return {
          ts: Date.now(),
          type: 'sequential-dispatch',
          severity: 'high',
          observation: 'These dispatches appear independent — consider parallel execution.',
          surfaced: false,
        };
      }
    }
  }
  return null;
}

function detectReReads(state) {
  // Find files read 2+ times without an edit between
  const fileReads = new Map(); // file -> count since last edit

  for (const call of state.toolCalls) {
    const file = call.meta?.file;
    if (!file) continue;

    if (call.tool === 'Edit' || call.tool === 'Write') {
      // Reset count for this file
      fileReads.delete(file);
    } else if (call.tool === 'Read') {
      fileReads.set(file, (fileReads.get(file) || 0) + 1);
    }
  }

  // Find worst offender
  let worst = null;
  let worstCount = 1;
  for (const [file, count] of fileReads) {
    if (count >= 2 && count > worstCount) {
      worst = file;
      worstCount = count;
    }
  }

  if (worst) {
    return {
      ts: Date.now(),
      type: 're-read',
      severity: 'medium',
      observation: `File ${worst} read ${worstCount} times — consider caching the content or dispatching a single agent.`,
      surfaced: false,
    };
  }
  return null;
}

function detectAssumptionLeap(state) {
  // Check if last Agent dispatch was preceded by any Read/search in recent window
  const recentCalls = state.toolCalls.slice(-10);
  const lastDispatch = [...recentCalls].reverse().find(c => c.tool === 'Agent' && !c.agentId);
  if (!lastDispatch) return null;

  // Check if dispatch tier is execute/edit
  const tier = (lastDispatch.meta.tier || '').toLowerCase();
  if (!tier.includes('execute') && !tier.includes('edit') && !tier.includes('implement')) return null;

  // Look for reads/searches before this dispatch in recent window
  const dispatchIdx = recentCalls.indexOf(lastDispatch);
  const preceding = recentCalls.slice(Math.max(0, dispatchIdx - 8), dispatchIdx);
  const hasResearch = preceding.some(c =>
    c.tool === 'Read' || c.tool === 'Grep' || c.tool === 'Glob' ||
    (c.tool === 'Agent' && (c.meta.tier || '').toLowerCase().includes('search'))
  );

  if (!hasResearch) {
    return {
      ts: Date.now(),
      type: 'assumption-leap',
      severity: 'high',
      observation: 'Dispatching work without prior research — consider a search agent first.',
      surfaced: false,
    };
  }
  return null;
}

function detectScopeCreep(state) {
  const totalCalls = state.toolCalls.length;
  if (totalCalls < 10) return null;

  const earlyWindow = state.toolCalls.slice(0, Math.ceil(totalCalls * 0.2));
  const earlyFiles = new Set();
  for (const c of earlyWindow) {
    if (c.meta?.file) earlyFiles.add(c.meta.file);
  }

  const declaredScope = Math.max(earlyFiles.size, 1);
  const currentScope = state.stats.uniqueFiles.length;

  if (currentScope >= declaredScope * 2 && currentScope > 4) {
    return {
      ts: Date.now(),
      type: 'scope-creep',
      severity: 'medium',
      observation: `Scope has grown beyond declared plan. Started with ~${declaredScope} files, now touching ${currentScope}.`,
      surfaced: false,
    };
  }
  return null;
}

function detectCeremony(state) {
  // More than 5 Reads of config/settings without a dispatch in between
  const recentCalls = state.toolCalls.slice(-15);
  let readStreak = 0;

  for (let i = recentCalls.length - 1; i >= 0; i--) {
    const call = recentCalls[i];
    if (call.tool === 'Agent') break;
    if (call.tool === 'Read') {
      const file = call.meta?.file || '';
      if (/config|settings|\.json|\.env|\.ya?ml/i.test(file)) {
        readStreak++;
      }
    }
  }

  if (readStreak > 5) {
    return {
      ts: Date.now(),
      type: 'ceremony',
      severity: 'low',
      observation: 'Consider dispatching a research agent instead of manual exploration.',
      surfaced: false,
    };
  }
  return null;
}

function detectStuckLoop(state) {
  const recentCalls = state.toolCalls.slice(-10);
  if (recentCalls.length < 3) return null;

  // Group by tool + simplified input signature
  const signatures = new Map();
  for (const call of recentCalls) {
    let sig = call.tool;
    if (call.meta?.file) sig += ':' + call.meta.file;
    else if (call.meta?.command) sig += ':' + call.meta.command.slice(0, 40);
    else if (call.meta?.pattern) sig += ':' + call.meta.pattern;

    signatures.set(sig, (signatures.get(sig) || 0) + 1);
  }

  for (const [sig, count] of signatures) {
    if (count >= 5) {
      return {
        ts: Date.now(),
        type: 'stuck-loop',
        severity: 'high',
        observation: `Possible stuck loop — try a different approach. (${sig.split(':')[0]} called ${count} times with similar inputs)`,
        surfaced: false,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Run all detectors
// ---------------------------------------------------------------------------

function runDetectors(state) {
  const results = [];
  const detectors = [
    detectSequentialDispatch,
    detectReReads,
    detectAssumptionLeap,
    detectScopeCreep,
    detectCeremony,
    detectStuckLoop,
  ];

  for (const detector of detectors) {
    try {
      const result = detector(state);
      if (result) {
        // Deduplicate: don't re-add if same type was noticed in last 60s
        const recent = state.noticings.filter(
          n => n.type === result.type && Date.now() - n.ts < 60_000
        );
        if (recent.length === 0) {
          results.push(result);
        }
      }
    } catch {}
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API: readDiagnosticNoticings (for head.mjs integration)
// ---------------------------------------------------------------------------

/**
 * Read unsurfaced diagnostic noticings and mark them as surfaced.
 * Called by head.mjs notice() to feed diagnostic observations into deliberation.
 */
export function readDiagnosticNoticings() {
  try {
    if (!existsSync(STATE_FILE)) return [];
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    const unsurfaced = (state.noticings || []).filter(n => !n.surfaced);
    if (unsurfaced.length === 0) return [];

    // Mark as surfaced
    for (const n of state.noticings) {
      if (!n.surfaced) n.surfaced = true;
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    return unsurfaced;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main — read stdin, record, detect, respond
// ---------------------------------------------------------------------------

async function main() {
  let raw = '';
  try {
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 64 * 1024) break;
    }
  } catch {}

  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {}

  const toolName = payload?.tool_name || payload?.toolName || 'unknown';
  const toolInput = payload?.tool_input || payload?.toolInput || {};
  const agentId = payload?.agent_id || payload?.agentId || null;

  // Load state
  const state = loadState();

  // Record the tool call
  recordToolCall(state, toolName, toolInput, agentId);

  // Run pattern detectors
  const newNoticings = runDetectors(state);

  // Add new noticings to state
  for (const n of newNoticings) {
    state.noticings.push(n);
  }

  // Save state
  saveState(state);

  // Determine output
  // For HEAD (no agent_id): high-severity → systemMessage
  // For subagents (agent_id present): only log, never inject systemMessage
  let output = {};

  if (!agentId) {
    const highSeverity = newNoticings.filter(n => n.severity === 'high');
    if (highSeverity.length > 0) {
      const messages = highSeverity.map(n => `[Diagnostic] ${n.observation}`);
      output = { systemMessage: messages.join('\n') };
      // Mark as surfaced
      for (const n of highSeverity) {
        n.surfaced = true;
      }
      saveState(state);
    }
  }

  process.stdout.write(JSON.stringify(output) + '\n');
  process.exit(0);
}

main();
