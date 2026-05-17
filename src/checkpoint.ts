// checkpoint.ts — Checkpoint wrapper for dual-brain execution safety.
// Wraps Replit's native checkpoint system with a git-based fallback.
// Exports: hasCheckpoints, createCheckpoint, listCheckpoints, getLastCheckpoint

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface CheckpointResult {
  success: boolean;
  id: string | null;
  label: string;
  timestamp: string;
}

interface CheckpointEntry {
  id: string;
  label: string;
  timestamp: string;
  type: string;
  tag?: string;
  status: string;
}

/**
 * Check if checkpoint capability is available.
 */
export function hasCheckpoints(): boolean {
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
 */
export function createCheckpoint(label: string, opts: { cwd?: string } = {}): CheckpointResult {
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
 */
export function listCheckpoints(cwd?: string): CheckpointEntry[] {
  const logPath = join(cwd || process.cwd(), '.dual-brain', 'checkpoints.jsonl');
  if (!existsSync(logPath)) return [];
  try {
    return readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as CheckpointEntry)
      .reverse()
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * Get the most recent checkpoint.
 */
export function getLastCheckpoint(cwd?: string): CheckpointEntry | null {
  const checkpoints = listCheckpoints(cwd);
  return checkpoints[0] || null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _logCheckpoint(entry: CheckpointEntry, cwd: string): void {
  const dir = join(cwd || process.cwd(), '.dual-brain');
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, 'checkpoints.jsonl');
  const line = JSON.stringify(entry) + '\n';
  try {
    const existing = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, existing + line);
  } catch { /* non-fatal */ }
}
