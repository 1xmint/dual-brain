// setup-flow.ts — Interactive first-run setup for dual-brain
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface, Interface } from 'node:readline';
import { execSync } from 'node:child_process';

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface DetectedEnvironment {
  claude: boolean;
  codex: boolean;
  git: boolean;
  gitBranch: string | null;
  language: string;
  existingConfig: boolean;
}

interface SetupAnswers {
  subscription?: string;
  subscriptionCapacity?: SubscriptionCapacity;
  workStyle?: string;
  advanced?: AdvancedOptions;
  setupMode?: string;
  shellDefault?: boolean;
}

interface SubscriptionCapacity {
  raw: string;
  counts: Record<string, number>;
}

interface AdvancedOptions {
  thinkEnabled?: boolean;
  cascadeEnabled?: boolean;
  learningEnabled?: boolean;
  explorationRate?: number;
  sessionLimitTokens?: number | null;
  warnAtPercent?: number;
  models?: Record<string, string>;
}

interface SetupConfig {
  version: number;
  subscription: string;
  subscriptionCapacity?: SubscriptionCapacity;
  workStyle: string;
  providers: { claude: boolean; openai: boolean };
  routing: {
    thinkEnabled: boolean;
    cascadeEnabled: boolean;
    learningEnabled: boolean;
    explorationRate: number;
  };
  models: Record<string, string>;
  budget: { sessionLimitTokens: number | null; warnAtPercent: number };
  configuredAt: string;
  setupMode: string;
  shellDefault: boolean;
  detectedEnv: { claude: boolean; codex: boolean; language: string };
}

interface SetupOptions {
  nonInteractive?: boolean;
  reconfigure?: boolean;
  subscription?: string;
  workStyle?: string;
}

interface MenuOption {
  label: string;
  value: unknown;
  description?: string;
}

// ── Detection ─────────────────────────────────────────────────────────────────
export function detectEnvironment(cwd: string): DetectedEnvironment {
  const tryCmd = (cmd: string): boolean => { try { execSync(cmd, { stdio: 'pipe' }); return true; } catch { return false; } };

  let language = 'unknown';
  if (existsSync(join(cwd, 'package.json')))      language = 'node';
  else if (existsSync(join(cwd, 'pyproject.toml')) ||
           existsSync(join(cwd, 'setup.py')))      language = 'python';
  else if (existsSync(join(cwd, 'go.mod')))        language = 'go';
  else if (existsSync(join(cwd, 'Cargo.toml')))    language = 'rust';
  else if (existsSync(join(cwd, 'pom.xml')))       language = 'java';

  let gitBranch: string | null = null;
  try { gitBranch = execSync('git -C "' + cwd + '" branch --show-current', { stdio: 'pipe' }).toString().trim(); } catch {}

  return {
    claude:         tryCmd('claude --version'),
    codex:          tryCmd('codex --version'),
    git:            !!gitBranch,
    gitBranch:      gitBranch || null,
    language,
    existingConfig: existsSync(join(cwd, '.dualbrain', 'config.json')),
  };
}

// ── Welcome banner ────────────────────────────────────────────────────────────
export function renderWelcome(detected: DetectedEnvironment): string {
  const row = (ok: boolean, label: string) => c.cyan('│') + `   ${ok ? c.green('✓') : c.dim('✗')} ${ok ? label : c.dim(label)}`.padEnd(49) + c.cyan('│');
  const bar = (s: string) => c.cyan('│') + s.padEnd(49) + c.cyan('│');
  return [
    c.cyan('╭' + '─'.repeat(49) + '╮'),
    bar(''),
    bar(`   ${c.bold('dual-brain')} — intelligent model orchestration`),
    bar(''),
    bar('   Detected:'),
    row(detected.claude, 'Claude CLI available'),
    row(detected.codex,  'Codex CLI available'),
    row(detected.git,    `Git repository (${detected.gitBranch || 'no branch'} branch)`),
    row(detected.language !== 'unknown', `${detected.language} project`),
    bar(''),
    c.cyan('╰' + '─'.repeat(49) + '╯'),
  ].join('\n');
}

