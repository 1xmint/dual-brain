#!/usr/bin/env node
/**
 * control-panel.mjs — Interactive TUI control panel for Dual-Brain Orchestrator.
 *
 * Keyboard-driven dashboard with live-updating pressure, profile switching,
 * inline budget editing, and routing decision viewer.
 *
 * Falls back to static emoji output when not in a TTY.
 */

import readline from 'readline';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, '..', 'orchestrator.json');
const PROFILE_FILE = join(__dirname, '..', 'dual-brain.profile.json');
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(__dirname, '..', '..', 'dual-brain', 'package.json'), 'utf8')).version; } catch {}
  try { return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version; } catch {}
  return '?';
})();

// ─── ANSI ──────────────────────────────────────────────────────────────────

const color = !process.env.NO_COLOR;
const A = {
  altOn: '\x1b[?1049h', altOff: '\x1b[?1049l',
  clear: '\x1b[2J', home: '\x1b[H',
  hide: '\x1b[?25l', show: '\x1b[?25h',
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
  white: '\x1b[37m',
};
const c = (code, s) => color ? `${code}${s}${A.reset}` : s;

// ─── Profiles ──────────────────────────────────────────────────────────────

const PROFILES = {
  balanced:        { emoji: '⚖️',  label: 'Balanced',      desc: 'Standard routing — best model per tier' },
  'cost-saver':    { emoji: '💸', label: 'Cost-saver',    desc: 'Minimize spend — prefer cheaper models' },
  'quality-first': { emoji: '💎', label: 'Quality-first', desc: 'Maximum quality — dual-brain for medium+' },
};

const PROFILE_BUDGETS = {
  balanced:        { session_warn_usd: 5, session_limit_usd: 10, daily_warn_usd: 20, daily_limit_usd: 50 },
  'cost-saver':    { session_warn_usd: 2, session_limit_usd: 5, daily_warn_usd: 8, daily_limit_usd: 20 },
  'quality-first': { session_warn_usd: 15, session_limit_usd: 30, daily_warn_usd: 50, daily_limit_usd: 100 },
};

const PROFILE_GATE = {
  balanced:        { sensitivity_floor: 'medium', dual_brain_minimum: 'high' },
  'cost-saver':    { sensitivity_floor: 'high', dual_brain_minimum: 'critical' },
  'quality-first': { sensitivity_floor: 'low', dual_brain_minimum: 'medium' },
};

// ─── Data Loaders ──────────────────────────────────────────────────────────

function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}

function loadProfile() {
  try {
    const data = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
    const name = data.active && PROFILES[data.active] ? data.active : 'balanced';
    const custom = data.custom_overrides || {};
    return {
      name,
      budgets: { ...PROFILE_BUDGETS[name], ...custom.budgets },
      gate: PROFILE_GATE[name],
      switched_at: data.switched_at || null,
    };
  } catch {
    return { name: 'balanced', budgets: PROFILE_BUDGETS.balanced, gate: PROFILE_GATE.balanced, switched_at: null };
  }
}

function saveProfile(name, customOverrides) {
  const data = { active: name, switched_at: new Date().toISOString() };
  if (customOverrides) data.custom_overrides = customOverrides;
  const tmp = PROFILE_FILE + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, PROFILE_FILE);
}

function saveBudget(sessionLimit, dailyLimit) {
  let existing = {};
  try { existing = JSON.parse(readFileSync(PROFILE_FILE, 'utf8')); } catch {}
  const custom = existing.custom_overrides || {};
  custom.budgets = {
    session_warn_usd: +(sessionLimit * 0.6).toFixed(2),
    session_limit_usd: sessionLimit,
    daily_warn_usd: +(dailyLimit * 0.6).toFixed(2),
    daily_limit_usd: dailyLimit,
  };
  const data = { active: existing.active || 'balanced', switched_at: existing.switched_at || new Date().toISOString(), custom_overrides: custom };
  const tmp = PROFILE_FILE + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, PROFILE_FILE);
}

