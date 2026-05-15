#!/usr/bin/env node
/**
 * session.mjs — Persist task state between terminal sessions.
 *
 * Exports:
 *   loadSession(cwd)                      → session state or null (if stale/missing)
 *   saveSession(state, cwd)               → write session atomically
 *   updateSession(patch, cwd)             → merge partial update into existing session
 *   clearSession(cwd)                     → delete session file
 *   formatSessionCard(session, repo, health) → compact status card string (≤5 lines)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_FILE   = '.dualbrain/session.json';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── File I/O ─────────────────────────────────────────────────────────────────

function sessionPath(cwd) {
  return join(cwd ?? process.cwd(), SESSION_FILE);
}

function ensureDir(cwd) {
  mkdirSync(join(cwd ?? process.cwd(), '.dualbrain'), { recursive: true });
}

// ─── Schema defaults ──────────────────────────────────────────────────────────

function defaultSession() {
  const now = new Date().toISOString();
  return {
    startedAt:    now,
    updatedAt:    now,
    objective:    null,
    branch:       null,
    filesChanged: [],
    commandsRun:  [],
    lastResult:   null,
    provider:     null,
    nextAction:   null,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Load the session file. Returns null if missing or older than 24 hours.
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function loadSession(cwd = process.cwd()) {
  const p = sessionPath(cwd);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const age = Date.now() - Date.parse(data.updatedAt || data.startedAt || 0);
    if (age > SESSION_TTL_MS) return null;
    return data;
  } catch { return null; }
}

/**
 * Write session state atomically (tmp + rename).
 * @param {object} state
 * @param {string} [cwd]
 */
export function saveSession(state, cwd = process.cwd()) {
  ensureDir(cwd);
  const p   = sessionPath(cwd);
  const tmp = p + '.tmp.' + process.pid;
  const data = {
    ...defaultSession(),
    ...state,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, p);
  return data;
}

/**
 * Merge a partial update into the existing session (or create a new one).
 * @param {object} patch
 * @param {string} [cwd]
 */
export function updateSession(patch, cwd = process.cwd()) {
  const existing = loadSession(cwd) || defaultSession();
  const updated  = { ...existing, ...patch };

  // Arrays: append, don't replace
  if (patch.filesChanged) {
    const combined = [...(existing.filesChanged || []), ...(patch.filesChanged || [])];
    updated.filesChanged = [...new Set(combined)]; // deduplicate
  }
  if (patch.commandsRun) {
    updated.commandsRun = [...(existing.commandsRun || []), ...(patch.commandsRun || [])];
  }

  return saveSession(updated, cwd);
}

/**
 * Delete the session file.
 * @param {string} [cwd]
 */
export function clearSession(cwd = process.cwd()) {
  const p = sessionPath(cwd);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* non-fatal */ }
  }
}

// ─── Session card formatting ──────────────────────────────────────────────────

/**
 * Format a compact status card (≤5 lines) for display when running `dual-brain`.
 *
 * @param {object|null} session — from loadSession()
 * @param {object}      repo    — from detectRepo() / loadRepoCache()
 * @param {object}      health  — from getHealth()  (shape: { states: {}, session: {} })
 * @returns {string}
 */
export function formatSessionCard(session, repo, health) {
  const lines = [];

  // Line 1: Repo identity
  const repoParts = [];
  if (repo.name)           repoParts.push(repo.name);
  if (repo.type !== 'unknown') {
    const typeLabel = repo.type.charAt(0).toUpperCase() + repo.type.slice(1);
    repoParts.push(typeLabel);
  }
  if (repo.packageManager) repoParts.push(repo.packageManager);

  // Detect test runner label (Vitest, Jest, pytest, etc.)
  const testCmd = repo.commands?.test || '';
  let testLabel = null;
  if (testCmd.includes('vitest'))    testLabel = 'Vitest';
  else if (testCmd.includes('jest')) testLabel = 'Jest';
  else if (testCmd.includes('mocha')) testLabel = 'Mocha';
  else if (testCmd.includes('pytest')) testLabel = 'Pytest';
  else if (testCmd.includes('rspec')) testLabel = 'RSpec';
  else if (testCmd.includes('go test')) testLabel = 'go test';
  else if (testCmd.includes('cargo test')) testLabel = 'cargo test';
  if (testLabel) repoParts.push(testLabel);

  lines.push(`dual-brain ready`);
  lines.push(`Repo: ${repoParts.join(' / ') || 'unknown'}`);

  // Line 3: Branch + dirty status
  if (repo.branch) {
    const dirtyNote = repo.dirty ? ` (uncommitted changes)` : '';
    lines.push(`Branch: ${repo.branch}${dirtyNote}`);
  }

  // Line 4: Health summary
  const { states = {} } = health || {};
  function providerStatus(name) {
    const entries = Object.entries(states).filter(([k]) => k.startsWith(`${name}:`));
    if (entries.length === 0) return 'healthy';
    const statuses = entries.map(([, v]) => v.status);
    if (statuses.includes('hot'))      return 'hot';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('probing'))  return 'probing';
    return 'healthy';
  }
  const claudeStatus = providerStatus('claude');
  const openaiStatus = providerStatus('openai');
  const claudeLabel = claudeStatus === 'healthy' ? 'Claude healthy' : `Claude ${claudeStatus}`;
  const openaiLabel = openaiStatus === 'healthy' ? 'OpenAI healthy' : `OpenAI ${openaiStatus}`;
  lines.push(`Health: ${claudeLabel}, ${openaiLabel}`);

  // Line 5: Last task summary (only if session exists)
  if (session) {
    const parts = [];
    if (session.objective) parts.push(session.objective);
    if (session.filesChanged?.length) {
      const fc = session.filesChanged.length;
      parts.push(`edited ${fc} file${fc !== 1 ? 's' : ''}`);
    }
    if (session.lastResult?.status === 'failure' && session.lastResult?.summary) {
      parts.push(session.lastResult.summary);
    } else if (session.lastResult?.summary) {
      // include brief result note if compact
      const summary = session.lastResult.summary;
      if (summary.length <= 40) parts.push(summary);
    }
    if (parts.length > 0) {
      lines.push(`Last: ${parts.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ─── CLI (direct invocation) ──────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('session.mjs');
if (isMain) {
  const session = loadSession(process.cwd());
  if (session) {
    process.stdout.write(JSON.stringify(session, null, 2) + '\n');
  } else {
    process.stdout.write('(no active session)\n');
  }
}
