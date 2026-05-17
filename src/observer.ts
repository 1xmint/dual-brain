import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const SEC_PATTERNS = /auth|login|password|token|secret|credential|session|jwt|oauth|permission|role|middleware/i;
const SOURCE_EXT = /\.(mjs|js|ts|py)$/;

interface Observation {
  type: string;
  priority: 'high' | 'medium' | 'low';
  message: string;
  action: string;
  files: string[];
}

interface ObserveResult {
  observations: Observation[];
  summary: string;
}

interface ObserveOptions {
  runTests?: boolean;
}

function exec(cmd: string, cwd: string, timeout: number = 5000): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function changedFiles(cwd: string): string[] {
  const output = exec('git diff --name-only HEAD 2>/dev/null || git diff --name-only', cwd);
  return output ? output.split('\n').filter(Boolean) : [];
}

function checkSecurity(files: string[]): Observation | null {
  const hits = files.filter(f => SEC_PATTERNS.test(f));
  if (!hits.length) return null;
  return {
    type: 'security-review',
    priority: 'high',
    message: 'Auth-related files changed — want a security review?',
    action: 'dual-brain review',
    files: hits,
  };
}

function checkNoTests(files: string[], cwd: string): Observation | null {
  const sources = files.filter(f => SOURCE_EXT.test(f));
  if (!sources.length) return null;

  const untested = sources.filter(f => {
    const base = f.replace(SOURCE_EXT, '');
    const dir = join(cwd, f.split('/').slice(0, -1).join('/'));
    const name = f.split('/').pop()!.replace(SOURCE_EXT, '');
    const candidates = ['test','spec'].flatMap(k =>
      ['mjs','js','ts'].flatMap(e => [
        join(cwd, `${base}.${k}.${e}`),
        join(dir, '__tests__', `${name}.${e}`),
      ])
    );
    return !candidates.some(c => existsSync(c));
  });

  if (!untested.length) return null;
  return {
    type: 'no-tests',
    priority: 'medium',
    message: `${untested.length} changed file${untested.length > 1 ? 's' : ''} have no tests`,
    action: "dual-brain go 'add tests for changed files'",
    files: untested,
  };
}

function checkLargeDiff(cwd: string): Observation | null {
  const stat = exec('git diff --stat', cwd);
  if (!stat) return null;
  const match = stat.match(/(\d+) insertion|(\d+) deletion/g);
  if (!match) return null;
  const total = match.reduce((sum, m) => sum + parseInt(m), 0);
  if (total <= 500) return null;
  return {
    type: 'large-diff',
    priority: 'medium',
    message: `Large uncommitted changes (${total} lines) — consider committing`,
    action: "dual-brain go 'commit current changes'",
    files: [],
  };
}

function checkStaleBranch(cwd: string, files: string[]): Observation | null {
  if (!files.length) return null;
  const ts = exec('git log -1 --format=%ct', cwd);
  if (!ts) return null;
  const age = Date.now() / 1000 - parseInt(ts);
  if (age < 86400) return null;
  const hours = Math.round(age / 3600);
  return {
    type: 'stale-branch',
    priority: 'low',
    message: `Last commit was ${hours}h ago with uncommitted work`,
    action: "dual-brain go 'commit current changes'",
    files: [],
  };
}

function checkConflicts(cwd: string): Observation | null {
  const conflicted = exec('git diff --name-only --diff-filter=U', cwd);
  if (!conflicted) return null;
  const files = conflicted.split('\n').filter(Boolean);
  if (!files.length) return null;
  return {
    type: 'conflict',
    priority: 'high',
    message: `${files.length} file${files.length > 1 ? 's' : ''} have merge conflicts`,
    action: "dual-brain go 'resolve merge conflicts'",
    files,
  };
}