function detectProviders() {
  const claude = { authed: false, models: 'opus / sonnet / haiku' };
  const codex = { authed: false, installed: false, models: 'gpt-5.5 / gpt-5.4 / gpt-4.1-mini' };

  const credPaths = [
    join(process.env.HOME || '', '.claude', '.credentials.json'),
    join(process.env.HOME || '', '.claude', 'credentials.json'),
  ];
  for (const p of credPaths) {
    try {
      const cred = JSON.parse(readFileSync(p, 'utf8'));
      if (cred.claudeAiOauth || cred.apiKey || cred.oauth_token) { claude.authed = true; break; }
    } catch {}
  }
  if (!claude.authed) {
    const r = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const out = ((r.stdout || '') + (r.stderr || '')).toLowerCase();
    if (out.includes('logged in') || out.includes('authenticated')) claude.authed = true;
  }

  const which = spawnSync('which', ['codex'], { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
  if (which.status === 0 && which.stdout.trim()) {
    codex.installed = true;
    const login = spawnSync(which.stdout.trim(), ['login', 'status'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const out = ((login.stdout || '') + (login.stderr || '')).toLowerCase();
    if (login.status === 0 || out.includes('logged in') || out.includes('authenticated')) codex.authed = true;
  }

  return { claude, codex };
}

function loadPressure() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const summaryPath = join(__dirname, `usage-summary-${today}.json`);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const cutoff = Date.now() - 5 * 60 * 60 * 1000;
    const result = {};
    for (const provider of ['claude', 'openai']) {
      result[provider] = {};
      for (const tier of ['think', 'execute', 'search']) {
        const ts = (summary.pressure?.[provider]?.[tier] || []).filter(t => Date.parse(t) >= cutoff);
        const BUDGETS = { think: 45, execute: 364, search: 2000 };
        const calls = ts.length;
        const pressure = Math.min(1, calls / (BUDGETS[tier] || 364));
        result[provider][tier] = { calls, pressure };
      }
    }
    return result;
  } catch {
    return {
      claude: { think: { calls: 0, pressure: 0 }, execute: { calls: 0, pressure: 0 }, search: { calls: 0, pressure: 0 } },
      openai: { think: { calls: 0, pressure: 0 }, execute: { calls: 0, pressure: 0 }, search: { calls: 0, pressure: 0 } },
    };
  }
}

function loadTodayCost() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const summary = JSON.parse(readFileSync(join(__dirname, `usage-summary-${today}.json`), 'utf8'));
    return summary.totals?.cost_estimate || 0;
  } catch { return 0; }
}

function loadLastDecision() {
  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(__dirname, `usage-${today}.jsonl`);
  if (!existsSync(logFile)) return null;
  try {
    const lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const e = JSON.parse(lines[i]);
        if (e.type === 'tier_recommendation') return e;
      } catch {}
    }
  } catch {}
  return null;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function pressureBar(p, w = 10) {
  const filled = Math.min(w, Math.round(p * w));
  const bar = '▓'.repeat(filled) + '░'.repeat(w - filled);
  const pct = String(Math.round(p * 100)).padStart(3) + '%';
  let stateEmoji, stateLabel;
  if (p >= 0.95)      { stateEmoji = '🛑'; stateLabel = c(A.red + A.bold, 'throttled'); }
  else if (p >= 0.82) { stateEmoji = '🔥'; stateLabel = c(A.red, 'hot'); }
  else if (p >= 0.65) { stateEmoji = '🟡'; stateLabel = c(A.yellow, 'warm'); }
  else                { stateEmoji = '🟢'; stateLabel = c(A.green, 'healthy'); }
  const barColored = p >= 0.82 ? c(A.red, bar) : p >= 0.65 ? c(A.yellow, bar) : c(A.green, bar);
  return `${barColored}  ${pct}  ${stateEmoji} ${stateLabel}`;
}

