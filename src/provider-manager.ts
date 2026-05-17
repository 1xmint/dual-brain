/**
 * provider-manager.ts — Provider health, failover, and rate-limit management
 *
 * The "invisible failover" layer: when Claude is rate-limited, work seamlessly
 * continues on GPT. When GPT is down, Claude handles everything.
 *
 * State storage:
 *   - Provider states: .dual-brain/providers/{provider}.json (atomic writes)
 *   - Global dispatch log: .dual-brain/dispatch-log.ndjson (append-only)
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson, readJsonSafe } from './integrity.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum dispatches allowed per rolling window (default: 30 per 5 min). */
export const MAX_DISPATCHES_PER_WINDOW = 30;

/** Default rolling window in minutes. */
export const DEFAULT_WINDOW_MINUTES = 5;

/** Cooldown duration in ms when rate-limited without a known reset time. */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/** Consecutive failures before marking a provider as "down". */
const DOWN_THRESHOLD = 5;

/** Consecutive failures before marking a provider as "degraded". */
const DEGRADED_THRESHOLD = 2;

/** Known providers. */
const KNOWN_PROVIDERS = ['anthropic', 'openai'] as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProviderState {
  provider: 'anthropic' | 'openai';
  status: 'healthy' | 'degraded' | 'rate-limited' | 'down';
  lastCheck: string;
  lastSuccess: string;
  lastFailure?: string;
  cooldownUntil?: string;
  remainingCapacity: number; // 0-1 estimated
  recentDispatches: number;  // in current window
  consecutiveFailures: number;
}

export interface FailoverResult {
  provider: string;
  model: string;
  reason: string;
  wasFailover: boolean;
}

export interface DispatchPermission {
  allowed: boolean;
  reason: string;
  suggestedDelay?: number;
  alternativeProvider?: string;
}

interface DispatchLogEntry {
  provider: string;
  model: string;
  taskId: string;
  timestamp: string;
}

// ─── Path helpers ───────────────────────────────────────────────────────────

function providersDir(cwd?: string): string {
  return join(cwd || process.cwd(), '.dual-brain', 'providers');
}

function providerFile(provider: string, cwd?: string): string {
  return join(providersDir(cwd), `${provider}.json`);
}

function dispatchLogPath(cwd?: string): string {
  return join(cwd || process.cwd(), '.dual-brain', 'dispatch-log.ndjson');
}

// ─── Default state ──────────────────────────────────────────────────────────

function defaultState(provider: 'anthropic' | 'openai'): ProviderState {
  const now = new Date().toISOString();
  return {
    provider,
    status: 'healthy',
    lastCheck: now,
    lastSuccess: now,
    remainingCapacity: 1,
    recentDispatches: 0,
    consecutiveFailures: 0,
  };
}

// ─── Tier-to-model mapping (for failover) ───────────────────────────────────

const TIER_MODELS: Record<number, Record<string, string>> = {
  // tier 1: cheap/fast search
  1: { anthropic: 'claude-haiku', openai: 'gpt-4.1-mini' },
  // tier 2: routine execution
  2: { anthropic: 'claude-sonnet', openai: 'gpt-4.1' },
  // tier 3: complex reasoning
  3: { anthropic: 'claude-sonnet', openai: 'o4-mini' },
  // tier 4: heavy thinking / architecture
  4: { anthropic: 'claude-opus', openai: 'o3' },
};

function modelForTier(tier: number, provider: string): string {
  const clamped = Math.max(1, Math.min(4, tier));
  return TIER_MODELS[clamped]?.[provider] ?? (provider === 'anthropic' ? 'claude-sonnet' : 'gpt-4.1');
}

// Map a model name back to an approximate tier
function tierForModel(model: string): number {
  const lower = model.toLowerCase();
  if (lower.includes('haiku') || lower.includes('mini')) return 1;
  if (lower.includes('opus') || lower === 'o3') return 4;
  if (lower.includes('o4-mini')) return 3;
  return 2;
}

// ─── Provider state I/O ─────────────────────────────────────────────────────

/**
 * Get the current health state for a provider.
 */