const SUB_LABELS: Record<string, string> = {
  'claude-pro': 'Claude Pro', 'claude-max-5x': 'Claude Max 5x',
  'claude-max-20x': 'Claude Max 20x', 'chatgpt-plus': 'ChatGPT Plus',
  'chatgpt-pro': 'ChatGPT Pro', 'dual-pro': 'Both Pro tiers', 'dual-max': 'Max + Pro tiers',
  'auto-detected': 'Auto-detected providers',
  'declared-capacity': 'Declared subscription capacity',
};

const CAPACITY_LABELS: Record<string, string> = {
  claudePro: 'Claude Pro $20',
  claudeMax5x: 'Claude Max $100',
  claudeMax20x: 'Claude Max $200',
  chatgptPlus: 'ChatGPT Plus $20',
  chatgptPro: 'ChatGPT Pro $200',
};

// ── Confirmation display ──────────────────────────────────────────────────────
export function renderConfirmation(config: SetupConfig): string {
  const row = (k: string, v: string) => `  ${c.dim(k.padEnd(16))} ${c.cyan(v)}`;
  return [
    '', c.bold('  Configuration:'), '',
    row('Subscription:', SUB_LABELS[config.subscription] || config.subscription),
    config.subscriptionCapacity ? row('Capacity:', formatCapacity(config.subscriptionCapacity)) : '',
    row('Work style:', config.workStyle),
    row('Primary model:', config.models.execute),
    row('Think agent:', config.routing.thinkEnabled ? 'enabled' : 'disabled'),
    row('Learning:', config.routing.learningEnabled ? 'on' : 'off'),
    row('Shell default:', config.shellDefault ? 'dual-brain' : 'leave current shell menu'),
    '',
  ].join('\n');
}

// ── Config builder ────────────────────────────────────────────────────────────
export function buildConfig(answers: SetupAnswers, detected: DetectedEnvironment): SetupConfig {
  const { subscription = 'auto-detected', subscriptionCapacity, workStyle = 'balanced', advanced = {}, setupMode = 'quick', shellDefault = true } = answers;
  const dual = subscription.startsWith('dual-');
  const isMax = subscription.includes('max') || subscription === 'chatgpt-pro';
  const topModel = isMax ? 'opus' : 'sonnet';
  const exploreRate = ({ aggressive: 0.3, conservative: 0.1, auto: 0.25 } as Record<string, number>)[workStyle] ?? 0.2;
  const capacityProviders = providersFromCapacity(subscriptionCapacity);
  return {
    version: 1, subscription, subscriptionCapacity, workStyle,
    providers: {
      claude: capacityProviders.claude || subscription.startsWith('claude-') || dual || (subscription === 'auto-detected' && detected.claude),
      openai: capacityProviders.openai || subscription.startsWith('chatgpt-') || dual || (subscription === 'auto-detected' && detected.codex),
    },
    routing: {
      thinkEnabled:    advanced.thinkEnabled    ?? true,
      cascadeEnabled:  advanced.cascadeEnabled  ?? true,
      learningEnabled: advanced.learningEnabled ?? true,
      explorationRate: advanced.explorationRate ?? exploreRate,
    },
    models: advanced.models || { search: 'haiku', execute: 'sonnet', think: topModel, review: topModel },
    budget: { sessionLimitTokens: advanced.sessionLimitTokens ?? null, warnAtPercent: advanced.warnAtPercent ?? 80 },
    configuredAt: new Date().toISOString(),
    setupMode,
    shellDefault,
    detectedEnv: { claude: detected.claude, codex: detected.codex, language: detected.language },
  };
}

