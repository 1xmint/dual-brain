#!/usr/bin/env node
// dispatch.mjs — Dispatch/execution module for dual-brain.
// Takes a routing decision and launches the agent via Claude CLI or Codex CLI.
// CLI: node src/dispatch.mjs --dry-run --provider claude --model sonnet --prompt "fix the bug"
//      node src/dispatch.mjs --detect-runtime
// Exports: dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain,
//          validateDispatch, checkWorktreeClean, getRetryBudget

import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { markHot, markDegraded, markHealthy, recordDispatch } from './health.mjs';
import { redact } from './redact.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = join(__dirname, '..', '.dualbrain', 'usage');
const TIER_TIMEOUT_MS = { search: 60_000, execute: 120_000, think: 180_000 };
const CLAUDE_MODEL_IDS = { opus: 'claude-opus-4-5', sonnet: 'claude-sonnet-4-5', haiku: 'claude-haiku-4-5' };

// ─── Median dispatch time tracker (in-process, for slow-response detection) ──
// Rolling window of recent dispatch durations keyed by "provider:modelClass"
const _durationHistory = new Map();
const DURATION_WINDOW  = 10; // keep last N durations per model class

function recordDuration(provider, model, durationMs) {
  const k = `${provider}:${model}`;
  if (!_durationHistory.has(k)) _durationHistory.set(k, []);
  const arr = _durationHistory.get(k);
  arr.push(durationMs);
  if (arr.length > DURATION_WINDOW) arr.shift();
}

function medianDuration(provider, model) {
  const k = `${provider}:${model}`;
  const arr = _durationHistory.get(k);
  if (!arr || arr.length < 3) return null; // not enough data
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Rate-limit error keywords
const RATE_LIMIT_PATTERNS = /rate.?limit|quota|capacity|too many requests|overloaded|throttl/i;

// ─── Runtime detection (cached) ───────────────────────────────────────────────

let _runtimeCache = null;

async function detectRuntime() {
  if (_runtimeCache) return _runtimeCache;

  const check = (cmd) => new Promise((resolve) => {
    const p = spawn(cmd, ['--version'], { stdio: 'pipe' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, 3000);
  });

  const [claudeAvailable, codexAvailable] = await Promise.all([
    check('claude'),
    check('codex'),
  ]);

  const runtime =
    claudeAvailable && codexAvailable ? 'claude-code'
    : claudeAvailable                 ? 'claude-code'
    : codexAvailable                  ? 'codex-cli'
    : process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY ? 'standalone'
    : 'none';

  _runtimeCache = { claudeAvailable, codexAvailable, runtime };
  return _runtimeCache;
}

// ─── Feature 1: Model validation + graceful fallback ─────────────────────────

/** Valid CLI model flags per provider */
const VALID_MODELS = {
  claude: ['opus', 'sonnet', 'haiku'],
  openai: ['o4-mini', 'o3', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5.2', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5'],
};

/** Safest default model for a given provider + tier */
function _safeModel(provider, tier) {
  if (provider === 'claude') {
    return tier === 'search' ? 'haiku' : 'sonnet';
  }
  return 'o4-mini';
}

/**
 * Validate a routing decision against CLI availability and valid model lists.
 * Returns either a (possibly corrected) decision object, or an error sentinel
 * `{ _error: string }` when no CLI is available at all.
 *
 * @param {object} decision
 * @param {{ claudeAvailable: boolean, codexAvailable: boolean }} rt  Runtime info
 * @returns {object}  Corrected decision or `{ _error: string }`
 */
function validateDispatch(decision, rt) {
  let { provider = 'claude', model, tier = 'execute' } = decision;

  // ── CLI availability ──────────────────────────────────────────────────────
  const claudeOk = rt.claudeAvailable;
  const codexOk  = rt.codexAvailable;

  if (!claudeOk && !codexOk) {
    return { _error: 'No AI CLI available. Install claude or codex CLI.' };
  }

  if (provider === 'claude' && !claudeOk && codexOk) {
    process.stderr.write('[dual-brain] Claude unavailable, falling back to OpenAI (codex)\n');
    provider = 'openai';
  } else if (provider === 'openai' && !codexOk && claudeOk) {
    process.stderr.write('[dual-brain] OpenAI unavailable, falling back to Claude (claude)\n');
    provider = 'claude';
  }

  // ── Model validation ──────────────────────────────────────────────────────
  const validList = VALID_MODELS[provider] ?? [];
  if (model && !validList.includes(model)) {
    const safe = _safeModel(provider, tier);
    process.stderr.write(`[dual-brain] Model "${model}" not valid for ${provider} CLI; defaulting to "${safe}"\n`);
    model = safe;
  }

  return { ...decision, provider, model };
}

// ─── Feature 2: Dirty-worktree guard ─────────────────────────────────────────

/**
 * Simple glob match:
 *  - `dir/*`  → prefix match on `dir/`
 *  - `*.ext`  → suffix match on `.ext`
 *  - otherwise → exact match
 */
function _globMatch(pattern, filePath) {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1); // 'src/auth/'
    return filePath.startsWith(prefix);
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.mjs'
    return filePath.endsWith(suffix);
  }
  return filePath === pattern;
}

