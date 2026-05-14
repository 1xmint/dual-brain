#!/usr/bin/env node
/**
 * dual-brain — Dual-provider orchestrator for Claude Code.
 *
 * Usage:
 *   npx -y dual-brain              # auto-detect, configure, done
 *   npx -y dual-brain update       # refresh hooks to latest package version
 *   npx dual-brain --force          # overwrite existing config
 *   npx dual-brain --dry-run        # detect only, don't install
 *   npx dual-brain --help
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8')).version;
const VERSION_STAMP_FILE = '.claude/dual-brain.version.json';
const UPDATE_CACHE_FILE = '.claude/dual-brain.update-check.json';
const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Replit Detection ──────────────────────────────────────────────────────

const IS_REPLIT = !!(process.env.REPL_ID || process.env.REPL_SLUG);

function cmd(s) { return IS_REPLIT ? `! ${s}` : s; }

// ─── CLI ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const force = flag('--force');
const dryRun = flag('--dry-run');
const jsonOut = flag('--json');
const restoreNpmFlag = flag('--restore-npm');
const positional = argv.filter(a => !a.startsWith('-'));
const subcommand = positional[0] || null;

if (flag('--version') || flag('-v')) {
  console.log(`dual-brain v${VERSION}`);
  process.exit(0);
}

if (flag('--help') || flag('-h')) {
  console.log(`
  🧠 Data Tools — Dual Brain v${VERSION}
  Dual-provider orchestrator for Claude Code
  Powered by replit-tools by Steve Moraco

  Usage:  npx -y dual-brain [command] [options]

  ⌨️  Commands:
    (none)       🧠 Auto-detect and install/update orchestrator
    status       🟢 Open live control panel
    auth         🔑 Show, login, or refresh provider auth
    mode         🎛️  Show or switch profile
    budget       💵 Set session/daily spend limits
    explain      🧭 Explain last routing decision
    update       🔄 Force re-install of latest hooks
    init         Alias for default install

  Options:
    --force      Overwrite all existing config
    --dry-run    Detect environment only
    --json       Output detection as JSON
    --restore-npm Restore persisted npm token before auth flows
    --help       Show this help

  🎛️  Routing modes:
    🤖 Auto (default) Adapts routing based on risk, health, outcomes
    ⚖️  Balanced       Auto-routes, uses both providers evenly
    🛡️  Conservative   Fewer GPT dispatches, sticks to Claude
    🚀 Aggressive     Maximizes both subscriptions, dual-brain for medium+

  🚀 Examples:
    ${cmd('npx dual-brain')}                  # install or update
    ${cmd('npx dual-brain status')}           # open control panel
    ${cmd('npx dual-brain auth')}             # show Claude/Codex auth
    ${cmd('npx dual-brain auth login')}       # sign in missing providers
    ${cmd('npx dual-brain auth refresh')}     # refresh provider auth
    ${cmd('npx dual-brain mode cost-saver')}  # switch profile
    ${cmd('npx dual-brain budget 8 25')}      # \$8 session / \$25 daily
    ${cmd('npx dual-brain explain')}          # last routing decision
    ${cmd('npx dual-brain update')}           # refresh installed hooks
  `);
  process.exit(0);
}

const SUBCOMMANDS = ['init', 'status', 'auth', 'mode', 'budget', 'explain', 'update'];
if (subcommand && !SUBCOMMANDS.includes(subcommand)) {
  console.error(`  Unknown command: ${subcommand}`);
  console.error(`  Run: ${cmd('npx dual-brain --help')}`);
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

function compareVersions(a, b) {
  const aParts = String(a || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const bParts = String(b || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonFile(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function getVersionStamp(workspace) {
  return readJsonFile(join(workspace, VERSION_STAMP_FILE));
}

function writeVersionStamp(workspace) {
  const target = join(workspace, VERSION_STAMP_FILE);
  const now = new Date().toISOString();
  const existing = readJsonFile(target);
  const stamp = {
    version: VERSION,
    installed_at: existing?.installed_at || now,
    updated_at: now,
  };
  writeJsonFile(target, stamp);
  return stamp;
}

function getUpdateCache(workspace) {
  const cache = readJsonFile(join(workspace, UPDATE_CACHE_FILE));
  if (!cache?.checked_at) return null;
  const age = Date.now() - Date.parse(cache.checked_at);
  if (!Number.isFinite(age) || age < 0 || age > UPDATE_CACHE_TTL_MS) return null;
  return cache;
}

function writeUpdateCache(workspace, result) {
  writeJsonFile(join(workspace, UPDATE_CACHE_FILE), {
    checked_at: new Date().toISOString(),
    ...result,
  });
}

function checkForUpdate(workspace, { force = false } = {}) {
  const installedStamp = getVersionStamp(workspace);
  const installed = installedStamp?.version || VERSION;

  if (!force) {
    const cached = getUpdateCache(workspace);
    if (cached && cached.installed === installed) {
      return {
        updateAvailable: !!cached.updateAvailable,
        installed: cached.installed,
        latest: cached.latest || installed,
        checkedAt: cached.checked_at,
      };
    }
  }

  try {
    const result = spawnSync('npm', ['view', 'dual-brain', 'version', '--json'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    if (result.status !== 0 || !result.stdout.trim()) {
      return null;
    }

    const latestRaw = JSON.parse(result.stdout);
    const latest = Array.isArray(latestRaw) ? latestRaw[latestRaw.length - 1] : latestRaw;
    if (!latest) return null;

    const updateAvailable = compareVersions(latest, installed) > 0;
    const payload = { updateAvailable, installed, latest };
    writeUpdateCache(workspace, payload);
    return payload;
  } catch {
    return null;
  }
}

function performUpdate(workspace, env, mode) {
  return install(workspace, env, mode);
}

function promptForUpdate(updateInfo) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Update available: v${updateInfo.installed} → v${updateInfo.latest}. Press [u] to update or Enter to continue. `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'u');
    });
  });
}

function isLoggedInStatus(result) {
  const out = ((result?.stdout || '') + (result?.stderr || '')).toLowerCase();
  if (/\b(not\s+logged\s+in|unauthenticated|logged\s+out|no\s+auth)\b/.test(out)) return false;
  return result?.status === 0 ||
    /\b(logged\s+in|authenticated|signed\s+in|valid\s+session)\b/.test(out);
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
  const result = { installed: false, version: null, authed: false, path: null, authMethod: null };

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
    if (isLoggedInStatus(login)) {
      result.authed = true;
      result.authMethod = 'oauth';
    }
  }

  if (!result.authed && process.env.OPENAI_API_KEY) {
    result.authed = true;
    result.authMethod = 'api_key_env';
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

// ─── NPM Token Persistence ────────────────────────────────────────────────

const NPM_PERSIST = resolve(process.cwd(), '.replit-tools', '.npm-persistent', '.npmrc');
const NPMRC_HOME = join(process.env.HOME || '', '.npmrc');

function restoreNpmToken() {
  if (existsSync(NPMRC_HOME)) return;
  if (!existsSync(NPM_PERSIST)) return;
  try {
    const content = readFileSync(NPM_PERSIST, 'utf8');
    if (content.includes('_authToken')) {
      writeFileSync(NPMRC_HOME, content);
    }
  } catch {}
}

// ─── Auth Self-Healing ─────────────────────────────────────────────────────

function healClaudeAuth(env) {
  if (env.claude.authed) return env;
  const refreshScript = resolve(process.cwd(), '.replit-tools', 'scripts', 'claude-auth-refresh.sh');
  if (existsSync(refreshScript)) {
    const result = run('bash', [refreshScript, '--auto']);
    const out = ((result.stdout || '') + (result.stderr || '')).toLowerCase();
    if (out.includes('refreshed') || out.includes('success')) {
      env.claude.authed = true;
      console.log('  🔄 Claude token refreshed via data-tools');
    }
  }
  return env;
}

function healCodexAuth(env) {
  if (env.codex.authed) return env;
  if (!env.codex.installed || !env.codex.path) return env;

  // Try restoring persisted credentials from data-tools
  if (restoreCodexCredentials()) {
    const login = run(env.codex.path, ['login', 'status']);
    if (isLoggedInStatus(login)) {
      env.codex.authed = true;
      env.codex.authMethod = 'restored_persistent';
      console.log('  🔄 Codex credentials restored from data-tools');
      return env;
    }
  }

  if (process.env.OPENAI_API_KEY) {
    const pipe = spawnSync(env.codex.path, ['login', '--with-api-key'], {
      input: process.env.OPENAI_API_KEY,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    if (pipe.status === 0) {
      env.codex.authed = true;
      env.codex.authMethod = 'api_key_env';
      saveCodexCredentials();
      console.log('  🔄 Codex authenticated via OPENAI_API_KEY');
      return env;
    }
  }

  return env;
}

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function authGuidance(env) {
  if (env.claude.authed && env.codex.authed) return env;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return env;

  console.log('');
  console.log('  ┌────────────────────────────────────────────┐');
  console.log('  │  🔑 Auth Setup                             │');
  console.log('  └────────────────────────────────────────────┘');

  if (!env.claude.authed) {
    console.log('');
    console.log('  🟠 Claude — not authenticated');
    if (env.isReplit) {
      console.log('    Run in your terminal:  ! claude login');
      console.log('    It will give you a URL + code to paste in your browser.');
    } else {
      console.log('    Run: claude login');
    }
  }

  if (!env.codex.authed) {
    console.log('');
    console.log('  🟢 Codex — not authenticated');
    if (!env.codex.installed) {
      console.log('    Install first: npm i -g @openai/codex');
      console.log('');
    }

    if (env.codex.installed && env.codex.path) {
      console.log('');
      console.log('    Sign in with your ChatGPT subscription (no API key needed):');
      console.log('');

      const answer = await prompt('  Press Enter to start device auth (or "skip" to skip): ');
      if (answer.toLowerCase() === 'skip') {
        console.log('  ⏭️  Skipped — GPT features disabled until Codex is authed');
      } else {
        console.log('');
        if (runCodexDeviceAuth(env.codex.path)) {
          env.codex.authed = true;
          env.codex.authMethod = 'device_auth';
          console.log('');
          console.log('  ✅ Codex authenticated! (credentials saved for next session)');
        } else {
          console.log('');
          console.log('  ❌ Auth failed — try again with: codex login --device-auth');
        }
      }
    }
  }

  console.log('');
  return env;
}

// ─── Codex Credential Persistence ──────────────────────────────────────────

const CODEX_HOME = join(process.env.HOME || '', '.codex');
const CODEX_PERSIST = resolve(process.cwd(), '.replit-tools', '.codex-persistent');

function isGitignored(path) {
  const result = run('git', ['check-ignore', '-q', path], { cwd: process.cwd() });
  return result.status === 0;
}

function hasStrictFilePermissions(path) {
  try {
    return (statSync(path).mode & 0o777) === 0o600;
  } catch {
    return false;
  }
}

function saveCodexCredentials() {
  const authFile = join(CODEX_HOME, 'auth.json');
  if (!existsSync(authFile)) return false;
  if (!isGitignored('.replit-tools')) {
    console.warn('WARNING: .replit-tools is not gitignored. Skipping credential persistence to avoid leaking secrets.');
    return false;
  }
  try {
    const auth = readFileSync(authFile, 'utf8');
    if (!auth.trim() || auth.trim() === '{}') return false;
    mkdirSync(CODEX_PERSIST, { recursive: true });
    const persisted = join(CODEX_PERSIST, 'auth.json');
    writeFileSync(persisted, auth, { mode: 0o600 });
    try { chmodSync(persisted, 0o600); } catch {}
    if (!hasStrictFilePermissions(persisted)) {
      console.warn(`WARNING: ${relPath(persisted)} permissions are not 0600.`);
    }
    return true;
  } catch { return false; }
}

function restoreCodexCredentials() {
  const persistedAuth = join(CODEX_PERSIST, 'auth.json');
  const targetAuth = join(CODEX_HOME, 'auth.json');
  if (existsSync(targetAuth)) return false;
  if (!existsSync(persistedAuth)) return false;
  if (!hasStrictFilePermissions(persistedAuth)) {
    console.warn(`WARNING: ${relPath(persistedAuth)} permissions are not 0600. Skipping restore.`);
    return false;
  }
  try {
    const auth = readFileSync(persistedAuth, 'utf8');
    if (!auth.trim() || auth.trim() === '{}') return false;
    mkdirSync(CODEX_HOME, { recursive: true });
    writeFileSync(targetAuth, auth, { mode: 0o600 });
    try { chmodSync(targetAuth, 0o600); } catch {}
    return true;
  } catch { return false; }
}

function parseDateValue(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatExpiry(value) {
  const d = parseDateValue(value);
  if (!d) return 'unknown';
  const iso = d.toISOString();
  return d.getTime() <= Date.now() ? `${iso} (expired)` : iso;
}

function formatTimestamp(value) {
  const d = parseDateValue(value);
  return d ? d.toISOString() : 'unknown';
}

function relPath(p) {
  if (!p) return 'unknown';
  const cwd = resolve(process.cwd());
  const full = resolve(p);
  if (full.startsWith(cwd + '/')) return full.slice(cwd.length + 1);
  const home = process.env.HOME || '';
  if (home && full.startsWith(home + '/')) return `~/${full.slice(home.length + 1)}`;
  return full;
}

function readJsonIfExists(file) {
  if (!file || !existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function claudeCredentialCandidates() {
  return [
    join(process.env.HOME || '', '.claude', '.credentials.json'),
    join(process.env.HOME || '', '.claude', 'credentials.json'),
    resolve(process.cwd(), '.replit-tools', '.claude-persistent', '.credentials.json'),
  ];
}

function getClaudeAuthDetails() {
  const detected = detectClaude();
  const status = detected.installed ? run('claude', ['auth', 'status']) : null;
  let method = 'none';
  let storage = null;
  let expiry = null;

  for (const file of claudeCredentialCandidates()) {
    const cred = readJsonIfExists(file);
    if (!cred) continue;
    if (cred.claudeAiOauth) {
      method = 'oauth';
      storage = file;
      expiry = cred.claudeAiOauth.expiresAt || null;
      break;
    }
    if (cred.apiKey || cred.oauth_token) {
      method = cred.apiKey ? 'api_key' : 'oauth_token';
      storage = file;
      break;
    }
  }

  const statusText = ((status?.stdout || '') + (status?.stderr || '')).trim();
  return {
    provider: 'claude',
    installed: detected.installed,
    version: detected.version,
    authed: detected.authed,
    method,
    expiry,
    expiryText: formatExpiry(expiry),
    storage,
    storageText: relPath(storage),
    statusText,
  };
}

function getCodexAuthDetails() {
  const detected = detectCodex();
  const status = (detected.installed && detected.path) ? run(detected.path, ['login', 'status']) : null;
  const authFile = join(CODEX_HOME, 'auth.json');
  const persisted = join(CODEX_PERSIST, 'auth.json');
  const activeFile = existsSync(authFile) ? authFile : existsSync(persisted) ? persisted : null;
  const auth = readJsonIfExists(activeFile);

  let method = detected.authMethod || 'none';
  if (auth?.auth_mode === 'chatgpt') method = 'chatgpt_device_auth';
  else if (auth?.auth_mode === 'api_key') method = 'api_key';
  else if (!detected.authed && process.env.OPENAI_API_KEY) method = 'api_key_env';

  const lastRefresh = auth?.last_refresh || null;
  const statusText = ((status?.stdout || '') + (status?.stderr || '')).trim();
  return {
    provider: 'codex',
    installed: detected.installed,
    version: detected.version,
    authed: detected.authed,
    method,
    expiry: null,
    expiryText: 'n/a',
    lastRefresh,
    lastRefreshText: formatTimestamp(lastRefresh),
    storage: activeFile,
    storageText: relPath(activeFile),
    statusText,
    path: detected.path,
  };
}

function getAuthState() {
  return {
    claude: getClaudeAuthDetails(),
    codex: getCodexAuthDetails(),
  };
}

function printAuthStatusBox(state) {
  const c = state.claude;
  const x = state.codex;
  const cIcon = c.authed ? '✅' : c.installed ? '⚠️' : '❌';
  const xIcon = x.authed ? '✅' : x.installed ? '⚠️' : '❌';

  console.log('');
  console.log(`  ${br('╔', '╗')}`);
  console.log(`  ${ln(`🔑 Auth Status`)}`);
  console.log(`  ${sep()}`);
  console.log(`  ${ln(`🟠 Claude ${cIcon}  ${c.authed ? 'authenticated' : c.installed ? 'not authenticated' : 'not installed'}`)}`);
  console.log(`  ${ln(`   Method:   ${c.method}`)}`);
  console.log(`  ${ln(`   Expiry:   ${c.expiryText}`)}`);
  console.log(`  ${ln(`   Storage:  ${c.storageText}`)}`);
  console.log(`  ${sep()}`);
  console.log(`  ${ln(`🟢 Codex  ${xIcon}  ${x.authed ? 'authenticated' : x.installed ? 'not authenticated' : 'not installed'}`)}`);
  console.log(`  ${ln(`   Method:   ${x.method}`)}`);
  console.log(`  ${ln(`   Expiry:   ${x.expiryText}`)}`);
  console.log(`  ${ln(`   Storage:  ${x.storageText}`)}`);
  if (x.lastRefresh) console.log(`  ${ln(`   Refreshed:${x.lastRefreshText}`)}`);
  console.log(`  ${br('╚', '╝')}`);
  console.log('');
}

function runCodexDeviceAuth(codexPath) {
  if (!codexPath) return false;
  const result = spawnSync(codexPath, ['login', '--device-auth'], {
    stdio: 'inherit',
    timeout: 900000,
  });
  if (result.status === 0) {
    saveCodexCredentials();
    return true;
  }
  return false;
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

const CLAUDE_MD_MANAGED_START = '<!-- dual-brain:start -->';
const CLAUDE_MD_MANAGED_END = '<!-- dual-brain:end -->';

function renderManagedClaudeSection(content) {
  return `${CLAUDE_MD_MANAGED_START}\n${content.replace(/\s+$/, '')}\n${CLAUDE_MD_MANAGED_END}\n`;
}

function mergeClaudeMd(existingContent, managedContent) {
  const managedSection = renderManagedClaudeSection(managedContent);
  const startIndex = existingContent.indexOf(CLAUDE_MD_MANAGED_START);
  const endIndex = existingContent.indexOf(CLAUDE_MD_MANAGED_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
    const before = existingContent.slice(0, startIndex);
    const after = existingContent.slice(endIndex + CLAUDE_MD_MANAGED_END.length);
    const prefix = before.replace(/\s*$/, '');
    const suffix = after.replace(/^\s*/, '');
    return `${prefix}${prefix ? '\n\n' : ''}${managedSection}${suffix ? `\n${suffix}` : ''}`.replace(/\s+$/, '') + '\n';
  }

  const trimmed = existingContent.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? '\n\n' : ''}${managedSection}`;
}

function writeClaudeMd(targetPath, content) {
  const managedContent = content.replace(/\s+$/, '');
  if (force || !existsSync(targetPath)) {
    writeFileSync(targetPath, renderManagedClaudeSection(managedContent));
    return;
  }

  const existing = readFileSync(targetPath, 'utf8');
  writeFileSync(targetPath, mergeClaudeMd(existing, managedContent));
}

function generateGitignoreEntries(workspace) {
  const entries = [
    '.claude/hooks/usage-*.jsonl',
    '.claude/hooks/usage.jsonl',
    '.claude/reviews/',
    '.claude/hooks/.drift-warned',
    '.claude/hooks/.budget-alerted',
    '.claude/dual-brain.profile.json',
    '.claude/hooks/usage-summary-*.json',
    '.claude/hooks/decision-ledger.jsonl',
    '.claude/.launched',
    '.claude/dual-brain.memory.json',
    '.claude/dual-brain.version.json',
    '.claude/dual-brain.update-check.json',
    '.claude/dual-brain.permissions.json',
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
    'gpt-work-dispatcher.mjs', 'profiles.mjs',
    'summary-checkpoint.mjs', 'decision-ledger.mjs', 'control-panel.mjs',
    'risk-classifier.mjs', 'failure-detector.mjs',
    'vibe-router.mjs', 'plan-generator.mjs', 'vibe-memory.mjs',
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
  writeClaudeMd(join(target, 'CLAUDE.md'), claudeMd);
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

  const stamp = writeVersionStamp(workspace);
  actions.push(`✓ version stamp (v${stamp.version})`);

  return actions;
}

// ─── Status Report ──────────────────────────────────────────────────────────

function printReport(env, mode, actions, isDryRun) {
  const lines = [];

  lines.push(br('╔', '╗'));
  lines.push(ln(`🧠 Data Tools — Dual Brain v${VERSION}`));
  lines.push(sep());

  const cAuth = env.claude.authed ? '✅' : env.claude.installed ? '⚠️' : '❌';
  const xAuth = env.codex.authed ? '✅' : env.codex.installed ? '⚠️' : '❌';
  lines.push(ln(`  🟠 Claude ${cAuth}   🟢 Codex ${xAuth}`));

  if (env.isReplit) {
    lines.push(ln(`  🌀 Replit${env.hasReplitTools ? ' + replit-tools' : ''}`));
  }

  if (actions) {
    lines.push(sep());
    for (const a of actions) lines.push(ln(`  ${a}`));
    lines.push(sep());
    lines.push(ln('✅ Installed — launching session manager...'));
  } else if (isDryRun) {
    lines.push(sep());
    lines.push(ln('Dry run — no files written'));
  }

  lines.push(br('╚', '╝'));

  console.log('');
  for (const l of lines) console.log(`  ${l}`);
  console.log('');
}

// ─── Profile System ────────────────────────────────────────────────────────

const PROFILE_FILE_REL = '.claude/dual-brain.profile.json';

function profilePath(workspace) {
  return join(workspace || process.cwd(), PROFILE_FILE_REL);
}

const PROFILES = {
  auto: {
    description: 'Adapts routing based on task risk, provider health, and outcomes',
    routing: { prefer_provider: 'auto', think_threshold: 'adaptive', gpt_dispatch_bias: 0 },
    budgets: { session_warn_usd: 5, session_limit_usd: 10, daily_warn_usd: 20, daily_limit_usd: 50 },
    quality_gate: { sensitivity_floor: 'medium', dual_brain_minimum: 'high' },
  },
  balanced: {
    description: 'Auto-routes by complexity, uses both providers evenly',
    routing: { prefer_provider: 'auto', think_threshold: 'normal', gpt_dispatch_bias: 0 },
    budgets: { session_warn_usd: 5, session_limit_usd: 10, daily_warn_usd: 20, daily_limit_usd: 50 },
    quality_gate: { sensitivity_floor: 'medium', dual_brain_minimum: 'high' },
  },
  'cost-saver': {
    description: 'Conservative — fewer GPT dispatches, sticks to Claude',
    routing: { prefer_provider: 'cheapest', think_threshold: 'strict', gpt_dispatch_bias: -20 },
    budgets: { session_warn_usd: 2, session_limit_usd: 5, daily_warn_usd: 8, daily_limit_usd: 20 },
    quality_gate: { sensitivity_floor: 'high', dual_brain_minimum: 'critical' },
  },
  'quality-first': {
    description: 'Aggressive — maximizes both subscriptions, dual-brain for medium+',
    routing: { prefer_provider: 'most-capable', think_threshold: 'relaxed', gpt_dispatch_bias: 10 },
    budgets: { session_warn_usd: 15, session_limit_usd: 30, daily_warn_usd: 50, daily_limit_usd: 100 },
    quality_gate: { sensitivity_floor: 'low', dual_brain_minimum: 'medium' },
  },
};

function loadProfile(workspace) {
  try {
    const data = JSON.parse(readFileSync(profilePath(workspace), 'utf8'));
    const name = data.active && PROFILES[data.active] ? data.active : 'auto';
    const profile = PROFILES[name];
    const custom = data.custom_overrides || {};
    return {
      name,
      ...profile,
      budgets: { ...profile.budgets, ...custom.budgets },
      routing: { ...profile.routing, ...custom.routing },
      switched_at: data.switched_at || null,
    };
  } catch {
    return { name: 'auto', ...PROFILES.auto, switched_at: null };
  }
}

function saveProfile(workspace, name, customOverrides) {
  const data = { active: name, switched_at: new Date().toISOString() };
  if (customOverrides) data.custom_overrides = customOverrides;
  const target = profilePath(workspace);
  const tmp = target + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, target);
}

// ─── Subcommand: status ────────────────────────────────────────────────────

function launchPanel() {
  const panelPath = join(resolve(process.cwd()), '.claude', 'hooks', 'control-panel.mjs');
  const pkgPanel = join(__dirname, 'hooks', 'control-panel.mjs');
  const panel = existsSync(panelPath) ? panelPath : existsSync(pkgPanel) ? pkgPanel : null;
  if (panel) {
    const { status } = spawnSync(process.execPath, [panel], { stdio: 'inherit' });
    process.exit(status || 0);
  }
}

// ─── Subcommand: auth ──────────────────────────────────────────────────────

function cmdAuthStatus() {
  const state = getAuthState();
  if (jsonOut) {
    console.log(JSON.stringify({ version: VERSION, auth: state }, null, 2));
    return;
  }
  printAuthStatusBox(state);
  console.log(`  Login:   ${cmd('npx dual-brain auth login')}`);
  console.log(`  Refresh: ${cmd('npx dual-brain auth refresh')}`);
  console.log('');
}

function cmdAuthLogin() {
  const state = getAuthState();

  console.log('');
  if (!state.claude.authed) {
    if (!state.claude.installed) {
      console.log('  🟠 Claude is not installed.');
    } else {
      console.log('  🟠 Claude needs login.');
      console.log(`    Run: ${cmd('claude login')}`);
      console.log('    Claude uses its own browser/device flow from the CLI.');
    }
    console.log('');
  }

  if (!state.codex.authed) {
    if (!state.codex.installed || !state.codex.path) {
      console.log('  🟢 Codex is not installed.');
      console.log('    Install first: npm i -g @openai/codex');
      console.log('');
    } else if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.log('  🟢 Codex login requires an interactive terminal.');
      console.log(`    Run: ${cmd('codex login --device-auth')}`);
      console.log('');
    } else {
      console.log('  🟢 Starting Codex device auth...');
      console.log('');
      if (runCodexDeviceAuth(state.codex.path)) {
        console.log('');
        console.log('  ✅ Codex authenticated and credentials saved.');
      } else {
        console.log('');
        console.log(`  ❌ Codex auth failed. Retry with: ${cmd('codex login --device-auth')}`);
      }
      console.log('');
    }
  }

  if (state.claude.authed && state.codex.authed) {
    console.log('  ✅ Claude and Codex are already authenticated.');
    console.log('');
    return;
  }

  const finalState = getAuthState();
  if (finalState.claude.authed && finalState.codex.authed) {
    printAuthStatusBox(finalState);
    return;
  }

  printAuthStatusBox(finalState);
}

function cmdAuthRefresh() {
  let env = detectEnvironment();
  let codexRefreshed = false;

  console.log('');
  console.log('  🔄 Refreshing provider auth...');
  console.log('');

  env = { ...env, claude: { ...env.claude, authed: false } };
  env = healClaudeAuth(env);

  if (env.codex.installed && env.codex.path && process.stdin.isTTY && process.stdout.isTTY) {
    console.log('  🟢 Codex device auth refresh');
    console.log('');
    codexRefreshed = runCodexDeviceAuth(env.codex.path);
    if (codexRefreshed) {
      env.codex.authed = true;
      env.codex.authMethod = 'device_auth';
      console.log('');
      console.log('  ✅ Codex auth refreshed and credentials saved.');
      console.log('');
    } else {
      console.log('');
      console.log(`  ❌ Codex refresh failed. Retry with: ${cmd('codex login --device-auth')}`);
      console.log('');
    }
  } else {
    env = { ...env, codex: { ...env.codex, authed: false } };
    env = healCodexAuth(env);
  }

  if (env.claude.installed && !env.claude.authed) {
    console.log(`  🟠 Claude refresh unavailable here. Run: ${cmd('claude login')}`);
    console.log('');
  }
  if (env.codex.installed && !env.codex.authed && !codexRefreshed) {
    console.log(`  🟢 Codex refresh incomplete. Run: ${cmd('codex login --device-auth')}`);
    console.log('');
  }

  const finalState = getAuthState();
  if (jsonOut) {
    console.log(JSON.stringify({ version: VERSION, auth: finalState }, null, 2));
    return;
  }
  printAuthStatusBox(finalState);
}

function cmdAuth() {
  const action = positional[1] || 'status';
  if (action === 'status')  { cmdAuthStatus(); return; }
  if (action === 'login')   { cmdAuthLogin(); return; }
  if (action === 'refresh') { cmdAuthRefresh(); return; }

  console.error(`  Unknown auth command: ${action}`);
  console.error(`  Run: ${cmd('npx dual-brain auth [status|login|refresh]')}`);
  process.exit(1);
}

// ─── Subcommand: mode ──────────────────────────────────────────────────────

function cmdMode() {
  const workspace = resolve(process.cwd());
  const modeArg = positional[1] || null;

  if (!modeArg || modeArg === 'list') {
    const current = loadProfile(workspace);
    const PEMOJIS = { auto: '🤖', balanced: '⚖️ ', 'cost-saver': '🛡️', 'quality-first': '🚀' };
    const UI_NAMES = { auto: 'Auto (default)', balanced: 'Balanced', 'cost-saver': 'Conservative', 'quality-first': 'Aggressive' };
    console.log('');
    console.log('  🎛️  Routing modes:');
    console.log('');
    for (const [name, p] of Object.entries(PROFILES)) {
      const active = name === current.name ? ' ✅ active' : '';
      const label = UI_NAMES[name] || name;
      console.log(`    ${PEMOJIS[name] || '  '} ${label.padEnd(15)} ${p.description}${active}`);
    }
    console.log('');
    console.log(`  Switch: ${cmd('npx dual-brain mode <name>')}`);
    console.log('');
    return;
  }

  let resolvedMode = modeArg;
  if (!PROFILES[resolvedMode]) {
    // Try natural language alias resolution
    const cleaned = resolvedMode.toLowerCase().trim()
      .replace(/^(go|be|use|switch to|set|mode)\s+/i, '')
      .replace(/\s+mode$/i, '');
    const MODE_ALIASES = {
      'auto': 'auto', 'adaptive': 'auto', 'smart': 'auto', 'default': 'auto', 'normal': 'auto',
      'balanced': 'balanced', 'even': 'balanced', 'equal': 'balanced',
      'cost-saver': 'cost-saver', 'cheap': 'cost-saver', 'save': 'cost-saver', 'conservative': 'cost-saver', 'frugal': 'cost-saver', 'budget': 'cost-saver',
      'quality-first': 'quality-first', 'aggressive': 'quality-first', 'quality': 'quality-first', 'max': 'quality-first', 'full': 'quality-first', 'both': 'quality-first',
    };
    resolvedMode = MODE_ALIASES[cleaned] || null;
    if (!resolvedMode) {
      console.error(`  Unknown profile: ${modeArg}`);
      console.error(`  Available: ${Object.keys(PROFILES).join(', ')}`);
      console.error(`  Aliases: cheap, aggressive, quality, budget, frugal, smart, adaptive, ...`);
      process.exit(1);
    }
  }

  const profile = PROFILES[resolvedMode];

  let customOverrides = null;
  try {
    const existing = JSON.parse(readFileSync(profilePath(workspace), 'utf8'));
    if (existing.custom_overrides?.budgets) {
      customOverrides = { budgets: existing.custom_overrides.budgets };
    }
  } catch {}

  saveProfile(workspace, resolvedMode, customOverrides);

  const PEMOJIS = { auto: '🤖', balanced: '⚖️ ', 'cost-saver': '🛡️', 'quality-first': '🚀' };
  const UI_NAMES = { auto: 'Auto (default)', balanced: 'Balanced', 'cost-saver': 'Conservative', 'quality-first': 'Aggressive' };
  console.log('');
  console.log(`  ✅ Mode switched: ${PEMOJIS[resolvedMode] || ''} ${UI_NAMES[resolvedMode] || resolvedMode}`);
  console.log(`  ${profile.description}`);
  console.log('');
  console.log('  🧭 Routing changes:');
  console.log(`    Provider:     ${profile.routing.prefer_provider}`);
  console.log(`    💵 Budget:    $${profile.budgets.session_limit_usd}/session, $${profile.budgets.daily_limit_usd}/day`);
  console.log(`    🛡️  Reviews:   ${profile.quality_gate.sensitivity_floor} risk+`);
  console.log(`    🧠 Dual-brain: ${profile.quality_gate.dual_brain_minimum} risk+`);
  console.log('');
  console.log('  🟢 Active immediately, no restart needed.');
  console.log('');
}

// ─── Subcommand: budget ────────────────────────────────────────────────────

function cmdBudget() {
  const workspace = resolve(process.cwd());
  const sessionArg = positional[1] ? parseFloat(positional[1]) : null;
  const dailyArg = positional[2] ? parseFloat(positional[2]) : null;

  if (sessionArg == null) {
    const profile = loadProfile(workspace);
    console.log('');
    console.log('  📊 Usage alert thresholds (estimated, not billing caps):');
    console.log(`    Session: ⚠️  $${profile.budgets.session_warn_usd} warn · 🛑 $${profile.budgets.session_limit_usd} alert`);
    console.log(`    Daily:   ⚠️  $${profile.budgets.daily_warn_usd} warn · 🛑 $${profile.budgets.daily_limit_usd} alert`);
    console.log('');
    console.log(`  Adjust: ${cmd('npx dual-brain budget <session$> [daily$]')}`);
    console.log(`  Example: ${cmd('npx dual-brain budget 8 25')}`);
    console.log('');
    return;
  }

  if (isNaN(sessionArg) || sessionArg <= 0) {
    console.error('  Session limit must be a positive number');
    process.exit(1);
  }

  const daily = (dailyArg != null && !isNaN(dailyArg) && dailyArg > 0) ? dailyArg : sessionArg * 3;

  let existing = {};
  try { existing = JSON.parse(readFileSync(profilePath(workspace), 'utf8')); } catch {}

  const customOverrides = existing.custom_overrides || {};
  customOverrides.budgets = {
    session_warn_usd: +(sessionArg * 0.6).toFixed(2),
    session_limit_usd: sessionArg,
    daily_warn_usd: +(daily * 0.6).toFixed(2),
    daily_limit_usd: daily,
  };

  const data = {
    active: existing.active || 'auto',
    switched_at: existing.switched_at || new Date().toISOString(),
    custom_overrides: customOverrides,
  };
  const budgetTarget = profilePath(workspace);
  const budgetTmp = budgetTarget + '.tmp.' + process.pid;
  writeFileSync(budgetTmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(budgetTmp, budgetTarget);

  console.log('');
  console.log('  ✅ Budget updated:');
  console.log(`    Session: ⚠️  $${customOverrides.budgets.session_warn_usd} warn · 🛑 $${sessionArg} limit`);
  console.log(`    Daily:   ⚠️  $${customOverrides.budgets.daily_warn_usd} warn · 🛑 $${daily} limit`);
  console.log('');
  console.log('  🟢 Active immediately, no restart needed.');
  console.log('');
}

// ─── Subcommand: explain ───────────────────────────────────────────────────

function cmdExplain() {
  const workspace = resolve(process.cwd());
  const hooksDir = join(workspace, '.claude', 'hooks');
  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(hooksDir, `usage-${today}.jsonl`);

  if (!existsSync(logFile)) {
    console.log('');
    console.log('  💤 No routing decisions recorded today.');
    console.log('  Start a Claude Code session and the tier enforcer will log decisions.');
    console.log('');
    return;
  }

  let lines;
  try {
    lines = readFileSync(logFile, 'utf8').split('\n').filter(Boolean);
  } catch {
    console.log('  Could not read usage log.');
    return;
  }

  let lastRec = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'tier_recommendation') { lastRec = entry; break; }
    } catch {}
  }

  if (!lastRec) {
    console.log('');
    console.log('  💤 No routing decisions found in today\'s log.');
    console.log('  The tier enforcer logs decisions when Agent tool is used.');
    console.log('');
    return;
  }

  const profile = loadProfile(workspace);

  console.log('');
  console.log('  🧭 Last Routing Decision');
  console.log('  ' + '─'.repeat(40));
  console.log(`  🕐 Time:         ${lastRec.timestamp?.slice(11, 19) || 'unknown'}`);
  console.log(`  🔎 Detected:     ${lastRec.detected_tier || 'unknown'} tier`);
  console.log(`  🧠 Recommended:  ${lastRec.recommended_model || 'unknown'}`);
  console.log(`  🎯 Actual:       ${lastRec.actual_model || 'unknown'}`);
  console.log(`  ${lastRec.followed ? '✅' : '⚠️'}  Followed:     ${lastRec.followed ? 'yes' : 'no'}`);
  console.log(`  🎛️  Profile:      ${profile.name}`);
  console.log('');

  if (!lastRec.followed) {
    console.log('  ⚠️  Recommendation was overridden. This may mean:');
    console.log('  - The task needed a different model (valid override)');
    console.log('  - The subagent_type forced a specific tier');
    console.log(`  - Profile "${profile.name}" adjusted the threshold`);
  } else {
    console.log('  ✅ Routing matched the recommendation.');
  }

  let total = 0, followed = 0;
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'tier_recommendation') { total++; if (e.followed) followed++; }
    } catch {}
  }
  const pct = total > 0 ? Math.round((followed / total) * 100) : 0;
  console.log('');
  console.log(`  Today: ${followed}/${total} recommendations followed (${pct}%)`);
  console.log('');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (subcommand === 'auth' || restoreNpmFlag) {
    restoreNpmToken();
  }

  if (subcommand === 'status') {
    launchPanel();
    return;
  }
  if (subcommand === 'auth')    { cmdAuth();    return; }
  if (subcommand === 'mode')    { cmdMode();    return; }
  if (subcommand === 'budget')  { cmdBudget();  return; }
  if (subcommand === 'explain') { cmdExplain(); return; }

  let env = detectEnvironment();
  const startupUpdateInfo = (subcommand === 'update' || dryRun || jsonOut)
    ? null
    : checkForUpdate(env.workspace);

  if (
    startupUpdateInfo?.updateAvailable &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !process.env.CI
  ) {
    console.log('');
    const shouldUpdate = await promptForUpdate(startupUpdateInfo);
    console.log('');
    if (shouldUpdate) {
      env = healClaudeAuth(env);
      env = healCodexAuth(env);
      const updateMode = resolveMode(env);
      const updateActions = performUpdate(env.workspace, env, updateMode);
      printReport(env, updateMode, updateActions);
      if (process.stdin.isTTY && process.stdout.isTTY && !process.env.CI) {
        launchPanel();
      }
      return;
    }
  }

  // Auth self-healing: try to fix expired/missing auth silently
  env = healClaudeAuth(env);
  env = healCodexAuth(env);

  // Interactive auth guidance if still not authed
  if (!env.claude.authed || !env.codex.authed) {
    env = await authGuidance(env);
  }

  // Re-resolve mode after healing
  const mode = resolveMode(env);

  if (dryRun || jsonOut) {
    if (jsonOut) {
      console.log(JSON.stringify({ version: VERSION, env, mode }, null, 2));
    } else {
      printReport(env, mode, null, true);
    }
    process.exit(0);
  }

  if (subcommand === 'update') {
    const actions = performUpdate(env.workspace, env, mode);
    printReport(env, mode, actions);
    process.exit(0);
  }

  // Check for replit-tools on Replit
  if (env.isReplit && !env.hasReplitTools) {
    console.log('');
    console.log('  ⚠️  replit-tools not found — recommended for Replit environments.');
    console.log('  Dual-brain works best alongside replit-tools for persistent auth,');
    console.log('  session management, and shell integration.');
    console.log('');
    console.log(`  Install: ${cmd('npx -y data-tools')}`);
    console.log('');
  }

  const actions = install(env.workspace, env, mode);
  printReport(env, mode, actions);

  // After install, launch the session manager (interactive TTY only)
  if (process.stdin.isTTY && process.stdout.isTTY && !process.env.CI) {
    launchPanel();
  }
}

main();