// ── Save config ───────────────────────────────────────────────────────────────
export function saveConfig(config: SetupConfig, cwd: string): void {
  const dir = join(cwd, '.dualbrain');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
  writeFileSync(join(dir, 'subscription.json'), JSON.stringify({
    subscription: config.subscription,
    capacity: config.subscriptionCapacity || null,
    configuredAt: config.configuredAt,
  }, null, 2), 'utf8');
  const orchPath = join(cwd, '.claude', 'orchestrator.json');
  if (existsSync(orchPath)) {
    try {
      const orch = JSON.parse(readFileSync(orchPath, 'utf8'));
      if (!orch.providers) orch.providers = {};
      orch.providers.claude = { ...(orch.providers.claude || {}), enabled: config.providers.claude, subscription: config.subscription };
      orch.providers.openai = { ...(orch.providers.openai || {}), enabled: config.providers.openai };
      if (config.routing) orch.routing = { ...(orch.routing || {}), ...config.routing };
      writeFileSync(orchPath, JSON.stringify(orch, null, 2), 'utf8');
    } catch { /* non-fatal */ }
  }
}

// ── Readline prompt helper ────────────────────────────────────────────────────
async function ask(rl: Interface, question: string, options: MenuOption[]): Promise<unknown> {
  const lines = options.map((o, i) => `  ${c.cyan(String(i + 1) + ')')} ${o.label}${o.description ? c.dim(' — ' + o.description) : ''}`);
  const prompt = `\n${c.bold(question)}\n${lines.join('\n')}\n${c.dim('> ')}`;
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      const trimmed = answer.trim();
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < options.length) resolve(options[idx].value);
      else resolve(options[0].value);
    });
  });
}

async function askYN(rl: Interface, question: string, defaultYes = true): Promise<boolean> {
  return new Promise(resolve => {
    rl.question(`\n${c.bold(question)} ${c.dim(defaultYes ? '(Y/n)' : '(y/N)')} `, answer => {
      const t = answer.trim().toLowerCase();
      if (!t) resolve(defaultYes);
      else resolve(t === 'y' || t === 'yes');
    });
  });
}

async function askLine(rl: Interface, question: string, hint: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(`\n${c.bold(question)}\n${c.dim(hint)}\n${c.dim('> ')}`, answer => resolve(answer.trim()));
  });
}

function parseCapacity(input: string): SubscriptionCapacity | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const counts: Record<string, number> = {};
  const aliases: Record<string, string> = {
    'claude-pro': 'claudePro', 'claude20': 'claudePro', 'c20': 'claudePro', 'cp': 'claudePro',
    'claude-max': 'claudeMax5x', 'claude-max-5x': 'claudeMax5x', 'claude100': 'claudeMax5x', 'c100': 'claudeMax5x', 'cm5': 'claudeMax5x',
    'claude-max-20x': 'claudeMax20x', 'claude200': 'claudeMax20x', 'c200': 'claudeMax20x', 'cm20': 'claudeMax20x',
    'chatgpt-plus': 'chatgptPlus', 'gpt-plus': 'chatgptPlus', 'openai20': 'chatgptPlus', 'gpt20': 'chatgptPlus', 'g20': 'chatgptPlus',
    'chatgpt-pro': 'chatgptPro', 'gpt-pro': 'chatgptPro', 'openai200': 'chatgptPro', 'gpt200': 'chatgptPro', 'g200': 'chatgptPro',
  };

  for (const match of raw.matchAll(/([a-z0-9$-]+)\s*(?:=|x|\*)\s*(\d+)/gi)) {
    const key = match[1].toLowerCase();
    const count = Math.max(0, parseInt(match[2], 10) || 0);
    const mapped = aliases[key] || (key === '$100' ? 'claudeMax5x' : key === '$200' ? 'chatgptPro' : key === '$20' ? 'chatgptPlus' : '');
    if (mapped && count) counts[mapped] = (counts[mapped] || 0) + count;
  }

  return { raw, counts };
}

