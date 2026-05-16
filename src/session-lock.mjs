// session-lock.mjs — Ensures one active HEAD session at a time.
// If two shells/chats open, only one owns the cognitive state.
// The other gets read-only access (can observe but not dispatch).
//
// "One ring rules them all" — no split-brain.

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const LOCK_FILE = join(STATE_DIR, 'session.lock');

const STALE_THRESHOLD_MS = 90_000; // 90 seconds without heartbeat = stale
const HEARTBEAT_INTERVAL_MS = 30_000;

let _heartbeatTimer = null;
let _sessionId = null;

/**
 * @typedef {object} LockResult
 * @property {boolean} acquired - Whether this session owns HEAD
 * @property {string} sessionId - This session's ID
 * @property {string|null} existingSession - ID of the session that already holds the lock (if not acquired)
 * @property {string} mode - 'primary' | 'takeover' | 'readonly'
 */

/**
 * Attempt to acquire the session lock.
 * - If no lock exists or lock is stale: acquire as primary
 * - If lock is fresh and held by another: return readonly
 *
 * @param {object} opts
 * @param {boolean} opts.force - Force takeover even if existing session is fresh
 * @returns {LockResult}
 */
export function acquire({ force = false } = {}) {
  mkdirSync(STATE_DIR, { recursive: true });
  _sessionId = _generateSessionId();

  const existing = _readLock();

  if (!existing) {
    // No lock — claim it
    _writeLock(_sessionId);
    _startHeartbeat();
    return { acquired: true, sessionId: _sessionId, existingSession: null, mode: 'primary' };
  }

  // Same process (re-entry within same session) — always grant
  if (existing.pid === process.pid) {
    _sessionId = existing.sessionId;
    return { acquired: true, sessionId: _sessionId, existingSession: null, mode: 'primary' };
  }

  const age = Date.now() - existing.heartbeat;

  if (age > STALE_THRESHOLD_MS || force) {
    // Stale or forced takeover
    _writeLock(_sessionId);
    _startHeartbeat();
    return { acquired: true, sessionId: _sessionId, existingSession: existing.sessionId, mode: 'takeover' };
  }

  // Another session is active — go readonly
  return { acquired: false, sessionId: _sessionId, existingSession: existing.sessionId, mode: 'readonly' };
}

/**
 * Release the session lock (called at session end).
 */
export function release() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }

  try {
    const existing = _readLock();
    if (existing && existing.sessionId === _sessionId) {
      unlinkSync(LOCK_FILE);
    }
  } catch {}
}

/**
 * Check if this session currently holds the lock.
 * @returns {boolean}
 */
export function isOwner() {
  const existing = _readLock();
  return existing?.sessionId === _sessionId;
}

/**
 * Get current lock status without modifying it.
 * @returns {{active: boolean, sessionId: string|null, age: number|null}}
 */
export function status() {
  const existing = _readLock();
  if (!existing) return { active: false, sessionId: null, age: null };
  return {
    active: (Date.now() - existing.heartbeat) < STALE_THRESHOLD_MS,
    sessionId: existing.sessionId,
    age: Date.now() - existing.heartbeat,
  };
}

/**
 * Manually heartbeat (useful if the automatic timer isn't running).
 */
export function heartbeat() {
  if (!_sessionId) return;
  const existing = _readLock();
  if (existing && existing.sessionId === _sessionId) {
    _writeLock(_sessionId);
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _generateSessionId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function _readLock() {
  try {
    if (!existsSync(LOCK_FILE)) return null;
    return JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function _writeLock(sessionId) {
  const lock = {
    sessionId,
    heartbeat: Date.now(),
    pid: process.pid,
  };
  writeFileSync(LOCK_FILE, JSON.stringify(lock));
}

function _startHeartbeat() {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(() => {
    try {
      const existing = _readLock();
      if (existing && existing.sessionId === _sessionId) {
        _writeLock(_sessionId);
      } else {
        // Someone else took over — stop heartbeating
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
      }
    } catch {}
  }, HEARTBEAT_INTERVAL_MS);

  // Don't keep the process alive just for heartbeats
  if (_heartbeatTimer.unref) _heartbeatTimer.unref();
}