export function getProviderState(provider: string, cwd?: string): ProviderState {
  const p = provider === 'claude' ? 'anthropic' : provider;
  const filePath = providerFile(p, cwd);

  if (!existsSync(filePath)) {
    return defaultState(p as 'anthropic' | 'openai');
  }

  const raw = readJsonSafe(filePath);
  if (!raw || typeof raw !== 'object') {
    return defaultState(p as 'anthropic' | 'openai');
  }

  const state = raw as Record<string, unknown>;

  // Re-evaluate cooldown: if cooldownUntil has passed, transition to healthy
  if (state.status === 'rate-limited' && state.cooldownUntil) {
    const cooldownEnd = new Date(state.cooldownUntil as string).getTime();
    if (Date.now() >= cooldownEnd) {
      const updated: ProviderState = {
        ...(state as unknown as ProviderState),
        status: 'healthy',
        cooldownUntil: undefined,
        consecutiveFailures: 0,
        remainingCapacity: 0.5, // conservative after cooldown
        lastCheck: new Date().toISOString(),
      };
      atomicWriteJson(filePath, updated);
      return updated;
    }
  }

  // Attach recent dispatch count from the log
  const dispatches = countRecentDispatches(p, DEFAULT_WINDOW_MINUTES, cwd);

  return {
    provider: p as 'anthropic' | 'openai',
    status: (state.status as ProviderState['status']) || 'healthy',
    lastCheck: (state.lastCheck as string) || new Date().toISOString(),
    lastSuccess: (state.lastSuccess as string) || new Date().toISOString(),
    lastFailure: state.lastFailure as string | undefined,
    cooldownUntil: state.cooldownUntil as string | undefined,
    remainingCapacity: typeof state.remainingCapacity === 'number' ? state.remainingCapacity : 1,
    recentDispatches: dispatches,
    consecutiveFailures: typeof state.consecutiveFailures === 'number' ? state.consecutiveFailures : 0,
  };
}

/**
 * Get health states for all known providers.
 */
export function getAllProviderStates(cwd?: string): ProviderState[] {
  return KNOWN_PROVIDERS.map(p => getProviderState(p, cwd));
}

// ─── State mutations ────────────────────────────────────────────────────────

function saveState(state: ProviderState, cwd?: string): void {
  const filePath = providerFile(state.provider, cwd);
  atomicWriteJson(filePath, state);
}

/**
 * Record a successful dispatch to a provider.
 */
export function recordSuccess(provider: string, model: string, cwd?: string): void {
  const p = (provider === 'claude' ? 'anthropic' : provider) as 'anthropic' | 'openai';
  const current = getProviderState(p, cwd);

  const updated: ProviderState = {
    ...current,
    status: 'healthy',
    lastCheck: new Date().toISOString(),
    lastSuccess: new Date().toISOString(),
    cooldownUntil: undefined,
    consecutiveFailures: 0,
    // Nudge capacity up on success, cap at 1
    remainingCapacity: Math.min(1, current.remainingCapacity + 0.1),
  };

  saveState(updated, cwd);
}

/**
 * Record a dispatch failure. Detects rate limits automatically.
 */
export function recordFailure(provider: string, model: string, error: string, cwd?: string): void {
  const p = (provider === 'claude' ? 'anthropic' : provider) as 'anthropic' | 'openai';

  // Check if this is a rate limit
  const rl = detectRateLimit(error);
  if (rl.isRateLimit) {
    recordRateLimit(p, rl.resetTime, cwd);
    return;
  }

  const current = getProviderState(p, cwd);
  const failures = current.consecutiveFailures + 1;

  let status: ProviderState['status'] = current.status;
  if (failures >= DOWN_THRESHOLD) {
    status = 'down';
  } else if (failures >= DEGRADED_THRESHOLD) {
    status = 'degraded';
  }

  const updated: ProviderState = {
    ...current,
    status,
    lastCheck: new Date().toISOString(),
    lastFailure: new Date().toISOString(),
    consecutiveFailures: failures,
    remainingCapacity: Math.max(0, current.remainingCapacity - 0.2),
  };

  saveState(updated, cwd);
}

/**
 * Explicitly record a rate limit event.
 */