function formatCapacity(capacity: SubscriptionCapacity): string {
  const parts = Object.entries(capacity.counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${CAPACITY_LABELS[key] || key} x${count}`);
  return parts.length ? parts.join(', ') : capacity.raw;
}

function providersFromCapacity(capacity?: SubscriptionCapacity): { claude: boolean; openai: boolean } {
  const counts = capacity?.counts || {};
  return {
    claude: !!(counts.claudePro || counts.claudeMax5x || counts.claudeMax20x),
    openai: !!(counts.chatgptPlus || counts.chatgptPro),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function runSetup(cwd: string, options: SetupOptions = {}): Promise<SetupConfig | null> {
  const detected = detectEnvironment(cwd);

  // Non-TTY fast path — stdin is piped or in CI
  if (!process.stdin.isTTY && !options.nonInteractive) {
    process.stderr.write('[dual-brain] Non-interactive terminal detected. Use --non-interactive flag or run in a TTY.\n');
    const config = buildConfig({ subscription: 'claude-pro', workStyle: 'balanced' }, detected);
    saveConfig(config, cwd);
    return config;
  }

  // Non-interactive fast path
  if (options.nonInteractive) {
    const config = buildConfig({
      subscription: options.subscription || 'claude-pro',
      workStyle:    options.workStyle    || 'balanced',
      setupMode:    'non-interactive',
    }, detected);
    saveConfig(config, cwd);
    return config;
  }

  // Already configured?
  if (detected.existingConfig && !options.reconfigure) {
    console.log('\n' + c.yellow('dual-brain is already configured.') + ' Pass --reconfigure to change settings.\n');
    return JSON.parse(readFileSync(join(cwd, '.dualbrain', 'config.json'), 'utf8'));
  }

  console.log('\n' + renderWelcome(detected) + '\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const close = () => rl.close();

  try {
    const mode = await ask(rl, 'Setup mode:', [
      { label: 'Quick setup', value: 'quick',    description: '3 questions, ~20 seconds' },
      { label: 'Advanced',    value: 'advanced', description: 'full control over routing, budgets, models' },
    ]) as string;
    const capacityRaw = await askLine(
      rl,
      'Subscription capacity (optional):',
      'Press Enter for auto-detected providers, or enter counts like: claude100x3 gpt20x2 gpt200x1'
    );
    const subscriptionCapacity = parseCapacity(capacityRaw);
    const subscription = subscriptionCapacity ? 'declared-capacity' : 'auto-detected';
    const workStyle = await ask(rl, 'How should dual-brain route your work?', [
      { label: 'Balanced',     value: 'balanced',     description: 'smart defaults, asks before expensive ops' },
      { label: 'Conservative', value: 'conservative', description: 'minimize tokens, prefer cheaper models' },
      { label: 'Aggressive',   value: 'aggressive',   description: 'best model available, maximize quality' },
      { label: 'Full auto',    value: 'auto',         description: 'never ask, optimize silently' },
    ]) as string;
    const shellDefault = await askYN(rl, 'Make dual-brain the default shell menu on new terminals?', true);
    let advanced: AdvancedOptions = {};
    if (mode === 'advanced') {
      const thinkEnabled    = await askYN(rl, 'Enable think agent?', true);
      const cascadeEnabled  = await askYN(rl, 'Enable cascade routing?', true);
      const learningEnabled = await askYN(rl, 'Enable learning (improves routing over time)?', true);
      const explorationRate = await ask(rl, 'Routing exploration rate:', [
        { label: 'Low (0.1)',    value: 0.1, description: 'rarely tries new routes' },
        { label: 'Medium (0.2)', value: 0.2, description: 'balanced' },
        { label: 'High (0.3)',   value: 0.3, description: 'frequently explores alternatives' },
      ]) as number;
      advanced = { thinkEnabled, cascadeEnabled, learningEnabled, explorationRate };
    }
    const config = buildConfig({ subscription, subscriptionCapacity, workStyle, advanced, setupMode: mode, shellDefault }, detected);
    console.log(renderConfirmation(config));
    if (!await askYN(rl, 'Save and start?', true)) {
      console.log('\n' + c.yellow('Setup cancelled.') + '\n');
      close(); return null;
    }
    saveConfig(config, cwd);
    console.log('\n' + c.green('✓') + ' ' + c.bold('dual-brain configured.') + ' Config saved to ' + c.cyan('.dualbrain/config.json') + '\n');
    close(); return config;
  } catch (err) { close(); throw err; }
}
