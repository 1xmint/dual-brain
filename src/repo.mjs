#!/usr/bin/env node
/**
 * repo.mjs — Auto-detect project type and commands without asking the user.
 *
 * Exports:
 *   detectRepo(cwd)         → repo descriptor object
 *   loadRepoCache(cwd)      → cached detection (re-detects if >1 hour old)
 *   getTestCommand(cwd)     → convenience: test command string or null
 *   getLintCommand(cwd)     → convenience: lint command string or null
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_FILE   = '.dualbrain/repo.json';

// npm init placeholder — skip this as a real test command
const NPM_PLACEHOLDER = 'echo "Error: no test specified"';

// ─── Git helpers ──────────────────────────────────────────────────────────────

function gitBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch { return null; }
}

function gitDirty(cwd) {
  try {
    const out = execSync('git status --porcelain', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString();
    return out.trim().length > 0;
  } catch { return false; }
}

// ─── Node.js detection ────────────────────────────────────────────────────────

function detectNode(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;

  let pkg = {};
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { return null; }

  const scripts = pkg.scripts || {};

  // Package manager detection (order matters: most specific first)
  let packageManager = 'npm';
  if (existsSync(join(cwd, 'bun.lockb')))        packageManager = 'bun';
  else if (existsSync(join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
  else if (existsSync(join(cwd, 'yarn.lock')))      packageManager = 'yarn';

  // Monorepo detection
  const monorepo = Boolean(
    pkg.workspaces ||
    existsSync(join(cwd, 'pnpm-workspace.yaml'))
  );

  // Extract commands from scripts (skip npm init placeholder for test)
  const rawTest = scripts.test || null;
  const test = (rawTest && !rawTest.includes(NPM_PLACEHOLDER) && !rawTest.toLowerCase().startsWith('echo'))
    ? rawTest
    : null;

  const lint = scripts.lint || null;
  const build = scripts.build || null;

  // Typecheck: explicit script or infer from tsconfig
  let typecheck = scripts.typecheck || scripts['type-check'] || null;
  if (!typecheck && existsSync(join(cwd, 'tsconfig.json'))) {
    typecheck = 'npx tsc --noEmit';
  }

  return {
    type: 'node',
    name: pkg.name || null,
    packageManager,
    commands: { test, lint, build, typecheck },
    monorepo,
  };
}

// ─── Go detection ─────────────────────────────────────────────────────────────

function detectGo(cwd) {
  const modPath = join(cwd, 'go.mod');
  if (!existsSync(modPath)) return null;

  let name = null;
  try {
    const content = readFileSync(modPath, 'utf8');
    const match = content.match(/^module\s+(\S+)/m);
    if (match) name = match[1].split('/').pop(); // last segment of module path
  } catch { /* skip */ }

  return {
    type: 'go',
    name,
    packageManager: null,
    commands: { test: 'go test ./...', lint: null, build: 'go build ./...', typecheck: null },
    monorepo: false,
  };
}

// ─── Rust detection ───────────────────────────────────────────────────────────

function detectRust(cwd) {
  const cargoPath = join(cwd, 'Cargo.toml');
  if (!existsSync(cargoPath)) return null;

  let name = null;
  try {
    const content = readFileSync(cargoPath, 'utf8');
    const match = content.match(/^\[package\][^\[]*name\s*=\s*"([^"]+)"/ms);
    if (match) name = match[1];
  } catch { /* skip */ }

  return {
    type: 'rust',
    name,
    packageManager: null,
    commands: { test: 'cargo test', lint: 'cargo clippy', build: 'cargo build', typecheck: null },
    monorepo: false,
  };
}

// ─── Python detection ─────────────────────────────────────────────────────────

