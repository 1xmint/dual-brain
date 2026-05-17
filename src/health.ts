/**
 * health.ts — Reactive provider health tracking for the Dual-Brain Orchestrator.
 *
 * Replaces budget-pressure estimation with real cooldown state persisted to
 * .dualbrain/health.json.  No external dependencies.
 *
 * Exports: getHealth, markHot, markDegraded, markHealthy, checkCooldown,
 *          getProviderScore, recordDispatch, getSessionStats, resetHealth
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Types ──────────────────────────────────────────────────────────────────

type HealthStatus = 'healthy' | 'degraded' | 'probing' | 'hot';

interface HealthState {
  status: HealthStatus;
  since: string;
  cooldownMinutes?: number;
  attempts?: number;
  probingAt?: string;
}

interface DispatchRecord {
  provider: string;
  model: string;
  tokens: number;
  at: string;
}

interface SessionData {
  startedAt: string;
  dispatches: DispatchRecord[];
}

interface HealthData {
  states: Record<string, HealthState>;
  session: SessionData | null;
}

export interface AuthHealthStatus {
  ok: boolean;
  detail: string;
  source: 'replit-tools' | 'direct' | 'unknown';
}

interface PingOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface PingResult {
  ok: boolean;
  status: 'ok' | 'timeout' | 'error';
  detail?: string;
}

interface HookEntry {
  command: string;
  eventType: string;
}

interface HookResult {
  path: string;
  exists: boolean;
  syntaxValid: boolean;
  source: 'local' | 'global';
  duplicate: boolean;
}

export interface HookHealthResult {
  healthy: boolean;
  hooks: HookResult[];
  conflicts: string[];
  degraded: string[];
  missing: string[];
}

export interface HookSmokeResult {
  path: string;
  failsOpen: boolean;
  stderr?: string;
  error?: string;
}

// ─── Auth status (delegates to replit-tools when available) ──────────────────

/**
 * Get Claude auth status, preferring replit-tools as the authoritative source.
 */
export async function getAuthHealthStatus(cwd?: string): Promise<AuthHealthStatus> {
  const root = cwd ?? process.cwd();

  // Try replit-tools first (dynamic import — never breaks if absent)
  try {
    // @ts-ignore — replit.mjs not yet migrated
    const { getAuthStatus } = await import('./replit.js');
    const status = getAuthStatus(root) as { available: boolean; tokenStatus: string; expiresAt?: string };
    if (status.available) {
      const tokenOk = status.tokenStatus === 'valid' || status.tokenStatus === 'unknown';
      const detail = status.tokenStatus === 'valid'
        ? `Auth: OK (via replit-tools${status.expiresAt ? ', expires ' + status.expiresAt : ''})`
        : status.tokenStatus === 'expired'
          ? 'Auth: expired (via replit-tools)'
          : status.tokenStatus === 'expiring'
            ? 'Auth: expiring soon (via replit-tools)'
            : 'Auth: status unknown (via replit-tools)';
      return { ok: tokenOk, detail, source: 'replit-tools' };
    }
  } catch {
    // replit-tools unavailable — fall through to direct check
  }

  // Fall back: check for .credentials.json directly
  const home = process.env.HOME || '/root';
  const credPaths = [
    join(home, '.claude', '.credentials.json'),
    join(root, '.replit-tools', '.claude-persistent', '.credentials.json'),
    join(root, '.claude-persistent', '.credentials.json'),
  ];

  for (const p of credPaths) {
    if (!existsSync(p)) continue;
    try {
      const creds = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
      const oauth = (creds?.claudeAiOauth ?? null) as { accessToken?: string; expiresAt?: number } | null;
      if (oauth?.accessToken) {
        const remainingMs = oauth.expiresAt ? oauth.expiresAt - Date.now() : Infinity;
        const remainingHours = Math.floor(remainingMs / 1000 / 60 / 60);
        if (remainingMs <= 0) {
          return { ok: false, detail: 'Auth: token expired (direct check)', source: 'direct' };
        }
        return {
          ok: true,
          detail: `Auth: OK (direct check, ${remainingHours}h remaining)`,
          source: 'direct',
        };
      }
    } catch {
      // continue to next path
    }
  }

  // .claude.json oauthAccount check
  const claudeJsonPaths = [
    join(root, '.replit-tools', '.claude-persistent', '.claude.json'),
    join(home, '.claude', '.claude.json'),
  ];
  for (const p of claudeJsonPaths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
      if (data?.oauthAccount || data?.apiKey) {
        return { ok: true, detail: 'Auth: OK (direct check via .claude.json)', source: 'direct' };
      }
    } catch {
      // continue
    }
  }

  return { ok: false, detail: 'Auth: no credentials found (direct check)', source: 'unknown' };
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;

