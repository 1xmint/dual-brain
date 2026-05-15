import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname, extname, relative } from 'node:path';

import { detectTask } from './detect.mjs';

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_LANG = {
  '.mjs': 'javascript', '.js': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
  '.py': 'python', '.pyx': 'python', '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
  '.json': 'json', '.jsonl': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown', '.mdx': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
};

function detectLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (!ext && filePath.toLowerCase().endsWith('dockerfile')) return 'dockerfile';
  return EXT_LANG[ext] || 'unknown';
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function git(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function safeGit(cmd, cwd, fallback = '') {
  try { return git(cmd, cwd); } catch { return fallback; }
}

function getGitChangedFiles(cwd) {
  const raw = safeGit('git status --porcelain', cwd, '');
  if (!raw) return { files: [], statusMap: {} };

  const statusMap = {};
  const files = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2).trim() || '?';
    const filePath = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
    if (filePath) {
      statusMap[filePath] = code;
      files.push(filePath);
    }
  }

  return { files, statusMap };
}

function getRepoState(cwd) {
  const branch = safeGit('git branch --show-current', cwd, 'unknown');

  const statusRaw = safeGit('git status --porcelain', cwd, '');
  const uncommittedCount = statusRaw
    ? statusRaw.split('\n').filter(l => l.trim()).length
    : 0;

  const lastCommitMessage = safeGit('git log -1 --pretty=format:%s', cwd, '');

  let lastCommitAge = 'unknown';
  try {
    const epochStr = git('git log -1 --pretty=format:%ct', cwd);
    const epoch = parseInt(epochStr, 10);
    if (!isNaN(epoch)) {
      lastCommitAge = formatTimeAgo(epoch * 1000);
    }
  } catch { /* non-fatal */ }

  return { branch, uncommittedCount, lastCommitMessage, lastCommitAge };
}

function formatTimeAgo(timestampMs) {
  const diff = Date.now() - timestampMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Related files (import graph, one hop) ───────────────────────────────────

const IMPORT_RE = /(?:import\s+.*?from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;

function findRelatedFiles(explicitFiles, cwd) {
  const related = new Set();

  for (const filePath of explicitFiles) {
    const absPath = resolve(cwd, filePath);
    if (!existsSync(absPath)) continue;

    let content;
    try { content = readFileSync(absPath, 'utf8'); } catch { continue; }

    const fileDir = dirname(absPath);
    let match;
    IMPORT_RE.lastIndex = 0;

    while ((match = IMPORT_RE.exec(content)) !== null) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue; // skip node_modules / bare specifiers

      // Try common extensions in order
      const candidates = [
        specifier,
        specifier + '.mjs', specifier + '.js', specifier + '.ts',
        specifier + '/index.mjs', specifier + '/index.js', specifier + '/index.ts',
      ];

      for (const candidate of candidates) {
        const abs = resolve(fileDir, candidate);
        if (existsSync(abs)) {
          const rel = relative(cwd, abs);
          if (!explicitFiles.includes(rel)) related.add(rel);
          break;
        }
      }
    }
  }

  return [...related];
}

// ─── File summaries ───────────────────────────────────────────────────────────

function buildFileSummary(filePath, cwd, statusMap = {}) {
  const absPath = resolve(cwd, filePath);
  const language = detectLanguage(filePath);

  let lines = 0;
  try {
    const content = readFileSync(absPath, 'utf8');
    lines = content.split('\n').length;
  } catch { /* file missing or unreadable */ }

  const rawStatus = statusMap[filePath] || statusMap[filePath.replace(/\\/g, '/')];
  const gitStatus = rawStatus || 'clean';

  return { path: filePath, language, lines, gitStatus };
}

// ─── Constraints from CLAUDE.md ───────────────────────────────────────────────

const CONSTRAINT_RE = /\b(must|never|always|require[sd]?|do not|don't)\b/i;

function extractConstraints(cwd) {
  const candidates = [
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
  ];

  const constraints = [];

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const lines = readFileSync(p, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && CONSTRAINT_RE.test(trimmed) && trimmed.length < 200) {
          constraints.push(trimmed.replace(/^[-*#\s]+/, '').trim());
        }
      }
    } catch { /* non-fatal */ }
  }

  return constraints;
}

// ─── Prior attempts from .dualbrain/outcomes/ ────────────────────────────────

function loadPriorAttempts(prompt, cwd) {
  const outcomesDir = join(cwd, '.dualbrain', 'outcomes');
  if (!existsSync(outcomesDir)) return [];

  const promptWords = new Set(
    prompt.toLowerCase().split(/\W+/).filter(w => w.length > 3),
  );

  const attempts = [];

  let entries;
  try { entries = readdirSync(outcomesDir); } catch { return []; }

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(readFileSync(join(outcomesDir, entry), 'utf8'));
      if (!raw.prompt) continue;

      // Simple word-overlap similarity
      const entryWords = raw.prompt.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const overlap = entryWords.filter(w => promptWords.has(w)).length;
      const similarity = overlap / Math.max(promptWords.size, entryWords.length, 1);

      if (similarity >= 0.3) {
        attempts.push({
          timestamp: raw.timestamp || 0,
          prompt: raw.prompt,
          success: raw.success ?? false,
          lesson: raw.lesson || raw.summary || '',
        });
      }
    } catch { /* non-fatal */ }
  }

  return attempts.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
}

