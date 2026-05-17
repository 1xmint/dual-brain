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
  workStyle?: string;
  advanced?: AdvancedOptions;
  setupMode?: string;
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
};

// ── Confirmation display ──────────────────────────────────────────────────────
export function renderConfirmation(config: SetupConfig): string {
  const row = (k: string, v: string) => `  ${c.dim(k.padEnd(16))} ${c.cyan(v)}`;
  return [
    '', c.bold('  Configuration:'), '',
    row('Subscription:', SUB_LABELS[config.subscription] || config.subscription),
    row('Work style:', config.workStyle),
    row('Primary model:', config.models.execute),
    row('Think agent:', config.routing.thinkEnabled ? 'enabled' : 'disabled'),
    row('Learning:', config.routing.learningEnabled ? 'on' : 'off'),
    '',
  ].join('\n');
}

// ── Config builder ────────────────────────────────────────────────────────────
export function buildConfig(answers: SetupAnswers, detected: DetectedEnvironment): SetupConfig {
  const { subscription = 'claude-pro', workStyle = 'balanced', advanced = {}, setupMode = 'quick' } = answers;
  const dual = subscription.startsWith('dual-');
  const isMax = subscription.includes('max') || subscription === 'chatgpt-pro';
  const topModel = isMax ? 'opus' : 'sonnet';
  const exploreRate = ({ aggressive: 0.3, conservative: 0.1, auto: 0.25 } as Record<string, number>)[workStyle] ?? 0.2;
  return {
    version: 1, subscription, workStyle,
    providers: { claude: subscription.startsWith('claude-') || dual, openai: subscription.startsWith('chatgpt-') || dual },
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
    detectedEnv: { claude: detected.claude, codex: detected.codex, language: detected.language },
  };
}

// ── Save config ───────────────────────────────────────────────────────────────
export function saveConfig(config: SetupConfig, cwd: string): void {
  const dir = join(cwd, '.dualbrain');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
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
    const subscription = await ask(rl, 'Your AI subscription:', [
      { label: 'Claude Pro ($20/mo)',        value: 'claude-pro' },
      { label: 'Claude Max 5x ($100/mo)',    value: 'claude-max-5x' },
      { label: 'Claude Max 20x ($200/mo)',   value: 'claude-max-20x' },
      { label: 'ChatGPT Plus ($20/mo)',      value: 'chatgpt-plus' },
      { label: 'ChatGPT Pro ($200/mo)',      value: 'chatgpt-pro' },
      { label: 'Both providers (Pro tiers)', value: 'dual-pro' },
      { label: 'Both providers (Max tiers)', value: 'dual-max' },
    ]) as string;
    const workStyle = await ask(rl, 'How should dual-brain route your work?', [
      { label: 'Balanced',     value: 'balanced',     description: 'smart defaults, asks before expensive ops' },
      { label: 'Conservative', value: 'conservative', description: 'minimize tokens, prefer cheaper models' },
      { label: 'Aggressive',   value: 'aggressive',   description: 'best model available, maximize quality' },
      { label: 'Full auto',    value: 'auto',         description: 'never ask, optimize silently' },
    ]) as string;
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
    const config = buildConfig({ subscription, workStyle, advanced, setupMode: mode }, detected);
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