const HEALTH_FILE = '.dualbrain/health.json';

// Cooldown ladder in minutes: index = attempts - 1, capped at last entry
const COOLDOWN_LADDER: readonly number[] = [5, 15, 45];
// Window in which repeated hot marks escalate the ladder (ms)
const ESCALATION_WINDOW_MS = 2 * 60 * 60 * 1000;

// ─── File I/O ────────────────────────────────────────────────────────────────

function healthPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), HEALTH_FILE);
}

function loadRaw(cwd?: string): HealthData {
  const p = healthPath(cwd);
  if (!existsSync(p)) return { states: {}, session: null };
  try { return JSON.parse(readFileSync(p, 'utf8')) as HealthData; } catch { return { states: {}, session: null }; }
}

function saveRaw(data: HealthData, cwd?: string): void {
  const p = healthPath(cwd);
  mkdirSync(join(cwd ?? process.cwd(), '.dualbrain'), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function key(provider: string, modelClass: string): string {
  return `${provider}:${modelClass}`;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function ensureSession(data: HealthData): HealthData {
  if (!data.session || typeof data.session !== 'object') {
    data.session = { startedAt: new Date().toISOString(), dispatches: [] };
  }
  if (!Array.isArray(data.session.dispatches)) data.session.dispatches = [];
  return data;
}

// ─── Exported: getHealth ─────────────────────────────────────────────────────

/**
 * Return the raw health data (states + session).
 */
export function getHealth(cwd?: string): HealthData {
  return loadRaw(cwd);
}

// ─── Exported: markHot ───────────────────────────────────────────────────────

/**
 * Mark a provider+model as hot (rate-limited).  Escalates cooldown on repeat.
 */
export function markHot(provider: string, modelClass: string, cwd?: string): void {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const existing = data.states[k] ?? {} as Partial<HealthState>;
  const now = Date.now();

  // Count how many times this was already marked hot within the escalation window
  let attempts = (existing.attempts ?? 0);
  const sinceMs = existing.since ? now - Date.parse(existing.since) : Infinity;
  if (sinceMs < ESCALATION_WINDOW_MS && existing.status === 'hot') {
    attempts += 1;
  } else if (existing.status !== 'hot') {
    // First time hot (or was healthy/probing before): reset counter to 1
    attempts = 1;
  }
  // Clamp to ladder length
  const ladderIdx = Math.min(attempts - 1, COOLDOWN_LADDER.length - 1);
  const cooldownMinutes = COOLDOWN_LADDER[ladderIdx];

  data.states[k] = {
    status: 'hot',
    since: new Date().toISOString(),
    cooldownMinutes,
    attempts,
  };
  saveRaw(data, cwd);
}

// ─── Exported: markDegraded ──────────────────────────────────────────────────

/**
 * Signal soft degradation (slow responses, elevated errors) without full cooldown.
 */
export function markDegraded(provider: string, modelClass: string, cwd?: string): void {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  // Only downgrade if currently healthy or probing — never upgrade from hot
  if (!data.states[k] || ['healthy', 'probing'].includes(data.states[k].status)) {
    data.states[k] = { status: 'degraded', since: new Date().toISOString() };
    saveRaw(data, cwd);
  }
}

// ─── Exported: markHealthy ───────────────────────────────────────────────────

/**
 * Clear hot/degraded state and reset attempt counter.
 */
export function markHealthy(provider: string, modelClass: string, cwd?: string): void {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  data.states[k] = { status: 'healthy', since: new Date().toISOString() };
  saveRaw(data, cwd);
}

// ─── Exported: checkCooldown ─────────────────────────────────────────────────

/**
 * Returns true if the cooldown for a hot provider+model has expired.
 * Side-effect: transitions status from 'hot' to 'probing' when expired.
 */
export function checkCooldown(provider: string, modelClass: string, cwd?: string): boolean {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const state = data.states[k];
  if (!state || state.status !== 'hot') return true; // not hot → no cooldown

  const sinceMs = Date.parse(state.since);
  const cooldownMs = (state.cooldownMinutes ?? 5) * 60 * 1000;
  const expired = Date.now() - sinceMs >= cooldownMs;

  if (expired) {
    // Transition to probing
    data.states[k] = { ...state, status: 'probing', probingAt: new Date().toISOString() };
    saveRaw(data, cwd);
    return true;
  }
  return false;
}

// ─── Exported: getProviderScore ──────────────────────────────────────────────

/**
 * Returns a 0-100 routing preference score for a provider+model.
 * healthy=100, degraded=50, probing=25, hot=0
 */
export function getProviderScore(provider: string, modelClass: string, cwd?: string): number {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const state = data.states[k];
  if (!state) return 100;
  switch (state.status) {
    case 'healthy':  return 100;
    case 'degraded': return 50;
    case 'probing':  return 25;
    case 'hot':      return 0;
    default:         return 100;
  }
}

// ─── Exported: recordDispatch ────────────────────────────────────────────────

/**
 * Log a successful dispatch for session tracking.
 */
export function recordDispatch(provider: string, modelClass: string, tokens: number, cwd?: string): void {
  const data = ensureSession(loadRaw(cwd));
  data.session!.dispatches.push({
    provider,
    model: modelClass,
    tokens: tokens ?? 0,
    at: new Date().toISOString(),
  });
  saveRaw(data, cwd);
}

// ─── Exported: getSessionStats ───────────────────────────────────────────────

/**
 * Return per-provider aggregated call + token counts for the current session.
 */
export function getSessionStats(cwd?: string): Record<string, { calls: number; tokens: number }> {
  const { session } = loadRaw(cwd);
  const stats: Record<string, { calls: number; tokens: number }> = {};
  for (const d of (session?.dispatches ?? [])) {
    if (!stats[d.provider]) stats[d.provider] = { calls: 0, tokens: 0 };
    stats[d.provider].calls  += 1;
    stats[d.provider].tokens += (d.tokens ?? 0);
  }
  return stats;
}

// ─── Exported: resetHealth ───────────────────────────────────────────────────

/**
 * Wipe all health state (states + session).
 */
export function resetHealth(cwd?: string): void {
  saveRaw({ states: {}, session: null }, cwd);
}

// ─── Network timeout guard ────────────────────────────────────────────────────

/**
 * Ping a provider URL with a bounded timeout so slow networks don't hang the CLI.
 *
 * Uses AbortController to enforce the deadline.  On timeout or network error the
 * caller receives { ok: false, status: 'timeout' } rather than hanging forever.
 */
export async function pingProvider(url: string, opts: PingOptions = {}): Promise<PingResult> {
  const timeoutMs = opts.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: opts.headers ?? {},
    });
    clearTimeout(timer);
    return { ok: res.ok, status: 'ok', detail: String(res.status) };
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: isTimeout ? 'timeout' : 'error',
      detail: isTimeout ? `Provider health: unknown (timeout after ${timeoutMs}ms)` : String(err instanceof Error ? err.message : err),
    };
  }
}