function renderDashboard(state) {
  const { profile, providers, pressure, cost, flash } = state;
  const pf = PROFILES[profile.name];
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const mode = (providers.claude.authed && providers.codex.authed) ? '🧠 Dual brain active' :
               providers.claude.authed ? '🟠 Claude only' :
               providers.codex.authed ? '🟢 OpenAI only' : '🔎 No providers';

  const lines = [];
  lines.push('');
  lines.push(c(A.bold, `  🧠 Dual-Brain Control Panel v${VERSION}`) + `                   ${c(A.green, '🟢 Live')}  ${c(A.dim, time)}`);
  lines.push('');
  lines.push(`  ${mode}`);
  lines.push(`  🎛️  Profile     ${pf.emoji}  ${c(A.bold, pf.label)}       ${c(A.dim, pf.desc)}`);
  lines.push(`  💵 Budget      Session $${cost.toFixed(2)} / $${profile.budgets.session_limit_usd}   Daily / $${profile.budgets.daily_limit_usd}`);
  lines.push(`  🛡️  Gate        Reviews ${profile.gate.sensitivity_floor}+         Dual-brain ${profile.gate.dual_brain_minimum}+`);
  lines.push('');

  lines.push(`  🔌 ${c(A.bold, 'Providers')}`);
  const cStatus = providers.claude.authed ? '✅ authenticated' : '⚠️  not authenticated';
  const xStatus = providers.codex.authed ? '✅ authenticated' : providers.codex.installed ? '⚠️  login needed' : '❌ not found';
  lines.push(`    🟠 Claude     ${cStatus}     ${c(A.dim, providers.claude.models)}`);
  lines.push(`    🟢 Codex      ${xStatus}     ${c(A.dim, providers.codex.models)}`);
  lines.push('');

  lines.push(`  🌡️  ${c(A.bold, 'Pressure')} ${c(A.dim, '— rolling 5h')}`);
  for (const [label, emoji, key] of [['Claude', '🟠', 'claude'], ['OpenAI', '🟢', 'openai']]) {
    lines.push(`    ${emoji} ${label}`);
    for (const tier of ['think', 'execute', 'search']) {
      const p = pressure[key]?.[tier] || { pressure: 0 };
      const tierLabel = (tier.charAt(0).toUpperCase() + tier.slice(1)).padEnd(8);
      lines.push(`       ${c(A.dim, tierLabel)}  ${pressureBar(p.pressure)}`);
    }
    if (key === 'claude') lines.push('');
  }
  lines.push('');

  if (flash) {
    lines.push(`  ${flash}`);
    lines.push('');
  }

  lines.push(c(A.dim, '  ─'.repeat(30)));
  lines.push(`  ⌨️   ${c(A.bold, '1')} Balanced  ${c(A.bold, '2')} Cost-saver  ${c(A.bold, '3')} Quality-first  ${c(A.bold, 'b')} Budget  ${c(A.bold, 'e')} Explain  ${c(A.bold, 'q')} Quit`);
  lines.push('');

  return lines.join('\n');
}

function renderExplain(decision, profile) {
  const lines = [];
  lines.push('');
  lines.push(c(A.bold, '  🧭 Last Routing Decision'));
  lines.push(c(A.dim, '  ' + '─'.repeat(40)));

  if (!decision) {
    lines.push('  💤 No routing decisions recorded today.');
    lines.push('');
    lines.push(c(A.dim, '  Press any key to go back'));
    return lines.join('\n');
  }

  const time = decision.timestamp?.slice(11, 19) || '??:??:??';
  const followed = decision.followed;
  lines.push(`  🕐 Time         ${time}`);
  lines.push(`  🔎 Detected     ${decision.detected_tier || 'unknown'} tier`);
  lines.push(`  🧠 Recommended  ${decision.recommended_model || 'unknown'}`);
  lines.push(`  🎯 Actual       ${decision.actual_model || 'unknown'}`);
  lines.push(`  ${followed ? '✅' : '⚠️'}  Followed     ${followed ? 'yes' : 'no'}`);
  lines.push(`  🎛️  Profile      ${profile.name}`);
  lines.push('');

  if (followed) {
    lines.push('  ✅ Routing matched the recommendation.');
  } else {
    lines.push('  ⚠️  Recommendation was overridden.');
  }

  lines.push('');
  lines.push(c(A.dim, '  Press any key to go back'));
  return lines.join('\n');
}

function renderBudgetEditor(sessionVal, dailyVal, field, flash) {
  const lines = [];
  lines.push('');
  lines.push(c(A.bold, '  💵 Edit Budget'));
  lines.push(c(A.dim, '  ' + '─'.repeat(40)));
  lines.push('');

  const sCursor = field === 'session' ? '_' : '';
  const dCursor = field === 'daily' ? '_' : '';
  lines.push(`  Session limit:  $${sessionVal}${sCursor}${field === 'session' ? c(A.dim, ' ← editing') : ''}`);
  lines.push(`  Daily limit:    $${dailyVal}${dCursor}${field === 'daily' ? c(A.dim, ' ← editing') : ''}`);
  lines.push('');

  if (flash) {
    lines.push(`  ${flash}`);
    lines.push('');
  }

  lines.push(c(A.dim, '  Type numbers · Tab next · Enter save · Esc cancel'));
  return lines.join('\n');
}

// ─── Static (non-TTY) Output ───────────────────────────────────────────────

