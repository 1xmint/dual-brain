#!/usr/bin/env node
// deliberation-gate.mjs — Enforces that HEAD deliberates before dispatching.
// PreToolUse hook for Agent dispatches. Validates deliberation artifact freshness
// and alignment before allowing work dispatches.
//
// Protocol (Claude Code sends this on stdin):
//   { session_id, hook_event_name, tool_name, tool_input,
//     tool_use_id, agent_id?, agent_type? }
//
// Exit behaviour:
//   exit 0                     → allow
//   exit 2 + stdout JSON       → block (permissionDecision: "deny")
//   stdout JSON { systemMessage } → inject context and allow

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Paths ────────────────────────────────────────────────────────────────────
const WORKSPACE = resolve(new URL(import.meta.url).pathname, '..', '..', '..');
const DUALBRAIN = join(WORKSPACE, '.dualbrain');
const DELIBERATION_FILE = join(DUALBRAIN, 'deliberation.json');
const TRACKING_FILE = join(DUALBRAIN, 'deliberation-tracking.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function allowWithMessage(msg) {
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
  process.exit(0);
}

function allow() {
  process.exit(0);
}

// ── Parse stdin ──────────────────────────────────────────────────────────────

let input;
let stdinRaw;
try {
  stdinRaw = readFileSync('/dev/stdin', 'utf8');
} catch {
  // Can't read stdin — not a hook invocation. Fail open.
  process.exit(0);
}

try {
  input = JSON.parse(stdinRaw);
} catch {
  // Malformed JSON — fail open.
  process.stderr.write('[dual-brain] deliberation-gate: malformed hook protocol — failing open\n');
  process.exit(0);
}

if (!input || typeof input !== 'object') {
  process.exit(0);
}

// ── Subagent bypass ──────────────────────────────────────────────────────────
// Only gate HEAD. Subagents (work agents) pass through immediately.
if (input.agent_id) {
  process.exit(0);
}

// Only fire on Agent dispatches
if (input.tool_name !== 'Agent') {
  process.exit(0);
}

// ── Read deliberation artifact ───────────────────────────────────────────────

let deliberation = null;

if (!existsSync(DELIBERATION_FILE)) {
  // Fail-OPEN: bootstrap case — no deliberation file exists yet.
  // Log a warning but allow the dispatch.
  process.stderr.write('[dual-brain] deliberation-gate: no deliberation artifact found — failing open (bootstrap)\n');
  allow();
}

try {
  deliberation = JSON.parse(readFileSync(DELIBERATION_FILE, 'utf8'));
} catch (err) {
  // File exists but can't parse — fail open with warning
  process.stderr.write(`[dual-brain] deliberation-gate: deliberation artifact unreadable (${err?.message?.slice(0, 80)}) — failing open\n`);
  allow();
}

// ── Validate freshness ───────────────────────────────────────────────────────

const MAX_AGE_MS = 60_000; // 60 seconds
const timestamp = deliberation.timestamp || deliberation.createdAt || 0;
const age = Date.now() - timestamp;

if (age > MAX_AGE_MS) {
  // Stale deliberation — fail CLOSED. HEAD contradicting itself by dispatching
  // without fresh deliberation.
  deny('[dual-brain] Deliberation artifact is stale (>60s). HEAD must re-deliberate before dispatching.');
}

// ── Validate action type alignment ──────────────────────────────────────────

const actionType = deliberation.result?.action?.type || deliberation.action?.type || null;
const toolInput = input.tool_input || {};
const rawPrompt = `${toolInput.description || ''} ${toolInput.prompt || ''}`.toLowerCase();

// Detect if the dispatch is execute-tier work
const EXECUTE_WORDS = /\b(edit|write|fix|implement|modify|refactor|delete|commit|test|build|run|add|update|create|install|deploy)\b/i;
const isExecuteDispatch = EXECUTE_WORDS.test(rawPrompt);

