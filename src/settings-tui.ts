// settings-tui.mjs — Interactive settings menu for `dual-brain settings`
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

// ─── ANSI helpers ─────────────────────────────────────────────────────────────
const c = {
  bold:   (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
  green:  (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s: string) => `\x1b[36m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
};

// ─── readline helper ──────────────────────────────────────────────────────────
async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise<string>(resolve => rl.question(question, (answer: string) => resolve(answer)));
}

// ─── Config helpers ───────────────────────────────────────────────────────────
function loadCurrentConfig(cwd: string): Record<string, unknown> {
  try {
    const p = join(cwd, '.dualbrain', 'config.json');
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  } catch { return {}; }
}

function saveConfig(cfg: Record<string, unknown>, cwd: string): void {
  const dir = join(cwd, '.dualbrain');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

// ─── Dial position map ────────────────────────────────────────────────────────
const DIAL_POSITIONS: Record<number, { label: string; workStyle: string; models: { search: string; execute: string; think: string; review: string }; thinkEnabled: boolean | string; budget: number | null }> = {
  1: { label: 'Frugal',      workStyle: 'frugal',      models: { search: 'haiku', execute: 'haiku',  think: 'sonnet', review: 'sonnet' }, thinkEnabled: false, budget: 3 },
  2: { label: 'Save Usage',  workStyle: 'conservative', models: { search: 'haiku', execute: 'sonnet', think: 'sonnet', review: 'sonnet' }, thinkEnabled: 'auto', budget: null },
  3: { label: 'Balanced',    workStyle: 'balanced',     models: { search: 'haiku', execute: 'sonnet', think: 'opus',   review: 'sonnet' }, thinkEnabled: true, budget: null },
  4: { label: 'Quality',     workStyle: 'quality',      models: { search: 'sonnet',execute: 'sonnet', think: 'opus',   review: 'opus'   }, thinkEnabled: true, budget: null },
  5: { label: 'Maximum',     workStyle: 'aggressive',   models: { search: 'sonnet',execute: 'opus',   think: 'opus',   review: 'opus'   }, thinkEnabled: true, budget: null },
};

function saveDialPosition(position: number, cwd: string): void {
  const dial = DIAL_POSITIONS[position];
  if (!dial) return;
  const cfg = loadCurrentConfig(cwd);
  cfg.workStyle = dial.workStyle;
  cfg.models = { ...((cfg.models as Record<string, unknown>) ?? {}), ...dial.models };
  cfg.routing = (cfg.routing as Record<string, unknown>) ?? {};
  (cfg.routing as Record<string, unknown>).thinkEnabled = dial.thinkEnabled === 'auto' ? true : dial.thinkEnabled;
  if (dial.budget !== null) {
    cfg.budget = (cfg.budget as Record<string, unknown>) ?? {};
    (cfg.budget as Record<string, unknown>).sessionLimitUsd = dial.budget;
  } else {
    if (cfg.budget) delete (cfg.budget as Record<string, unknown>).sessionLimitUsd;
  }
  cfg.dialPosition = position;
  saveConfig(cfg, cwd);
}

// ─── Header helpers ───────────────────────────────────────────────────────────
function inferDialLabel(cfg: Record<string, unknown>): string {
  const pos = cfg.dialPosition as number | undefined;
  if (pos && DIAL_POSITIONS[pos]) return DIAL_POSITIONS[pos].label;
  const ws = (cfg.workStyle ?? '') as string;
  const map: Record<string, string> = { frugal: 'Frugal', conservative: 'Save Usage', balanced: 'Balanced', quality: 'Quality', aggressive: 'Maximum' };
  return map[ws] ?? 'Balanced';
}

function inferSubLabel(cwd: string): string {
  try {
    const p = join(cwd, '.dualbrain', 'subscription.json');
    if (!existsSync(p)) return 'unknown';
    const { subscription } = JSON.parse(readFileSync(p, 'utf8'));
    const labels = {
      'claude-pro': 'Claude Pro', 'claude-max-5x': 'Claude Max 5x',
      'claude-max-20x': 'Claude Max 20x', 'chatgpt-plus': 'ChatGPT Plus',
      'chatgpt-pro': 'ChatGPT Pro', 'dual-pro': 'Both Pro', 'dual-max': 'Both Max',
    };
    return labels[subscription as keyof typeof labels] ?? subscription;
  } catch { return 'unknown'; }
}

// ─── Subscreens ───────────────────────────────────────────────────────────────

export async function dialScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  const cfg = loadCurrentConfig(cwd);
  const cur = (cfg.dialPosition as number) ?? 3;
  console.log('');
  console.log(c.bold('  Routing Dial'));
  console.log('');
  console.log(`  Current: ${c.cyan(`[${cur}] ${DIAL_POSITIONS[cur]?.label ?? '?'}`)}`);
  console.log('');
  console.log('  1) Frugal        — minimize token usage');
  console.log('  2) Save Usage    — prefer cheaper models');
  console.log('  3) Balanced      — smart defaults');
  console.log('  4) Quality       — best available for each task');
  console.log('  5) Maximum       — always use most capable');
  console.log('');
  const ans = ((await prompt(rl, `  Enter number (1-5) or [esc] to cancel: `)) as string).trim();
  if (ans === '\x1b' || ans === '' || ans === 'esc') return;
  const n = parseInt(ans, 10);
  if (n >= 1 && n <= 5) {
    saveDialPosition(n, cwd);
    console.log(c.green(`  Dial set to [${n}] ${DIAL_POSITIONS[n].label}`));
  } else {
    console.log(c.red('  Invalid choice.'));
  }
}

export async function routingScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  const cfg = loadCurrentConfig(cwd);
  const models = (cfg.models ?? {}) as Record<string, string>;
  console.log('');
  console.log(c.bold('  Tier Assignments'));
  console.log('');
  for (const [tier, model] of Object.entries(models)) {
    console.log(`    ${tier.padEnd(8)}: ${c.cyan(model as string)}`);
  }
  console.log('');
  console.log(c.bold('  Learned Preferences') + c.dim(' (from routing advisor)'));
  console.log('');
  let stats: { topPerformers: Array<{ cell: string; model: string; ema: number; observations: number }>; totalObservations: number } = { topPerformers: [], totalObservations: 0 };
  try {
    const { getRoutingStats } = await import('./routing-advisor.js');
    stats = getRoutingStats(cwd);
  } catch {}
  if (stats.topPerformers.length === 0) {
    console.log(c.dim('    No observations yet.'));
  } else {
    for (const p of stats.topPerformers.slice(0, 5)) {
      console.log(`    ${p.cell.padEnd(22)} → ${c.cyan(p.model)} (EMA ${p.ema.toFixed(2)}, n=${p.observations})`);
    }
  }
  console.log('');
  const ans = ((await prompt(rl, '  [o] Override tier   [r] Reset learned data   [esc] back: ')) as string).trim().toLowerCase();
  if (ans === 'r') {
    try {
      const { resetAdvisor } = await import('./routing-advisor.js');
      resetAdvisor(cwd);
      console.log(c.green('  Routing advisor state cleared.'));
    } catch { console.log(c.red('  Failed to reset.')); }
  } else if (ans === 'o') {
    const tier = ((await prompt(rl, '  Tier to override (search/execute/think/review): ')) as string).trim();
    const model = ((await prompt(rl, '  Model (haiku/sonnet/opus): ')) as string).trim();
    if (tier && model) {
      const cfg2 = loadCurrentConfig(cwd);
      cfg2.models = (cfg2.models as Record<string, unknown>) ?? {};
      (cfg2.models as Record<string, unknown>)[tier] = model;
      saveConfig(cfg2, cwd);
      console.log(c.green(`  ${tier} → ${model} saved.`));
    }
  }
}

export async function thinkScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  let metrics = { hits: 0, misses: 0, totalTokens: 0 };
  try {
    const p = join(cwd, '.dualbrain', 'think-metrics.json');
    if (existsSync(p)) metrics = JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  const cfg = loadCurrentConfig(cwd);
  const enabled = (cfg.routing as Record<string, unknown> | undefined)?.thinkEnabled !== false;
  const total = metrics.hits + metrics.misses;
  const hitRate = total > 0 ? Math.round((metrics.hits / total) * 100) : 0;
  console.log('');
  console.log(c.bold('  Think Pre-flight'));
  console.log('');
  console.log(`  Status:     ${enabled ? c.green('enabled') : c.red('disabled')}`);
  console.log(`  Hit rate:   ${hitRate}% (${metrics.hits} hits / ${metrics.misses} misses)`);
  console.log(`  Tokens:     ~${((metrics.totalTokens ?? 0) / 1000).toFixed(0)}K`);
  console.log(`  Auto-disable threshold: 30%`);
  console.log('');
  const ans = ((await prompt(rl, '  [t] Toggle   [r] Reset metrics   [esc] back: ')) as string).trim().toLowerCase();
  if (ans === 't') {
    const cfg2 = loadCurrentConfig(cwd);
    cfg2.routing = (cfg2.routing as Record<string, unknown>) ?? {};
    (cfg2.routing as Record<string, unknown>).thinkEnabled = !enabled;
    saveConfig(cfg2, cwd);
    console.log(c.green(`  Think ${!enabled ? 'enabled' : 'disabled'}.`));
  } else if (ans === 'r') {
    try {
      const p = join(cwd, '.dualbrain', 'think-metrics.json');
      writeFileSync(p, JSON.stringify({ hits: 0, misses: 0, totalTokens: 0 }, null, 2) + '\n');
      console.log(c.green('  Think metrics reset.'));
    } catch { console.log(c.red('  Failed to reset.')); }
  }
}

async function budgetScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  let budget = { spent: 0, remaining: 10, limit: 10, warning: false };
  try {
    const { loadGovernanceState, checkBudget } = await import('./governance.js');
    const cfg = loadCurrentConfig(cwd);
    budget = checkBudget(cwd, cfg);
  } catch {}
  const pct = budget.limit > 0 ? Math.round((budget.spent / budget.limit) * 100) : 0;
  const cfg = loadCurrentConfig(cwd);
  const warnAt = (cfg.budget as Record<string, unknown> | undefined)?.warnAtPercent ?? 80;
  console.log('');
  console.log(c.bold('  Budget'));
  console.log('');
  console.log(`  Session limit:   $${budget.limit.toFixed(2)} (estimated)`);
  console.log(`  Current session: $${budget.spent.toFixed(2)} spent (${pct}%)`);
  console.log(`  Warning at:      ${warnAt}%`);
  console.log('');
  const ans = ((await prompt(rl, '  [l] Set limit   [w] Set warning %   [esc] back: ')) as string).trim().toLowerCase();
  if (ans === 'l') {
    const val = ((await prompt(rl, '  New session limit ($): ')) as string).trim();
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) {
      const cfg2 = loadCurrentConfig(cwd);
      cfg2.budget = (cfg2.budget as Record<string, unknown>) ?? {};
      (cfg2.budget as Record<string, unknown>).sessionLimitUsd = n;
      saveConfig(cfg2, cwd);
      console.log(c.green(`  Session limit set to $${n}.`));
    } else { console.log(c.red('  Invalid value.')); }
  } else if (ans === 'w') {
    const val = ((await prompt(rl, '  Warn at percent (0-100): ')) as string).trim();
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      const cfg2 = loadCurrentConfig(cwd);
      cfg2.budget = (cfg2.budget as Record<string, unknown>) ?? {};
      (cfg2.budget as Record<string, unknown>).warnAtPercent = n;
      saveConfig(cfg2, cwd);
      console.log(c.green(`  Warning threshold set to ${n}%.`));
    } else { console.log(c.red('  Invalid value.')); }
  }
}

async function subscriptionScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  let curSub = 'unknown';
  try {
    const p = join(cwd, '.dualbrain', 'subscription.json');
    if (existsSync(p)) curSub = JSON.parse(readFileSync(p, 'utf8')).subscription ?? 'unknown';
  } catch {}
  const subs = [
    ['claude-pro',      'Claude Pro ($20/mo)'],
    ['claude-max-5x',   'Claude Max 5x ($100/mo)'],
    ['claude-max-20x',  'Claude Max 20x ($200/mo)'],
    ['chatgpt-plus',    'ChatGPT Plus ($20/mo)'],
    ['chatgpt-pro',     'ChatGPT Pro ($200/mo)'],
    ['dual-pro',        'Both Pro tiers'],
    ['dual-max',        'Both Max tiers'],
  ];
  console.log('');
  console.log(c.bold('  Subscription'));
  console.log('');
  console.log(`  Current: ${c.cyan(curSub)}`);
  console.log('');
  subs.forEach(([key, label], i) => console.log(`  ${i + 1}) ${label}`));
  console.log('');
  const ans = ((await prompt(rl, '  Enter number or [esc] to cancel: ')) as string).trim();
  if (ans === '' || ans === 'esc' || ans === '\x1b') return;
  const n = parseInt(ans, 10);
  if (n >= 1 && n <= subs.length) {
    const [subType, label] = subs[n - 1];
    try {
      const { saveUserSubscription } = await import('./subscription.js');
      saveUserSubscription(subType, cwd);
      console.log(c.green(`  Subscription set to: ${label}`));
    } catch { console.log(c.red('  Failed to save subscription.')); }
  } else { console.log(c.red('  Invalid choice.')); }
}

async function resetScreen(rl: ReturnType<typeof createInterface>, cwd: string): Promise<void> {
  let obs = 0;
  try {
    const { getRoutingStats } = await import('./routing-advisor.js');
    obs = getRoutingStats(cwd).totalObservations;
  } catch {}
  console.log('');
  console.log(c.bold(c.red('  Reset Learned Data')));
  console.log('');
  console.log('  This will clear:');
  console.log(`  - Routing advisor state (${obs} observations)`);
  console.log('  - Think metrics');
  console.log('  - Outcome history');
  console.log('');
  const ans = ((await prompt(rl, '  Are you sure? (y/N): ')) as string).trim().toLowerCase();
  if (ans !== 'y') { console.log(c.dim('  Cancelled.')); return; }
  let cleared = 0;
  const targets = ['routing-state.json', 'routing-weights.json', 'think-metrics.json', 'outcomes.json'];
  for (const f of targets) {
    try {
      const p = join(cwd, '.dualbrain', f);
      if (existsSync(p)) { writeFileSync(p, '{}\n'); cleared++; }
    } catch {}
  }
  try {
    const { resetAdvisor } = await import('./routing-advisor.js');
    resetAdvisor(cwd);
  } catch {}
  console.log(c.green(`  Cleared. (${cleared} files reset)`));
}

// ─── Main menu ────────────────────────────────────────────────────────────────
export async function runSettings(cwd: string): Promise<void> {
  cwd = cwd ?? process.cwd();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const box = (lines: string[]) => {
    const W = 65;
    const hr = '─'.repeat(W - 2);
    console.log(`╭${hr}╮`);
    for (const l of lines) {
      const visible = l.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = W - 2 - visible.length;
      console.log(`│ ${l}${' '.repeat(Math.max(0, pad - 1))}│`);
    }
    console.log(`╰${hr}╯`);
  };

  const showMenu = () => {
    const cfg = loadCurrentConfig(cwd);
    const profile = inferDialLabel(cfg);
    const sub = inferSubLabel(cwd);
    let obs = 0;
    try {
      const p = join(cwd, '.dualbrain', 'routing-state.json');
      if (existsSync(p)) {
        const state = JSON.parse(readFileSync(p, 'utf8'));
        for (const models of Object.values(state)) {
          for (const e of Object.values(models as Record<string, Record<string, unknown>>)) obs += ((e as Record<string, unknown>).observations as number) ?? 0;
        }
      }
    } catch {}
    const learning = (cfg.routing as Record<string, unknown> | undefined)?.learningEnabled !== false
      ? c.green(`active (${obs} observations)`)
      : c.dim('disabled');

    console.log('');
    box([
      c.bold(' dual-brain settings'),
      '',
      ` Profile: ${c.cyan(profile.padEnd(20))} Subscription: ${c.cyan(sub)}`,
      ` Learning: ${learning}`,
      '',
      '─'.repeat(63),
      '',
      ` ${c.bold('[d]')} Dial         Adjust routing aggression`,
      ` ${c.bold('[r]')} Routing      Model preferences & learned data`,
      ` ${c.bold('[t]')} Think        Pre-flight settings & metrics`,
      ` ${c.bold('[b]')} Budget       Limits and session caps`,
      ` ${c.bold('[s]')} Subscription Change plan type`,
      ` ${c.bold('[x]')} Reset        Clear learned data`,
      '',
      ` ${c.dim('[q]')} quit`,
      '',
    ]);
  };

  let running = true;
  while (running) {
    showMenu();
    const key = ((await prompt(rl, '  > ')) as string).trim().toLowerCase();
    switch (key) {
      case 'd': await dialScreen(rl, cwd); break;
      case 'r': await routingScreen(rl, cwd); break;
      case 't': await thinkScreen(rl, cwd); break;
      case 'b': await budgetScreen(rl, cwd); break;
      case 's': await subscriptionScreen(rl, cwd); break;
      case 'x': await resetScreen(rl, cwd); break;
      case 'q': case '': running = false; break;
      default: console.log(c.dim('  Unknown option.'));
    }
    if (running && key !== '') await prompt(rl, c.dim('\n  Press enter to continue...'));
  }

  rl.close();
  console.log(c.dim('\n  Settings closed.\n'));
}
