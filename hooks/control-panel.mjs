#!/usr/bin/env node
/**
 * control-panel.mjs — Session manager + control panel for Dual-Brain.
 *
 * Data-tools-style interactive menu: recent sessions, continue/resume/new,
 * profile switching, budget editing. Loops until user exits to shell.
 */

import readline from 'readline';
import { existsSync, readFileSync, readdirSync, statSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_FILE = join(__dirname, '..', 'dual-brain.profile.json');
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version; } catch {}
  return '?';
})();

const IS_REPLIT = !!(process.env.REPL_ID || process.env.REPL_SLUG);
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CWD = process.cwd();

// ─── ANSI ──────────────────────────────────────────────────────────────────

const noColor = !!process.env.NO_COLOR;
const e = (code, s) => noColor ? s : `\x1b[${code}m${s}\x1b[0m`;
const bold = s => e('1', s);
const dim = s => e('2', s);
const cyan = s => e('36', s);
const green = s => e('32', s);
const yellow = s => e('33', s);
const magenta = s => e('95', s);
const orange = s => e('1;38;5;208', s);
const blue = s => e('1;38;5;33', s);

// ─── Profiles ──────────────────────────────────────────────────────────────

const PROFILES = {
  balanced:        { emoji: '⚖️',  label: 'Balanced',      desc: 'Best model per tier, normal budgets' },
  'cost-saver':    { emoji: '💸', label: 'Cost-saver',    desc: 'Prefer cheaper models, lower budgets' },
  'quality-first': { emoji: '💎', label: 'Quality-first', desc: 'Dual-brain for medium+, strict reviews' },
};

const PROFILE_BUDGETS = {
  balanced:        { session_warn_usd: 5, session_limit_usd: 10, daily_warn_usd: 20, daily_limit_usd: 50 },
  'cost-saver':    { session_warn_usd: 2, session_limit_usd: 5, daily_warn_usd: 8, daily_limit_usd: 20 },
  'quality-first': { session_warn_usd: 15, session_limit_usd: 30, daily_warn_usd: 50, daily_limit_usd: 100 },
};

function loadProfile() {
  try {
    const data = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
    const name = data.active && PROFILES[data.active] ? data.active : 'balanced';
    const custom = data.custom_overrides || {};
    return { name, budgets: { ...PROFILE_BUDGETS[name], ...custom.budgets } };
  } catch {
    return { name: 'balanced', budgets: PROFILE_BUDGETS.balanced };
  }
}

function saveProfile(name, customOverrides) {
  const data = { active: name, switched_at: new Date().toISOString() };
  if (customOverrides) data.custom_overrides = customOverrides;
  const tmp = PROFILE_FILE + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, PROFILE_FILE);
}

// ─── Provider Detection ───────────────────────────────────────────────────

