/**
 * intelligence.mjs — Situational awareness for every pipeline run.
 * Reads project reality fresh, derives task context, and detects contradictions
 * between what an agent plans to do and what is actually true.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const PROTECTED_PATHS = [
  'src/pipeline.mjs',
  'src/dispatch.mjs',
  'src/decide.mjs',
  '.claude/hooks/head-guard.mjs',
];

// ─── Git helpers ──────────────────────────────────────────────────────────────

function safeExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function getDirtyFiles(cwd) {
  const raw = safeExec('git status --porcelain', cwd);
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(l => l.trim())
    .map(l => l.slice(3).trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

function getRecentCommits(cwd, n = 5) {
  const raw = safeExec(`git log -${n} --pretty=format:%s`, cwd);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

function getAheadCount(cwd) {
  const raw = safeExec('git rev-list --count @{u}..HEAD', cwd);
  const n = parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

function getCurrentBranch(cwd) {
  return safeExec('git branch --show-current', cwd) || 'unknown';
}

// ─── Failure reader ───────────────────────────────────────────────────────────

function readRecentFailures(cwd, limit = 10) {
  const path = join(cwd, '.dualbrain', 'failures.jsonl');
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(r => r && !r.resolved)
      .map(r => ({
        prompt: r.prompt ?? '',
        error: r.error ?? '',
        approach: r.tier ? `${r.tier}/${r.model ?? 'unknown'}` : (r.model ?? 'unknown'),
        timestamp: r.timestamp ?? 0,
      }));
  } catch {
    return [];
  }
}

// ─── Outcome reader ───────────────────────────────────────────────────────────

function readRecentOutcomes(cwd, limit = 10) {
  const dir = join(cwd, '.dualbrain', 'outcomes');
  if (!existsSync(dir)) return [];
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .slice(0, 3);

    const records = [];
    for (const file of files) {
      try {
        const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const r = JSON.parse(line);
            records.push({
              task: r.prompt ?? '',
              success: r.result?.success ?? false,
              timestamp: r.timestamp ?? 0,
            });
          } catch { /* skip bad line */ }
        }
      } catch { /* skip unreadable file */ }
    }

    return records
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } catch {
    return [];
  }
}

// ─── Package.json reader ──────────────────────────────────────────────────────

