import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const AUTH_PAT = /\b(auth|credential|secret|token|password|encrypt|permission|oauth|jwt|api.?key)\b/i;
const TEST_PAT = /\b(test|spec|\.test\.|\.spec\.)\b/i;

function gitBranch(cwd) {
  try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}

function packageVersionChanged(cwd, files) {
  if (!files.some(f => f.includes('package.json'))) return false;
  try { return execSync('git diff HEAD~1 HEAD -- package.json', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().includes('"version"'); }
  catch { return false; }
}

function changelogExists(cwd) {
  return ['CHANGELOG.md', 'CHANGELOG', 'changelog.md'].some(f => existsSync(join(cwd, f)));
}

function step(priority, type, message, command, reason) {
  return { priority, type, message, command, reason };
}

function dedup(steps) {
  const seen = new Set();
  return steps.filter(s => { if (seen.has(s.type)) return false; seen.add(s.type); return true; });
}

export async function suggestNextSteps(completedTask = {}, outcome = {}, cwd = process.cwd()) {
  try {
    const { prompt = '', files = [], trigger } = completedTask;
    const { success = false, filesChanged = [], error = '' } = outcome;
    const steps = [];
    const branch = gitBranch(cwd);
    const onMain = !branch || branch === 'main' || branch === 'master';
    const allFiles = [...files, ...filesChanged];
    const hasAuth = allFiles.some(f => AUTH_PAT.test(f));
    const hasTests = allFiles.some(f => TEST_PAT.test(f));
    const n = filesChanged.length;
    const fs = (count) => `${count} file${count !== 1 ? 's' : ''}`;

    if (trigger === 'auto-commit') {
      steps.push(!onMain && branch
        ? step(4, 'pr', `Open a pull request for branch "${branch}"`, `gh pr create --head ${branch}`, `On feature branch — changes need review before merging`)
        : step(3, 'deploy', 'Deploy or tag a release', null, 'Committed to main — ready to ship or version'));
      if (packageVersionChanged(cwd, filesChanged))
        steps.push(step(4, 'publish', 'Publish the new package version to npm', 'npm publish', 'package.json version changed in this commit'));
      if (changelogExists(cwd) && !filesChanged.some(f => /changelog/i.test(f)))
        steps.push(step(2, 'changelog', 'Update CHANGELOG with this change', null, 'CHANGELOG exists but was not updated'));

    } else if (trigger === 'review' || trigger === 'think') {
      const issues = error || /issue|problem|fail|error|warn/i.test(prompt);
      steps.push(issues
        ? step(5, 'fix', 'Fix the issues identified in the review', `dual-brain go "fix issues identified in review"`, 'Review found problems that need resolution')
        : step(3, 'continue', 'Ship it — the review looks good', null, 'Review completed without critical findings'));

    } else if (!success) {
      steps.push(step(5, 'fix', 'Retry with higher reasoning depth', `dual-brain go --tier think "${prompt}"`, 'Task failed — escalating tier may resolve it'));
      if (error && /test/i.test(error))
        steps.push(step(4, 'test', 'Look at test output for clues', null, 'Error references tests — check output to understand the failure'));
      steps.push(step(3, 'review', 'Try a different approach — dual-brain think', `node .claude/hooks/dual-brain-think.mjs --question "${prompt}"`, 'GPT perspective may surface a different solution'));

    } else if (success && n > 0) {
      if (!hasTests)
        steps.push(step(5, 'test', `Run tests to verify the ${fs(n)} changed`, 'npm test', `${fs(n)} changed without test verification`));
      if (hasAuth)
        steps.push(step(5, 'review', 'Run a security review on auth/credential changes', `node .claude/hooks/dual-brain-think.mjs --question "Security review: ${prompt}"`, 'Auth or security-sensitive files were modified'));
      if (n > 3)
        steps.push(step(4, 'review', `Review the ${n}-file diff before committing`, 'git diff', `${n} files changed — quick diff review before committing`));
      if (!onMain && branch)
        steps.push(step(4, 'pr', `Open a pull request for branch "${branch}"`, `gh pr create --head ${branch}`, `Changes are on feature branch "${branch}" — ready for PR`));
      if (hasTests)
        steps.push(step(3, 'commit', 'Commit changes', 'git add -p && git commit', 'Tests passed — safe to commit'));
      steps.push(step(2, 'continue', 'Check for edge cases in the changed code', null, 'Edge cases are often missed during implementation'));
      if (changelogExists(cwd) && !filesChanged.some(f => /changelog/i.test(f)))
        steps.push(step(2, 'changelog', 'Update CHANGELOG with this change', null, 'CHANGELOG exists but was not updated in this batch'));
    }

    const sorted = dedup(steps.sort((a, b) => b.priority - a.priority));
    return {
      steps: sorted,
      topSuggestion: sorted.length > 0 ? `→ ${sorted[0].message}` : '→ Nothing urgent — task complete',
    };
  } catch {
    return { steps: [], topSuggestion: '→ Task complete' };
  }
}

export function formatNextSteps(steps, limit = 3) {
  if (!steps?.length) return '';
  return `📋 Next steps\n${steps.slice(0, limit).map((s, i) => `  ${i + 1}. ${s.message}`).join('\n')}`;
}

export function getTopSuggestion(steps) {
  if (!steps?.length) return '→ Task complete';
  return `→ ${steps[0].message}`;
}