// If deliberation says clarify or plan but HEAD is dispatching execute work → block
if ((actionType === 'clarify' || actionType === 'plan') && isExecuteDispatch) {
  deny(`[dual-brain] Deliberation action is "${actionType}" but dispatch is execute-tier. HEAD must align before dispatching.`);
}

// ── Validate shouldAskUser ───────────────────────────────────────────────────

const shouldAskUser = deliberation.shouldAskUser
  || deliberation.result?.shouldAskUser
  || false;

if (shouldAskUser) {
  deny('[dual-brain] HEAD deliberation requires user input first');
}

// ── Validate confidence ──────────────────────────────────────────────────────

const confidenceLevel = deliberation.confidence?.level
  || deliberation.result?.confidence?.level
  || null;

if (confidenceLevel === 'insufficient') {
  deny('[dual-brain] Confidence too low to dispatch — clarify first');
}

// ── Parallel-wave tracking ───────────────────────────────────────────────────

const dispatchPlan = deliberation.dispatchPlan || deliberation.result?.dispatchPlan || null;
let parallelReminder = null;

if (dispatchPlan && dispatchPlan.strategy === 'parallel-wave') {
  // Track dispatch count
  let tracking = { dispatches: 0, planId: dispatchPlan.id || 'unknown', lastDispatch: 0, prevDispatch: 0 };
  try {
    if (existsSync(TRACKING_FILE)) {
      tracking = JSON.parse(readFileSync(TRACKING_FILE, 'utf8'));
      // Reset if plan ID changed
      if (tracking.planId !== (dispatchPlan.id || 'unknown')) {
        tracking = { dispatches: 0, planId: dispatchPlan.id || 'unknown', lastDispatch: 0, prevDispatch: 0 };
      }
    }
  } catch { /* fresh tracking */ }

  // Store previous dispatch time before updating
  tracking.prevDispatch = tracking.lastDispatch;
  tracking.dispatches += 1;
  tracking.lastDispatch = Date.now();

  // If HEAD is dispatching sequentially (>2s gap) when plan says parallel
  const expectedParallel = dispatchPlan.expectedParallel || dispatchPlan.waveSize || 0;
  if (expectedParallel > 1 && tracking.dispatches > 1 && tracking.prevDispatch > 0) {
    const gap = tracking.lastDispatch - tracking.prevDispatch;
    if (gap > 2000) {
      parallelReminder = `Deliberation plan expects parallel dispatch (wave of ${expectedParallel}) but HEAD is dispatching sequentially. Consider batching.`;
    }
  }

  try {
    mkdirSync(DUALBRAIN, { recursive: true });
    writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2));
  } catch { /* non-fatal */ }
}

// ── Build system message with deliberation summary ───────────────────────────

const parts = [];

// Obligations summary
const obligations = deliberation.obligations
  || deliberation.result?.obligations
  || [];
if (obligations.length > 0) {
  const criticals = obligations.filter(o => o.priority === 'critical');
  if (criticals.length > 0) {
    parts.push(`Critical obligations: ${criticals.map(o => o.type || o.description).join(', ')}`);
  }
}

// Surface noticings
const noticings = deliberation.surfaceNoticings
  || deliberation.result?.surfaceNoticings
  || [];
if (noticings.length > 0) {
  const observations = noticings.map(n => n.observation).filter(Boolean).slice(0, 3);
  if (observations.length > 0) {
    parts.push(`Noticings: ${observations.join('; ')}`);
  }
}

// Confidence gaps
const gaps = deliberation.confidence?.gaps
  || deliberation.result?.confidence?.gaps
  || [];
if (gaps.length > 0) {
  parts.push(`Confidence gaps: ${gaps.slice(0, 3).join('; ')}`);
}

// Parallel reminder
if (parallelReminder) {
  parts.push(parallelReminder);
}

// ── Output ───────────────────────────────────────────────────────────────────

if (parts.length > 0) {
  allowWithMessage(`[Deliberation] ${parts.join(' | ')}`);
} else {
  allow();
}