function checkUnfinishedWork(cwd: string): Observation | null {
  const outcomesDir = join(cwd, '.dualbrain', 'outcomes');
  if (!existsSync(outcomesDir)) return null;

  const cutoff = Date.now() - 86_400_000;
  let failed: { prompt: string; timestamp?: number } | null = null;

  try {
    const files = readdirSync(outcomesDir).filter(f => f.endsWith('.jsonl')).sort().reverse();
    for (const file of files) {
      const lines = readFileSync(join(outcomesDir, file), 'utf8')
        .split('\n').filter(Boolean);
      for (const line of lines.reverse()) {
        try {
          const rec = JSON.parse(line);
          if (rec.timestamp && rec.timestamp < cutoff) break;
          if (rec.result && rec.result.success === false && rec.prompt) {
            failed = rec;
            break;
          }
        } catch { /* skip */ }
      }
      if (failed) break;
    }
  } catch { return null; }

  if (!failed) return null;
  const prompt = failed.prompt.slice(0, 60);
  return {
    type: 'unfinished-work',
    priority: 'medium',
    message: `Last session had a failed task: '${prompt}' — resume?`,
    action: `dual-brain go '${failed.prompt}'`,
    files: [],
  };
}

async function checkFailingTests(cwd: string): Promise<Observation | null> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (!pkg.scripts?.test) return null;
  } catch { return null; }

  try {
    execSync('npm test --silent 2>&1', { cwd, encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
    return null;
  } catch {
    return {
      type: 'failing-tests',
      priority: 'high',
      message: 'Tests are failing — want me to investigate?',
      action: "dual-brain go 'fix failing tests'",
      files: [],
    };
  }
}

function buildSummary(files: string[], observations: Observation[]): string {
  const conflicts = observations.filter(o => o.type === 'conflict').length;
  const hi = observations.filter(o => o.priority === 'high').length;
  const parts: string[] = [];
  if (files.length) parts.push(`${files.length} file${files.length > 1 ? 's' : ''} changed`);
  else parts.push('no uncommitted changes');
  if (conflicts) parts.push(`${conflicts} conflict${conflicts > 1 ? 's' : ''}`);
  if (hi) parts.push(`${hi} high-priority suggestion${hi > 1 ? 's' : ''}`);
  return parts.join(', ');
}

export async function observe(cwd: string, options: ObserveOptions = {}): Promise<ObserveResult> {
  const observations: Observation[] = [];
  try {
    const files = changedFiles(cwd);

    const sec = checkSecurity(files);
    if (sec) observations.push(sec);

    const conflicts = checkConflicts(cwd);
    if (conflicts) observations.push(conflicts);

    const noTests = checkNoTests(files, cwd);
    if (noTests) observations.push(noTests);

    const largeDiff = checkLargeDiff(cwd);
    if (largeDiff) observations.push(largeDiff);

    const stale = checkStaleBranch(cwd, files);
    if (stale) observations.push(stale);

    const unfinished = checkUnfinishedWork(cwd);
    if (unfinished) observations.push(unfinished);

    if (options.runTests) {
      const failing = await checkFailingTests(cwd);
      if (failing) observations.push(failing);
    }

    return { observations, summary: buildSummary(files, observations) };
  } catch {
    return { observations: [], summary: 'unable to observe repo state' };
  }
}

export function formatObservations(observations: Observation[]): string {
  if (!observations.length) return '\u{1F4A1} Suggestions\n  (none)';
  const icon: Record<string, string> = { high: '\u{1F534}', medium: '\u{1F7E1}', low: '\u{1F7E2}' };
  const lines = observations.map(o => `  ${icon[o.priority] || '⚪'} ${o.message}`);
  return `\u{1F4A1} Suggestions\n${lines.join('\n')}`;
}

export async function getQuickState(cwd: string): Promise<ObserveResult> {
  try {
    const files = changedFiles(cwd);
    const observations: Observation[] = [];

    const sec = checkSecurity(files);
    if (sec) observations.push(sec);

    const conflicts = checkConflicts(cwd);
    if (conflicts) observations.push(conflicts);

    const noTests = checkNoTests(files, cwd);
    if (noTests) observations.push(noTests);

    const largeDiff = checkLargeDiff(cwd);
    if (largeDiff) observations.push(largeDiff);

    const stale = checkStaleBranch(cwd, files);
    if (stale) observations.push(stale);

    return { observations, summary: buildSummary(files, observations) };
  } catch {
    return { observations: [], summary: 'unable to observe repo state' };
  }
}