// ─── Related sessions ─────────────────────────────────────────────────────────

async function loadRelatedSessions(prompt, files, cwd) {
  try {
    // Dynamic import so missing module doesn't break the whole pack
    const { findRelatedSessions } = await import('./session.mjs');
    const raw = findRelatedSessions(prompt, files, cwd);
    return raw.map(s => ({
      id: s.sessionId,
      name: s.smartName || s.sessionId.slice(0, 8),
      score: s.score,
    }));
  } catch {
    return [];
  }
}

// ─── Acceptance criteria ──────────────────────────────────────────────────────

const CRITERIA_PATTERNS = [
  { re: /\btests?\s+pass\b/i,        label: 'tests pass' },
  { re: /\bno\s+regression[s]?\b/i,  label: 'no regressions' },
  { re: /\bbuilds?\s+clean\b/i,      label: 'builds clean' },
  { re: /\bbuild[s]?\b/i,            label: 'builds clean' },
  { re: /\blint\s+clean\b/i,         label: 'lint clean' },
  { re: /\bno\s+error[s]?\b/i,       label: 'no errors' },
  { re: /\btype.?check\b/i,          label: 'type-check passes' },
  { re: /\bworks?\s+on\s+\w+/i,      label: (m) => `works on ${m[0].match(/works?\s+on\s+(\w+)/i)?.[1]}` },
  { re: /\bcompatible\s+with\s+\w+/i, label: (m) => `compatible with ${m[0].match(/compatible\s+with\s+(\w+)/i)?.[1]}` },
  { re: /\bno\s+breaking\s+change[s]?\b/i, label: 'no breaking changes' },
  { re: /\bbackward[s]?\s+compat/i,  label: 'backward compatible' },
  { re: /\ball\s+tests?\s+pass/i,    label: 'all tests pass' },
  { re: /\bci\s+pass(?:es)?\b/i,     label: 'CI passes' },
  { re: /\bcoverage\b/i,             label: 'coverage maintained' },
];