function detectPython(cwd) {
  const hasPyproject = existsSync(join(cwd, 'pyproject.toml'));
  const hasSetupPy   = existsSync(join(cwd, 'setup.py'));
  if (!hasPyproject && !hasSetupPy) return null;

  let name = null;
  let test = 'pytest';
  let lint = null;

  if (hasPyproject) {
    try {
      const content = readFileSync(join(cwd, 'pyproject.toml'), 'utf8');
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      if (nameMatch) name = nameMatch[1];
      if (content.includes('pytest'))  test = 'pytest';
      if (content.includes('ruff'))    lint = 'ruff check .';
      if (content.includes('flake8'))  lint = lint || 'flake8';
    } catch { /* skip */ }
  }

  return {
    type: 'python',
    name,
    packageManager: null,
    commands: { test, lint, build: null, typecheck: null },
    monorepo: false,
  };
}

// ─── Ruby detection ───────────────────────────────────────────────────────────

function detectRuby(cwd) {
  const gemfilePath = join(cwd, 'Gemfile');
  if (!existsSync(gemfilePath)) return null;

  let name = null;
  let test = null;

  try {
    const content = readFileSync(gemfilePath, 'utf8');
    if (content.includes('rspec')) test = 'bundle exec rspec';
    else if (content.includes('minitest')) test = 'bundle exec rake test';
  } catch { /* skip */ }

  // Try gemspec for name
  try {
    const gemspecFiles = readdirSync(cwd).filter(f => f.endsWith('.gemspec'));
    if (gemspecFiles.length > 0) {
      const spec = readFileSync(join(cwd, gemspecFiles[0]), 'utf8');
      const match = spec.match(/\.name\s*=\s*["']([^"']+)["']/);
      if (match) name = match[1];
    }
  } catch { /* skip */ }

  return {
    type: 'ruby',
    name,
    packageManager: null,
    commands: { test, lint: null, build: null, typecheck: null },
    monorepo: false,
  };
}

// ─── Main detection ───────────────────────────────────────────────────────────

/**
 * Detect the project type, name, package manager, and common commands.
 * @param {string} [cwd]
 * @returns {object} Repo descriptor
 */
export function detectRepo(cwd = process.cwd()) {
  // Try detectors in priority order
  const detected =
    detectNode(cwd) ||
    detectGo(cwd) ||
    detectRust(cwd) ||
    detectPython(cwd) ||
    detectRuby(cwd) ||
    {
      type: 'unknown',
      name: null,
      packageManager: null,
      commands: { test: null, lint: null, build: null, typecheck: null },
      monorepo: false,
    };

  return {
    ...detected,
    branch: gitBranch(cwd),
    dirty: gitDirty(cwd),
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Load cached repo detection if <1 hour old, otherwise re-detect and cache.
 * @param {string} [cwd]
 * @returns {object} Repo descriptor
 */
export function loadRepoCache(cwd = process.cwd()) {
  const cachePath = join(cwd, CACHE_FILE);

  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      const age = Date.now() - Date.parse(cached._cachedAt || 0);
      if (age < CACHE_TTL_MS && cached.type) {
        // Re-detect git state (branch/dirty) which changes frequently
        return {
          ...cached,
          branch: gitBranch(cwd),
          dirty:  gitDirty(cwd),
        };
      }
    } catch { /* fall through to re-detect */ }
  }

  const repo = detectRepo(cwd);
  const toWrite = { ...repo, _cachedAt: new Date().toISOString() };

  try {
    const dir = join(cwd, '.dualbrain');
    mkdirSync(dir, { recursive: true });
    const tmp = cachePath + '.tmp.' + process.pid;
    writeFileSync(tmp, JSON.stringify(toWrite, null, 2) + '\n');
    renameSync(tmp, cachePath);
  } catch { /* non-fatal: cache miss is fine */ }

  return repo;
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Returns the detected test command or null.
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function getTestCommand(cwd = process.cwd()) {
  return detectRepo(cwd).commands.test;
}

/**
 * Returns the detected lint command or null.
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function getLintCommand(cwd = process.cwd()) {
  return detectRepo(cwd).commands.lint;
}

// ─── CLI (direct invocation) ──────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('repo.mjs');
if (isMain) {
  const repo = detectRepo(process.cwd());
  process.stdout.write(JSON.stringify(repo, null, 2) + '\n');
}