export function recordRateLimit(provider: string, resetTime?: string, cwd?: string): void {
  const p = (provider === 'claude' ? 'anthropic' : provider) as 'anthropic' | 'openai';
  const current = getProviderState(p, cwd);

  const cooldownUntil = resetTime
    ? new Date(resetTime).toISOString()
    : new Date(Date.now() + DEFAULT_COOLDOWN_MS).toISOString();

  const updated: ProviderState = {
    ...current,
    status: 'rate-limited',
    lastCheck: new Date().toISOString(),
    lastFailure: new Date().toISOString(),
    cooldownUntil,
    remainingCapacity: 0,
    consecutiveFailures: current.consecutiveFailures + 1,
  };

  saveState(updated, cwd);
}

// ─── Pre-dispatch checks ────────────────────────────────────────────────────

/**
 * Check whether dispatching to a provider is allowed right now.
 */
export function canDispatch(provider: string, cwd?: string): DispatchPermission {
  const p = provider === 'claude' ? 'anthropic' : provider;
  const state = getProviderState(p, cwd);
  const other = p === 'anthropic' ? 'openai' : 'anthropic';

  // 1. Rate-limited with active cooldown
  if (state.status === 'rate-limited' && state.cooldownUntil) {
    const remaining = new Date(state.cooldownUntil).getTime() - Date.now();
    if (remaining > 0) {
      return {
        allowed: false,
        reason: `${p} is rate-limited, cooldown expires in ${Math.ceil(remaining / 1000)}s`,
        suggestedDelay: remaining,
        alternativeProvider: other,
      };
    }
    // Cooldown expired — allow but note it
  }

  // 2. Provider is down
  if (state.status === 'down') {
    return {
      allowed: false,
      reason: `${p} is down (${state.consecutiveFailures} consecutive failures)`,
      alternativeProvider: other,
    };
  }

  // 3. Global dispatch budget check
  if (!isWithinBudget(MAX_DISPATCHES_PER_WINDOW, DEFAULT_WINDOW_MINUTES, cwd)) {
    return {
      allowed: false,
      reason: `Global dispatch limit reached (${MAX_DISPATCHES_PER_WINDOW} per ${DEFAULT_WINDOW_MINUTES}min)`,
      suggestedDelay: 60_000,
    };
  }

  // 4. Degraded — allow but warn
  if (state.status === 'degraded') {
    return {
      allowed: true,
      reason: `${p} is degraded (${state.consecutiveFailures} failures), proceeding with caution`,
    };
  }

  return { allowed: true, reason: `${p} is healthy` };
}

// ─── Failover ───────────────────────────────────────────────────────────────

/**
 * If the preferred provider cannot handle work right now, find the best alternative.
 */
export function getFailoverTarget(
  preferredProvider: string,
  preferredModel: string,
  cwd?: string,
): FailoverResult {
  const p = preferredProvider === 'claude' ? 'anthropic' : preferredProvider;
  const permission = canDispatch(p, cwd);

  if (permission.allowed) {
    return {
      provider: p,
      model: preferredModel,
      reason: permission.reason,
      wasFailover: false,
    };
  }

  // Attempt failover to the other provider
  const other = p === 'anthropic' ? 'openai' : 'anthropic';
  const otherPermission = canDispatch(other, cwd);

  if (otherPermission.allowed) {
    // Map the model to an equivalent tier on the other provider
    const tier = tierForModel(preferredModel);
    const altModel = modelForTier(tier, other);

    return {
      provider: other,
      model: altModel,
      reason: `Failover from ${p} (${permission.reason}). Using ${other}:${altModel}`,
      wasFailover: true,
    };
  }

  // Both providers unavailable — return the preferred with a warning
  return {
    provider: p,
    model: preferredModel,
    reason: `Both providers unavailable. ${p}: ${permission.reason}. ${other}: ${otherPermission.reason}`,
    wasFailover: false,
  };
}

/**
 * Choose the best provider right now based on health + task tier.
 */
export function selectProvider(
  taskTier: number,
  preferredProvider?: string,
  cwd?: string,
): FailoverResult {
  // If a preference is given, try it first
  if (preferredProvider) {
    const model = modelForTier(taskTier, preferredProvider === 'claude' ? 'anthropic' : preferredProvider);
    return getFailoverTarget(preferredProvider, model, cwd);
  }

  // No preference: pick the healthiest provider
  const states = getAllProviderStates(cwd);

  // Sort by: healthy > degraded > rate-limited > down, then by remaining capacity
  const statusOrder: Record<string, number> = {
    healthy: 0,
    degraded: 1,
    'rate-limited': 2,
    down: 3,
  };

  states.sort((a, b) => {
    const sDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (sDiff !== 0) return sDiff;
    return b.remainingCapacity - a.remainingCapacity;
  });

  const best = states[0];
  const model = modelForTier(taskTier, best.provider);

  return {
    provider: best.provider,
    model,
    reason: `Selected ${best.provider} (status: ${best.status}, capacity: ${Math.round(best.remainingCapacity * 100)}%)`,
    wasFailover: false,
  };
}