function detectProviders() {
  const claude = { installed: false, authed: false };
  const codex = { installed: false, authed: false };

  const claudeCheck = spawnSync('which', ['claude'], { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
  claude.installed = claudeCheck.status === 0 && !!claudeCheck.stdout.trim();

  const credPaths = [
    join(HOME, '.claude', '.credentials.json'),
    join(HOME, '.claude', 'credentials.json'),
    join(CWD, '.replit-tools', '.claude-persistent', '.credentials.json'),
  ];
  for (const p of credPaths) {
    try {
      const cred = JSON.parse(readFileSync(p, 'utf8'));
      if (cred.claudeAiOauth || cred.apiKey || cred.oauth_token) { claude.authed = true; break; }
    } catch {}
  }
  if (!claude.authed && claude.installed) {
    const r = spawnSync('claude', ['auth', 'status'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const out = ((r.stdout || '') + (r.stderr || '')).toLowerCase();
    if (out.includes('logged in') || out.includes('authenticated')) claude.authed = true;
  }

  const codexCheck = spawnSync('which', ['codex'], { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
  if (codexCheck.status === 0 && codexCheck.stdout.trim()) {
    codex.installed = true;
    const login = spawnSync(codexCheck.stdout.trim(), ['login', 'status'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const out = ((login.stdout || '') + (login.stderr || '')).toLowerCase();
    if (login.status === 0 || out.includes('logged in') || out.includes('authenticated')) codex.authed = true;
  }

  return { claude, codex };
}

// ─── Session Discovery ────────────────────────────────────────────────────

function getRecentSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const sessions = new Map();

  const isRealPrompt = (txt) => {
    if (!txt) return false;
    const t = txt.trim();
    if (!t) return false;
    if (/^[✅❌📦🔗⚠️🚀🎉🔧📝]/.test(t)) return false;
    if (/Claude (history|binary|versions) symlink/.test(t)) return false;
    if (t.startsWith('# AGENTS.md')) return false;
    return true;
  };

  // Claude sessions
  const historyFile = join(HOME, '.claude', 'history.jsonl');
  if (existsSync(historyFile)) {
    try {
      const lines = readFileSync(historyFile, 'utf8').trim().split('\n');
      const entries = [];
      for (const line of lines) {
        try {
          const j = JSON.parse(line);
          if (j.sessionId && j.timestamp) entries.push(j);
        } catch {}
      }
      entries.sort((a, b) => a.timestamp - b.timestamp);
      for (const j of entries) {
        const key = 'claude:' + j.sessionId;
        if (!sessions.has(key)) {
          sessions.set(key, { tool: 'claude', id: j.sessionId, firstSeen: j.timestamp, lastSeen: j.timestamp, firstPrompt: '' });
        }
        const s = sessions.get(key);
        if (j.timestamp < s.firstSeen) s.firstSeen = j.timestamp;
        if (j.timestamp > s.lastSeen) s.lastSeen = j.timestamp;
        if (!s.firstPrompt && isRealPrompt(j.display)) s.firstPrompt = j.display;
      }
      for (const [key, s] of sessions) {
        if (s.tool === 'claude' && !s.firstPrompt) sessions.delete(key);
      }
    } catch {}
  }

  // Codex sessions
  const codexDir = join(HOME, '.codex', 'sessions');
  if (existsSync(codexDir)) {
    const walk = (dir) => {
      let results = [];
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) results = results.concat(walk(full));
          else if (entry.isFile() && entry.name.endsWith('.jsonl')) results.push(full);
        }
      } catch {}
      return results;
    };
    for (const f of walk(codexDir)) {
      try {
        const stat = statSync(f);
        if (stat.mtimeMs < cutoff) continue;
        const content = readFileSync(f, 'utf8');
        const lns = content.trim().split('\n');
        if (!lns.length) continue;
        const meta = JSON.parse(lns[0]);
        if (meta.type !== 'session_meta' || !meta.payload) continue;
        if (meta.payload.cwd !== CWD) continue;
        const id = meta.payload.id;
        const firstTs = Date.parse(meta.payload.timestamp || meta.timestamp);
        let lastTs = firstTs;
        let firstPrompt = '';
        let realMsgCount = 0;
        for (const ln of lns) {
          try {
            const j = JSON.parse(ln);
            if (j.timestamp) lastTs = Math.max(lastTs, Date.parse(j.timestamp));
            if (j.type === 'event_msg' && j.payload?.type === 'user_message') {
              const text = (j.payload.message || '').trim();
              if (text) { if (!firstPrompt) firstPrompt = text; realMsgCount++; }
            }
          } catch {}
        }
        if (realMsgCount === 0 || !firstPrompt) continue;
        if (/^(you are |you're |\*\*role\*\*|<role>|## role)/i.test(firstPrompt)) continue;
        if (realMsgCount === 1 && firstPrompt.length > 500) continue;
        sessions.set('codex:' + id, { tool: 'codex', id, firstSeen: firstTs, lastSeen: lastTs, firstPrompt });
      } catch {}
    }
  }

  return Array.from(sessions.values())
    .filter(s => (s.lastSeen || 0) >= cutoff)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 9);
}

function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const h = Math.round(mins / 60);
  return h + 'h ago';
}

function snippet(s, n = 15) {
  const clean = (s || '').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

function countRunning() {
  let claude = 0, codex = 0;
  try {
    const r = spawnSync('pgrep', ['-x', 'claude'], { encoding: 'utf8', stdio: 'pipe', timeout: 2000 });
    claude = (r.stdout || '').trim().split('\n').filter(Boolean).length;
  } catch {}
  try {
    const r = spawnSync('pgrep', ['-x', 'codex'], { encoding: 'utf8', stdio: 'pipe', timeout: 2000 });
    codex = (r.stdout || '').trim().split('\n').filter(Boolean).length;
  } catch {}
  return { claude, codex };
}

// ─── Replit-Tools Check ───────────────────────────────────────────────────

function checkReplitTools() {
  if (!IS_REPLIT) return true;
  return existsSync(join(CWD, '.replit-tools'));
}

// ─── Menu Renderer ────────────────────────────────────────────────────────

function renderMenu() {
  const providers = detectProviders();
  const profile = loadProfile();
  const sessions = getRecentSessions();
  const running = countRunning();
  const pf = PROFILES[profile.name];
  const hasReplitTools = checkReplitTools();

  const lines = [];

  lines.push('');
  lines.push(`  🧠 ${bold(`Dual-Brain v${VERSION}`)}`);
  lines.push('');

  // Quick reference box
  lines.push('  ┌─────────────────────────────┐');
  if (IS_REPLIT) {
    lines.push(`  │ ${magenta('At')} ${blue('~/workspace')}${magenta('$ prompt:')}     │`);
    lines.push(`  │ ${cyan('! npx dual-brain')} = this menu│`);
  } else {
    lines.push(`  │ ${magenta('At shell prompt:')}             │`);
    lines.push(`  │ ${cyan('npx dual-brain')} = this menu   │`);
  }
  lines.push(`  │ ${cyan('j')}  = login to Claude        │`);
  lines.push(`  │ ${cyan('k')}  = login to Codex         │`);
  lines.push('  ├─────────────────────────────┤');
  lines.push(`  │ ${orange('In Claude session:')}           │`);
  lines.push(`  │ ${green('Ctrl+C x2')} = back to menu    │`);
  lines.push(`  │ ${green('Ctrl+C x3')} = exit to shell   │`);
  lines.push('  └─────────────────────────────┘');
  lines.push('');

  // Provider status line
  const cStat = providers.claude.authed ? '✅' : providers.claude.installed ? '⚠️' : '❌';
  const xStat = providers.codex.authed ? '✅' : providers.codex.installed ? '⚠️' : '❌';
  lines.push(`  🟠 Claude ${cStat}  🟢 Codex ${xStat}  ${pf.emoji}  ${bold(pf.label)}  ${dim('$' + profile.budgets.session_limit_usd + '/session')}`);

  // Missing provider nudge
  if (!providers.claude.authed || !providers.codex.authed) {
    lines.push('');
    if (!providers.claude.installed) lines.push(`  ${dim('└')} Install Claude: ${cyan('curl -fsSL https://claude.ai/install.sh | sh')}`);
    else if (!providers.claude.authed) lines.push(`  ${dim('└')} Auth Claude: press ${bold('j')} below`);
    if (!providers.codex.installed) lines.push(`  ${dim('└')} Install Codex: ${cyan('npm i -g @openai/codex')}`);
    else if (!providers.codex.authed) lines.push(`  ${dim('└')} Auth Codex: press ${bold('k')} below`);
  }

  // Replit-tools check
  if (IS_REPLIT && !hasReplitTools) {
    lines.push('');
    lines.push(`  ⚠️  ${yellow('replit-tools not found')} — recommended for Replit environments`);
    lines.push(`  ${dim('└')} Press ${bold('t')} to install replit-tools`);
  }

  // Recent sessions
  if (sessions.length > 0) {
    lines.push('');
    lines.push(`  ${bold('Recent (last 24h):')}`);
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const num = String(i + 1);
      const toolLabel = s.tool === 'codex' ? orange('cdx') : blue('cld');
      const ago = timeAgo(s.lastSeen).padEnd(9);
      lines.push(`  ${bold('[' + num + ']')} ${toolLabel}  ${dim(ago)} ${snippet(s.firstPrompt)}`);
    }
  }

  // Session manager box
  lines.push('');
  lines.push('  ┌─────────────────────────────┐');
  lines.push('  │  🧠 Dual-Brain Session Mgr   │');
  lines.push('  └─────────────────────────────┘');

  const runParts = [];
  if (running.claude > 0) runParts.push(`${running.claude} claude`);
  if (running.codex > 0) runParts.push(`${running.codex} codex`);
  if (runParts.length > 0) lines.push(`  ${dim('(' + runParts.join(', ') + ' running)')}`);
  lines.push('');

  // Menu options
  lines.push(`  ${bold('[c]')} Continue last session`);
  if (sessions.length > 0) lines.push(`  ${bold('[1-9]')} Resume numbered above`);
  lines.push(`  ${bold('[n]')} New session`);
  lines.push(`  ${bold('[p]')} Profile ${dim('(' + pf.emoji + ' ' + profile.name + ')')}`);
  lines.push(`  ${bold('[b]')} Budget ${dim('($' + profile.budgets.session_limit_usd + ' session / $' + profile.budgets.daily_limit_usd + ' daily)')}`);
  lines.push(`  ${bold('[j]')} Login to Claude`);
  lines.push(`  ${bold('[k]')} Login to Codex`);
  if (IS_REPLIT && !hasReplitTools) lines.push(`  ${bold('[t]')} Install replit-tools`);
  lines.push(`  ${bold('[s]')} Skip — just shell`);
  lines.push('');

  return { lines, sessions, providers };
}

// ─── Profile Picker ───────────────────────────────────────────────────────

function showProfilePicker(rl) {
  return new Promise((resolve) => {
    const current = loadProfile();
    console.log('');
    console.log(`  ${bold('🎛️  Switch Profile:')}`);
    console.log('');
    for (const [i, [name, pf]] of Object.entries(PROFILES).entries()) {
      const active = name === current.name ? ' ✅' : '';
      console.log(`  ${bold('[' + (i + 1) + ']')} ${pf.emoji}  ${name.padEnd(15)} ${dim(pf.desc)}${active}`);
    }
    console.log(`  ${bold('[q]')} Cancel`);
    console.log('');

    rl.question('  Choice: ', (answer) => {
      const names = Object.keys(PROFILES);
      const idx = parseInt(answer, 10) - 1;
      if (idx >= 0 && idx < names.length) {
        let customOverrides = null;
        try {
          const existing = JSON.parse(readFileSync(PROFILE_FILE, 'utf8'));
          if (existing.custom_overrides?.budgets) customOverrides = { budgets: existing.custom_overrides.budgets };
        } catch {}
        saveProfile(names[idx], customOverrides);
        const pf = PROFILES[names[idx]];
        console.log(`  ✅ Switched to ${pf.emoji}  ${pf.label}`);
      }
      resolve();
    });
  });
}

// ─── Budget Editor ────────────────────────────────────────────────────────

function showBudgetEditor(rl) {
  return new Promise((resolve) => {
    const profile = loadProfile();
    console.log('');
    console.log(`  ${bold('💵 Edit Budget')}`);
    console.log(`  ${dim('Current: $' + profile.budgets.session_limit_usd + ' session / $' + profile.budgets.daily_limit_usd + ' daily')}`);
    console.log('');

    rl.question('  Session limit ($): ', (sessionStr) => {
      const session = parseFloat(sessionStr);
      if (isNaN(session) || session <= 0) {
        console.log('  Cancelled.');
        return resolve();
      }
      rl.question('  Daily limit ($, Enter = auto): ', (dailyStr) => {
        const daily = parseFloat(dailyStr);
        const finalDaily = (isNaN(daily) || daily <= 0) ? session * 3 : daily;

        let existing = {};
        try { existing = JSON.parse(readFileSync(PROFILE_FILE, 'utf8')); } catch {}
        const custom = existing.custom_overrides || {};
        custom.budgets = {
          session_warn_usd: +(session * 0.6).toFixed(2),
          session_limit_usd: session,
          daily_warn_usd: +(finalDaily * 0.6).toFixed(2),
          daily_limit_usd: finalDaily,
        };
        const data = { active: existing.active || 'balanced', switched_at: existing.switched_at || new Date().toISOString(), custom_overrides: custom };
        const tmp = PROFILE_FILE + '.tmp.' + process.pid;
        writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
        renameSync(tmp, PROFILE_FILE);

        console.log(`  ✅ Budget: $${session}/session · $${finalDaily}/daily`);
        resolve();
      });
    });
  });
}

// ─── Session Runner ───────────────────────────────────────────────────────

function runSession(cmd, args, label) {
  console.log('');
  console.log(`  ${label}...`);
  console.log('');
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  console.log('');
  console.log('  Exited. Returning to menu...');
  return result.status || 0;
}

// ─── Main Loop ────────────────────────────────────────────────────────────

async function mainLoop() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => new Promise(resolve => rl.question('  Choice: ', resolve));

  while (true) {
    const { lines, sessions } = renderMenu();
    for (const l of lines) console.log(l);

    const choice = (await ask()).trim().toLowerCase();

    if (choice === 's' || choice === 'q') {
      console.log('');
      rl.close();
      return;
    }

    if (choice === 'c' || choice === '') {
      // Continue most recent session
      if (sessions.length > 0) {
        const s = sessions[0];
        if (s.tool === 'codex') {
          runSession('codex', ['--dangerously-bypass-approvals-and-sandbox', 'resume', s.id], `Resuming codex session ${s.id.slice(0, 8)}`);
        } else {
          runSession('claude', ['-r', s.id, '--dangerously-skip-permissions'], `Resuming session ${s.id.slice(0, 8)}`);
        }
      } else {
        runSession('claude', ['--dangerously-skip-permissions'], 'Starting new session');
      }
      continue;
    }

    const num = parseInt(choice, 10);
    if (num >= 1 && num <= 9 && sessions[num - 1]) {
      const s = sessions[num - 1];
      if (s.tool === 'codex') {
        runSession('codex', ['--dangerously-bypass-approvals-and-sandbox', 'resume', s.id], `Resuming codex session ${s.id.slice(0, 8)}`);
      } else {
        runSession('claude', ['-r', s.id, '--dangerously-skip-permissions'], `Resuming session ${s.id.slice(0, 8)}`);
      }
      continue;
    }

    if (choice === 'n') {
      runSession('claude', ['--dangerously-skip-permissions'], 'Starting new session');
      continue;
    }

    if (choice === 'p') {
      await showProfilePicker(rl);
      continue;
    }

    if (choice === 'b') {
      await showBudgetEditor(rl);
      continue;
    }

    if (choice === 'j') {
      console.log('');
      console.log('  Starting Claude login...');
      console.log('');
      spawnSync('claude', ['login'], { stdio: 'inherit' });
      continue;
    }

    if (choice === 'k') {
      const codexPath = spawnSync('which', ['codex'], { encoding: 'utf8', stdio: 'pipe', timeout: 3000 });
      if (codexPath.status !== 0) {
        console.log('');
        console.log(`  Codex not installed. Run: ${cyan('npm i -g @openai/codex')}`);
        console.log('');
        await ask();
        continue;
      }
      console.log('');
      console.log('  Starting Codex login...');
      console.log('');
      spawnSync(codexPath.stdout.trim(), ['login'], { stdio: 'inherit' });
      continue;
    }

    if (choice === 't' && IS_REPLIT) {
      console.log('');
      console.log('  Installing replit-tools...');
      console.log('');
      spawnSync('npx', ['-y', 'data-tools'], { stdio: 'inherit', cwd: CWD });
      console.log('');
      console.log('  ✅ replit-tools installed. You may need to restart your shell.');
      console.log('');
      await ask();
      continue;
    }

    console.log(`  Unknown option: ${choice}`);
  }
}

// ─── Non-Interactive Fallback ─────────────────────────────────────────────

function renderStatic() {
  const { lines } = renderMenu();
  for (const l of lines) console.log(l);
}

// ─── Entry ────────────────────────────────────────────────────────────────

if (process.stdin.isTTY && process.stdout.isTTY && !process.env.CI) {
  mainLoop().catch(err => { console.error(err); process.exit(1); });
} else {
  renderStatic();
}
