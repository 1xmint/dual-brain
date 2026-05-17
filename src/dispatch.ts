#!/usr/bin/env node
// dispatch.ts — Dispatch/execution module for dual-brain.
// Takes a routing decision and launches the agent via Claude CLI or Codex CLI.
// CLI: node src/dispatch.ts --dry-run --provider claude --model sonnet --prompt "fix the bug"
//      node src/dispatch.ts --detect-runtime
// Exports: dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain,
//          validateDispatch, checkWorktreeClean, getRetryBudget,
//          isInsideClaude, buildNativeDispatch, normalizeResult

import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
// @ts-ignore
import { markHot, markDegraded, markHealthy, recordDispatch } from './health.js';
// @ts-ignore
import { redact } from './redact.js';
import { getFailoverOrder } from './decide.js';
import { getTemplate, renderPrompt, quickRender } from './templates.js';
import { compilePacket, shapeForRole } from './context-intel.js';
// @ts-ignore
import { buildContextPack } from './context.js';
// @ts-ignore
import { scoreTask, computeRequiredTier } from './governance.js';
import { buildProviderEnvelope, codexPolicyArgs } from './provider-enforcement.js';

import type { Provider, Tier, Risk, DispatchDecision } from './types.js';

// ─── Local interfaces ─────────────────────────────────────────────────────────

interface RuntimeInfo {
  claudeAvailable: boolean;
  codexAvailable: boolean;
  runtime: 'claude-code' | 'codex-cli' | 'none';
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
}

interface RetryBudgetCheck {
  allowed: boolean;
  reason?: string;
}

interface RetryBudgetState {
  perTaskRetries: Record<string, number>;
  recentDispatches: number;
  windowMs: number;
  maxPerTask: number;
  maxPerWindow: number;
}

interface WorktreeCheck {
  safe: boolean;
  conflicts?: string[];
}

interface PreflightResult {
  ready: boolean;
  provider: string;
  error?: string;
  suggestion?: string;
}

interface FailoverLogEntry {
  from: string;
  to: string;
  reason: string;
  attempt: number;
}

interface NativeDispatchDescriptor {
  type: 'native-agent';
  description: string;
  model: 'haiku' | 'sonnet' | 'opus';
  prompt: string;
  isolation: string | undefined;
  maxTurns: number;
  disallowedTools: string[];
  background: boolean;
}

interface NormalizedResult {
  status: 'success' | 'failure' | 'partial';
  provider: string;
  model: string;
  tier: string;
  filesChanged: string[];
  filesFound: string[];
  testsRun: number;
  edgeCases: string[];
  tokensUsed: { input: number; output: number };
  errors: string[];
  rawOutput: string;
}

interface DispatchInput {
  prompt?: string;
  decision?: Record<string, unknown>;
  files?: string[];
  cwd?: string;
  dryRun?: boolean;
  verbose?: boolean;
  situationBrief?: string;
  useWorktree?: boolean;
  maxTurns?: number;
  modelSuggestion?: { model: string; reason: string };
  profile?: Record<string, unknown>;
  _retryAttempt?: number;
  _skipPreDispatchThink?: boolean;
  _skipRelatedContext?: boolean;
}

interface DispatchResult {
  status: string;
  provider: string;
  model: string;
  specialist?: string;
  command: string[] | null;
  nativeDispatch?: NativeDispatchDescriptor;
  exitCode: number | null;
  summary: string | null;
  durationMs: number;
  usage: TokenUsageInfo | null;
  worktreeUsed?: boolean;
  autoReview?: { triggered: boolean; provider?: string; status?: string; reason?: string };
  authVerified?: boolean;
  error: string | null;
  suggestion?: string;
  type?: string;
}

interface DualBrainResult {
  tier: string;
  claude: DispatchResult;
  openai: DispatchResult;
  consensus: 'both-passed' | 'both-failed' | 'split';
}

interface SpecialistEntry {
  prompt_file?: string;
  tier_bias?: Tier;
}

