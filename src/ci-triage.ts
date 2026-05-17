import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Detect CI system in use.
 * @param {string} [cwd]
 * @returns {{ systems: string[], primary: string|null }}
 */
export function detectCI(cwd?: string): { systems: string[]; primary: string | null } {
  const root = cwd || process.cwd();
  const systems = [];

  if (existsSync(join(root, '.github/workflows'))) systems.push('github-actions');
  if (existsSync(join(root, '.circleci')))          systems.push('circleci');
  if (existsSync(join(root, '.gitlab-ci.yml')))     systems.push('gitlab-ci');
  if (existsSync(join(root, 'Jenkinsfile')))        systems.push('jenkins');
  if (existsSync(join(root, '.travis.yml')))        systems.push('travis');
  if (existsSync(join(root, 'vercel.json')) || existsSync(join(root, '.vercel'))) systems.push('vercel');
  if (existsSync(join(root, 'netlify.toml')))       systems.push('netlify');

  return { systems, primary: systems[0] || null };
}

/**
 * Get recent CI run status using gh CLI.
 * @param {string} [cwd]
 * @returns {{ available: boolean, runs: object[], hasFailures: boolean, lastRun: object|null }}
 */
export function getCIStatus(cwd?: string): { available: boolean; runs: unknown[]; hasFailures: boolean; lastRun: unknown } {
  try {
    const json = execSync(
      'gh run list --limit 5 --json databaseId,name,status,conclusion,headBranch,createdAt',
      { cwd, encoding: 'utf8', timeout: 10000 }
    );
    const runs = JSON.parse(json) as Array<Record<string, unknown>>;
    return {
      available: true,
      runs: runs.map((r: Record<string, unknown>) => ({
        id: r.databaseId,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        branch: r.headBranch,
        createdAt: r.createdAt,
      })),
      hasFailures: runs.some((r: Record<string, unknown>) => r.conclusion === 'failure'),
      lastRun: runs[0] || null,
    };
  } catch {
    return { available: false, runs: [], hasFailures: false, lastRun: null };
  }
}

/**
 * Get failed CI run logs and classify the failure.
 * @param {string|number} runId
 * @param {string} [cwd]
 * @returns {object}
 */
export function triageFailure(runId: string | number, cwd?: string): Record<string, unknown> {
  try {
    const logs = execSync(`gh run view ${runId} --log-failed 2>/dev/null | tail -100`, {
      cwd, encoding: 'utf8', timeout: 15000,
    });

    const classification = classifyFailure(logs);
    const fileHints = extractFileHints(logs, cwd);

    return {
      success: true,
      runId,
      logs: logs.slice(-3000), // last 3000 chars
      classification,
      fileHints,
      suggestedAction: getSuggestedAction(classification),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, runId, error: msg };
  }
}

/**
 * Classify a CI failure from log output.
 * @param {string} logs
 * @returns {{ type: string, confidence: string }}
 */
function classifyFailure(logs: string): { type: string; confidence: string } {
  const lower = logs.toLowerCase();

  if (lower.includes('syntaxerror') || lower.includes('parse error'))               return { type: 'syntax',          confidence: 'high' };
  if (lower.includes('typeerror') || lower.includes('type error'))                  return { type: 'type-error',      confidence: 'high' };
  if (lower.includes('referenceerror'))                                              return { type: 'reference-error', confidence: 'high' };
  if (lower.includes('test fail') || lower.includes('tests failed') || lower.includes('assertion')) return { type: 'test-failure',    confidence: 'high' };
  if (lower.includes('enoent') || lower.includes('no such file'))                   return { type: 'missing-file',    confidence: 'high' };
  if (lower.includes('permission denied') || lower.includes('eacces'))             return { type: 'permissions',     confidence: 'high' };
  if (lower.includes('timeout') || lower.includes('timed out'))                    return { type: 'timeout',         confidence: 'medium' };
  if (lower.includes('out of memory') || lower.includes('heap'))                   return { type: 'oom',             confidence: 'medium' };
  if (lower.includes('npm err') || lower.includes('yarn error') || lower.includes('dependency')) return { type: 'dependency',     confidence: 'medium' };
  if (lower.includes('lint') || lower.includes('eslint'))                           return { type: 'lint',            confidence: 'high' };
  if (lower.includes('build fail'))                                                  return { type: 'build',           confidence: 'medium' };
  if (lower.includes('docker') || lower.includes('container'))                      return { type: 'container',       confidence: 'medium' };

  return { type: 'unknown', confidence: 'low' };
}

/**
 * Extract local file paths referenced in CI logs.
 * @param {string} logs
 * @param {string} [cwd]
 * @returns {string[]}
 */
function extractFileHints(logs: string, cwd?: string): string[] {
  const files = new Set();
  const root = cwd || process.cwd();

  const patterns = [
    /(?:at\s+)?([a-zA-Z0-9_./\\-]+\.[a-zA-Z]+):(\d+)/g,
    /(?:in\s+)?([a-zA-Z0-9_./\\-]+\.[a-zA-Z]+)\((\d+)\)/g,
    /Error in ([a-zA-Z0-9_./\\-]+\.[a-zA-Z]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of logs.matchAll(pattern)) {
      const file = match[1];
      if (file && !file.includes('node_modules') && existsSync(join(root, file))) {
        files.add(file);
      }
    }
  }

  return [...files] as string[];
}

/**
 * Get a human-readable suggested action for a failure classification.
 * @param {{ type: string }} classification
 * @returns {string}
 */
function getSuggestedAction(classification: { type: string }): string {
  const actions = {
    'syntax':          'Fix syntax error in the identified file',
    'type-error':      'Check type annotations and function signatures',
    'reference-error': 'Check for undefined variables or missing imports',
    'test-failure':    'Run tests locally and fix failing assertions',
    'missing-file':    'Check if a required file was deleted or not committed',
    'permissions':     'Check file permissions and access rights',
    'timeout':         'Investigate slow operations or increase timeout',
    'oom':             'Check for memory leaks or reduce batch size',
    'dependency':      'Run npm install and check for version conflicts',
    'lint':            'Run linter locally and fix violations',
    'build':           'Check build configuration and dependencies',
    'container':       'Check Dockerfile and container configuration',
    'unknown':         'Review full CI logs for error details',
  };
  return actions[classification.type as keyof typeof actions] || actions.unknown;
}

/**
 * Full CI triage: detect CI, fetch status, classify failures, map to files.
 * @param {string} [cwd]
 * @returns {object}
 */
export function fullTriage(cwd?: string): Record<string, unknown> {
  const ci = detectCI(cwd);
  if (!ci.primary) return { available: false, reason: 'no-ci-detected' };

  const status = getCIStatus(cwd);
  if (!status.available) return { available: false, reason: 'gh-cli-unavailable' };
  if (!status.hasFailures) return { available: true, healthy: true, message: 'All CI runs passing' };

  const failedRuns = status.runs.filter((r: unknown) => (r as Record<string, unknown>).conclusion === 'failure');
  const triages = failedRuns.slice(0, 3).map((r: unknown) => triageFailure((r as Record<string, unknown>).id as string, cwd));

  return {
    available: true,
    healthy: false,
    failedRuns: failedRuns.length,
    triages,
    topIssue: triages[0]?.classification || null,
  };
}

// ─── CLI (direct invocation) ──────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('ci-triage.ts') || process.argv[1]?.endsWith('ci-triage.js');
if (isMain) {
  const cwd = process.argv[2] || process.cwd();
  const result = fullTriage(cwd);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
