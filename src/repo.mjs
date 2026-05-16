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

// ─── Ownership hints ──────────────────────────────────────────────────────────

/**
 * Return the last git author, last-modified date, and commit count for a file.
 * @param {string} filePath
 * @param {string} [cwd]
 * @returns {{ lastAuthor: string, lastModified: string, totalCommits: number }|null}
 */
export function getFileOwnership(filePath, cwd) {
  try {
    const blame = execSync(`git log --format="%an" -1 -- "${filePath}"`, { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    const lastDate = execSync(`git log --format="%ci" -1 -- "${filePath}"`, { cwd, encoding: 'utf8', timeout: 5000 }).trim();
    const commitCount = parseInt(execSync(`git rev-list --count HEAD -- "${filePath}"`, { cwd, encoding: 'utf8', timeout: 5000 }).trim()) || 0;
    return { lastAuthor: blame, lastModified: lastDate, totalCommits: commitCount };
  } catch { return null; }
}

// ─── Dependency edges ─────────────────────────────────────────────────────────

/**
 * Extract import/require edges from a source file.
 * @param {string} filePath  — relative path from cwd
 * @param {string} [cwd]
 * @returns {{ local: string[], external: string[], total: number }}
 */
export function getDependencyEdges(filePath, cwd) {
  try {
    const content = readFileSync(join(cwd || process.cwd(), filePath), 'utf8');
    const imports = [];
    // ES module imports
    for (const match of content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)) {
      imports.push(match[1]);
    }
    // Dynamic imports
    for (const match of content.matchAll(/import\(['"]([^'"]+)['"]\)/g)) {
      imports.push(match[1]);
    }
    // CommonJS requires
    for (const match of content.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      imports.push(match[1]);
    }
    const local = imports.filter(i => i.startsWith('.') || i.startsWith('/'));
    const external = imports.filter(i => !i.startsWith('.') && !i.startsWith('/'));
    return { local, external, total: imports.length };
  } catch { return { local: [], external: [], total: 0 }; }
}

// ─── Test mapping ─────────────────────────────────────────────────────────────

/**
 * Find test files whose name matches the source file's base name.
 * @param {string} filePath
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function findRelatedTests(filePath, cwd) {
  const root = cwd || process.cwd();
  const base = filePath.replace(/\.(mjs|js|ts|tsx|jsx)$/, '');
  const name = base.split('/').pop();

  const found = [];
  try {
    const allTests = execSync(
      `find . -type f \\( -name "*.test.*" -o -name "*.spec.*" -o -path "*/tests/*" -o -path "*/test/*" -o -path "*/__tests__/*" \\) -not -path "*/node_modules/*"`,
      { cwd: root, encoding: 'utf8', timeout: 5000 }
    ).trim().split('\n').filter(Boolean);

    for (const t of allTests) {
      if (t.includes(name)) found.push(t.replace(/^\.\//, ''));
    }
  } catch {}

  return found;
}

// ─── Risk hotspots ────────────────────────────────────────────────────────────

/**
 * Return the files with highest churn × complexity risk in the last N days.
 * @param {string} [cwd]
 * @param {{ days?: number, limit?: number }} [opts]
 * @returns {Array<{ file: string, changeCount: number, lineCount: number, risk: number }>}
 */
export function getRiskHotspots(cwd, opts = {}) {
  const { days = 30, limit = 10 } = opts;
  const root = cwd || process.cwd();
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const log = execSync(
      `git log --since="${since}" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -${limit * 2}`,
      { cwd: root, encoding: 'utf8', timeout: 10000 }
    ).trim();

    const hotspots = [];
    for (const line of log.split('\n').filter(Boolean)) {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        const changeCount = parseInt(match[1]);
        const file = match[2];
        if (changeCount >= 3 && existsSync(join(root, file))) {
          let lineCount = 0;
          try {
            lineCount = readFileSync(join(root, file), 'utf8').split('\n').length;
          } catch {}
          hotspots.push({ file, changeCount, lineCount, risk: changeCount * Math.log2(Math.max(lineCount, 1)) });
        }
      }
    }

    return hotspots.sort((a, b) => b.risk - a.risk).slice(0, limit);
  } catch { return []; }
}

// ─── Primary language detection ───────────────────────────────────────────────

function detectPrimaryLanguage(cwd) {
  try {
    const files = execSync(
      'git ls-files --cached | grep -oE "\\.[a-zA-Z]+$" | sort | uniq -c | sort -rn | head -5',
      { cwd, encoding: 'utf8', timeout: 5000 }
    ).trim();
    const match = files.split('\n')[0]?.trim().match(/^\d+\s+\.(.+)$/);
    const ext = match?.[1];
    const langMap = {
      js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
      py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java',
      kt: 'Kotlin', swift: 'Swift', cpp: 'C++', c: 'C',
    };
    return langMap[ext] || ext || 'unknown';
  } catch { return 'unknown'; }
}

// ─── Repo intelligence ────────────────────────────────────────────────────────

/**
 * Return consolidated repo intelligence for routing decisions.
 * @param {string} [cwd]
 * @returns {object}
 */
export function getRepoIntelligence(cwd) {
  const root = cwd || process.cwd();
  const cache = loadRepoCache(root);
  const hotspots = getRiskHotspots(root);

  return {
    ...cache,
    hotspots,
    hasTests: hotspots.some(h => h.file.includes('test')),
    primaryLanguage: detectPrimaryLanguage(root),
    repoSize: cache?.fileCount || 0,
  };
}

// ─── CLI (direct invocation) ──────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('repo.mjs');
if (isMain) {
  const repo = detectRepo(process.cwd());
  process.stdout.write(JSON.stringify(repo, null, 2) + '\n');
}