interface SpecialistRegistry {
  specialists?: Record<string, SpecialistEntry>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = join(__dirname, '..', '.dualbrain', 'usage');
const TIER_TIMEOUT_MS: Record<string, number> = { search: 60_000, execute: 120_000, think: 180_000 };
const CLAUDE_MODEL_IDS: Record<string, string> = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' };

// ─── Specialist prompt loader ─────────────────────────────────────────────────

const SPECIALISTS_DIR = join(__dirname, '..', 'agents', 'specialists');

/**
 * Load specialist registry from agents/specialists/registry.json.
 * Returns null if registry is missing or malformed.
 */
function _loadSpecialistRegistry(): SpecialistRegistry | null {
  try {
    const raw = readFileSync(join(SPECIALISTS_DIR, 'registry.json'), 'utf8');
    return JSON.parse(raw) as SpecialistRegistry;
  } catch {
    return null;
  }
}

/**
 * Read agents/specialists/_base.md and agents/specialists/{specialist}.md,
 * concatenate them (base first, specialist second). Falls back gracefully:
 * - If base is missing, only specialist content is returned.
 * - If specialist file is missing, only base content is returned.
 * - If both are missing, returns an empty string.
 */
function loadSpecialistPrompt(specialist: string): string {
  if (!specialist || specialist === 'generic') return '';

  const tryRead = (filePath: string): string => {
    try { return readFileSync(filePath, 'utf8').trim(); } catch { return ''; }
  };

  const registry = _loadSpecialistRegistry();
  const entry = registry?.specialists?.[specialist];
  const promptFile = entry?.prompt_file ?? `${specialist}.md`;

  const base       = tryRead(join(SPECIALISTS_DIR, '_base.md'));
  const specific   = tryRead(join(SPECIALISTS_DIR, promptFile));

  const parts = [base, specific].filter(Boolean);
  return parts.join('\n\n');
}

// ─── Median dispatch time tracker (in-process, for slow-response detection) ──
// Rolling window of recent dispatch durations keyed by "provider:modelClass"
const _durationHistory = new Map<string, number[]>();
const DURATION_WINDOW  = 10; // keep last N durations per model class

function recordDuration(provider: string, model: string, durationMs: number): void {
  const k = `${provider}:${model}`;
  if (!_durationHistory.has(k)) _durationHistory.set(k, []);
  const arr = _durationHistory.get(k)!;
  arr.push(durationMs);
  if (arr.length > DURATION_WINDOW) arr.shift();
}

function medianDuration(provider: string, model: string): number | null {
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

// ─── Auto-heal failover helpers ───────────────────────────────────────────────

const FAILOVER_LOG_DIR = join(__dirname, '..', '.dualbrain', 'audit');

/** Retryable exit-code-1 patterns: rate limits, quota, capacity, timeouts */
const RETRYABLE_PATTERNS = /rate.?limit|429|quota.?exceeded|capacity|overloaded|timeout/i;

/** Non-retryable patterns: auth failures, bad input, user cancellation */
const NON_RETRYABLE_PATTERNS = /unauthorized|forbidden|invalid.?api.?key|authentication|bad.?request|cancelled|canceled/i;

/**
 * Decide if a subprocess result is a retryable failure.
 * Must be exit code 1 (or non-zero) AND match retryable keywords AND NOT match
 * non-retryable keywords.
 */
function isRetryableFailure({ exitCode, stderr, stdout }: { exitCode: number; stderr: string; stdout: string }): boolean {
  if (exitCode === 0) return false;
  const errText = `${stderr} ${stdout}`.slice(0, 1000);
  if (NON_RETRYABLE_PATTERNS.test(errText)) return false;
  return RETRYABLE_PATTERNS.test(errText);
}

/**
 * Append a failover event to .dualbrain/audit/failover.jsonl.
 */
function logFailover({ from, to, reason, attempt }: FailoverLogEntry): void {
  try {
    mkdirSync(FAILOVER_LOG_DIR, { recursive: true });
    appendFileSync(
      join(FAILOVER_LOG_DIR, 'failover.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), from, to, reason, attempt }) + '\n',
    );
  } catch {}
}

// ─── Native Claude Code detection ────────────────────────────────────────────

/**
 * Detect whether we are running inside Claude Code (as a subagent or tool call).
 * Checks the CLAUDE_CODE env var or the presence of .claude/settings.json in the project root.
 */
function isInsideClaude(): boolean {
  if (process.env.CLAUDE_CODE) return true;
  // Walk up from __dirname (src/) to find .claude/settings.json in project root
  const projectRoot = join(__dirname, '..');
  return existsSync(join(projectRoot, '.claude', 'settings.json'));
}

// ─── Tier defaults for maxTurns ──────────────────────────────────────────────

const TIER_MAX_TURNS: Record<string, number> = { search: 5, execute: 15, think: 10 };

// ─── Agent model mapper ───────────────────────────────────────────────────────

/**
 * Map a model alias or model ID to the canonical agent model name (haiku|sonnet|opus).
 * Falls back to tier-based defaults when no match is found.
 */
function mapToAgentModel(modelAlias: string | undefined | null, tier?: string): 'haiku' | 'sonnet' | 'opus' {
  if (!modelAlias) {
    const tierDefaults: Record<string, 'haiku' | 'sonnet' | 'opus'> = { search: 'haiku', execute: 'sonnet', think: 'opus' };
    return tierDefaults[tier ?? ''] ?? 'sonnet';
  }
  const lower = String(modelAlias).toLowerCase();
  if (lower === 'haiku' || lower.startsWith('claude-3-haiku') || lower.includes('haiku')) return 'haiku';
  if (lower === 'opus'  || lower.startsWith('claude-opus')   || lower.includes('opus'))  return 'opus';
  if (lower === 'sonnet'|| lower.startsWith('claude-sonnet') || lower.includes('sonnet')) return 'sonnet';
  // Tier-based fallback
  const tierDefaults: Record<string, 'haiku' | 'sonnet' | 'opus'> = { search: 'haiku', execute: 'sonnet', think: 'opus' };
  return tierDefaults[tier ?? ''] ?? 'sonnet';
}

// ─── Native dispatch builder ──────────────────────────────────────────────────

/**
 * Build a structured native Agent tool call descriptor instead of a shell command.
 * The caller (CLI or plugin) is responsible for invoking the Agent tool with this object.
 */
function buildNativeDispatch(
  decision: Record<string, unknown>,
  prompt: string,
  options: { worktree?: boolean; maxTurns?: number } = {},
): NativeDispatchDescriptor {
  const tier  = (decision.tier as string) ?? 'execute';
  const model = mapToAgentModel(decision.model as string | undefined, tier);

  return {
    type:        'native-agent',
    description: `dual-brain ${tier}: ${String(prompt).slice(0, 50)}`,
    model,
    prompt,
    isolation:      options.worktree ? 'worktree' : undefined,
    maxTurns:       options.maxTurns ?? TIER_MAX_TURNS[tier] ?? 15,
    disallowedTools: tier === 'search' ? ['Edit', 'Write', 'NotebookEdit'] : [],
    background:     false,
  };
}

// ─── Result normalizer ────────────────────────────────────────────────────────

/**
 * Normalize a raw result from either a native Agent call or subprocess stdout
 * into a common result shape.
 */
function normalizeResult(rawResult: unknown, dispatchType: 'native-agent' | 'subprocess'): NormalizedResult {
  const raw: Record<string, unknown> = (rawResult as Record<string, unknown>) ?? {};

  // Determine raw output string regardless of dispatch type
  let rawOutput = '';
  if (typeof rawResult === 'string') {
    rawOutput = rawResult;
  } else if (typeof raw.stdout === 'string') {
    rawOutput = raw.stdout;
  } else if (typeof raw.output === 'string') {
    rawOutput = raw.output;
  } else if (typeof raw.result === 'string') {
    rawOutput = raw.result;
  } else {
    try { rawOutput = JSON.stringify(raw); } catch { rawOutput = String(raw); }
  }

  // Determine status
  let status: 'success' | 'failure' | 'partial' = 'success';
  if (dispatchType === 'subprocess') {
    const exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : (raw.code as number | null ?? null);
    if (exitCode !== null) {
      status = exitCode === 0 ? 'success' : 'failure';
    } else if (raw.status === 'failed' || raw.status === 'error') {
      status = 'failure';
    } else if (raw.status === 'partial') {
      status = 'partial';
    }
  } else {
    // native-agent
    if (raw.status === 'failed' || raw.status === 'error' || raw.error) {
      status = 'failure';
    } else if (raw.status === 'partial') {
      status = 'partial';
    }
  }

  // Extract fields from raw
  const provider = (raw.provider as string) ?? (dispatchType === 'native-agent' ? 'claude' : 'unknown');
  const model    = (raw.model as string) ?? ((raw.agentModel as string) ?? 'unknown');
  const tier     = (raw.tier as string) ?? 'execute';

  // Files changed / found — best-effort extraction from raw output
  const filesChangedSet = new Set<string>();
  const filesFoundSet   = new Set<string>();
  if (Array.isArray(raw.filesChanged)) (raw.filesChanged as string[]).forEach(f => filesChangedSet.add(f));
  if (Array.isArray(raw.filesFound))   (raw.filesFound as string[]).forEach(f => filesFoundSet.add(f));

  // Scan rawOutput for file hints
  const changeMatches = rawOutput.matchAll(/(?:changed|edited|wrote|created|modified)\s+([^\s,]+\.[a-z]{1,6})/gi);
  for (const m of changeMatches) filesChangedSet.add(m[1]);
  const foundMatches = rawOutput.matchAll(/(?:found|located|in)\s+([^\s,]+\.[a-z]{1,6})/gi);
  for (const m of foundMatches) filesFoundSet.add(m[1]);

  // Tests run
  let testsRun = (raw.testsRun as number) ?? 0;
  if (testsRun === 0) {
    const testMatch = rawOutput.match(/(\d+)\s+(?:tests?|specs?)\s+(?:passed|run|ran)/i);
    if (testMatch) testsRun = parseInt(testMatch[1], 10);
  }

  // Edge cases
  const edgeCases: string[] = Array.isArray(raw.edgeCases) ? (raw.edgeCases as string[]) : [];

  // Token usage
  const rawTokensUsed = raw.tokensUsed as Record<string, number> | undefined;
  const rawUsage = raw.usage as Record<string, number> | undefined;
  const tokensUsed = {
    input:  rawTokensUsed?.input  ?? rawUsage?.inputTokens  ?? rawUsage?.input_tokens  ?? 0,
    output: rawTokensUsed?.output ?? rawUsage?.outputTokens ?? rawUsage?.output_tokens ?? 0,
  };

  // Errors
  const errors: string[] = [];
  if (Array.isArray(raw.errors)) errors.push(...(raw.errors as string[]));
  if (typeof raw.error === 'string' && raw.error) errors.push(raw.error);
  if (typeof raw.stderr === 'string' && raw.stderr) errors.push((raw.stderr as string).slice(0, 200));

  return {
    status,
    provider,
    model,
    tier,
    filesChanged: [...filesChangedSet],
    filesFound:   [...filesFoundSet],
    testsRun,
    edgeCases,
    tokensUsed,
    errors,
    rawOutput: rawOutput.slice(0, 2000),
  };
}

// ─── Runtime detection (cached) ───────────────────────────────────────────────

let _runtimeCache: RuntimeInfo | null = null;

async function detectRuntime(): Promise<RuntimeInfo> {
  if (_runtimeCache) return _runtimeCache;

  const check = (cmd: string): Promise<boolean> => new Promise((resolve) => {
    const p = spawn(cmd, ['--version'], { stdio: 'pipe' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, 3000);
  });

  const [claudeAvailable, codexAvailable] = await Promise.all([
    check('claude'),
    check('codex'),
  ]);

  const runtime: RuntimeInfo['runtime'] =
    claudeAvailable && codexAvailable ? 'claude-code'
    : claudeAvailable                 ? 'claude-code'
    : codexAvailable                  ? 'codex-cli'
    : 'none';

  _runtimeCache = { claudeAvailable, codexAvailable, runtime };
  return _runtimeCache;
}

// ─── Feature 1: Model validation + graceful fallback ─────────────────────────

/** Valid CLI model flags per provider */
const VALID_MODELS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  openai: ['o4-mini', 'o3', 'o1', 'o1-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo'],
};

/** Safest default model for a given provider + tier */
function _safeModel(provider: string, tier: string): string {
  if (provider === 'claude') {
    return tier === 'search' ? 'haiku' : 'sonnet';
  }
  return 'o4-mini';
}

/**
 * Validate a routing decision against CLI availability and valid model lists.
 * Returns either a (possibly corrected) decision object, or an error sentinel
 * `{ _error: string }` when no CLI is available at all.
 */
function validateDispatch(
  decision: Record<string, unknown>,
  rt: RuntimeInfo,
): Record<string, unknown> & { _error?: string } {
  let provider = (decision.provider as string) ?? 'claude';
  let model = decision.model as string | undefined;
  const tier = (decision.tier as string) ?? 'execute';

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
 *  - `dir/*`  -> prefix match on `dir/`
 *  - `*.ext`  -> suffix match on `.ext`
 *  - otherwise -> exact match
 */
function _globMatch(pattern: string, filePath: string): boolean {
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
 */
async function checkWorktreeClean(owns: string[], cwd?: string): Promise<WorktreeCheck> {
  if (!owns || owns.length === 0) return { safe: true };

  const dirty = await new Promise<string[]>((resolve) => {
    const proc = spawn('git', ['status', '--porcelain', '-u'], {
      cwd: cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d; });
    proc.on('close', () => {
      // Each line: "XY path" — grab the path part (columns 4+, after "XY ")
      const files = out.split('\n')
        .map(l => l.slice(3).trim())
        .filter(Boolean);
      resolve(files);
    });
    proc.on('error', () => resolve([])); // git not available -> skip guard
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
const _retryCount = new Map<string, number>();

/** Recent dispatch timestamps for the 5-minute window rate-limit */
const _recentDispatches: number[] = [];

const MAX_RETRIES_PER_TASK    = 2;
const MAX_DISPATCHES_PER_5MIN = 5;
const WINDOW_MS = 5 * 60 * 1000;

function _promptKey(prompt: string): string {
  return createHash('sha256').update(String(prompt)).digest('hex').slice(0, 16);
}

/**
 * Check whether this dispatch is within budget.
 */
function _checkRetryBudget(prompt: string): RetryBudgetCheck {
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

function _recordDispatchBudget(prompt: string): void {
  _recentDispatches.push(Date.now());
  const key = _promptKey(prompt);
  _retryCount.set(key, (_retryCount.get(key) ?? 0) + 1);
}

/**
 * Return current retry budget state for status display.
 */
function getRetryBudget(): RetryBudgetState {
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

// ─── Preflight auth check ─────────────────────────────────────────────────────

/**
 * Verify a provider CLI is present and (optionally) responds to --version.
 * Uses `which` for the fast path and a 3s-capped --version call to confirm.
 */
async function preflightAuth(provider: string, _cwd?: string): Promise<PreflightResult> {
  const bin = provider === 'openai' ? 'codex' : 'claude';

  // Fast path: check binary existence with `which`
  const whichResult = await new Promise<boolean>((resolve) => {
    const p = spawn('which', [bin], { stdio: 'pipe' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, 2000);
  });

  if (!whichResult) {
    const installHint = provider === 'openai'
      ? 'Install: npm install -g @openai/codex'
      : 'Install: npm install -g @anthropic-ai/claude-code';
    return {
      ready:      false,
      provider,
      error:      `${bin} CLI not found in PATH`,
      suggestion: installHint,
    };
  }

  // Version check: confirms the binary actually runs (catches broken installs)
  const versionOk = await new Promise<boolean>((resolve) => {
    const p = spawn(bin, ['--version'], { stdio: 'pipe' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, 3000);
  });

  if (!versionOk) {
    const loginHint = provider === 'openai' ? 'Run: codex login' : 'Run: claude login';
    return {
      ready:      false,
      provider,
      error:      `${bin} --version failed (auth may have expired)`,
      suggestion: loginHint,
    };
  }

  return { ready: true, provider };
}

// ─── Command builder ──────────────────────────────────────────────────────────

function buildCommand(decision: Record<string, unknown>, prompt: string, files: string[] = [], _cwd?: string): string[] {
  const provider = (decision?.provider as string) ?? 'claude';
  const modelAlias = (decision?.model as string) ?? 'sonnet';
  const effort = (decision?.effort as string | null) ?? null;
  const tier = (decision?.tier as string) ?? 'execute';

  if (provider === 'claude') {
    const modelId = CLAUDE_MODEL_IDS[modelAlias] ?? modelAlias;
    const wrappedPrompt = buildProviderEnvelope(prompt, {
      provider: 'claude',
      mode: 'dispatch',
      tier,
      cwd: _cwd,
    });
    const cmd = ['claude', '--model', modelId, '--permission-mode', 'auto', '--print', '--output-format', 'json', '-p', wrappedPrompt];
    if (effort) cmd.push('--effort', effort);
    return cmd;
  }

  // openai / codex
  const wrappedPrompt = buildProviderEnvelope(prompt, {
    provider: 'codex',
    mode: 'dispatch',
    tier,
    cwd: _cwd,
  });
  const cmd = ['codex', ...codexPolicyArgs('exec'), '-m', modelAlias, wrappedPrompt];
  if (effort) cmd.push('-c', `reasoning.effort="${effort}"`);
  return cmd;
}

// ─── Usage recorder ───────────────────────────────────────────────────────────
function recordUsage(entry: Record<string, unknown>): void {
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
function compressResult(rawOutput: string = '', maxLength: number = 300): string {
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
function runProcess(cmd: string[], cwd: string, timeoutMs: number, env?: Record<string, string>): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const spawnEnv = env ? { ...process.env, ...env } : undefined;
    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], ...(spawnEnv ? { env: spawnEnv } : {}) });

    proc.stdout.on('data', (d: Buffer) => { stdout += d; });
    proc.stderr.on('data', (d: Buffer) => { stderr += d; });

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

// ─── Template-based prompt rendering ─────────────────────────────────────────

function _renderTemplatedPrompt(prompt: string, decision: Record<string, unknown>, context: Record<string, unknown> = {}): string {
  const tierStr = (decision.tier as string) ?? 'execute';
  const tier = tierStr as Parameters<typeof getTemplate>[0];
  const template = getTemplate(tier);
  if (!template) return prompt;

  if (decision.contract) {
    const rendered = renderPrompt(tier, decision.contract as Parameters<typeof renderPrompt>[1], context);
    if (rendered.valid) return rendered.prompt ?? prompt;
  }

  const rendered = quickRender(tier, prompt, {
    scope: (decision.owns as string[]) || (decision.scope as string[]) || [],
    files: (decision.files as string[]) || [],
    risk: (decision.risk as string) || 'medium',
    criteria: (decision.acceptanceCriteria as string[]) || [],
    nonGoals: (decision.nonGoals as string[]) || [],
    context: (decision.taskContext as string) || '',
  });

  return rendered.valid ? rendered.prompt ?? prompt : prompt;
}

// ─── Dispatch marker ─────────────────────────────────────────────────────────
// Prepend a marker to every prompt that goes through the official dispatch pipeline.
// The enforce-tier hook checks for this marker to distinguish legitimate dispatches
// from raw Agent calls made by the HEAD that bypass the dual-brain pipeline.
// Format: <!-- dual-brain-dispatch:<runId>|tier:<tier>|model:<model>|risk:<risk>|req:<requiredTier> -->
// runId is a short timestamp-based ID; governance fields enable over-provisioning validation.

let _dispatchRunId: string | null = null;

function _getDispatchRunId(): string {
  if (!_dispatchRunId) {
    // Generate once per process: timestamp + random suffix
    _dispatchRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  return _dispatchRunId;
}

function _prependDispatchMarker(prompt: string, decision: Record<string, unknown> = {}): string {
  const runId = _getDispatchRunId();
  const tier = (decision.tier as string) || 'execute';
  const model = (decision.model as string) || 'sonnet';
  const risk = (decision.risk as string) || 'medium';
  const requiredTier = (decision._requiredTier as string) || '';
  const marker = `<!-- dual-brain-dispatch:${runId}|tier:${tier}|model:${model}|risk:${risk}|req:${requiredTier} -->`;
  return `${marker}\n${prompt}`;
}

// ─── Related session age label ────────────────────────────────────────────────

/**
 * Human-readable age label for a related session date string.
 */
function _relatedSessionAge(isoDate: string): string {
  const diff = Date.now() - Date.parse(isoDate);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Main dispatch ────────────────────────────────────────────────────────────
async function dispatch(input: DispatchInput = {}): Promise<DispatchResult> {
  const { files = [], cwd = process.cwd(), dryRun = false, verbose = false } = input;
  let decision: Record<string, unknown> = (input.decision as Record<string, unknown>) ?? {};
  let prompt = input.prompt as string;

  if (!prompt) throw new Error('prompt is required');

  // Safety gate: redact secrets before anything reaches a subprocess or log
  prompt = redact(prompt);

  // ── Template-based prompt rendering ─────────────────────────────────────────
  // When a tier and/or contract are present, render through templates.mjs for
  // structured, typed prompts. Falls back to raw prompt when no template matches.
  prompt = _renderTemplatedPrompt(prompt, decision);

  // ── Context intelligence: model-specific prompt shaping ─────────────────────
  // When we have files and a target model, shape the prompt context for optimal
  // model consumption. This adds structured context without replacing the template output.
  if (files.length > 0 || decision.tier) {
    try {
      const pack = await buildContextPack(prompt, files, cwd);
      const role = decision.tier === 'think' ? 'thinker'
                 : decision.tier === 'review' ? 'reviewer'
                 : 'worker';
      const targetModel = (decision.model as string) || 'sonnet';
      const tokenBudget = role === 'thinker' ? 3000
                        : role === 'reviewer' ? 4000
                        : 8000;
      const { shaped, tokenEstimate } = shapeForRole(pack as unknown as Parameters<typeof shapeForRole>[0], role, targetModel, tokenBudget);
      if (shaped && tokenEstimate > 0) {
        prompt = `${shaped}\n\n---\n\n${prompt}`;
        if (verbose) process.stderr.write(`[dual-brain] context-intel: ${role} packet shaped for ${targetModel} (~${tokenEstimate} tokens)\n`);
      }
    } catch { /* non-blocking — context shaping failure never prevents dispatch */ }
  }
  // ── End context intelligence ─────────────────────────────────────────────────

  // ── Resume brief injection ───────────────────────────────────────────────────
  // Inject the last session's receipt as context when no situationBrief is already set.
  // This closes the receipt -> brief -> next session loop automatically.
  // Falls back to continuity.mjs handoffs when receipt.mjs returns nothing.
  if (!input.situationBrief) {
    try {
      // @ts-ignore
      const { buildResumeBrief } = await import('./receipt.js');
      const brief = buildResumeBrief(cwd);
      if (brief) {
        input = { ...input, situationBrief: brief };
      }
    } catch { /* non-blocking */ }

    // Provider-aware continuity fallback: adapts resume format for target provider
    if (!input.situationBrief) {
      try {
        // @ts-ignore
        const { buildProviderResumeBrief } = await import('./provider-context.js');
        const targetProvider = (decision.provider as string) || 'claude';
        const providerBrief = buildProviderResumeBrief(cwd, targetProvider);
        if (providerBrief) {
          input = { ...input, situationBrief: providerBrief };
        }
      } catch { /* non-blocking */ }

      // Legacy fallback: continuity.mjs handoff (provider-unaware)
      if (!input.situationBrief) {
        try {
          // @ts-ignore
          const { buildResumeBrief: buildHandoffBrief } = await import('./continuity.js');
          const handoffBrief = buildHandoffBrief(cwd);
          if (handoffBrief) {
            input = { ...input, situationBrief: handoffBrief };
          }
        } catch { /* non-blocking */ }
      }
    }
  }
  // ── End resume brief injection ───────────────────────────────────────────────

  // ── Related session context injection ────────────────────────────────────────
  // Find past sessions related to this task and prepend a context block.
  // Only injected when confidence is high (score > 5). Fast: index-only, no JSONL parsing.
  if (!input._skipRelatedContext) {
    try {
      // @ts-ignore
      const { findRelatedSessions } = await import('./session.js');
      const related = findRelatedSessions(prompt, files, cwd) as Array<{
        score: number;
        date?: string;
        messageCount?: number;
        matchedFiles: string[];
        smartName: string;
      }>;
      const highConfidence = related.filter(r => r.score > 5);
      if (highConfidence.length > 0) {
        const lines = highConfidence.map(r => {
          const dateLabel = r.date ? _relatedSessionAge(r.date) : null;
          const datePart  = dateLabel ? `, ${dateLabel}` : '';
          const msgPart   = r.messageCount && r.messageCount > 0 ? `, ${r.messageCount} messages` : '';
          const fileList  = r.matchedFiles.length > 0
            ? `: touched ${r.matchedFiles.map(f => f.split('/').pop()).join(', ')}`
            : '';
          return `- "${r.smartName}"${datePart}${msgPart}${fileList}`;
        });
        const contextBlock = `[Prior context from related sessions:]\n${lines.join('\n')}\n[End prior context]\n\n`;
        prompt = contextBlock + prompt;
        if (verbose) process.stderr.write(`[dual-brain] injected related session context (${highConfidence.length} sessions)\n`);
      }
    } catch { /* non-fatal — never block dispatch */ }
  }
  // ── End related session context ──────────────────────────────────────────────

  // Stamp the prompt with the dispatch marker so enforce-tier.mjs can recognise
  // that this agent call came through the official pipeline.
  // Compute required tier for governance validation
  try {
    const scores = scoreTask({ intent: decision.tier as string | undefined, risk: decision.risk as string | undefined, files, objective: prompt.slice(0, 200) });
    decision = { ...decision, _requiredTier: computeRequiredTier(scores) };
  } catch { /* non-blocking */ }
  prompt = _prependDispatchMarker(prompt, decision);

  // ── Situation brief injection ────────────────────────────────────────────────
  // Prepend a compact project-state summary when provided by the pipeline.
  // This gives every dispatched agent immediate context about the project reality.
  const situationBrief = typeof input.situationBrief === 'string' && input.situationBrief.trim()
    ? input.situationBrief.trim()
    : null;
  if (situationBrief) {
    prompt = `[SITUATION BRIEF]\n${situationBrief}\n[END BRIEF]\n\n${prompt}`;
  }
  // ── End situation brief ──────────────────────────────────────────────────────

  // ── Specialist prompt injection ──────────────────────────────────────────────
  const specialist = decision.specialist && decision.specialist !== 'generic'
    ? (decision.specialist as string)
    : null;

  if (specialist) {
    const specialistPrompt = loadSpecialistPrompt(specialist);
    if (specialistPrompt) {
      prompt = `${specialistPrompt}\n\n---\n\n${prompt}`;
      if (verbose) process.stderr.write(`[dual-brain] specialist: ${specialist}\n`);
    }

    // Apply tier_bias from registry if decision didn't already pin a tier
    if (!decision.tier) {
      const registry = _loadSpecialistRegistry();
      const tierBias = registry?.specialists?.[specialist]?.tier_bias;
      if (tierBias) {
        decision = { ...decision, tier: tierBias };
        if (verbose) process.stderr.write(`[dual-brain] specialist tier_bias applied: ${tierBias}\n`);
      }
    }
  }
  // ── End specialist injection ─────────────────────────────────────────────────

  // ── Plugin hint injection (Codex path) ──────────────────────────────────────
  // When dispatching to OpenAI/Codex, check if any Codex plugins match the task
  // and append an advisory hint so the agent can choose to use them.
  // Uses dynamic import so failure is always non-fatal.
  const targetProvider = (decision.provider as string) ?? 'claude';
  if (targetProvider === 'openai') {
    try {
      // @ts-ignore
      const { matchPluginsForTask } = await import('./replit.js');
      const matched = matchPluginsForTask(prompt, undefined, cwd) as Array<{ plugin: { id: string } }>;
      if (matched.length > 0) {
        const pluginNames = matched.slice(0, 3).map(m => m.plugin.id).join(', ');
        const hint = `\n\n[Available Codex plugins for this task: ${pluginNames}. Consider using the matching plugin for direct API access.]`;
        prompt = prompt + hint;
        if (verbose) process.stderr.write(`[dual-brain] plugin hint injected: ${pluginNames}\n`);
      }
    } catch { /* non-fatal — never block dispatch */ }
  }
  // ── End plugin hint injection ────────────────────────────────────────────────

  const tier     = (decision.tier as string) ?? 'execute';
  const timeoutMs = TIER_TIMEOUT_MS[tier] ?? 120_000;

  // ── Feature 3: Retry budget check ────────────────────────────────────────
  const budget = _checkRetryBudget(prompt);
  if (!budget.allowed) {
    return {
      status: 'error',
      provider: (decision.provider as string) ?? 'claude',
      model: (decision.model as string) ?? 'sonnet',
      command: null,
      exitCode: null,
      summary: budget.reason!,
      durationMs: 0,
      usage: null,
      error: budget.reason!,
    };
  }

  // ── Feature 1: Validate dispatch (CLI availability + model) ──────────────
  const rt = await detectRuntime();
  const validated = validateDispatch({ ...decision, tier }, rt);

  if (validated._error) {
    return {
      status: 'error',
      provider: (decision.provider as string) ?? 'claude',
      model: (decision.model as string) ?? 'sonnet',
      command: null,
      exitCode: null,
      summary: validated._error,
      durationMs: 0,
      usage: null,
      error: validated._error,
    };
  }

  const effectiveProvider = validated.provider as string;
  let effectiveModel    = (validated.model as string) ?? (decision.model as string) ?? 'sonnet';
  let effectiveDecision: Record<string, unknown> = { ...validated };

  // modelSuggestion influence: if the pipeline provided a model suggestion from models.mjs,
  // apply it when the current model is a tier default/fallback (not an explicit override).
  // The suggestion is advisory — it only applies when the decision didn't pin a specific model.
  if (input.modelSuggestion?.model && effectiveProvider === 'claude') {
    const TIER_DEFAULTS = new Set(['haiku', 'sonnet', 'opus']);
    const decisionModelExplicit = (decision as Record<string, unknown> & { _explicit?: { model?: boolean } })._explicit?.model ?? false;
    const isDefault = !decisionModelExplicit && TIER_DEFAULTS.has(effectiveModel);
    if (isDefault) {
      const suggestedAlias = mapToAgentModel(input.modelSuggestion.model, (effectiveDecision.tier as string) ?? 'execute');
      const validList = VALID_MODELS[effectiveProvider] ?? [];
      if (validList.includes(suggestedAlias)) {
        effectiveModel = suggestedAlias;
        effectiveDecision = { ...effectiveDecision, model: suggestedAlias };
        if (verbose) process.stderr.write(`\x1b[2m[dual-brain] modelSuggestion applied: ${suggestedAlias} (${input.modelSuggestion.reason})\x1b[0m\n`);
      }
    }
  }

  // ── Preflight auth check ─────────────────────────────────────────────────
  // Verify the target provider CLI is present and responsive before dispatching.
  // Runs after model/provider resolution so we check the effective provider.
  const preflight = await preflightAuth(effectiveProvider, cwd);
  if (!preflight.ready) {
    // Check if the other provider is available as a fallback
    const otherProvider = effectiveProvider === 'claude' ? 'openai' : 'claude';
    const otherPreflight = await preflightAuth(otherProvider, cwd);
    const fallbackNote = otherPreflight.ready
      ? ` Fallback available: ${otherProvider}.`
      : '';
    const errMsg = `${preflight.error}. ${preflight.suggestion}${fallbackNote}`;
    return {
      status:        'error',
      provider:      effectiveProvider,
      model:         effectiveModel,
      command:       null,
      exitCode:      null,
      summary:       errMsg,
      durationMs:    0,
      usage:         null,
      error:         errMsg,
      authVerified:  false,
      suggestion:    preflight.suggestion,
    };
  }
  // ── End preflight auth check ─────────────────────────────────────────────

  // ── Feature 2: Dirty-worktree guard for execute-tier dispatches ──────────
  if (tier === 'execute' && decision.owns && !(decision._force as boolean)) {
    const wtCheck = await checkWorktreeClean(decision.owns as string[], cwd);
    if (!wtCheck.safe) {
      const msg = `Uncommitted changes conflict with agent scope: ${wtCheck.conflicts!.join(', ')}. Commit or stash before dispatching.`;
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

  // ── Worktree isolation decision ──────────────────────────────────────────────
  // Compute whether this dispatch should run in an isolated worktree based on
  // risk level, file-edit volume, and security/auth signals in the prompt.
  const SECURITY_PATTERN = /\b(auth|secret|token|credential|password|key|oauth|jwt|session|permission|role|acl)\b/i;
  const decisionRisk        = ((decision.risk as string) ?? 'low').toLowerCase();
  const decisionFilesEst    = (decision.filesEstimate as number) ?? 0;
  const riskIsElevated      = decisionRisk === 'medium' || decisionRisk === 'high' || decisionRisk === 'critical';
  const manyFiles           = decisionFilesEst >= 3;
  const hasSecurity         = SECURITY_PATTERN.test(prompt);
  const useWorktree         = input.useWorktree ?? (riskIsElevated || manyFiles || hasSecurity);

  // Propagate useWorktree onto effectiveDecision so callers can inspect it
  if (useWorktree) {
    effectiveDecision = { ...effectiveDecision, useWorktree: true };
  }
  // ── End worktree isolation decision ─────────────────────────────────────────

  // ── Native Claude Code dispatch ──────────────────────────────────────────────
  // When running inside Claude Code AND the provider is claude, execute via the
  // claude CLI directly (foreground subprocess) so results are captured and returned.
  // DUAL_BRAIN_DISPATCH=1 is set so the enforce-tier hook allows this agent call.
  if (isInsideClaude() && effectiveProvider === 'claude') {
    const nativeDescriptor = buildNativeDispatch(
      effectiveDecision,
      prompt,
      { worktree: useWorktree, maxTurns: input.maxTurns },
    );

    const command = buildCommand(effectiveDecision, prompt, files, cwd);

    if (dryRun) {
      return {
        status:        'dry-run',
        provider:      effectiveProvider,
        model:         effectiveModel,
        specialist:    specialist ?? 'generic',
        command,
        nativeDispatch: nativeDescriptor,
        exitCode:      null,
        summary:       null,
        durationMs:    0,
        usage:         null,
        error:         null,
        authVerified:  true,
      };
    }

    _recordDispatchBudget(prompt);

    const dispatchEnv = { DUAL_BRAIN_DISPATCH: '1' };

    // ── Auto-heal failover retry loop (native Claude path) ────────────────
    const MAX_FAILOVER_ATTEMPTS = 2;
    let currentProvider = effectiveProvider;
    let currentModel    = effectiveModel;
    let currentDecision = effectiveDecision;
    let currentCommand  = command;
    let lastRaw: ProcessResult = { exitCode: 1, stdout: '', stderr: '', durationMs: 0 };

    for (let attempt = 0; attempt <= MAX_FAILOVER_ATTEMPTS; attempt++) {
      lastRaw = await runProcess(currentCommand, cwd, timeoutMs, dispatchEnv);
      if (lastRaw.exitCode === 0 || !isRetryableFailure(lastRaw) || attempt === MAX_FAILOVER_ATTEMPTS) break;

      const failoverList = getFailoverOrder(
        { provider: currentProvider, model: currentModel, tier },
        input.profile ?? {},
      ) as Array<{ provider: string; model: string; label: string }>;
      if (failoverList.length === 0) break;

      const next   = failoverList[0];
      const reason = `${lastRaw.stderr || lastRaw.stdout}`.slice(0, 120);
      logFailover({ from: `${currentProvider}/${currentModel}`, to: `${next.provider}/${next.model}`, reason, attempt: attempt + 1 });
      process.stderr.write(`\x1b[2m[dual-brain] Provider busy, failing over to ${next.label}...\x1b[0m\n`);

      markHot(currentProvider, currentModel, cwd);
      currentProvider = next.provider;
      currentModel    = next.model;
      currentDecision = { ...currentDecision, provider: currentProvider, model: currentModel };
      currentCommand  = buildCommand(currentDecision, prompt, files, cwd);
    }

    const { exitCode, stdout, stderr, durationMs } = lastRaw;
    // ── End failover loop ────────────────────────────────────────────────

    // Extract token usage from JSON output if available
    let usage: TokenUsageInfo | null = null;
    try {
      const parsed = JSON.parse(stdout);
      if (parsed?.usage) {
        usage = { inputTokens: parsed.usage.input_tokens ?? 0, outputTokens: parsed.usage.output_tokens ?? 0 };
      }
    } catch {}

    const success = exitCode === 0;
    const errorText = (stderr || stdout).slice(0, 500);
    const summary = success ? compressResult(stdout) : compressResult(stderr || stdout);

    // ── Health tracking ────────────────────────────────────────────────────
    if (success) {
      recordDuration(currentProvider, currentModel, durationMs);
      const median = medianDuration(currentProvider, currentModel);
      if (median !== null && durationMs > median * 3) {
        markDegraded(currentProvider, currentModel, cwd);
      } else {
        markHealthy(currentProvider, currentModel, cwd);
      }
      const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      recordDispatch(currentProvider, currentModel, totalTokens, cwd);
    } else {
      if (RATE_LIMIT_PATTERNS.test(errorText)) {
        markHot(currentProvider, currentModel, cwd);
      }
    }
    // ── End health tracking ────────────────────────────────────────────────

    recordUsage({
      provider: currentProvider,
      model:    currentModel,
      tier,
      durationMs,
      inputTokens:  usage?.inputTokens  ?? null,
      outputTokens: usage?.outputTokens ?? null,
      success,
    });

    // ── Auto-review annotation ────────────────────────────────────────────────
    // When execution changed files at medium+ risk, stamp result with a pending
    // review note. The opposite provider from the one that did the work reviews
    // it (true dual-brain). Non-blocking — does not delay the return value.
    let autoReview: { triggered: boolean; provider?: string; status?: string; reason?: string };
    if (success && (decision.risk === 'medium' || decision.risk === 'high' || decision.risk === 'critical')) {
      try {
        const reviewProvider = currentProvider === 'claude' ? 'openai' : 'claude';
        autoReview = { triggered: true, provider: reviewProvider, status: 'pending' };
      } catch {
        autoReview = { triggered: false, reason: 'review-dispatch-failed' };
      }
    } else {
      autoReview = { triggered: false, reason: success ? 'low-risk' : 'dispatch-failed' };
    }
    // ── End auto-review annotation ────────────────────────────────────────────

    const nativeResult: DispatchResult = {
      status:        success ? 'completed' : 'failed',
      type:          'native-agent',
      provider:      currentProvider,
      model:         currentModel,
      specialist:    specialist ?? 'generic',
      command:       currentCommand,
      nativeDispatch: nativeDescriptor,
      exitCode,
      summary,
      durationMs,
      usage,
      worktreeUsed:  useWorktree,
      autoReview,
      authVerified:  true,
      error: success ? null : errorText.slice(0, 200),
    };
    try {
      const outcomeModule = await import('./outcome.js');
      (outcomeModule.recordDispatchOutcome as (a: unknown, b: unknown) => unknown)(input, nativeResult);
    } catch { /* never block */ }

    // ── Self-correction: intelligent retry after failover exhaustion ──────────
    if (!success) {
      const attemptNumber = input._retryAttempt || 1;
      try {
        const selfCorrectModule = await import('./self-correct.js');
        const retry = (selfCorrectModule.shouldRetry as (a: unknown, b: unknown, c: unknown) => unknown)(nativeResult, decision, attemptNumber) as {
          retry: boolean;
          decision?: Record<string, unknown>;
          strategy?: string;
          reason?: string;
        };
        if (retry.retry && retry.decision) {
          if (verbose) process.stderr.write(`[dual-brain] self-correct: ${retry.strategy} (attempt ${attemptNumber + 1}, reason: ${retry.reason})\n`);
          return dispatch({
            ...input,
            decision: retry.decision,
            _retryAttempt: attemptNumber + 1,
            _skipPreDispatchThink: retry.strategy !== 'rethink',
            _skipRelatedContext: true,
          });
        } else if (verbose) {
          process.stderr.write(`[dual-brain] self-correct: giving up (${retry.reason})\n`);
        }
      } catch { /* non-blocking — if self-correct fails, return original failure */ }
    }
    // ── End self-correction ───────────────────────────────────────────────────

    return nativeResult;
  }

  const command = buildCommand(effectiveDecision, prompt, files, cwd);

  if (dryRun) {
    return { status: 'dry-run', provider: effectiveProvider, model: effectiveModel, specialist: specialist ?? 'generic', command, exitCode: null, summary: null, durationMs: 0, usage: null, error: null, authVerified: true };
  }

  // Record this dispatch against the budget
  _recordDispatchBudget(prompt);

  // ── Auto-heal failover retry loop (subprocess path) ──────────────────────
  const MAX_FAILOVER_ATTEMPTS_SUB = 2;
  let subProvider = effectiveProvider;
  let subModel    = effectiveModel;
  let subDecision = effectiveDecision;
  let subCommand  = command;
  let subRaw: ProcessResult = { exitCode: 1, stdout: '', stderr: '', durationMs: 0 };

  for (let attempt = 0; attempt <= MAX_FAILOVER_ATTEMPTS_SUB; attempt++) {
    subRaw = await runProcess(subCommand, cwd, timeoutMs);
    if (subRaw.exitCode === 0 || !isRetryableFailure(subRaw) || attempt === MAX_FAILOVER_ATTEMPTS_SUB) break;

    const failoverList = getFailoverOrder(
      { provider: subProvider, model: subModel, tier },
      input.profile ?? {},
    ) as Array<{ provider: string; model: string; label: string }>;
    if (failoverList.length === 0) break;

    const next   = failoverList[0];
    const reason = `${subRaw.stderr || subRaw.stdout}`.slice(0, 120);
    logFailover({ from: `${subProvider}/${subModel}`, to: `${next.provider}/${next.model}`, reason, attempt: attempt + 1 });
    process.stderr.write(`\x1b[2m[dual-brain] Provider busy, failing over to ${next.label}...\x1b[0m\n`);

    markHot(subProvider, subModel, cwd);
    subProvider = next.provider;
    subModel    = next.model;
    subDecision = { ...subDecision, provider: subProvider, model: subModel };
    subCommand  = buildCommand(subDecision, prompt, files, cwd);
  }

  const { exitCode, stdout, stderr, durationMs } = subRaw;
  // ── End failover loop ──────────────────────────────────────────────────────

  // Extract token usage from JSON output if available
  let usage: TokenUsageInfo | null = null;
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
    recordDuration(subProvider, subModel, durationMs);
    const median = medianDuration(subProvider, subModel);
    if (median !== null && durationMs > median * 3) {
      markDegraded(subProvider, subModel, cwd);
    } else {
      markHealthy(subProvider, subModel, cwd);
    }
    const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    recordDispatch(subProvider, subModel, totalTokens, cwd);
  } else {
    if (RATE_LIMIT_PATTERNS.test(errorText)) {
      markHot(subProvider, subModel, cwd);
    }
  }
  // ── End health tracking ──────────────────────────────────────────────────

  recordUsage({
    provider: subProvider,
    model:    subModel,
    tier,
    durationMs,
    inputTokens:  usage?.inputTokens  ?? null,
    outputTokens: usage?.outputTokens ?? null,
    success,
  });

  // ── Auto-review annotation ──────────────────────────────────────────────────
  // When execution changed files at medium+ risk, stamp result with a pending
  // review note. The opposite provider from the one that did the work reviews
  // it (true dual-brain). Non-blocking — does not delay the return value.
  let autoReview: { triggered: boolean; provider?: string; status?: string; reason?: string };
  if (success && (decision.risk === 'medium' || decision.risk === 'high' || decision.risk === 'critical')) {
    try {
      const reviewProvider = subProvider === 'claude' ? 'openai' : 'claude';
      autoReview = { triggered: true, provider: reviewProvider, status: 'pending' };
    } catch {
      autoReview = { triggered: false, reason: 'review-dispatch-failed' };
    }
  } else {
    autoReview = { triggered: false, reason: success ? 'low-risk' : 'dispatch-failed' };
  }
  // ── End auto-review annotation ──────────────────────────────────────────────

  const subResult: DispatchResult = {
    status:      success ? 'completed' : 'failed',
    provider:    subProvider,
    model:       subModel,
    specialist:  specialist ?? 'generic',
    command:     subCommand,
    exitCode,
    summary,
    durationMs,
    usage,
    worktreeUsed: useWorktree,
    autoReview,
    authVerified: true,
    error: success ? null : errorText.slice(0, 200),
  };
  try {
    const outcomeModule2 = await import('./outcome.js');
    (outcomeModule2.recordDispatchOutcome as (a: unknown, b: unknown) => unknown)(input, subResult);
  } catch { /* never block */ }

  // ── Self-correction: intelligent retry after failover exhaustion ──────────
  if (!success) {
    const attemptNumber = input._retryAttempt || 1;
    try {
      const selfCorrectModule2 = await import('./self-correct.js');
      const retry = (selfCorrectModule2.shouldRetry as (a: unknown, b: unknown, c: unknown) => unknown)(subResult, decision, attemptNumber) as {
        retry: boolean;
        decision?: Record<string, unknown>;
        strategy?: string;
        reason?: string;
      };
      if (retry.retry && retry.decision) {
        if (verbose) process.stderr.write(`[dual-brain] self-correct: ${retry.strategy} (attempt ${attemptNumber + 1}, reason: ${retry.reason})\n`);
        return dispatch({
          ...input,
          decision: retry.decision,
          _retryAttempt: attemptNumber + 1,
          _skipPreDispatchThink: retry.strategy !== 'rethink',
          _skipRelatedContext: true,
        });
      } else if (verbose) {
        process.stderr.write(`[dual-brain] self-correct: giving up (${retry.reason})\n`);
      }
    } catch { /* non-blocking — if self-correct fails, return original failure */ }
  }
  // ── End self-correction ───────────────────────────────────────────────────

  return subResult;
}

// ─── Dual-brain dispatch (parallel) ───────────────────────────────────────────
async function dispatchDualBrain(input: DispatchInput = {}): Promise<DualBrainResult> {
  const { files = [], cwd = process.cwd(), dryRun = false, verbose = false } = input;
  let decision: Record<string, unknown> = (input.decision as Record<string, unknown>) ?? {};
  let prompt = input.prompt as string;
  if (!prompt) throw new Error('prompt is required');

  // Safety gate: redact secrets before sending to either provider
  prompt = redact(prompt);

  // Stamp with dispatch marker so enforce-tier.mjs allows this Agent call
  // Compute required tier for governance validation
  try {
    const scores = scoreTask({ intent: decision.tier as string | undefined, risk: decision.risk as string | undefined, files, objective: prompt.slice(0, 200) });
    decision = { ...decision, _requiredTier: computeRequiredTier(scores) };
  } catch { /* non-blocking */ }
  prompt = _prependDispatchMarker(prompt, decision);

  // ── Situation brief injection ────────────────────────────────────────────────
  const _dualBrainBrief = typeof input.situationBrief === 'string' && input.situationBrief.trim()
    ? input.situationBrief.trim()
    : null;
  if (_dualBrainBrief) {
    prompt = `[SITUATION BRIEF]\n${_dualBrainBrief}\n[END BRIEF]\n\n${prompt}`;
  }
  // ── End situation brief ──────────────────────────────────────────────────────

  // Feature 1: Validate both sub-decisions before spawning anything
  const rt = await detectRuntime();
  const tier = (decision.tier as string) ?? 'execute';

  const claudeDecision: Record<string, unknown> = { ...decision, provider: 'claude', model: (decision.model as string) ?? 'sonnet', tier };
  const _oaiDefault = tier === 'think' ? 'o3' : tier === 'search' ? 'gpt-4o-mini' : 'gpt-4o';
  const openaiDecision: Record<string, unknown> = { ...decision, provider: 'openai', model: (decision.openaiModel as string) ?? _oaiDefault, tier };

  const validatedClaude = validateDispatch(claudeDecision, rt);
  const validatedOpenai = validateDispatch(openaiDecision, rt);

  const [claudeResult, openaiResult] = await Promise.all([
    validatedClaude._error
      ? Promise.resolve({ status: 'error', provider: 'claude', model: claudeDecision.model as string, command: null, exitCode: null, summary: validatedClaude._error, durationMs: 0, usage: null, error: validatedClaude._error } as DispatchResult)
      : dispatch({ decision: validatedClaude, prompt, files, cwd, dryRun, verbose }),
    validatedOpenai._error
      ? Promise.resolve({ status: 'error', provider: 'openai', model: openaiDecision.model as string, command: null, exitCode: null, summary: validatedOpenai._error, durationMs: 0, usage: null, error: validatedOpenai._error } as DispatchResult)
      : dispatch({ decision: validatedOpenai, prompt, files, cwd, dryRun, verbose }),
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
  const flag = (name: string): string | true | null => { const i = args.indexOf(name); return i !== -1 ? (args[i + 1] ?? true) : null; };

  if (args.includes('--detect-runtime')) {
    const rt = await detectRuntime();
    console.log(JSON.stringify(rt, null, 2));
    process.exit(0);
  }

  const prompt = flag('--prompt') || args.find(a => !a.startsWith('--'));
  if (!prompt) {
    console.error('Usage: node src/dispatch.ts --prompt "..." [--provider claude|openai] [--model sonnet] [--tier execute] [--dry-run]');
    console.error('       node src/dispatch.ts --detect-runtime');
    process.exit(1);
  }

  const decision: Record<string, unknown> = {
    provider: flag('--provider') || 'claude',
    model:    flag('--model')    || 'sonnet',
    tier:     flag('--tier')     || 'execute',
    effort:   flag('--effort')   || null,
  };

  try {
    const result = await dispatch({ decision, prompt: prompt as string, dryRun: args.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
  } catch (err: unknown) {
    console.error('dispatch error:', (err as Error).message);
    process.exit(1);
  }
}

export { dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain, validateDispatch, checkWorktreeClean, getRetryBudget, isInsideClaude, buildNativeDispatch, normalizeResult, loadSpecialistPrompt, preflightAuth };
