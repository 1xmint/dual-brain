#!/usr/bin/env node
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const url = `https://registry.npmjs.org/dual-brain/${version}`;
const maxWait = 30000;
const start = Date.now();

async function check() {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`✓ dual-brain@${version} verified on registry`);
      return true;
    }
  } catch {}

  if (Date.now() - start > maxWait) {
    console.log(`⚠ dual-brain@${version} published but CDN propagation may take a moment`);
    return true;
  }

  await new Promise(r => setTimeout(r, 3000));
  return check();
}

async function commitAndPush() {
  try {
    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (!status) return;

    // Stage all tracked + new src/hooks/bin files (not .dualbrain/ runtime state)
    execSync('git add src/ hooks/ bin/ scripts/ package.json CLAUDE.md .claude/ .replit .gitignore tests/ 2>/dev/null || true', { encoding: 'utf8' });

    // Check if anything was staged
    const staged = execSync('git diff --cached --stat', { encoding: 'utf8' }).trim();
    if (!staged) return;

    execSync(`git commit -m "${version}: publish"`, { encoding: 'utf8' });
    console.log(`✓ committed ${version}`);

    // Push with explicit credential helper (Replit persistence)
    const ghDir = '/home/runner/workspace/.replit-tools/.gh-persistent';
    const credHelper = `!GH_CONFIG_DIR=${ghDir} gh auth git-credential`;
    execSync(`git -c 'credential.https://github.com.helper=${credHelper}' push`, {
      encoding: 'utf8',
      timeout: 15000,
      env: { ...process.env, GH_CONFIG_DIR: ghDir },
    });
    console.log(`✓ pushed to origin`);
  } catch (e) {
    // Non-fatal — publish succeeded even if commit/push fails
    const msg = e.message || '';
    if (msg.includes('Authentication')) {
      console.log(`⚠ push failed (git auth not configured) — commit is local`);
    }
  }
}

const verified = await check();
if (verified) await commitAndPush();