/**
 * Check whether dirty worktree files overlap with the agent's ownership globs.
 *
 * @param {string[]} owns  Glob patterns for files the agent will touch
 * @param {string}   cwd   Working directory for git
 * @returns {Promise<{ safe: boolean, conflicts?: string[] }>}
 */
async function checkWorktreeClean(owns, cwd) {
  if (!owns || owns.length === 0) return { safe: true };

  const dirty = await new Promise((resolve) => {
    const proc = spawn('git', ['status', '--porcelain', '-u'], {
      cwd: cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.on('close', () => {
      // Each line: "XY path" — grab the path part (columns 4+, after "XY ")
      const files = out.split('\n')
        .map(l => l.slice(3).trim())
        .filter(Boolean);
      resolve(files);
    });
    proc.on('error', () => resolve([])); // git not available → skip guard
  });

  if (dirty.length === 0) return { safe: true };

  const conflicts = dirty.filter(f =>
    owns.some(pattern => _globMatch(pattern, f))
  );

  if (conflicts.length > 0) return { safe: false, conflicts };
  return { safe: true };
}

// ─── Feature 3: Retry budget ──────────────────────────────────────────────────

/** Per-prompt retry count (keyed by first 16 hex chars of SHA-256 of prompt) */
const _retryCount = new Map();

/** Recent dispatch timestamps for the 5-minute window rate-limit */
const _recentDispatches = [];

const MAX_RETRIES_PER_TASK    = 2;
const MAX_DISPATCHES_PER_5MIN = 5;
const WINDOW_MS = 5 * 60 * 1000;

function _promptKey(prompt) {
  return createHash('sha256').update(String(prompt)).digest('hex').slice(0, 16);
}

/**
 * Check whether this dispatch is within budget.
 * @param {string} prompt
 * @returns {{ allowed: boolean, reason?: string }}
 */
function _checkRetryBudget(prompt) {
  const now = Date.now();

  // Evict dispatch timestamps older than 5 minutes
  while (_recentDispatches.length > 0 && now - _recentDispatches[0] > WINDOW_MS) {
    _recentDispatches.shift();
  }

  if (_recentDispatches.length >= MAX_DISPATCHES_PER_5MIN) {
    return { allowed: false, reason: 'Retry budget exhausted. Wait or adjust task.' };
  }

  const key   = _promptKey(prompt);
  const count = _retryCount.get(key) ?? 0;
  if (count > MAX_RETRIES_PER_TASK) {
    return { allowed: false, reason: 'Retry budget exhausted. Wait or adjust task.' };
  }

  return { allowed: true };
}

function _recordDispatchBudget(prompt) {
  _recentDispatches.push(Date.now());
  const key = _promptKey(prompt);
  _retryCount.set(key, (_retryCount.get(key) ?? 0) + 1);
}

/**
 * Return current retry budget state for status display.
 * @returns {object}
 */
function getRetryBudget() {
  const now = Date.now();
  const active = _recentDispatches.filter(t => now - t <= WINDOW_MS).length;
  return {
    perTaskRetries:   Object.fromEntries(_retryCount),
    recentDispatches: active,
    windowMs:         WINDOW_MS,
    maxPerTask:       MAX_RETRIES_PER_TASK,
    maxPerWindow:     MAX_DISPATCHES_PER_5MIN,
  };
}

// ─── Command builder ──────────────────────────────────────────────────────────

function buildCommand(decision, prompt, files = [], _cwd) {
  const provider = decision?.provider ?? 'claude';
  const modelAlias = decision?.model ?? 'sonnet';
  const effort = decision?.effort ?? null;
  const sandbox = decision?.sandbox ?? 'danger-full-access';

  if (provider === 'claude') {
    const modelId = CLAUDE_MODEL_IDS[modelAlias] ?? modelAlias;
    const cmd = ['claude', '--model', modelId, '--print', '--output-format', 'json', '-p', prompt];
    if (effort) cmd.push('--effort', effort);
    return cmd;
  }

  // openai / codex
  const cmd = ['codex', 'exec', '-m', modelAlias, '-s', sandbox, prompt];
  if (effort) cmd.push('-c', `reasoning.effort="${effort}"`);
  return cmd;
}

// ─── Usage recorder ───────────────────────────────────────────────────────────
function recordUsage(entry) {
  try {
    mkdirSync(USAGE_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    appendFileSync(
      join(USAGE_DIR, `${date}.jsonl`),
      JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n',
    );
  } catch {}
}

// ─── Result compressor ────────────────────────────────────────────────────────
function compressResult(rawOutput = '', maxLength = 300) {
  if (!rawOutput) return '(no output)';

  // Try JSON parse first (claude --output-format json)
  try {
    const parsed = JSON.parse(rawOutput);
    const text = parsed?.result ?? parsed?.content ?? parsed?.message ?? JSON.stringify(parsed);
    return String(text).slice(0, maxLength);
  } catch {}

  // Strip code blocks
  let cleaned = rawOutput
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/^\s+at\s+.+$/gm, '')          // stack trace lines
    .replace(/\n{3,}/g, '\n\n')             // collapse blank lines
    .trim();

  // Extract first 2 meaningful sentences
  const sentences = cleaned.match(/[^.!?\n]+[.!?\n]+/g) ?? [cleaned];
  const meaningful = sentences.filter(s => s.trim().length > 15).slice(0, 2);
  const head = meaningful.join(' ').trim() || cleaned.slice(0, maxLength);

  // Append file-change hints if present
  const fileHints = rawOutput.match(/(?:changed|edited|wrote|created|modified)\s+([^\s,]+\.[a-z]+)/gi) ?? [];
  const suffix = fileHints.length ? ` | files: ${[...new Set(fileHints)].slice(0, 3).join(', ')}` : '';

  return (head + suffix).slice(0, maxLength);
}

// ─── Core runner ──────────────────────────────────────────────────────────────
function runProcess(cmd, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    const killer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(killer);
      resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim(), durationMs: Date.now() - start });
    });

    proc.on('error', (err) => {
      clearTimeout(killer);
      resolve({ exitCode: 1, stdout: '', stderr: err.message, durationMs: Date.now() - start });
    });
  });
}