// ─── Remaining cooldown helper (used by status display) ──────────────────────

/**
 * Returns remaining cooldown in minutes for a hot provider+model, or 0.
 */
export function remainingCooldownMinutes(provider: string, modelClass: string, cwd?: string): number {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const state = data.states[k];
  if (!state || state.status !== 'hot') return 0;
  const elapsedMs = Date.now() - Date.parse(state.since);
  const cooldownMs = (state.cooldownMinutes ?? 5) * 60 * 1000;
  const remaining = cooldownMs - elapsedMs;
  return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
}

// ─── Hook health check ────────────────────────────────────────────────────────

/**
 * Extract the file path from a hook command string.
 * Handles patterns like `node /path/to/hook.mjs` or `node /path/to/hook.mjs --flag`.
 * Returns null if the pattern doesn't match.
 */
function extractHookPath(command: unknown): string | null {
  if (typeof command !== 'string') return null;
  const match = command.match(/node\s+([^\s]+\.mjs)/);
  return match ? match[1] : null;
}

/**
 * Collect all hook entries from a settings object, returning
 * [{ command, eventType }] pairs.
 */
function collectHookCommands(settings: Record<string, unknown>): HookEntry[] {
  const entries: HookEntry[] = [];
  const hooks = (settings?.hooks ?? {}) as Record<string, unknown>;
  for (const [eventType, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (const matcher of matchers) {
      const m = matcher as { hooks?: Array<{ type?: string; command?: string }> } | null;
      for (const hook of (m?.hooks ?? [])) {
        if (hook?.type === 'command' && typeof hook.command === 'string') {
          entries.push({ command: hook.command, eventType });
        }
      }
    }
  }
  return entries;
}

/**
 * Load and parse a JSON settings file.  Returns {} on any error.
 */
function loadSettings(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Check the health of all hook files referenced in project-local and global
 * Claude Code settings.
 */
export function checkHookHealth(cwd?: string): HookHealthResult {
  const root = cwd ?? process.cwd();
  const home = process.env.HOME || '/root';

  const localSettingsPath  = join(root, '.claude', 'settings.local.json');
  const globalSettingsPath = join(home, '.claude', 'settings.json');

  const localSettings  = loadSettings(localSettingsPath);
  const globalSettings = loadSettings(globalSettingsPath);

  const localCommands  = collectHookCommands(localSettings);
  const globalCommands = collectHookCommands(globalSettings);

  // Build a set of hook paths from local settings for duplicate detection
  const localPaths  = new Set(localCommands.map(e => extractHookPath(e.command)).filter((p): p is string => p !== null));
  const globalPaths = new Set(globalCommands.map(e => extractHookPath(e.command)).filter((p): p is string => p !== null));

  // Paths that appear in both local and global are conflicts
  const conflictPaths = new Set([...localPaths].filter(p => globalPaths.has(p)));

  const hookResults: HookResult[] = [];
  const conflicts: string[] = [];
  const degraded: string[]  = [];
  const missing: string[]   = [];

  function processEntry(entry: HookEntry, source: 'local' | 'global'): void {
    const path = extractHookPath(entry.command);
    if (!path) return; // non-node hook — skip

    const fileExists = existsSync(path);
    const isDuplicate = conflictPaths.has(path);

    let syntaxValid = false;
    if (fileExists) {
      try {
        const check = spawnSync('node', ['--check', path], {
          timeout: 3000,
          encoding: 'utf8',
        });
        syntaxValid = check.status === 0;
      } catch {
        syntaxValid = false;
      }
    }

    const record: HookResult = { path, exists: fileExists, syntaxValid, source, duplicate: isDuplicate };
    hookResults.push(record);

    if (!fileExists) {
      missing.push(`${source}: ${path} (file not found)`);
    } else if (!syntaxValid) {
      degraded.push(`${source}: ${path} (syntax error)`);
    }

    if (isDuplicate && source === 'global') {
      // Only report the conflict once (when we encounter it from the global side)
      conflicts.push(`Hook defined in both local and global settings: ${path}`);
    }
  }

  for (const entry of localCommands)  processEntry(entry, 'local');
  for (const entry of globalCommands) processEntry(entry, 'global');

  const healthy = missing.length === 0 && degraded.length === 0 && conflicts.length === 0;

  return { healthy, hooks: hookResults, conflicts, degraded, missing };
}

// ─── Hook smoke test ──────────────────────────────────────────────────────────

/**
 * Run a hook with deliberately malformed input to verify it fails open
 * (exits 0 even on bad input, so it never blocks the Claude Code flow).
 */
export function runHookSmoke(hookPath: string): HookSmokeResult {
  try {
    const result = spawnSync('node', [hookPath], {
      input: 'not valid json',
      timeout: 5000,
      encoding: 'utf8',
    });
    // Exit 0 = fails open (good), Exit non-0 = fails closed (bad)
    return { path: hookPath, failsOpen: result.status === 0, stderr: (result.stderr || '').slice(0, 200) };
  } catch {
    return { path: hookPath, failsOpen: false, error: 'smoke test crashed' };
  }
}
