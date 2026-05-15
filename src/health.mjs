#!/usr/bin/env node
/**
 * health.mjs — Reactive provider health tracking for the Dual-Brain Orchestrator.
 *
 * Replaces budget-pressure estimation with real cooldown state persisted to
 * .dualbrain/health.json.  No external dependencies.
 *
 * Exports: getHealth, markHot, markDegraded, markHealthy, checkCooldown,
 *          getProviderScore, recordDispatch, getSessionStats, resetHealth
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Auth status (delegates to replit-tools when available) ──────────────────

/**
 * Get Claude auth status, preferring replit-tools as the authoritative source.
 *
 * Returns:
 *   { ok: boolean, detail: string, source: 'replit-tools' | 'direct' | 'unknown' }
 *
 * @param {string} [cwd]
 */
export async function getAuthHealthStatus(cwd) {
  const root = cwd ?? process.cwd();

  // Try replit-tools first (dynamic import — never breaks if absent)
  try {
    const { getAuthStatus } = await import('./replit.mjs');
    const status = getAuthStatus(root);
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
      const creds = JSON.parse(readFileSync(p, 'utf8'));
      const oauth = creds?.claudeAiOauth;
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
      const data = JSON.parse(readFileSync(p, 'utf8'));
      if (data?.oauthAccount || data?.apiKey) {
        return { ok: true, detail: 'Auth: OK (direct check via .claude.json)', source: 'direct' };
      }
    } catch {
      // continue
    }
  }

  return { ok: false, detail: 'Auth: no credentials found (direct check)', source: 'unknown' };
}

const HEALTH_FILE = '.dualbrain/health.json';

// Cooldown ladder in minutes: index = attempts - 1, capped at last entry
const COOLDOWN_LADDER = [5, 15, 45];
// Window in which repeated hot marks escalate the ladder (ms)
const ESCALATION_WINDOW_MS = 2 * 60 * 60 * 1000;

// ─── File I/O ────────────────────────────────────────────────────────────────

function healthPath(cwd) {
  return join(cwd ?? process.cwd(), HEALTH_FILE);
}

function loadRaw(cwd) {
  const p = healthPath(cwd);
  if (!existsSync(p)) return { states: {}, session: null };
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { states: {}, session: null }; }
}

function saveRaw(data, cwd) {
  const p = healthPath(cwd);
  mkdirSync(join(cwd ?? process.cwd(), '.dualbrain'), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function key(provider, modelClass) {
  return `${provider}:${modelClass}`;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

function ensureSession(data) {
  if (!data.session || typeof data.session !== 'object') {
    data.session = { startedAt: new Date().toISOString(), dispatches: [] };
  }
  if (!Array.isArray(data.session.dispatches)) data.session.dispatches = [];
  return data;
}

// ─── Exported: getHealth ─────────────────────────────────────────────────────

/**
 * Return the raw health data (states + session).
 * @param {string} [cwd]
 * @returns {{ states: object, session: object }}
 */
export function getHealth(cwd) {
  return loadRaw(cwd);
}

// ─── Exported: markHot ───────────────────────────────────────────────────────

/**
 * Mark a provider+model as hot (rate-limited).  Escalates cooldown on repeat.
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 */
export function markHot(provider, modelClass, cwd) {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const existing = data.states[k] ?? {};
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
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 */
export function markDegraded(provider, modelClass, cwd) {
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
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 */
export function markHealthy(provider, modelClass, cwd) {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  data.states[k] = { status: 'healthy', since: new Date().toISOString() };
  saveRaw(data, cwd);
}

// ─── Exported: checkCooldown ─────────────────────────────────────────────────

/**
 * Returns true if the cooldown for a hot provider+model has expired.
 * Side-effect: transitions status from 'hot' to 'probing' when expired.
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 * @returns {boolean} true = cooldown expired, ready to probe
 */
export function checkCooldown(provider, modelClass, cwd) {
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
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 * @returns {number}
 */
export function getProviderScore(provider, modelClass, cwd) {
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
 * @param {string} provider
 * @param {string} modelClass
 * @param {number} tokens
 * @param {string} [cwd]
 */
export function recordDispatch(provider, modelClass, tokens, cwd) {
  const data = ensureSession(loadRaw(cwd));
  data.session.dispatches.push({
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
 * @param {string} [cwd]
 * @returns {{ [provider: string]: { calls: number, tokens: number } }}
 */
export function getSessionStats(cwd) {
  const { session } = loadRaw(cwd);
  const stats = {};
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
 * @param {string} [cwd]
 */
export function resetHealth(cwd) {
  saveRaw({ states: {}, session: null }, cwd);
}

// ─── Remaining cooldown helper (used by status display) ──────────────────────

/**
 * Returns remaining cooldown in minutes for a hot provider+model, or 0.
 * @param {string} provider
 * @param {string} modelClass
 * @param {string} [cwd]
 * @returns {number}
 */
export function remainingCooldownMinutes(provider, modelClass, cwd) {
  const data = loadRaw(cwd);
  const k = key(provider, modelClass);
  const state = data.states[k];
  if (!state || state.status !== 'hot') return 0;
  const elapsedMs = Date.now() - Date.parse(state.since);
  const cooldownMs = (state.cooldownMinutes ?? 5) * 60 * 1000;
  const remaining = cooldownMs - elapsedMs;
  return remaining > 0 ? Math.ceil(remaining / 60_000) : 0;
}
