/**
 * integrity.ts — State integrity primitives for dual-brain
 *
 * Provides:
 *   - atomicWriteJson / readJsonSafe   — safe JSON file I/O with schema versioning
 *   - acquireLock / releaseLock / withLock — advisory file locks
 *   - lockedUpdate                      — locked atomic read-modify-write
 *   - atomicAppend                      — append-only ledger with lock
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Atomic JSON writes
// ---------------------------------------------------------------------------

interface AtomicWriteOpts {
  schemaVersion?: number;
  backup?: boolean;
}

interface ReadJsonOpts {
  expectedVersion?: number;
  migrate?: (data: unknown, fromVersion: number | undefined, toVersion: number) => unknown;
}

interface LockResult {
  acquired: boolean;
  lockPath: string;
  reason?: string;
}

/**
 * Write JSON to filePath atomically via a temp file + rename.
 * Adds _schemaVersion and _writtenAt to plain objects.
 */
export function atomicWriteJson(filePath: string, data: unknown, opts: AtomicWriteOpts = {}): void {
  const { schemaVersion = 1, backup = false } = opts;

  // Stamp schema version onto plain objects
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    (data as Record<string, unknown>)._schemaVersion = schemaVersion;
    (data as Record<string, unknown>)._writtenAt = new Date().toISOString();
  }

  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(data, null, 2) + '\n';

  // Write to temp file
  writeFileSync(tmpPath, json);

  // Validate the temp file is parseable before committing
  try {
    JSON.parse(readFileSync(tmpPath, 'utf8'));
  } catch (err) {
    unlinkSync(tmpPath);
    throw new Error(`atomicWrite: validation failed for ${filePath}: ${(err as Error).message}`);
  }

  // Optionally back up the existing file
  if (backup && existsSync(filePath)) {
    const backupPath = filePath + '.bak';
    try { renameSync(filePath, backupPath); } catch {}
  }

  // Atomic rename — either fully succeeds or the original is untouched
  renameSync(tmpPath, filePath);
}

/**
 * Read and parse a JSON file safely, with optional schema migration.
 * Falls back to a .bak copy on parse failure.
 * Returns null when the file is absent or unrecoverable.
 */
export function readJsonSafe(filePath: string, opts: ReadJsonOpts = {}): unknown | null {
  const { expectedVersion, migrate } = opts;

  if (!existsSync(filePath)) return null;

  let data: unknown;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    // Primary file corrupt — try backup
    const bakPath = filePath + '.bak';
    if (existsSync(bakPath)) {
      try {
        data = JSON.parse(readFileSync(bakPath, 'utf8'));
      } catch { return null; }
    } else {
      return null;
    }
  }

  // Schema version check with optional migration
  if (expectedVersion !== undefined && (data as Record<string, unknown>)?._schemaVersion !== expectedVersion) {
    if (migrate && typeof migrate === 'function') {
      data = migrate(data, (data as Record<string, unknown>)?._schemaVersion as number | undefined, expectedVersion);
    }
    // Tolerant read: return data even without a migrator
  }

  return data;
}

// ---------------------------------------------------------------------------
// 2. Advisory file locks
// ---------------------------------------------------------------------------

const LOCK_TIMEOUT_MS = 10_000; // stale lock threshold
const LOCK_RETRY_MS   = 50;     // busy-wait interval
const LOCK_MAX_RETRIES = 100;   // max retries (~5 s)

/**
 * Acquire an advisory lock for filePath by creating filePath.lock.
 * Stale locks (> LOCK_TIMEOUT_MS old) are cleared automatically.
 */
export function acquireLock(filePath: string): LockResult {
  const lockPath = filePath + '.lock';

  // Clear stale or corrupt lock
  if (existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(readFileSync(lockPath, 'utf8'));
      const age = Date.now() - (lockData.createdAt || 0);
      if (age > LOCK_TIMEOUT_MS) {
        unlinkSync(lockPath);
      }
    } catch {
      try { unlinkSync(lockPath); } catch {}
    }
  }

  // Spin-try to create the lock exclusively
  let retries = 0;
  while (retries < LOCK_MAX_RETRIES) {
    try {
      writeFileSync(lockPath, JSON.stringify({
        pid: process.pid,
        createdAt: Date.now(),
        holder: process.argv[1] || 'unknown',
      }), { flag: 'wx' }); // 'wx' = exclusive create, EEXIST if present
      return { acquired: true, lockPath };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        retries++;
        // Synchronous busy-wait — intentional; only triggered under contention
        const start = Date.now();
        while (Date.now() - start < LOCK_RETRY_MS) {}
        continue;
      }
      throw err; // Unexpected error — propagate
    }
  }

  return { acquired: false, lockPath, reason: 'timeout' };
}

/**
 * Release a previously acquired lock.
 */
export function releaseLock(lockResult: LockResult | undefined): void {
  if (lockResult?.lockPath) {
    try { unlinkSync(lockResult.lockPath); } catch {}
  }
}

/**
 * Run fn while holding an advisory lock on filePath.
 * Throws if the lock cannot be acquired within the retry window.
 */
export function withLock<T>(filePath: string, fn: () => T): T {
  const lock = acquireLock(filePath);
  if (!lock.acquired) {
    throw new Error(`Could not acquire lock for ${filePath}: ${lock.reason}`);
  }
  try {
    return fn();
  } finally {
    releaseLock(lock);
  }
}

/**
 * Locked atomic read-modify-write.
 * Reads the current JSON, passes it to updateFn, then writes the result.
 * If updateFn returns undefined the file is left unchanged.
 */
export function lockedUpdate(filePath: string, updateFn: (current: unknown | null) => unknown | undefined, opts: AtomicWriteOpts & ReadJsonOpts = {}): unknown | undefined {
  return withLock(filePath, () => {
    const current = readJsonSafe(filePath, opts);
    const updated = updateFn(current);
    if (updated !== undefined) {
      atomicWriteJson(filePath, updated, opts);
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// 3. Append-only ledger with lock
// ---------------------------------------------------------------------------

/**
 * Append a NDJSON record to filePath under an advisory lock.
 * On lock failure the write is attempted without a lock (best-effort).
 */
export async function atomicAppend(filePath: string, record: unknown): Promise<void> {
  const line = JSON.stringify(record) + '\n';

  const lock = acquireLock(filePath);
  if (!lock.acquired) {
    // Non-fatal: best-effort append without lock
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(filePath, line);
    } catch {}
    return;
  }

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, line);
  } finally {
    releaseLock(lock);
  }
}
