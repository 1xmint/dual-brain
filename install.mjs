#!/usr/bin/env node
/**
 * dual-brain — Install the Dual-Brain Orchestrator into your project.
 *
 * Usage:
 *   npx dual-brain init [--force]
 *   npx dual-brain --help
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith('-'));
const force = args.includes('--force');

const W = 50;
const border = (l, r) => l + '═'.repeat(W) + r;
const line = (text) => {
  const padded = String(text).padEnd(W - 2);
  return `║ ${padded.slice(0, W - 2)} ║`;
};

if (args.includes('--help') || args.includes('-h') || (!command && !force)) {
  console.log('');
  console.log('  Usage: npx dual-brain init [--force]');
  console.log('');
  console.log('  Commands:');
  console.log('    init       Install orchestrator into .claude/');
  console.log('');
  console.log('  Options:');
  console.log('    --force    Overwrite existing .claude/ hooks');
  console.log('    --help     Show this help message');
  console.log('');
  process.exit(0);
}

if (command && command !== 'init') {
  console.error(`  Unknown command: ${command}`);
  console.error('  Run: npx dual-brain --help');
  process.exit(1);
}

const TARGET = resolve(process.cwd(), '.claude');

console.log('');
console.log(`  ${border('╔', '╗')}`);
console.log(`  ${line('Dual-Brain Orchestrator Installer')}`);
console.log(`  ${border('╚', '╝')}`);
console.log('');

if (existsSync(TARGET) && !force) {
  console.log('  .claude/ directory already exists.');
  console.log('  Use --force to overwrite, or run the setup wizard:');
  console.log('  node .claude/hooks/setup-wizard.mjs');
  console.log('');
  process.exit(1);
}

mkdirSync(join(TARGET, 'hooks'), { recursive: true });

const HOOKS = [
  'enforce-tier.mjs', 'cost-logger.mjs', 'cost-report.mjs',
  'dual-brain-review.mjs', 'dual-brain-think.mjs', 'quality-gate.mjs',
  'test-orchestrator.mjs', 'setup-wizard.mjs', 'health-check.mjs',
  'install-git-hooks.mjs', 'session-report.mjs', 'budget-balancer.mjs',
  'gpt-work-dispatcher.mjs',
];

for (const hook of HOOKS) {
  cpSync(join(__dirname, 'hooks', hook), join(TARGET, 'hooks', hook));
}
console.log(`  ✓ Copied ${HOOKS.length} hook scripts`);

const CONFIGS = [
  'orchestrator.json',
  'CLAUDE.md',
  'hookify.orchestrator-route.local.md',
  'hookify.orchestrator-gate.local.md',
  'hookify.orchestrator-cost.local.md',
];

for (const cfg of CONFIGS) {
  cpSync(join(__dirname, cfg), join(TARGET, cfg));
}
console.log('  ✓ Copied orchestrator config');

const rulesTarget = join(TARGET, 'review-rules.md');
if (!existsSync(rulesTarget)) {
  cpSync(join(__dirname, 'review-rules.md'), rulesTarget);
  console.log('  ✓ Created review-rules.md template');
} else {
  console.log('  ⊘ review-rules.md already exists, skipping');
}

const settingsPath = join(TARGET, 'settings.json');
let settings = {};
try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}

const hooksConfig = {
  PreToolUse: [
    {
      matcher: 'Agent',
      hooks: [{ type: 'command', command: `node ${join('.claude', 'hooks', 'enforce-tier.mjs')}` }],
    },
  ],
  PostToolUse: [
    {
      matcher: '',
      hooks: [{ type: 'command', command: `node ${join('.claude', 'hooks', 'cost-logger.mjs')}` }],
    },
  ],
};

settings.hooks = { ...(settings.hooks || {}), ...hooksConfig };
writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
console.log('  ✓ Registered hooks in .claude/settings.json');

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
console.log(`  ${border('╔', '╗')}`);
console.log(`  ${line('Installed!')}`);
console.log(`  ${border('╠', '╣')}`);
console.log(`  ${line('Next steps:')}`);
console.log(`  ${line('1. node .claude/hooks/setup-wizard.mjs')}`);
console.log(`  ${line('2. Restart your Claude Code session')}`);
console.log(`  ${line('3. node .claude/hooks/health-check.mjs')}`);
console.log(`  ${border('╠', '╣')}`);
console.log(`  ${line('Optional:')}`);
console.log(`  ${line('• Edit .claude/review-rules.md for your repo')}`);
console.log(`  ${line('• node .claude/hooks/install-git-hooks.mjs')}`);
console.log(`  ${line('• node .claude/hooks/test-orchestrator.mjs')}`);
console.log(`  ${border('╚', '╝')}`);
console.log('');