// ─── Dispatch marker ─────────────────────────────────────────────────────────
// Prepend a marker to every prompt that goes through the official dispatch pipeline.
// The enforce-tier hook checks for this marker to distinguish legitimate dispatches
// from raw Agent calls made by the HEAD that bypass the dual-brain pipeline.
// Format: <!-- dual-brain-dispatch: <runId> -->
// runId is a short timestamp-based ID that ties back to this dispatch session.

let _dispatchRunId = null;

function _getDispatchRunId() {
  if (!_dispatchRunId) {
    // Generate once per process: timestamp + random suffix
    _dispatchRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  return _dispatchRunId;
}

function _prependDispatchMarker(prompt) {
  const runId = _getDispatchRunId();
  return `<!-- dual-brain-dispatch: ${runId} -->\n${prompt}`;
}

// ─── Main dispatch ────────────────────────────────────────────────────────────
async function dispatch(input = {}) {
  const { decision = {}, files = [], cwd = process.cwd(), dryRun = false } = input;
  let { prompt } = input;

  if (!prompt) throw new Error('prompt is required');

  // Safety gate: redact secrets before anything reaches a subprocess or log
  prompt = redact(prompt);

  // Stamp the prompt with the dispatch marker so enforce-tier.mjs can recognise
  // that this agent call came through the official pipeline.
  prompt = _prependDispatchMarker(prompt);

  const tier     = decision.tier ?? 'execute';
  const timeoutMs = TIER_TIMEOUT_MS[tier] ?? 120_000;

  // ── Feature 3: Retry budget check ────────────────────────────────────────
  const budget = _checkRetryBudget(prompt);
  if (!budget.allowed) {
    return {
      status: 'error',
      provider: decision.provider ?? 'claude',
      model: decision.model ?? 'sonnet',
      command: null,
      exitCode: null,
      summary: budget.reason,
      durationMs: 0,
      usage: null,
      error: budget.reason,
    };
  }

  // ── Feature 1: Validate dispatch (CLI availability + model) ──────────────
  const rt = await detectRuntime();
  const validated = validateDispatch({ ...decision, tier }, rt);

  if (validated._error) {
    return {
      status: 'error',
      provider: decision.provider ?? 'claude',
      model: decision.model ?? 'sonnet',
      command: null,
      exitCode: null,
      summary: validated._error,
      durationMs: 0,
      usage: null,
      error: validated._error,
    };
  }

  const effectiveProvider = validated.provider;
  const effectiveModel    = validated.model ?? decision.model ?? 'sonnet';
  const effectiveDecision = { ...validated };

  // ── Feature 2: Dirty-worktree guard for execute-tier dispatches ──────────
  if (tier === 'execute' && decision.owns && !decision._force) {
    const wtCheck = await checkWorktreeClean(decision.owns, cwd);
    if (!wtCheck.safe) {
      const msg = `Uncommitted changes conflict with agent scope: ${wtCheck.conflicts.join(', ')}. Commit or stash before dispatching.`;
      return {
        status: 'error',
        provider: effectiveProvider,
        model: effectiveModel,
        command: null,
        exitCode: null,
        summary: msg,
        durationMs: 0,
        usage: null,
        error: msg,
      };
    }
  }

  const command = buildCommand(effectiveDecision, prompt, files, cwd);

  if (dryRun) {
    return { status: 'dry-run', provider: effectiveProvider, model: effectiveModel, command, exitCode: null, summary: null, durationMs: 0, usage: null, error: null };
  }

  // Record this dispatch against the budget
  _recordDispatchBudget(prompt);

  const { exitCode, stdout, stderr, durationMs } = await runProcess(command, cwd, timeoutMs);

  // Extract token usage from JSON output if available
  let usage = null;
  try {
    const parsed = JSON.parse(stdout);
    if (parsed?.usage) {
      usage = { inputTokens: parsed.usage.input_tokens ?? 0, outputTokens: parsed.usage.output_tokens ?? 0 };
    }
  } catch {}

  const success = exitCode === 0;
  const errorText = (stderr || stdout).slice(0, 500);
  const summary = success ? compressResult(stdout) : compressResult(stderr || stdout);

  // ── Health tracking ──────────────────────────────────────────────────────
  if (success) {
    recordDuration(effectiveProvider, effectiveModel, durationMs);
    const median = medianDuration(effectiveProvider, effectiveModel);
    if (median !== null && durationMs > median * 3) {
      markDegraded(effectiveProvider, effectiveModel, cwd);
    } else {
      markHealthy(effectiveProvider, effectiveModel, cwd);
    }
    const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    recordDispatch(effectiveProvider, effectiveModel, totalTokens, cwd);
  } else {
    if (RATE_LIMIT_PATTERNS.test(errorText)) {
      markHot(effectiveProvider, effectiveModel, cwd);
    }
  }
  // ── End health tracking ──────────────────────────────────────────────────

  recordUsage({
    provider: effectiveProvider,
    model: effectiveModel,
    tier,
    durationMs,
    inputTokens:  usage?.inputTokens  ?? null,
    outputTokens: usage?.outputTokens ?? null,
    success,
  });

  return {
    status:     success ? 'completed' : 'failed',
    provider:   effectiveProvider,
    model:      effectiveModel,
    command,
    exitCode,
    summary,
    durationMs,
    usage,
    error: success ? null : errorText.slice(0, 200),
  };
}

// ─── Dual-brain dispatch (parallel) ───────────────────────────────────────────
async function dispatchDualBrain(input = {}) {
  const { decision = {}, files = [], cwd = process.cwd(), dryRun = false } = input;
  let { prompt } = input;
  if (!prompt) throw new Error('prompt is required');

  // Safety gate: redact secrets before sending to either provider
  prompt = redact(prompt);

  // Stamp with dispatch marker so enforce-tier.mjs allows this Agent call
  prompt = _prependDispatchMarker(prompt);

  // Feature 1: Validate both sub-decisions before spawning anything
  const rt = await detectRuntime();
  const tier = decision.tier ?? 'execute';

  const claudeDecision = { ...decision, provider: 'claude', model: decision.model ?? 'sonnet', tier };
  const _oaiDefault = tier === 'think' ? 'gpt-5.5' : tier === 'search' ? 'o4-mini' : 'gpt-5.4';
  const openaiDecision = { ...decision, provider: 'openai', model: decision.openaiModel ?? _oaiDefault, tier };

  const validatedClaude = validateDispatch(claudeDecision, rt);
  const validatedOpenai = validateDispatch(openaiDecision, rt);

  const [claudeResult, openaiResult] = await Promise.all([
    validatedClaude._error
      ? Promise.resolve({ status: 'error', provider: 'claude', model: claudeDecision.model, command: null, exitCode: null, summary: validatedClaude._error, durationMs: 0, usage: null, error: validatedClaude._error })
      : dispatch({ decision: validatedClaude, prompt, files, cwd, dryRun }),
    validatedOpenai._error
      ? Promise.resolve({ status: 'error', provider: 'openai', model: openaiDecision.model, command: null, exitCode: null, summary: validatedOpenai._error, durationMs: 0, usage: null, error: validatedOpenai._error })
      : dispatch({ decision: validatedOpenai, prompt, files, cwd, dryRun }),
  ]);

  return {
    tier,
    claude: claudeResult,
    openai: openaiResult,
    consensus: claudeResult.status === 'completed' && openaiResult.status === 'completed'
      ? 'both-passed'
      : claudeResult.status === 'failed' && openaiResult.status === 'failed'
        ? 'both-failed'
        : 'split',
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i !== -1 ? (args[i + 1] ?? true) : null; };

  if (args.includes('--detect-runtime')) {
    const rt = await detectRuntime();
    console.log(JSON.stringify(rt, null, 2));
    process.exit(0);
  }

  const prompt = flag('--prompt') || args.find(a => !a.startsWith('--'));
  if (!prompt) {
    console.error('Usage: node src/dispatch.mjs --prompt "..." [--provider claude|openai] [--model sonnet] [--tier execute] [--dry-run]');
    console.error('       node src/dispatch.mjs --detect-runtime');
    process.exit(1);
  }

  const decision = {
    provider: flag('--provider') || 'claude',
    model:    flag('--model')    || 'sonnet',
    tier:     flag('--tier')     || 'execute',
    effort:   flag('--effort')   || null,
  };

  try {
    const result = await dispatch({ decision, prompt, dryRun: args.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('dispatch error:', err.message);
    process.exit(1);
  }
}

export { dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain, validateDispatch, checkWorktreeClean, getRetryBudget };
