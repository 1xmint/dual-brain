#!/usr/bin/env node
// auto-update-wrapper.mjs — PostToolUse hook (Node.js entry point).
// Runs once per session, checks for dual-brain updates, installs silently.
// The parent exits immediately; all npm work happens in a detached child.

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE   = resolve(__dirname, '..');
const STATE_DIR   = join(WORKSPACE, '.dualbrain');
const LOCK_FILE   = join(STATE_DIR, '.update-checked');
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// ── 1. Already checked recently? ─────────────────────────────────────────────
if (existsSync(LOCK_FILE)) {
  try {
    const lastCheck = parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10);
    if (Number.isFinite(lastCheck) && Date.now() - lastCheck < TWENTY_FOUR_HOURS) {
      process.exit(0);
    }
  } catch {
    // Corrupt lock file — proceed with check
  }
}

// ── 2. Write lock BEFORE spawning (prevents concurrent session races) ─────────
try {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(LOCK_FILE, String(Date.now()));
} catch {
  process.exit(0); // Can't write state — bail silently
}

// ── 3. Resolve local version ─────────────────────────────────────────────────
let localVersion = '';
try {
  const pkg = JSON.parse(readFileSync(join(WORKSPACE, 'package.json'), 'utf8'));
  localVersion = pkg.version || '';
} catch {
  process.exit(0);
}

if (!localVersion) process.exit(0);

// ── 4. Detach background worker — parent returns immediately ─────────────────
// The worker script is inlined as a node -e string to avoid needing a temp file.
const workerScript = `
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const localVersion = ${JSON.stringify(localVersion)};

// 3-second timeout npm check
const npmResult = spawnSync('npm', ['view', 'dual-brain', 'version'], {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 3000,
});

const latestVersion = (npmResult.stdout || '').trim();
if (!latestVersion) process.exit(0);

// Compare: is latest strictly greater than local?
function versionGt(a, b) {
  const ap = a.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const bp = b.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const diff = (bp[i] || 0) - (ap[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

if (!versionGt(localVersion, latestVersion)) process.exit(0);

// Newer version found — print notice then install
process.stderr.write('dual-brain: updating v' + localVersion + ' → ' + latestVersion + '...\\n');

spawnSync('npx', ['-y', 'dual-brain@latest', '--quiet'], {
  stdio: 'ignore',
  timeout: 120000,
});
`;

const child = spawn(
  process.execPath,
  ['--input-type=module'],
  {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  }
);

child.stdin.write(workerScript);
child.stdin.end();
child.unref(); // Let parent exit without waiting

process.exit(0);
