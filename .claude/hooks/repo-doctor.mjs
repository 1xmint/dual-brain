#!/usr/bin/env node
/**
 * repo-doctor.mjs — Maintainer-only prepublish gate for the dual-brain package.
 *
 * Catches inconsistencies, broken wirings, and drift before `npm publish`.
 * NOT for end users. Run: node .claude/hooks/repo-doctor.mjs
 *
 * Usage:
 *   node .claude/hooks/repo-doctor.mjs          # Full report
 *   node .claude/hooks/repo-doctor.mjs --json   # Machine-readable output
 *   node .claude/hooks/repo-doctor.mjs --fix    # Auto-fix what's fixable
 */

// ─── Institutional Memory ────────────────────────────────────────────────────

const POLICIES = {
  versionScheme: /^0\.\d+\.\d+$/,
  packageName: 'dual-brain',
  forbiddenStrings: ['data-tools', 'Steve Moraco', 'steve moraco'],
  requiredFiles: ['bin/dual-brain.mjs', 'src/index.mjs', 'README.md', 'LICENSE'],
  notes: [
    'Version 7.x was drift from replit-tools auto-versioning — never use 7.x again',
    'Package was forked from data-tools — all data-tools branding must be removed',
    'Version scheme: 0.1.x for pre-release, 0.2.x after architecture rewrite',
  ],
};

// ─── Imports ─────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const FIX_MODE = args.includes('--fix');

function abs(rel) {
  return join(ROOT, rel);
}

function fileExists(rel) {
  return existsSync(abs(rel));
}

function readJson(rel) {
  const p = abs(rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function readText(rel) {
  const p = abs(rel);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function run(cmd, opts = {}) {
  try {
    const result = spawnSync('sh', ['-c', cmd], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30000,
      ...opts,
    });
    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status,
    };
  } catch (e) {
    return { ok: false, stdout: '', stderr: e.message, status: 1 };
  }
}

// Walk a directory tree and collect all file paths (relative to ROOT)
function walkDir(dir, collected = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return collected; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // Skip hidden dirs and node_modules
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      walkDir(full, collected);
    } else {
      collected.push(relative(ROOT, full));
    }
  }
  return collected;
}

let _allFiles = null;
function getAllFiles() {
  if (!_allFiles) _allFiles = walkDir(ROOT);
  return _allFiles;
}