// ─── Global dispatch counter ────────────────────────────────────────────────

function countRecentDispatches(
  provider: string | undefined,
  windowMinutes: number,
  cwd?: string,
): number {
  const logPath = dispatchLogPath(cwd);
  if (!existsSync(logPath)) return 0;

  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  let count = 0;

  try {
    const lines = readFileSync(logPath, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry: DispatchLogEntry = JSON.parse(line);
        const ts = new Date(entry.timestamp).getTime();
        if (ts >= cutoff) {
          if (!provider || entry.provider === provider) {
            count++;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    return 0;
  }

  return count;
}

/**
 * Get the total number of dispatches across all providers in the given window.
 */
export function getGlobalDispatchCount(windowMinutes?: number, cwd?: string): number {
  return countRecentDispatches(undefined, windowMinutes ?? DEFAULT_WINDOW_MINUTES, cwd);
}

/**
 * Append a dispatch attempt to the global log (file-based, shared across processes).
 */
export function recordDispatchAttempt(
  provider: string,
  model: string,
  taskId: string,
  cwd?: string,
): void {
  const logPath = dispatchLogPath(cwd);
  const dir = join(cwd || process.cwd(), '.dual-brain');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const entry: DispatchLogEntry = {
    provider: provider === 'claude' ? 'anthropic' : provider,
    model,
    taskId,
    timestamp: new Date().toISOString(),
  };

  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

/**
 * Check whether dispatch rate is within budget.
 */
export function isWithinBudget(
  maxPerWindow?: number,
  windowMinutes?: number,
  cwd?: string,
): boolean {
  const max = maxPerWindow ?? MAX_DISPATCHES_PER_WINDOW;
  const window = windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  return getGlobalDispatchCount(window, cwd) < max;
}

// ─── Rate limit detection ───────────────────────────────────────────────────

const RATE_LIMIT_PATTERNS = [
  /429/i,
  /rate.?limit/i,
  /too many requests/i,
  /capacity/i,
  /quota/i,
  /exceeded/i,
  /throttl/i,
  /overloaded/i,
];

/**
 * Parse an error message for rate limit signals.
 */
export function detectRateLimit(error: string): { isRateLimit: boolean; resetTime?: string } {
  if (!error) return { isRateLimit: false };

  const isRateLimit = RATE_LIMIT_PATTERNS.some(p => p.test(error));
  if (!isRateLimit) return { isRateLimit: false };

  // Try to extract a reset time from the error
  // Common patterns: "retry after 123s", "Retry-After: 123", "reset at 2024-..."
  let resetTime: string | undefined;

  const retryAfterMatch = error.match(/retry.?after:?\s*(\d+)/i);
  if (retryAfterMatch) {
    const seconds = parseInt(retryAfterMatch[1], 10);
    resetTime = new Date(Date.now() + seconds * 1000).toISOString();
  }

  const isoMatch = error.match(/reset.+?(20\d{2}-\d{2}-\d{2}T[\d:.]+Z?)/i);
  if (!resetTime && isoMatch) {
    resetTime = new Date(isoMatch[1]).toISOString();
  }

  return { isRateLimit, resetTime };
}

// ─── Health summary ─────────────────────────────────────────────────────────

/**
 * One-line health status string for TUI display.
 */
export function getHealthSummary(cwd?: string): string {
  const states = getAllProviderStates(cwd);
  const dispatches = getGlobalDispatchCount(DEFAULT_WINDOW_MINUTES, cwd);

  const parts = states.map(s => {
    const icon = s.status === 'healthy' ? 'OK'
      : s.status === 'degraded' ? 'WARN'
      : s.status === 'rate-limited' ? 'LIMIT'
      : 'DOWN';
    return `${s.provider}:${icon}`;
  });

  parts.push(`${dispatches}/${MAX_DISPATCHES_PER_WINDOW} dispatches`);

  return parts.join(' | ');
}
