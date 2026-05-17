// pr-agent.mjs — PR workflow module for dual-brain.
// Provides issue/task → branch → implement → PR automation using the gh CLI.
// Exports: hasGitHub, getBranchInfo, createBranch, getDiffSummary, createPR,
//          listPRs, getPRDetails, buildPRBody

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check if gh CLI is available and authenticated.
 * @returns {{ available: boolean, authenticated: boolean }}
 */
export function hasGitHub(): { available: boolean; authenticated: boolean } {
  try {
    execSync('gh auth status', { stdio: 'pipe', timeout: 5000 });
    return { available: true, authenticated: true };
  } catch {
    try {
      execSync('which gh', { stdio: 'pipe', timeout: 2000 });
      return { available: true, authenticated: false };
    } catch {
      return { available: false, authenticated: false };
    }
  }
}

/**
 * Get current branch info including distance from default branch.
 * @param {string} [cwd]
 * @returns {{ branch: string|null, defaultBranch: string, ahead: number, behind: number, isDefault: boolean }}
 */
export function getBranchInfo(cwd?: string): { branch: string | null; defaultBranch: string; ahead: number; behind: number; isDefault: boolean } {
  const dir = cwd ?? process.cwd();
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim();
    const defaultBranch = execSync(
      'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo refs/remotes/origin/main',
      { cwd: dir, encoding: 'utf8', timeout: 3000 },
    ).trim().replace('refs/remotes/origin/', '');
    const ahead = parseInt(
      execSync(`git rev-list --count ${defaultBranch}..HEAD 2>/dev/null || echo 0`, { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim(),
    ) || 0;
    const behind = parseInt(
      execSync(`git rev-list --count HEAD..${defaultBranch} 2>/dev/null || echo 0`, { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim(),
    ) || 0;
    return { branch, defaultBranch, ahead, behind, isDefault: branch === defaultBranch };
  } catch {
    return { branch: null, defaultBranch: 'main', ahead: 0, behind: 0, isDefault: true };
  }
}

/**
 * Create a feature branch from a task description.
 * Branch name is prefixed with "db/" and slugified from the description.
 * @param {string} taskDescription
 * @param {string} [cwd]
 * @returns {{ success: boolean, branch: string, error?: string }}
 */
export function createBranch(taskDescription: string, cwd?: string): { success: boolean; branch: string; error?: string } {
  const dir = cwd ?? process.cwd();
  const slug = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
  const branchName = `db/${slug}`;

  try {
    execSync(`git checkout -b "${branchName}"`, { cwd: dir, stdio: 'pipe', timeout: 5000 });
    return { success: true, branch: branchName };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, branch: branchName, error: msg };
  }
}

/**
 * Get diff summary for PR description generation.
 * @param {string} baseBranch  Base branch name (e.g. 'main')
 * @param {string} [cwd]
 * @returns {{ stat: string, files: string[], summary: string, fileCount: number }}
 */
export function getDiffSummary(baseBranch: string, cwd?: string): { stat: string; files: string[]; summary: string; fileCount: number } {
  const dir = cwd ?? process.cwd();
  try {
    const stat = execSync(`git diff --stat ${baseBranch}...HEAD`, { cwd: dir, encoding: 'utf8', timeout: 10000 }).trim();
    const files = execSync(`git diff --name-only ${baseBranch}...HEAD`, { cwd: dir, encoding: 'utf8', timeout: 5000 })
      .trim()
      .split('\n')
      .filter(Boolean);
    const summary = execSync(`git diff --shortstat ${baseBranch}...HEAD`, { cwd: dir, encoding: 'utf8', timeout: 5000 }).trim();
    return { stat, files, summary, fileCount: files.length };
  } catch {
    return { stat: '', files: [], summary: '', fileCount: 0 };
  }
}

/**
 * Create a PR using the gh CLI. Pushes the current branch first.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.baseBranch]
 * @param {boolean} [opts.draft]
 * @param {string[]} [opts.labels]
 * @param {string} [opts.cwd]
 * @returns {{ success: boolean, url?: string, error?: string }}
 */
export function createPR(opts: { title: string; body: string; baseBranch?: string; draft?: boolean; labels?: string[]; cwd?: string }): { success: boolean; url?: string; error?: string } {
  const { title, body, baseBranch, draft, labels, cwd } = opts;
  const dir = cwd ?? process.cwd();

  try {
    // Push current branch to origin first
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim();
    execSync(`git push -u origin "${branch}"`, { cwd: dir, stdio: 'pipe', timeout: 30000 });

    // Build gh pr create args
    const args = ['gh', 'pr', 'create', '--title', JSON.stringify(title), '--body', JSON.stringify(body)];
    if (baseBranch) args.push('--base', baseBranch);
    if (draft) args.push('--draft');
    if (labels?.length) args.push('--label', labels.join(','));

    const result = execSync(args.join(' '), { cwd: dir, encoding: 'utf8', timeout: 30000 });
    const url = result.trim();
    return { success: true, url };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * List open (or other state) PRs for the current repo.
 * @param {string} [cwd]
 * @param {object} [opts]
 * @param {'open'|'closed'|'merged'|'all'} [opts.state]
 * @param {number} [opts.limit]
 * @returns {object[]}
 */
export function listPRs(cwd?: string, opts: { state?: string; limit?: number } = {}): unknown[] {
  const dir = cwd ?? process.cwd();
  const { state = 'open', limit = 10 } = opts;
  try {
    const json = execSync(
      `gh pr list --state ${state} --limit ${limit} --json number,title,headRefName,author,createdAt,isDraft`,
      { cwd: dir, encoding: 'utf8', timeout: 10000 },
    );
    return JSON.parse(json);
  } catch {
    return [];
  }
}

/**
 * Get PR details including diff stats, comments, and CI checks.
 * @param {number|string} prNumber
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function getPRDetails(prNumber: number | string, cwd?: string): unknown {
  const dir = cwd ?? process.cwd();
  try {
    const json = execSync(
      `gh pr view ${prNumber} --json title,body,headRefName,baseRefName,state,additions,deletions,changedFiles,reviews,comments,statusCheckRollup`,
      { cwd: dir, encoding: 'utf8', timeout: 10000 },
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Build a PR body from a task description and dispatch results.
 * @param {string} taskDescription
 * @param {object} results  Dispatch result object (filesChanged, testsRun, decisions, etc.)
 * @returns {string}
 */
export function buildPRBody(taskDescription: string, results: { filesChanged?: string[]; testsRun?: string[]; decisions?: string[] }): string {
  const lines = [];
  lines.push('## Summary');
  lines.push(taskDescription);
  lines.push('');

  if (results.filesChanged?.length) {
    lines.push('## Changes');
    for (const f of results.filesChanged) {
      lines.push(`- \`${f}\``);
    }
    lines.push('');
  }

  if (results.testsRun?.length) {
    lines.push('## Tests');
    for (const t of results.testsRun) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  if (results.decisions?.length) {
    lines.push('## Routing');
    for (const d of results.decisions) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('Generated by [dual-brain](https://npmjs.com/package/dual-brain)');

  return lines.join('\n');
}