// Simple glob matcher: supports * (no slash) and ** (any depth) and ? wildcards
function matchGlob(pattern, filePath) {
  // Normalize separators
  const p = pattern.replace(/\\/g, '/');
  const f = filePath.replace(/\\/g, '/');

  // Convert glob to regex
  const regexStr = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex specials (except * and ?)
    .replace(/\*\*\//g, '(?:.+/)?')         // **/ → any path prefix (optional)
    .replace(/\*\*/g, '.*')                  // ** → anything
    .replace(/\*/g, '[^/]*')                 // * → any segment chars (no slash)
    .replace(/\?/g, '[^/]');                 // ? → single char (no slash)

  try {
    return new RegExp(`^${regexStr}$`).test(f);
  } catch {
    return false;
  }
}

// Expand glob patterns relative to ROOT, returning matched relative paths
function expandGlob(pattern) {
  if (!isGlobPattern(pattern)) {
    return fileExists(pattern) ? [pattern] : [];
  }
  return getAllFiles().filter(f => matchGlob(pattern, f));
}

function isGlobPattern(str) {
  return str.includes('*') || str.includes('?') || str.includes('{');
}

// ─── Check runners ───────────────────────────────────────────────────────────

function checkVersionScheme(pkg) {
  const version = pkg?.version;
  if (!version) {
    return { name: 'version-scheme', status: 'fail', message: 'No version field in package.json' };
  }
  if (!POLICIES.versionScheme.test(version)) {
    const message = `Version "${version}" does not match 0.x.y scheme. ${POLICIES.notes[0]}`;
    if (FIX_MODE) {
      // Attempt to coerce: strip leading non-0 major
      const parts = version.split('.');
      if (parts.length === 3) {
        const fixed = `0.${parts[1]}.${parts[2]}`;
        if (POLICIES.versionScheme.test(fixed)) {
          pkg.version = fixed;
          writeFileSync(abs('package.json'), JSON.stringify(pkg, null, 2) + '\n');
          return { name: 'version-scheme', status: 'pass', message: `Fixed: version changed from ${version} to ${fixed}` };
        }
      }
    }
    return { name: 'version-scheme', status: 'fail', message };
  }
  return { name: 'version-scheme', status: 'pass', message: `Version is ${version} — matches 0.x.y` };
}

function checkPackageName(pkg) {
  const name = pkg?.name;
  if (name !== POLICIES.packageName) {
    return { name: 'package-name', status: 'fail', message: `Package name is "${name}", expected "${POLICIES.packageName}"` };
  }
  return { name: 'package-name', status: 'pass', message: `Package name is "${name}"` };
}

function checkBinTarget(pkg) {
  const bin = pkg?.bin;
  if (!bin || typeof bin !== 'object') {
    return { name: 'bin-target', status: 'fail', message: 'No bin field in package.json' };
  }
  const results = [];
  let anyFail = false;
  for (const [cmd, target] of Object.entries(bin)) {
    const rel = target.replace(/^\.\//, '');
    if (!fileExists(rel)) {
      results.push(`bin.${cmd} → "${target}" NOT FOUND`);
      anyFail = true;
    } else {
      results.push(`bin.${cmd} → "${target}" ok`);
    }
  }
  return {
    name: 'bin-target',
    status: anyFail ? 'fail' : 'pass',
    message: results.join('; '),
  };
}

function checkExports(pkg) {
  const exports_ = pkg?.exports;
  if (!exports_ || typeof exports_ !== 'object') {
    return { name: 'exports', status: 'warn', message: 'No exports field in package.json' };
  }
  const missing = [];
  const ok = [];
  for (const [key, target] of Object.entries(exports_)) {
    if (typeof target !== 'string') continue;
    const rel = target.replace(/^\.\//, '');
    if (!fileExists(rel)) {
      missing.push(`"${key}" → "${target}"`);
    } else {
      ok.push(key);
    }
  }
  if (missing.length > 0) {
    return {
      name: 'exports',
      status: 'fail',
      message: `Missing export targets: ${missing.join(', ')}`,
    };
  }
  return { name: 'exports', status: 'pass', message: `All ${ok.length} exports resolve to existing files` };
}

function checkFilesArray(pkg) {
  const files = pkg?.files;
  if (!Array.isArray(files) || files.length === 0) {
    return { name: 'files-array', status: 'warn', message: 'No files array in package.json' };
  }
  const missing = [];
  const noGlobMatch = [];
  const ok = [];

  for (const entry of files) {
    if (isGlobPattern(entry)) {
      const matches = expandGlob(entry);
      if (matches.length === 0) {
        noGlobMatch.push(entry);
      } else {
        ok.push(`${entry} (${matches.length} files)`);
      }
    } else {
      const rel = entry.replace(/^\.\//, '');
      if (!fileExists(rel)) {
        missing.push(entry);
      } else {
        ok.push(entry);
      }
    }
  }

  const issues = [];
  if (missing.length > 0) issues.push(`Missing files: ${missing.join(', ')}`);
  if (noGlobMatch.length > 0) issues.push(`Globs with no matches: ${noGlobMatch.join(', ')}`);

  if (issues.length > 0) {
    return { name: 'files-array', status: 'warn', message: issues.join(' | ') };
  }
  return { name: 'files-array', status: 'pass', message: `${ok.length} entries validated (including globs)` };
}

function checkInstallSmokeTest() {
  const result = run('npm pack --dry-run 2>&1');
  if (!result.ok) {
    return {
      name: 'npm-pack-dry-run',
      status: 'fail',
      message: `npm pack --dry-run failed: ${result.stderr.trim() || result.stdout.trim()}`,
    };
  }
  // Verify expected files appear in the pack output
  const output = result.stdout + result.stderr;
  const expectedInPack = ['bin/dual-brain.mjs', 'src/index.mjs', 'README.md'];
  const missingFromPack = expectedInPack.filter(f => !output.includes(f));
  if (missingFromPack.length > 0) {
    return {
      name: 'npm-pack-dry-run',
      status: 'warn',
      message: `Pack succeeded but expected files not listed: ${missingFromPack.join(', ')}`,
    };
  }
  return { name: 'npm-pack-dry-run', status: 'pass', message: 'npm pack --dry-run succeeded with expected files' };
}

function checkCliSmokeTest() {
  const result = run('node bin/dual-brain.mjs --version');
  if (!result.ok && result.status !== 0) {
    return {
      name: 'cli-smoke-test',
      status: 'fail',
      message: `node bin/dual-brain.mjs --version failed (exit ${result.status}): ${result.stderr.trim()}`,
    };
  }
  const output = (result.stdout + result.stderr).trim();
  if (!output || output.length < 1) {
    return { name: 'cli-smoke-test', status: 'warn', message: '--version produced no output' };
  }
  return { name: 'cli-smoke-test', status: 'pass', message: `--version output: "${output}"` };
}

function checkReadmeCommands(pkg) {
  const readme = readText('README.md');
  if (!readme) {
    return { name: 'readme-commands', status: 'warn', message: 'README.md not found' };
  }
  const bin = readText('bin/dual-brain.mjs');
  if (!bin) {
    return { name: 'readme-commands', status: 'warn', message: 'bin/dual-brain.mjs not found' };
  }

  // Extract dual-brain subcommands from README code blocks
  const codeBlockRe = /```[^\n]*\n([\s\S]*?)```/g;
  const subcommandRe = /dual-brain\s+([a-z][\w-]*)/g;
  const foundSubcommands = new Set();

  let match;
  while ((match = codeBlockRe.exec(readme)) !== null) {
    const block = match[1];
    let cmdMatch;
    while ((cmdMatch = subcommandRe.exec(block)) !== null) {
      foundSubcommands.add(cmdMatch[1]);
    }
  }

  // Also check non-code-block inline usage
  const inlineRe = /`dual-brain\s+([a-z][\w-]*)`/g;
  while ((match = inlineRe.exec(readme)) !== null) {
    foundSubcommands.add(match[1]);
  }

  // Skip words that are not actual subcommands (the binary name itself, npx artifacts, etc.)
  const skipWords = new Set(['dual-brain', 'npx', '--dry-run', '--files', '--version', '--help']);

  const notImplemented = [];
  for (const sub of foundSubcommands) {
    if (sub.startsWith('-')) continue; // skip flags
    if (skipWords.has(sub)) continue;  // skip known non-subcommands
    // Check if handled in bin
    const handled =
      bin.includes(`cmd === '${sub}'`) ||
      bin.includes(`cmd === "${sub}"`) ||
      bin.includes(`'${sub}'`) ||
      bin.includes(`"${sub}"`);
    if (!handled) {
      notImplemented.push(sub);
    }
  }

  if (notImplemented.length > 0) {
    return {
      name: 'readme-commands',
      status: 'warn',
      message: `README mentions subcommands not clearly handled in bin: ${notImplemented.join(', ')}`,
    };
  }
  const checkedSubcommands = [...foundSubcommands].filter(s => !s.startsWith('-') && !skipWords.has(s));
  return {
    name: 'readme-commands',
    status: 'pass',
    message: `All ${checkedSubcommands.length} README subcommands found in bin handler: ${checkedSubcommands.join(', ')}`,
  };
}

function checkDeadExports(pkg) {
  const exports_ = pkg?.exports;
  if (!exports_ || typeof exports_ !== 'object') {
    return { name: 'dead-exports', status: 'warn', message: 'No exports to check' };
  }

  // Build list of src files from exports (non-root entries)
  const exportedFiles = [];
  for (const [key, target] of Object.entries(exports_)) {
    if (key === '.') continue; // skip root export
    if (typeof target === 'string') {
      exportedFiles.push({ key, file: target.replace(/^\.\//, '') });
    }
  }

  // Scan src/ and bin/ files for import references
  const scanResult = run('grep -rh "from.*dual-brain/" src/ bin/ --include="*.mjs" 2>/dev/null || true');
  const importText = scanResult.stdout;

  // Also check direct relative imports in src/index.mjs
  const indexContent = readText('src/index.mjs') || '';

  const dead = [];
  for (const { key, file } of exportedFiles) {
    const moduleName = key.replace(/^\.\//, ''); // e.g. "profile"
    const filename = file.split('/').pop().replace('.mjs', ''); // e.g. "profile"

    // Check if referenced in index.mjs or in any dual-brain/* import
    const referencedInIndex = indexContent.includes(`./${filename}.mjs`) || indexContent.includes(`'./${filename}'`);
    const referencedAsPackage = importText.includes(`dual-brain/${moduleName}`);

    if (!referencedInIndex && !referencedAsPackage) {
      dead.push(key);
    }
  }

  if (dead.length > 0) {
    return {
      name: 'dead-exports',
      status: 'warn',
      message: `Exports not re-exported from index or imported via package path: ${dead.join(', ')}`,
    };
  }
  return { name: 'dead-exports', status: 'pass', message: `All ${exportedFiles.length} named exports are referenced` };
}

function checkBranding() {
  const filesToScan = ['README.md', 'package.json', 'bin/dual-brain.mjs'];
  const hits = [];

  // Functional uses of 'data-tools' that are not branding (e.g. session source tags)
  const allowedPatterns = [
    /source:\s*['"]data-tools['"]/,
    /=== ['"]data-tools['"]/,
    /['"]data-tools['"]\s*\)/,
  ];

  for (const relPath of filesToScan) {
    const content = readText(relPath);
    if (!content) continue;
    const lines = content.split('\n');
    for (const forbidden of POLICIES.forbiddenStrings) {
      const lower = forbidden.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].toLowerCase().includes(lower)) continue;
        const isFunctional = forbidden === 'data-tools' &&
          allowedPatterns.some(p => p.test(lines[i]));
        if (!isFunctional) {
          hits.push(`"${forbidden}" found in ${relPath}:${i + 1}`);
        }
      }
    }
  }

  if (hits.length > 0) {
    return {
      name: 'branding-check',
      status: 'fail',
      message: `Branding errors detected: ${hits.join(' | ')}. ${POLICIES.notes[1]}`,
    };
  }
  return { name: 'branding-check', status: 'pass', message: 'No forbidden branding strings found' };
}

function checkRequiredFiles() {
  const missing = POLICIES.requiredFiles.filter(f => !fileExists(f));
  if (missing.length > 0) {
    return {
      name: 'required-files',
      status: 'fail',
      message: `Required files missing: ${missing.join(', ')}`,
    };
  }
  return { name: 'required-files', status: 'pass', message: `All ${POLICIES.requiredFiles.length} required files present` };
}

// ─── Report formatting ───────────────────────────────────────────────────────

const ICONS = { pass: '✓', fail: '✗', warn: '⚠' };
const COLORS = {
  pass: '\x1b[32m',
  fail: '\x1b[31m',
  warn: '\x1b[33m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function colorize(status, text) {
  if (!process.stdout.isTTY || JSON_MODE) return text;
  return `${COLORS[status]}${text}${COLORS.reset}`;
}

function bold(text) {
  if (!process.stdout.isTTY || JSON_MODE) return text;
  return `${COLORS.bold}${text}${COLORS.reset}`;
}

function dim(text) {
  if (!process.stdout.isTTY || JSON_MODE) return text;
  return `${COLORS.dim}${text}${COLORS.reset}`;
}

function printReport(results) {
  const counts = { pass: 0, fail: 0, warn: 0 };
  for (const r of results) counts[r.status]++;

  console.log('');
  console.log(bold('  dual-brain repo-doctor'));
  console.log(dim('  Maintainer prepublish gate'));
  console.log('');

  for (const r of results) {
    const icon = colorize(r.status, ICONS[r.status]);
    const name = r.name.padEnd(22);
    const status = colorize(r.status, r.status.toUpperCase().padEnd(5));
    console.log(`  ${icon} ${dim(name)} ${status}  ${r.message}`);
  }

  console.log('');

  const summary = [];
  if (counts.pass > 0) summary.push(colorize('pass', `${counts.pass} passed`));
  if (counts.warn > 0) summary.push(colorize('warn', `${counts.warn} warned`));
  if (counts.fail > 0) summary.push(colorize('fail', `${counts.fail} failed`));
  console.log(`  ${summary.join('  ')}`);
  console.log('');

  if (counts.fail > 0) {
    console.log(colorize('fail', '  BLOCKED: Fix failures before publishing.'));
    console.log('');
  } else if (counts.warn > 0) {
    console.log(colorize('warn', '  ADVISORY: Warnings present, but publish is not blocked.'));
    console.log('');
  } else {
    console.log(colorize('pass', '  CLEAR: Safe to publish.'));
    console.log('');
  }

  if (FIX_MODE) {
    console.log(dim('  --fix was applied where possible.'));
    console.log('');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Load package.json once; pass mutable ref so --fix can update it
  const pkg = readJson('package.json');
  if (!pkg) {
    const err = [{ name: 'package-json', status: 'fail', message: 'Cannot read package.json' }];
    if (JSON_MODE) { console.log(JSON.stringify({ results: err, exitCode: 1 }, null, 2)); }
    else { printReport(err); }
    process.exit(1);
  }

  // Run all checks (order matters: cheap/structural first, expensive last)
  const results = await Promise.all([
    // Structural / fast
    Promise.resolve(checkPackageName(pkg)),
    checkVersionScheme(pkg),
    Promise.resolve(checkBinTarget(pkg)),
    checkExports(pkg),
    Promise.resolve(checkRequiredFiles()),
    // Content / scanning
    Promise.resolve(checkBranding()),
    Promise.resolve(checkReadmeCommands(pkg)),
    checkDeadExports(pkg),
    // Disk / glob
    checkFilesArray(pkg),
    // Exec (slower)
    Promise.resolve(checkCliSmokeTest()),
    Promise.resolve(checkInstallSmokeTest()),
  ]);

  if (JSON_MODE) {
    const exitCode = results.some(r => r.status === 'fail') ? 1 : 0;
    console.log(JSON.stringify({ results, exitCode, policies: POLICIES.notes }, null, 2));
    process.exit(exitCode);
  }

  printReport(results);
  const anyFail = results.some(r => r.status === 'fail');
  process.exit(anyFail ? 1 : 0);
}

main().catch(err => {
  console.error('repo-doctor crashed:', err.message);
  process.exit(1);
});
