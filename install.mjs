#!/usr/bin/env node
/**
 * dual-brain init — Install the Dual-Brain Orchestrator into your project.
 *
 * Usage:
 *   npx dual-brain init
 *   node install.mjs [--force]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(process.cwd(), '.claude');
const force = process.argv.includes('--force');

console.log('');
console.log('  ╔══════════════════════════════════════════════════╗');
console.log('  ║          Dual-Brain Orchestrator Installer        ║');
console.log('  ╚══════════════════════════════════════════════════╝');
console.log('');

// Check if .claude already exists
if (existsSync(TARGET) && !force) {
  console.log('  .claude/ directory already exists.');
  console.log('  Use --force to overwrite, or run the setup wizard:');
  console.log('  node .claude/hooks/setup-wizard.mjs');
  console.log('');
  process.exit(1);
}

// Create directories
mkdirSync(join(TARGET, 'hooks'), { recursive: true });

// Copy hooks
const HOOKS = [
  'enforce-tier.mjs', 'cost-logger.mjs', 'cost-report.mjs',
  'dual-brain-review.mjs', 'quality-gate.mjs', 'test-orchestrator.mjs',
  'setup-wizard.mjs', 'health-check.mjs', 'install-git-hooks.mjs',
  'session-report.mjs',
];

for (const hook of HOOKS) {
  const src = join(__dirname, 'hooks', hook);
  const dst = join(TARGET, 'hooks', hook);
  cpSync(src, dst);
}
console.log(`  ✓ Copied ${HOOKS.length} hook scripts`);

// Copy config files
const CONFIGS = [
  'orchestrator.json',
  'hookify.orchestrator-route.local.md',
  'hookify.orchestrator-gate.local.md',
  'hookify.orchestrator-cost.local.md',
];

for (const cfg of CONFIGS) {
  const src = join(__dirname, cfg);
  const dst = join(TARGET, cfg);
  cpSync(src, dst);
}
console.log('  ✓ Copied orchestrator config');

// Copy review-rules template (don't overwrite if exists)
const rulesTarget = join(TARGET, 'review-rules.md');
if (!existsSync(rulesTarget)) {
  cpSync(join(__dirname, 'review-rules.md'), rulesTarget);
  console.log('  ✓ Created review-rules.md template');
} else {
  console.log('  ⊘ review-rules.md already exists, skipping');
}

// Update .gitignore
const gitignorePath = resolve(process.cwd(), '.gitignore');
const ignoreEntries = [
  '.claude/hooks/usage-*.jsonl',
  '.claude/hooks/usage.jsonl',
  '.claude/reviews/',
  '.claude/hooks/.drift-warned',
  '.claude/hooks/.budget-alerted',
];

let gitignore = '';
try { gitignore = readFileSync(gitignorePath, 'utf8'); } catch {}

const newEntries = ignoreEntries.filter(e => !gitignore.includes(e));
if (newEntries.length > 0) {
  const block = '\n# Dual-Brain Orchestrator\n' + newEntries.join('\n') + '\n';
  writeFileSync(gitignorePath, gitignore + block);
  console.log('  ✓ Updated .gitignore');
}

console.log('');
console.log('  ╔══════════════════════════════════════════════════╗');
console.log('  ║                   Installed!                      ║');
console.log('  ╠══════════════════════════════════════════════════╣');
console.log('  ║  Next steps:                                      ║');
console.log('  ║  1. node .claude/hooks/setup-wizard.mjs           ║');
console.log('  ║  2. Restart your Claude Code session              ║');
console.log('  ║  3. node .claude/hooks/health-check.mjs           ║');
console.log('  ╠══════════════════════════════════════════════════╣');
console.log('  ║  Optional:                                        ║');
console.log('  ║  • Edit .claude/review-rules.md for your repo     ║');
console.log('  ║  • node .claude/hooks/install-git-hooks.mjs       ║');
console.log('  ║  • node .claude/hooks/test-orchestrator.mjs       ║');
console.log('  ╚══════════════════════════════════════════════════╝');
console.log('');
