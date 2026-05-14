#!/usr/bin/env node
/**
 * dual-brain — Dual-provider orchestrator for Claude Code.
 *
 * Usage:
 *   npx -y dual-brain              # auto-detect, configure, done
 *   npx dual-brain --force          # overwrite existing config
 *   npx dual-brain --dry-run        # detect only, don't install
 *   npx dual-brain --help
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version;

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const force = flag('--force');
const dryRun = flag('--dry-run');
const jsonOut = flag('--json');

if (flag('--version') || flag('-v')) {
  console.log(`dual-brain v${VERSION}`);
  process.exit(0);
}

if (flag('--help') || flag('-h')) {
  console.log(`
  dual-brain v${VERSION} — Dual-provider orchestrator for Claude Code

  Usage:  npx -y dual-brain [options]

  Options:
    --force      Overwrite all existing config (keeps review-rules.md)
    --dry-run    Detect environment only, don't install
    --json       Output detection as JSON (implies --dry-run)
    --help       Show this help
  `);
  process.exit(0);
}

// Silently accept 'init' for backward compat
const positional = argv.filter(a => !a.startsWith('-'));
if (positional.length > 0 && positional[0] !== 'init') {
  console.error(`  Unknown command: ${positional[0]}`);
  console.error('  Run: npx dual-brain --help');
  process.exit(1);
}

// ─── Box Drawing ────────────────────────────────────────────────────────────

const W = 54;
const pad = (s, len = W - 2) => {
  s = String(s);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
};
const ln = (s) => `║ ${pad(s)} ║`;
const br = (l, r) => l + '═'.repeat(W) + r;
const sep = () => '╠' + '═'.repeat(W) + '╣';

// ─── Detection ──────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 8000,
    ...opts,
  });
}

function detectReplit() {
  const isReplit = !!(process.env.REPL_ID || process.env.REPL_SLUG);
  const hasReplitTools = existsSync(resolve(process.cwd(), '.replit-tools'));
  return { isReplit, hasReplitTools };
}

function detectClaude() {
  const result = { installed: false, version: null, authed: false };

  const ver = run('claude', ['--version']);
  if (ver.status === 0 && ver.stdout.trim()) {
    result.installed = true;
    result.version = ver.stdout.trim().split('\n')[0];
  }

  if (!result.installed) {
    const which = run('which', ['claude']);
    if (which.status === 0 && which.stdout.trim()) result.installed = true;
  }

  const credPaths = [
    join(process.env.HOME || '', '.claude', '.credentials.json'),
    join(process.env.HOME || '', '.claude', 'credentials.json'),
    resolve(process.cwd(), '.replit-tools', '.claude-persistent', '.credentials.json'),
  ];
  for (const p of credPaths) {
    try {
      const cred = JSON.parse(readFileSync(p, 'utf8'));
      if (cred.claudeAiOauth || cred.apiKey || cred.oauth_token) {
        result.authed = true;
        break;
      }
    } catch {}
  }

  if (!result.authed && result.installed) {
    const auth = run('claude', ['auth', 'status']);
    const out = ((auth.stdout || '') + (auth.stderr || '')).toLowerCase();
    if (out.includes('logged in') || out.includes('authenticated') || out.includes('valid')) {
      result.authed = true;
    }
  }

  return result;
}

function detectCodex() {
  const result = { installed: false, version: null, authed: false, path: null };

  const which = run('which', ['codex']);
  if (which.status === 0 && which.stdout.trim()) {
    result.path = which.stdout.trim();
    result.installed = true;
  }

  if (!result.installed) {
    const home = process.env.HOME || '';
    const fallbacks = [
      join(home, '.local', 'bin', 'codex'),
      join(home, 'bin', 'codex'),
      '/usr/local/bin/codex',
    ];
    for (const p of fallbacks) {
      if (existsSync(p)) { result.path = p; result.installed = true; break; }
    }
  }

  if (result.installed && result.path) {
    const ver = run(result.path, ['--version']);
    if (ver.status === 0) result.version = ver.stdout.trim().split('\n')[0];

    const login = run(result.path, ['login', 'status']);
    const out = ((login.stdout || '') + (login.stderr || '')).toLowerCase();
    if (login.status === 0 || out.includes('logged in') || out.includes('authenticated')) {
      result.authed = true;
    }
  }

  return result;
}

function detectExisting(workspace) {
  const claude = resolve(workspace, '.claude');
  return {
    hasClaudeDir: existsSync(claude),
    hasOrchestrator: existsSync(join(claude, 'orchestrator.json')),
    hasSettings: existsSync(join(claude, 'settings.json')),
    hasHooks: existsSync(join(claude, 'hooks', 'enforce-tier.mjs')),
  };
}

function detectEnvironment() {
  return {
    ...detectReplit(),
    claude: detectClaude(),
    codex: detectCodex(),
    existing: detectExisting(process.cwd()),
    workspace: resolve(process.cwd()),
  };
}

// ─── Mode Resolution ────────────────────────────────────────────────────────

function resolveMode(env) {
  const c = env.claude.authed || env.claude.installed;
  const o = env.codex.authed;
  if (c && o) return { mode: 'dual', claudeEnabled: true, openaiEnabled: true };
  if (c)      return { mode: 'claude-only', claudeEnabled: true, openaiEnabled: false };
  if (o)      return { mode: 'openai-only', claudeEnabled: false, openaiEnabled: true };
  return { mode: 'detect-only', claudeEnabled: true, openaiEnabled: false };
}

const MODE_LABELS = {
  'dual':        'dual-provider (full features)',
  'claude-only': 'Claude only (GPT features available when Codex authed)',
  'openai-only': 'OpenAI + Claude (auth Claude for full features)',
  'detect-only': 'hooks installed (auth providers to activate)',
};

// ─── Config Generation ──────────────────────────────────────────────────────

function generateOrchestrator(mode, workspace) {
  const template = JSON.parse(readFileSync(join(__dirname, 'orchestrator.json'), 'utf8'));
  const existing = {};
  const existingPath = join(workspace, '.claude', 'orchestrator.json');
  try { Object.assign(existing, JSON.parse(readFileSync(existingPath, 'utf8'))); } catch {}

  const config = force ? { ...template } : { ...template, ...existing };

  config.providers = config.providers || template.providers;
  config.providers.claude = { ...(template.providers?.claude || {}), ...(config.providers?.claude || {}) };
  config.providers.openai = { ...(template.providers?.openai || {}), ...(config.providers?.openai || {}) };
  config.providers.claude.enabled = mode.claudeEnabled;
  config.providers.openai.enabled = mode.openaiEnabled;

  config.dual_thinking = config.dual_thinking || template.dual_thinking;
  config.dual_thinking.enabled = mode.mode === 'dual';

  config.subscriptions = config.subscriptions || template.subscriptions;
  config.model_intelligence = config.model_intelligence || template.model_intelligence;
  config.tiers = config.tiers || template.tiers;
  config.quality_gate = force ? template.quality_gate : (config.quality_gate || template.quality_gate);
  config.routing_rules = force ? template.routing_rules : (config.routing_rules || template.routing_rules);
  config.budgets = force ? template.budgets : (config.budgets || template.budgets);
  config.routing = force ? template.routing : (config.routing || template.routing);
  config.codex_skills = template.codex_skills;
  config.pricing_verified = new Date().toISOString().slice(0, 10);

  return config;
}

function generateSettings(workspace) {
  const settingsPath = join(workspace, '.claude', 'settings.json');
  let existing = {};
  try { existing = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch {}

  const hooks = {
    PreToolUse: [
      {
        matcher: 'Agent',
        hooks: [{ type: 'command', command: 'node .claude/hooks/enforce-tier.mjs' }],
      },
    ],
    PostToolUse: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: 'node .claude/hooks/cost-logger.mjs' }],
      },
    ],
  };

  const DUAL_BRAIN_CMDS = [
    'node .claude/hooks/enforce-tier.mjs',
    'node .claude/hooks/cost-logger.mjs',
  ];

  const merged = { ...(existing.hooks || {}) };
  for (const [event, entries] of Object.entries(hooks)) {
    const existingEntries = (merged[event] || []).filter(e =>
      !e.hooks?.some(h => DUAL_BRAIN_CMDS.includes(h.command))
    );
    merged[event] = [...existingEntries, ...entries];
  }

  return { ...existing, hooks: merged };
}

function generateClaudeMd(mode) {
  let md = readFileSync(join(__dirname, 'CLAUDE.md'), 'utf8');

  if (mode.mode === 'claude-only') {
    md = md.replace(
      /## GPT Lane[\s\S]*?(?=## )/,
      '## GPT Lane\n\nGPT features activate automatically when Codex CLI is authenticated (`npm i -g @openai/codex && codex login`).\n\n'
    );
  } else if (mode.mode === 'detect-only') {
    md = '# Dual-Brain Orchestrator\n\nHooks installed but no providers authenticated yet.\nRun `npx dual-brain` again after authenticating Claude or Codex.\n\n' + md.split('\n').slice(3).join('\n');
  }

  return md;
}

function generateGitignoreEntries(workspace) {
  const entries = [
    '.claude/hooks/usage-*.jsonl',
    '.claude/hooks/usage.jsonl',
    '.claude/reviews/',
    '.claude/hooks/.drift-warned',
    '.claude/hooks/.budget-alerted',
  ];
  let existing = '';
  try { existing = readFileSync(join(workspace, '.gitignore'), 'utf8'); } catch {}
  const needed = entries.filter(e => !existing.includes(e));
  return { existing, needed };
}

// ─── Installation ───────────────────────────────────────────────────────────

function install(workspace, env, mode) {
  const target = join(workspace, '.claude');
  const actions = [];

  mkdirSync(join(target, 'hooks'), { recursive: true });

  const HOOKS = [
    'enforce-tier.mjs', 'cost-logger.mjs', 'cost-report.mjs',
    'dual-brain-review.mjs', 'dual-brain-think.mjs', 'quality-gate.mjs',
    'test-orchestrator.mjs', 'setup-wizard.mjs', 'health-check.mjs',
    'install-git-hooks.mjs', 'session-report.mjs', 'budget-balancer.mjs',
    'gpt-work-dispatcher.mjs',
  ];
  for (const h of HOOKS) cpSync(join(__dirname, 'hooks', h), join(target, 'hooks', h));
  actions.push(`✓ ${HOOKS.length} hook scripts`);

  const RULES = [
    'hookify.orchestrator-route.local.md',
    'hookify.orchestrator-gate.local.md',
    'hookify.orchestrator-cost.local.md',
  ];
  for (const r of RULES) cpSync(join(__dirname, r), join(target, r));
  actions.push(`✓ ${RULES.length} hookify rules`);

  const orch = generateOrchestrator(mode, workspace);
  writeFileSync(join(target, 'orchestrator.json'), JSON.stringify(orch, null, 2) + '\n');
  actions.push(`✓ orchestrator.json (${mode.mode})`);

  const settings = generateSettings(workspace);
  writeFileSync(join(target, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  actions.push('✓ settings.json (hooks registered)');

  const claudeMd = generateClaudeMd(mode);
  writeFileSync(join(target, 'CLAUDE.md'), claudeMd);
  actions.push('✓ CLAUDE.md (session instructions)');

  const rulesTarget = join(target, 'review-rules.md');
  if (!existsSync(rulesTarget) || force) {
    cpSync(join(__dirname, 'review-rules.md'), rulesTarget);
    actions.push('✓ review-rules.md template');
  } else {
    actions.push('⊘ review-rules.md (kept yours)');
  }

  const { existing: gi, needed } = generateGitignoreEntries(workspace);
  if (needed.length > 0) {
    writeFileSync(
      join(workspace, '.gitignore'),
      (gi && !gi.endsWith('\n') ? gi + '\n' : gi) + '\n# Dual-Brain Orchestrator\n' + needed.join('\n') + '\n'
    );
    actions.push('✓ .gitignore updated');
  }

  return actions;
}

// ─── Status Report ──────────────────────────────────────────────────────────

function statusIcon(val) { return val ? '✓' : '✗'; }

function printReport(env, mode, actions) {
  const lines = [];

  lines.push(br('╔', '╗'));
  lines.push(ln(`Dual-Brain Orchestrator v${VERSION}`));
  lines.push(sep());

  lines.push(ln('Environment'));
  if (env.isReplit) {
    lines.push(ln(`  Platform:    Replit${env.hasReplitTools ? ' (replit-tools detected)' : ''}`));
  } else {
    lines.push(ln('  Platform:    standalone'));
  }

  const cVer = env.claude.version ? ` ${env.claude.version}` : '';
  const cAuth = env.claude.authed ? 'authenticated' : env.claude.installed ? 'not authenticated' : 'not found';
  lines.push(ln(`  Claude CLI:  ${statusIcon(env.claude.authed)} ${cAuth}${cVer}`));

  const xVer = env.codex.version ? ` ${env.codex.version}` : '';
  const xAuth = env.codex.authed ? 'authenticated' : env.codex.installed ? 'not authenticated' : 'not found';
  lines.push(ln(`  Codex CLI:   ${statusIcon(env.codex.authed)} ${xAuth}${xVer}`));

  lines.push(sep());
  lines.push(ln(`Mode: ${MODE_LABELS[mode.mode]}`));

  if (actions) {
    lines.push(sep());
    lines.push(ln('Installed'));
    for (const a of actions) lines.push(ln(`  ${a}`));
  }

  const needsAction = !env.claude.authed || !env.codex.authed;
  if (needsAction && mode.mode !== 'dual') {
    lines.push(sep());
    lines.push(ln('To unlock full features:'));
    if (!env.claude.installed) {
      lines.push(ln('  curl -fsSL https://claude.ai/install.sh | sh'));
    }
    if (!env.claude.authed) {
      lines.push(ln('  claude login'));
    }
    if (!env.codex.installed) {
      lines.push(ln('  npm i -g @openai/codex'));
    }
    if (!env.codex.authed && env.codex.installed) {
      lines.push(ln('  codex login'));
    }
    lines.push(ln('  Then run: npx dual-brain'));
  }

  lines.push(sep());
  if (actions) {
    lines.push(ln(mode.mode === 'dual'
      ? 'Ready — both providers active, no restart needed'
      : 'Ready — hooks active, run commands above for full power'));
  } else {
    lines.push(ln('Dry run — no files written'));
  }
  lines.push(br('╚', '╝'));

  console.log('');
  for (const l of lines) console.log(`  ${l}`);
  console.log('');

  if (actions) {
    console.log('  What just happened:');
    console.log('  Every Claude Code session in this project now auto-routes');
    console.log('  agent work by complexity — cheap models for search, mid-tier');
    console.log('  for execution, best models for thinking. Cost is tracked.');
    if (mode.mode === 'dual') {
      console.log('  Both Claude and GPT are available as work providers.');
    }
    console.log('');
    console.log('  Try these in your next Claude Code session:');
    console.log('    node .claude/hooks/health-check.mjs     # verify setup');
    console.log('    node .claude/hooks/cost-report.mjs      # see activity');
    console.log('    node .claude/hooks/budget-balancer.mjs   # provider balance');
    if (mode.openaiEnabled) {
      console.log('    node .claude/hooks/dual-brain-review.mjs # GPT code review');
    }
    console.log('');
    console.log('  Customize:');
    console.log('    .claude/review-rules.md     # your project\'s review rules');
    console.log('    .claude/orchestrator.json   # routing, budgets, tiers');
    console.log('');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const env = detectEnvironment();
  const mode = resolveMode(env);

  if (dryRun || jsonOut) {
    if (jsonOut) {
      console.log(JSON.stringify({ version: VERSION, env, mode }, null, 2));
    } else {
      printReport(env, mode, null);
    }
    process.exit(0);
  }

  const actions = install(env.workspace, env, mode);
  printReport(env, mode, actions);
}

main();