function renderStatic() {
  const profile = loadProfile();
  const providers = detectProviders();
  const pressure = loadPressure();
  const cost = loadTodayCost();
  const state = { profile, providers, pressure, cost, flash: null };
  console.log(renderDashboard(state));
}

// ─── Interactive TUI ───────────────────────────────────────────────────────

function startTUI() {
  let view = 'dashboard';
  let flash = null;
  let flashTimeout = null;
  let refreshTimer = null;

  // Budget editor state
  let budgetSession = '';
  let budgetDaily = '';
  let budgetField = 'session';

  function setFlash(msg, ms = 3000) {
    flash = msg;
    clearTimeout(flashTimeout);
    flashTimeout = setTimeout(() => { flash = null; render(); }, ms);
  }

  function loadState() {
    return {
      profile: loadProfile(),
      providers: detectProviders(),
      pressure: loadPressure(),
      cost: loadTodayCost(),
      flash,
    };
  }

  function render() {
    let screen;
    if (view === 'dashboard') {
      screen = renderDashboard(loadState());
    } else if (view === 'explain') {
      const decision = loadLastDecision();
      const profile = loadProfile();
      screen = renderExplain(decision, profile);
    } else if (view === 'budget') {
      screen = renderBudgetEditor(budgetSession, budgetDaily, budgetField, flash);
    }
    process.stdout.write(A.home + A.clear + screen);
  }

  function startRefresh() {
    stopRefresh();
    refreshTimer = setInterval(render, 2000);
  }

  function stopRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function cleanup() {
    stopRefresh();
    clearTimeout(flashTimeout);
    process.stdin.setRawMode(false);
    process.stdout.write(A.reset + A.show + A.altOff);
    process.exit(0);
  }

  function switchProfile(name) {
    let customOverrides = null;
    try {
      const existing = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
      if (existing.custom_overrides?.budgets) customOverrides = { budgets: existing.custom_overrides.budgets };
    } catch {}
    saveProfile(name, customOverrides);
    const pf = PROFILES[name];
    setFlash(`✅ Profile switched: ${pf.emoji}  ${pf.label}`);
    render();
  }

  // Setup
  process.stdout.write(A.altOn + A.hide);
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (err) => {
    cleanup();
    console.error(err);
  });

  render();
  startRefresh();

  process.stdin.on('keypress', (str, key) => {
    if (key?.ctrl && key?.name === 'c') return cleanup();

    if (view === 'budget') {
      if (key?.name === 'escape') {
        view = 'dashboard';
        startRefresh();
        render();
        return;
      }
      if (key?.name === 'tab') {
        budgetField = budgetField === 'session' ? 'daily' : 'session';
        render();
        return;
      }
      if (key?.name === 'return') {
        const s = parseFloat(budgetSession);
        const d = parseFloat(budgetDaily);
        if (isNaN(s) || s <= 0) { setFlash('❌ Invalid session limit'); render(); return; }
        const daily = (isNaN(d) || d <= 0) ? s * 3 : d;
        saveBudget(s, daily);
        view = 'dashboard';
        startRefresh();
        setFlash(`✅ Budget updated: Session $${s} · Daily $${daily}`);
        render();
        return;
      }
      if (key?.name === 'backspace') {
        if (budgetField === 'session') budgetSession = budgetSession.slice(0, -1);
        else budgetDaily = budgetDaily.slice(0, -1);
        render();
        return;
      }
      if (str && /[0-9.]/.test(str)) {
        if (budgetField === 'session') budgetSession += str;
        else budgetDaily += str;
        render();
        return;
      }
      return;
    }

    if (view === 'explain') {
      view = 'dashboard';
      startRefresh();
      render();
      return;
    }

    // Dashboard keys
    if (key?.name === 'q' || key?.name === 'escape') return cleanup();
    if (str === '1') return switchProfile('balanced');
    if (str === '2') return switchProfile('cost-saver');
    if (str === '3') return switchProfile('quality-first');
    if (str === 'r') { render(); return; }
    if (str === 'e') {
      view = 'explain';
      stopRefresh();
      render();
      return;
    }
    if (str === 'b') {
      view = 'budget';
      stopRefresh();
      const profile = loadProfile();
      budgetSession = String(profile.budgets.session_limit_usd);
      budgetDaily = String(profile.budgets.daily_limit_usd);
      budgetField = 'session';
      flash = null;
      render();
      return;
    }
  });
}

// ─── Entry ─────────────────────────────────────────────────────────────────

const interactive = process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;

if (interactive) {
  startTUI();
} else {
  renderStatic();
}
