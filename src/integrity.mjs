/**
 * integrity.mjs — State integrity primitives for dual-brain
 *
 * Provides:
 *   - atomicWriteJson / readJsonSafe   — safe JSON file I/O with schema versioning
 *   - acquireLock / releaseLock / withLock — advisory file locks
 *   - lockedUpdate                      — locked atomic read-modify-write
 *   - atomicAppend                      — append-only ledger with lock
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Atomic JSON writes
// ---------------------------------------------------------------------------

/**
 * Write JSON to filePath atomically via a temp file + rename.
 * Adds _schemaVersion and _writtenAt to plain objects.
 *
 * @param {string} filePath  - Destination file path
 * @param {*}      data      - Value to serialize
 * @param {object} opts
 * @param {number} [opts.schemaVersion=1] - Schema version stamped into data
 * @param {boolean}[opts.backup=false]    - Keep a .bak copy of the previous file
 */
export function atomicWriteJson(filePath, data, opts = {}) {
  const { schemaVersion = 1, backup = false } = opts;

  // Stamp schema version onto plain objects
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    data._schemaVersion = schemaVersion;
    data._writtenAt = new Date().toISOString();
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
    throw new Error(`atomicWrite: validation failed for ${filePath}: ${err.message}`);
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
 *
 * @param {string}   filePath
 * @param {object}   opts
 * @param {number}  [opts.expectedVersion]  - Schema version to verify
 * @param {Function}[opts.migrate]           - (data, fromVersion, toVersion) => data
 * @returns {*|null}
 */
export function readJsonSafe(filePath, opts = {}) {
  const { expectedVersion, migrate } = opts;

  if (!existsSync(filePath)) return null;

  let data;
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
  if (expectedVersion !== undefined && data?._schemaVersion !== expectedVersion) {
    if (migrate && typeof migrate === 'function') {
      data = migrate(data, data?._schemaVersion, expectedVersion);
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
 *
 * @param {string} filePath
 * @returns {{ acquired: boolean, lockPath: string, reason?: string }}
 */
export function acquireLock(filePath) {
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
      if (err.code === 'EEXIST') {
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
 *
 * @param {{ lockPath?: string }} lockResult - Return value of acquireLock
 */
export function releaseLock(lockResult) {
  if (lockResult?.lockPath) {
    try { unlinkSync(lockResult.lockPath); } catch {}
  }
}

/**
 * Run fn while holding an advisory lock on filePath.
 * Throws if the lock cannot be acquired within the retry window.
 *
 * @param {string}   filePath
 * @param {Function} fn
 * @returns {*} Return value of fn
 */
export function withLock(filePath, fn) {
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
 *
 * @param {string}   filePath
 * @param {Function} updateFn   - (currentData: *|null) => updatedData | undefined
 * @param {object}   opts       - Forwarded to readJsonSafe and atomicWriteJson
 * @returns {*} Return value of updateFn
 */
export function lockedUpdate(filePath, updateFn, opts = {}) {
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
 *
 * @param {string} filePath
 * @param {*}      record   - Value to serialize as one JSON line
 */
export async function atomicAppend(filePath, record) {
  const { appendFileSync } = await import('node:fs');
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