function inferAcceptanceCriteria(prompt) {
  const found = new Set();
  for (const { re, label } of CRITERIA_PATTERNS) {
    const m = prompt.match(re);
    if (m) {
      const criterion = typeof label === 'function' ? label([m[0]]) : label;
      if (criterion) found.add(criterion);
    }
  }
  return [...found];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build a structured context pack for a task. All fields are best-effort —
 * missing git, missing files, and missing optional modules all degrade gracefully.
 *
 * @param {string}   prompt
 * @param {string[]} files   - Explicitly mentioned file paths (may be relative)
 * @param {string}   cwd     - Working directory (absolute)
 * @param {object}   options
 * @param {number}   [options.priorFailures=0]
 * @returns {Promise<object>}
 */
export async function buildContextPack(prompt = '', files = [], cwd = process.cwd(), options = {}) {
  const { priorFailures = 0 } = options;

  // 1. Detection (intent / tier / risk)
  const detection = detectTask({ prompt, files, priorFailures });

  // 2. Git changed files + status map
  const { files: gitChanged, statusMap } = getGitChangedFiles(cwd);

  // 3. Related files (import graph, one hop from explicit files)
  const relatedFiles = findRelatedFiles(files, cwd);

  const filesPack = {
    explicit: files,
    gitChanged,
    related: relatedFiles,
  };

  // 4. File summaries — explicit + gitChanged, deduped
  const summaryTargets = [...new Set([...files, ...gitChanged])];
  const fileSummaries = summaryTargets.map(f => buildFileSummary(f, cwd, statusMap));

  // 5. Repo state
  const repoState = getRepoState(cwd);

  // 6. Constraints from CLAUDE.md
  const constraints = extractConstraints(cwd);

  // 7. Prior attempts
  const priorAttempts = loadPriorAttempts(prompt, cwd);

  // 8. Related sessions (async, may fail silently)
  const allFiles = [...new Set([...files, ...gitChanged])];
  const relatedSessions = await loadRelatedSessions(prompt, allFiles, cwd);

  // 9. Acceptance criteria
  const acceptanceCriteria = inferAcceptanceCriteria(prompt);

  return {
    intent: detection.intent,
    prompt,
    tier: detection.tier,
    risk: detection.risk,
    files: filesPack,
    fileSummaries,
    repoState,
    constraints,
    priorAttempts,
    relatedSessions,
    acceptanceCriteria,
  };
}

// ─── Summarizer ───────────────────────────────────────────────────────────────

/**
 * Return a human-readable 3-5 line summary of a context pack for logging/display.
 *
 * @param {object} pack - Result of buildContextPack()
 * @returns {string}
 */
export function summarizeContextPack(pack) {
  const lines = [];

  lines.push(
    `Task: ${pack.intent} (${pack.tier} tier, ${pack.risk} risk)`,
  );

  const explicit = pack.files?.explicit?.length ?? 0;
  const changed  = pack.files?.gitChanged?.length ?? 0;
  const related  = pack.files?.related?.length ?? 0;
  lines.push(`Files: ${explicit} explicit, ${changed} changed, ${related} related`);

  const { branch, uncommittedCount, lastCommitAge } = pack.repoState ?? {};
  const branchStr = branch ? `${branch} branch` : 'unknown branch';
  const uncommittedStr = uncommittedCount != null
    ? `${uncommittedCount} uncommitted file${uncommittedCount === 1 ? '' : 's'}`
    : 'commit count unknown';
  const ageStr = lastCommitAge && lastCommitAge !== 'unknown' ? `, last commit ${lastCommitAge}` : '';
  lines.push(`Repo: ${branchStr}, ${uncommittedStr}${ageStr}`);

  if (pack.priorAttempts?.length > 0) {
    const failed = pack.priorAttempts.filter(a => !a.success).length;
    const total = pack.priorAttempts.length;
    const label = failed > 0
      ? `${failed} failed attempt${failed === 1 ? '' : 's'} on similar task`
      : `${total} prior attempt${total === 1 ? '' : 's'} on similar task`;
    lines.push(`Prior: ${label}`);
  }

  if (pack.acceptanceCriteria?.length > 0) {
    lines.push(`Criteria: ${pack.acceptanceCriteria.join(', ')}`);
  }

  return lines.join('\n');
}
