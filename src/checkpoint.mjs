// checkpoint.mjs — Checkpoint wrapper for dual-brain execution safety.
// Wraps Replit's native checkpoint system with a git-based fallback.
// Exports: hasCheckpoints, createCheckpoint, listCheckpoints, getLastCheckpoint

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Check if checkpoint capability is available.
 * @returns {boolean}
 */
export function hasCheckpoints() {
  try {
    // Check for Replit checkpoint binary
    if (existsSync('/usr/local/bin/replit-checkpoint')) return true;
    execSync('which replit-checkpoint', { stdio: 'pipe', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a checkpoint before a risky operation.
 * @param {string} label — human-readable label like "before auth refactor"
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 * @returns {{ success: boolean, id: string|null, label: string, timestamp: string }}
 */
export function createCheckpoint(label, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const timestamp = new Date().toISOString();
  const id = `cp-${Date.now()}`;

  // Try Replit checkpoint first
  if (hasCheckpoints()) {
    try {
      execSync('replit-checkpoint create', { cwd, stdio: 'pipe', timeout: 10000 });
      _logCheckpoint({ id, label, timestamp, type: 'replit', status: 'created' }, cwd);
      return { success: true, id, label, timestamp };
    } catch {
      // Fall through to git-based checkpoint
    }
  }

  // Fallback: git stash + tag
  try {
    // Stash any uncommitted changes
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    if (status) {
      execSync(`git stash push -m "dual-brain-checkpoint: ${label}"`, { cwd, stdio: 'pipe', timeout: 10000 });
      execSync('git stash pop', { cwd, stdio: 'pipe', timeout: 10000 });
    }
    // Create a lightweight tag
    const safeLabel = label.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50);
    const tagName = `db-checkpoint/${safeLabel}-${Date.now()}`;
    execSync(`git tag "${tagName}"`, { cwd, stdio: 'pipe', timeout: 5000 });
    _logCheckpoint({ id, label, timestamp, type: 'git-tag', tag: tagName, status: 'created' }, cwd);
    return { success: true, id, label, timestamp };
  } catch {
    _logCheckpoint({ id, label, timestamp, type: 'failed', status: 'failed' }, cwd);
    return { success: false, id: null, label, timestamp };
  }
}

/**
 * List recent checkpoints (most recent first, up to 20).
 * @param {string} [cwd]
 * @returns {object[]}
 */
export function listCheckpoints(cwd) {
  const logPath = join(cwd || process.cwd(), '.dual-brain', 'checkpoints.jsonl');
  if (!existsSync(logPath)) return [];
  try {
    return readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
      .reverse()
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Get the most recent checkpoint.
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function getLastCheckpoint(cwd) {
  const checkpoints = listCheckpoints(cwd);
  return checkpoints[0] || null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _logCheckpoint(entry, cwd) {
  const dir = join(cwd || process.cwd(), '.dual-brain');
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, 'checkpoints.jsonl');
  const line = JSON.stringify(entry) + '\n';
  try {
    const existing = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, existing + line);
  } catch {}
}