function readPackageJson(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Read project reality fresh. No cache. Returns a ProjectBrief.
 */
export function deriveProjectState(cwd = process.cwd()) {
  const pkg = readPackageJson(cwd);

  const version = pkg.version ?? '0.0.0';
  const versionMajor = parseInt(version.split('.')[0], 10) || 0;

  const dirtyFiles = getDirtyFiles(cwd);
  const recentCommits = getRecentCommits(cwd, 5);
  const branch = getCurrentBranch(cwd);
  const aheadOfRemote = getAheadCount(cwd);

  const binField = pkg.bin ?? {};
  const binValues = Object.values(binField);
  const entryPoint = binValues[0] ?? (pkg.main ?? '');

  const testCommand = pkg.scripts?.test ?? null;

  const recentFailures = readRecentFailures(cwd, 10);
  const recentOutcomes = readRecentOutcomes(cwd, 10);

  return {
    packageName: pkg.name ?? 'unknown',
    version,
    versionMajor,
    description: pkg.description ?? '',

    branch,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    recentCommits,
    aheadOfRemote,

    brandName: 'dual-brain',
    cliCommand: 'dual-brain',

    moduleType: pkg.type === 'module' ? 'esm' : 'cjs',
    entryPoint,
    testCommand,

    protectedPaths: PROTECTED_PATHS,

    recentFailures,
    recentOutcomes,

    derivedAt: Date.now(),
  };
}

/**
 * Derive task-scoped context from the current prompt and optional session events.
 */
export function deriveTaskContext(task = '', recentEvents = []) {
  const priorAttempts = [];
  const filesOutOfScope = [];
  const filesInScopeSet = new Set();

  const FILE_RE = /(?:^|\s)((?:src|hooks|bin|scripts|\.claude)\/[\w./\-]+\.\w+)/g;
  let m;

  FILE_RE.lastIndex = 0;
  while ((m = FILE_RE.exec(task)) !== null) filesInScopeSet.add(m[1]);

  for (const ev of (recentEvents ?? [])) {
    if (!ev) continue;

    if (ev.type === 'failure' || ev.failed) {
      priorAttempts.push({
        approach: ev.approach ?? ev.tier ?? 'unknown',
        failed: true,
        reason: ev.error ?? ev.reason ?? '',
      });
      for (const f of (ev.files ?? ev.filesChanged ?? [])) {
        filesOutOfScope.push(f);
      }
    }

    FILE_RE.lastIndex = 0;
    const evText = JSON.stringify(ev);
    while ((m = FILE_RE.exec(evText)) !== null) filesInScopeSet.add(m[1]);
  }

  const failureCount = priorAttempts.filter(a => a.failed).length;
  const escalationLevel =
    failureCount >= 3 ? 'critical' :
    failureCount >= 1 ? 'elevated' :
    'normal';

  const constraintKeywords = [];
  const CONSTRAINT_RE = /\b(must|never|always|do not|don't|only|no\s+\w+)\b[^.!?]{0,80}/gi;
  let cm;
  CONSTRAINT_RE.lastIndex = 0;
  while ((cm = CONSTRAINT_RE.exec(task)) !== null) {
    constraintKeywords.push(cm[0].trim());
  }

  return {
    task,
    priorAttempts,
    activeConstraints: constraintKeywords,
    filesInScope: [...filesInScopeSet],
    filesOutOfScope: [...new Set(filesOutOfScope)],
    escalationLevel,
  };
}

/**
 * Detect contradictions between project reality, task context, and a proposed plan.
 * Returns an array of contradiction objects.
 */
export function detectContradictions(projectBrief, taskBrief, plan = {}) {
  const contradictions = [];

  const planDesc = plan.description ?? '';
  const planAssumptions = plan.assumptions ?? {};
  const targetFiles = Array.isArray(plan.targetFiles) ? plan.targetFiles : [];

  // 1. version_mismatch
  const assumedVersion = typeof planAssumptions === 'string'
    ? planAssumptions
    : (planAssumptions.version ?? planAssumptions.packageVersion ?? '');

  if (assumedVersion) {
    const assumedMajor = parseInt(String(assumedVersion).split('.')[0], 10);
    if (!isNaN(assumedMajor) && assumedMajor !== projectBrief.versionMajor) {
      contradictions.push({
        type: 'version_mismatch',
        severity: 'block',
        message: `Plan assumes major version ${assumedMajor} but package is v${projectBrief.versionMajor} (${projectBrief.version})`,
        evidence: { expected: projectBrief.version, actual: assumedVersion },
      });
    }
  }

  // version reference in description
  const versionInDesc = planDesc.match(/\bv?(\d+)\.\d+\.\d+\b/);
  if (versionInDesc) {
    const descMajor = parseInt(versionInDesc[1], 10);
    if (!isNaN(descMajor) && descMajor !== projectBrief.versionMajor) {
      contradictions.push({
        type: 'version_mismatch',
        severity: 'warn',
        message: `Plan description references v${versionInDesc[0]} but package is v${projectBrief.version}`,
        evidence: { expected: projectBrief.version, actual: versionInDesc[0] },
      });
    }
  }

  // 2. branding_error
  const WRONG_NAMES = ['data-tools', 'orchestrator', 'dual_brain', 'dualbrain', 'brain-dual'];
  const searchText = [planDesc, JSON.stringify(planAssumptions)].join(' ').toLowerCase();
  for (const wrongName of WRONG_NAMES) {
    if (searchText.includes(wrongName) && !searchText.includes('dual-brain')) {
      contradictions.push({
        type: 'branding_error',
        severity: 'block',
        message: `Plan references "${wrongName}" but correct package name is "${projectBrief.brandName}"`,
        evidence: { expected: projectBrief.brandName, actual: wrongName },
      });
      break;
    }
  }

  // check explicit packageName assumption
  const assumedName = typeof planAssumptions === 'object' ? planAssumptions.packageName : null;
  if (assumedName && assumedName !== projectBrief.packageName) {
    contradictions.push({
      type: 'name_mismatch',
      severity: 'block',
      message: `Plan assumes packageName "${assumedName}" but actual package is "${projectBrief.packageName}"`,
      evidence: { expected: projectBrief.packageName, actual: assumedName },
    });
  }

  // 3. repeated_failure
  const planWords = new Set(
    planDesc.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  );
  for (const failure of (projectBrief.recentFailures ?? [])) {
    const failureWords = (failure.prompt ?? '').toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const overlap = failureWords.filter(w => planWords.has(w)).length;
    const similarity = overlap / Math.max(planWords.size, failureWords.length, 1);
    if (similarity >= 0.4) {
      contradictions.push({
        type: 'repeated_failure',
        severity: 'warn',
        message: `Plan resembles a recent failed attempt: "${failure.prompt.slice(0, 80)}"`,
        evidence: { expected: 'novel approach', actual: failure.prompt.slice(0, 80) },
      });
      break;
    }
  }

  // 4. scope_violation + 5. protected_file
  const taskFiles = new Set(taskBrief?.filesInScope ?? []);
  const protectedSet = new Set(projectBrief.protectedPaths ?? []);

  for (const f of targetFiles) {
    const isProtected = protectedSet.has(f) || [...protectedSet].some(p => f.endsWith(p));
    const inScope = taskFiles.has(f) || taskFiles.size === 0;

    if (isProtected && !inScope) {
      contradictions.push({
        type: 'protected_file',
        severity: 'block',
        message: `Plan targets protected file "${f}" without explicit scope justification`,
        evidence: { expected: 'file not in plan', actual: f },
      });
    } else if (!inScope && isProtected) {
      contradictions.push({
        type: 'scope_violation',
        severity: 'warn',
        message: `Plan targets "${f}" which is protected and not mentioned in task scope`,
        evidence: { expected: [...taskFiles].join(', ') || 'none', actual: f },
      });
    } else if (!inScope && taskFiles.size > 0) {
      contradictions.push({
        type: 'scope_violation',
        severity: 'warn',
        message: `Plan targets "${f}" which is outside the task's stated file scope`,
        evidence: { expected: [...taskFiles].join(', '), actual: f },
      });
    }
  }

  return contradictions;
}

/**
 * Format a compact situational awareness summary (max 15 lines) for agent prompts.
 */
export function formatBrief(projectBrief, taskBrief) {
  const lines = [];

  const dirtyLabel = projectBrief.dirty ? 'dirty' : 'clean';
  lines.push(
    `PROJECT: ${projectBrief.packageName} v${projectBrief.version} (${projectBrief.moduleType})`
  );

  lines.push(
    `BRANCH: ${projectBrief.branch} (${dirtyLabel}) | ${projectBrief.aheadOfRemote} ahead`
  );

  if (projectBrief.recentCommits?.length > 0) {
    const preview = projectBrief.recentCommits
      .slice(0, 2)
      .map(c => `"${c.slice(0, 50)}"`)
      .join(' · ');
    lines.push(`RECENT: ${preview}`);
  }

  const failureCount = (projectBrief.recentFailures ?? []).length;
  if (failureCount > 0) {
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - dayMs;
    const recent24 = projectBrief.recentFailures.filter(f => f.timestamp >= cutoff).length;
    const categories = [...new Set(
      projectBrief.recentFailures.slice(0, 5).map(f => f.error?.split(':')[0]?.trim()).filter(Boolean)
    )].slice(0, 2).join(', ');
    lines.push(
      `FAILURES: ${recent24} in last 24h${categories ? ` (${categories})` : ''}`
    );
  } else {
    lines.push('FAILURES: none');
  }

  const protectedNames = (projectBrief.protectedPaths ?? [])
    .map(p => p.split('/').pop())
    .join(', ');
  if (protectedNames) lines.push(`PROTECTED: ${protectedNames}`);

  if (taskBrief) {
    const taskPreview = (taskBrief.task ?? '').slice(0, 80);
    if (taskPreview) lines.push(`TASK: "${taskPreview}"`);

    const failedAttempts = (taskBrief.priorAttempts ?? []).filter(a => a.failed);
    if (failedAttempts.length > 0) {
      const lastReason = failedAttempts[0].reason
        ? ` (${failedAttempts[0].reason.slice(0, 40)})`
        : '';
      lines.push(`PRIOR ATTEMPTS: ${failedAttempts.length} failed${lastReason}`);
    }

    if (taskBrief.escalationLevel && taskBrief.escalationLevel !== 'normal') {
      lines.push(`ESCALATION: ${taskBrief.escalationLevel}`);
    }

    if (taskBrief.filesInScope?.length > 0) {
      lines.push(`IN SCOPE: ${taskBrief.filesInScope.slice(0, 4).join(', ')}`);
    }
  }

  return lines.slice(0, 15).join('\n');
}
