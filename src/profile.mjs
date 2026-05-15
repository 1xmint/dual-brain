#!/usr/bin/env node
/**
 * profile.mjs — User profile module for the Dual-Brain Orchestrator.
 *
 * Exported API:
 *   loadProfile(cwd)               → profile (or defaults)
 *   saveProfile(profile, opts)     → write project or global file
 *   ensureProfile(cwd, opts)       → load or onboard
 *   runOnboarding(opts)            → interactive 3-question setup
 *   rememberPreference(text, opts) → add/update preference
 *   forgetPreference(text, cwd)    → remove preference by fuzzy match
 *   getActivePreferences(cwd)      → enabled global + project preferences
 *   getAvailableProviders(profile) → enabled providers with plan info
 *   isSoloBrain(profile)           → true if only one provider enabled
 *   getHeadModel(profile)          → suggested head model string
 *
 * CLI:
 *   node src/profile.mjs                  # show current profile
 *   node src/profile.mjs --init           # run onboarding
 *   node src/profile.mjs --remember "…"   # add preference
 *   node src/profile.mjs --forget "…"     # remove preference
 *   node src/profile.mjs --providers      # show available providers
 */

import { createInterface } from 'readline';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';

// ---------------------------------------------------------------------------
// Claude Code memory integration
// ---------------------------------------------------------------------------

const MEMORY_FILE_NAME = 'dual_brain_preferences.md';
const MEMORY_INDEX_ENTRY =
  '- [Dual-brain preferences](dual_brain_preferences.md) — Active routing preferences for model/provider selection';

/**
 * Derive the Claude Code memory directory for the given project root.
 * Returns null when the directory doesn't exist (i.e. not running on Replit).
 */
function _memoryDir(cwd) {
  const root = cwd || process.cwd();
  // Replit persistent memory lives at a fixed path derived from the workspace root.
  // Convert e.g. /home/runner/workspace → -home-runner-workspace
  const encoded = root.replace(/\//g, '-');
  const candidate = join(
    root,
    '.replit-tools',
    '.claude-persistent',
    'projects',
    encoded,
    'memory',
  );
  return existsSync(candidate) ? candidate : null;
}

/**
 * Write (or update) the dual_brain_preferences.md file in the Claude Code
 * memory directory, and ensure MEMORY.md has an index entry for it.
 * Fails silently if the memory directory is absent or unwritable.
 */
function syncPreferencesToMemory(profile, cwd) {
  try {
    const memDir = _memoryDir(cwd);
    if (!memDir) return; // not on Replit / memory dir missing — skip silently

    const prefs = (profile.preferences || []).filter(p => p.enabled);

    // Build markdown body
    const prefLines = prefs.length
      ? prefs.map(p => `- ${p.text} (scope: ${p.scope || 'project'})`).join('\n')
      : '_(no active preferences)_';

    const content = [
      '---',
      'name: dual-brain-preferences',
      'description: Active dual-brain routing preferences — affects model selection, provider choice, and dual-brain consensus',
      'metadata:',
      '  type: project',
      '---',
      '',
      'Active dual-brain preferences:',
      '',
      prefLines,
      '',
      'These preferences are enforced by the dual-brain orchestrator routing engine.',
      'Provider routing, model selection, and dual-brain consensus decisions',
      'respect these preferences automatically via src/decide.mjs.',
      '',
    ].join('\n');

    const prefFile = join(memDir, MEMORY_FILE_NAME);
    writeFileSync(prefFile, content, 'utf8');

    // Update MEMORY.md index — add entry only if not already present
    const indexFile = join(memDir, 'MEMORY.md');
    if (existsSync(indexFile)) {
      const existing = readFileSync(indexFile, 'utf8');
      if (!existing.includes(MEMORY_FILE_NAME)) {
        writeFileSync(indexFile, existing.trimEnd() + '\n' + MEMORY_INDEX_ENTRY + '\n', 'utf8');
      }
    }
  } catch {
    // Non-fatal — the profile JSON remains the source of truth
  }
}

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

/**
 * Detect the runtime environment.
 * Returns { isReplit, hasReplitTools, isCI }.
 */
function detectEnvironment() {
  const isReplit = !!(process.env.REPL_ID || process.env.REPLIT_DB_URL);
  const hasReplitTools = existsSync(join(process.cwd(), '.replit-tools'));
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
  return { isReplit, hasReplitTools, isCI };
}

// ---------------------------------------------------------------------------
// Auth detection
// ---------------------------------------------------------------------------

/**
 * Detect CLI login status for Claude and Codex.
 * Checks config files on disk — never makes network calls.
 *
 * @returns {{ claude: AuthEntry, openai: AuthEntry }}
 * @typedef {{ found: boolean, source: string|null, loginType: 'oauth'|'cli'|null }} AuthEntry
 */
async function detectAuth() {
  const results = {
    claude: { found: false, source: null, loginType: null },
    openai: { found: false, source: null, loginType: null },
  };

  // --- Claude: check .claude.json for oauthAccount (CLI login) ---
  const claudePaths = [
    '/home/runner/workspace/.replit-tools/.claude-persistent/.claude.json',
    join(homedir(), '.claude', '.claude.json'),
  ];
  for (const p of claudePaths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      if (data?.oauthAccount) {
        results.claude.found     = true;
        results.claude.source    = p.includes('.replit-tools') ? 'claude CLI (replit-tools)' : 'claude CLI';
        results.claude.loginType = 'oauth';
        break;
      }
      // Legacy: apiKey field in .claude.json (set by claude CLI in some versions)
      if (data?.apiKey && typeof data.apiKey === 'string') {
        results.claude.found     = true;
        results.claude.source    = p.includes('.replit-tools') ? 'claude CLI (replit-tools)' : 'claude CLI';
        results.claude.loginType = 'cli';
        break;
      }
    } catch { continue; }
  }

  // --- OpenAI/Codex: check auth.json for access_token or id_token (CLI login) ---
  const codexPaths = [
    '/home/runner/workspace/.replit-tools/.codex-persistent/auth.json',
    join(homedir(), '.codex', 'auth.json'),
  ];
  for (const p of codexPaths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const accessToken = data?.tokens?.access_token || data?.access_token;
      const idToken     = data?.tokens?.id_token     || data?.id_token;

      if (accessToken || idToken) {
        results.openai.found     = true;
        results.openai.source    = p.includes('.replit-tools') ? 'codex CLI (replit-tools)' : 'codex CLI';
        results.openai.loginType = 'oauth';
        break;
      }
    } catch { continue; }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Subscription management (.dualbrain/profile.json)
// ---------------------------------------------------------------------------

/**
 * Save subscription config for a provider into .dualbrain/profile.json.
 * @param {string} provider — 'claude' or 'openai'
 * @param {{ plan: string, label?: string, expiresAt?: string }} config
 * @param {string} [cwd]
 */
function saveSubscription(provider, config, cwd) {
  const profile = loadProfile(cwd);
  if (!profile.providers[provider]) profile.providers[provider] = { enabled: true };
  profile.providers[provider].plan    = config.plan;
  profile.providers[provider].enabled = true;
  if (config.label)     profile.providers[provider].label     = config.label;
  if (config.expiresAt) profile.providers[provider].expiresAt = config.expiresAt;
  saveProfile(profile, { cwd: cwd || process.cwd() });
  return profile;
}

/**
 * Return subscription configs for all providers from the saved profile.
 * @param {string} [cwd]
 * @returns {{ [provider: string]: { plan: string, enabled: boolean, label?: string, expiresAt?: string } }}
 */
function listSubscriptions(cwd) {
  const profile = loadProfile(cwd);
  return profile.providers || {};
}

// ---------------------------------------------------------------------------
// Auto-detect subscription plans from provider config files
// ---------------------------------------------------------------------------

/**
 * Decode a JWT payload without verifying the signature.
 * Returns the payload object, or null on failure.
 * @param {string} token
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // Base64url → base64 → Buffer
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Infer plan tier from Claude Code and Codex auth config files.
 * Returns { claude: '$20'|'$100'|'$200'|null, openai: '$20'|'$100'|'$200'|null }.
 * Returns nulls for any provider whose config cannot be read — never throws.
 *
 * NOTE: This reads rate-limit tier signals (organizationRateLimitTier for Claude,
 * chatgpt_plan_type JWT claim for OpenAI) and maps them to price tiers.
 * It does NOT retrieve the actual subscription plan name from the provider —
 * labels like "Max x5" or "Pro" are our own interpretations of those signals.
 */
function detectPlans() {
  const plans = { claude: null, openai: null };

  // --- Claude: read organizationRateLimitTier from .claude.json ---
  const claudePaths = [
    // Replit-tools persistent path (takes precedence)
    '/home/runner/workspace/.replit-tools/.claude-persistent/.claude.json',
    join(homedir(), '.claude', '.claude.json'),
  ];
  for (const p of claudePaths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const tier = data?.oauthAccount?.organizationRateLimitTier;
      if (tier) {
        if (tier.includes('max_20x')) plans.claude = '$200';
        else if (tier.includes('max_5x')) plans.claude = '$100';
        else plans.claude = '$20';
      }
      break;
    } catch { continue; }
  }

  // --- OpenAI/Codex: read plan from auth.json (direct field or JWT payload) ---
  const codexPaths = [
    // Replit-tools persistent path (takes precedence)
    '/home/runner/workspace/.replit-tools/.codex-persistent/auth.json',
    join(homedir(), '.codex', 'auth.json'),
  ];
  for (const p of codexPaths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));

      // Try a top-level `plan` field first
      let planType = data.plan ?? null;

      // Fall back to decoding the JWT id_token or access_token
      if (!planType) {
        for (const key of ['id_token', 'access_token']) {
          const token = data?.tokens?.[key];
          if (!token) continue;
          const payload = decodeJwtPayload(token);
          planType =
            payload?.['https://api.openai.com/auth']?.chatgpt_plan_type ?? null;
          if (planType) break;
        }
      }

      if (planType) {
        // pro / prolite → $100 | plus → $20 | pro200 / team → $200
        if (planType === 'pro200' || planType === 'team') plans.openai = '$200';
        else if (planType === 'pro' || planType === 'prolite') plans.openai = '$100';
        else plans.openai = '$20';
      }
      break;
    } catch { continue; }
  }

  return plans;
}

// ---------------------------------------------------------------------------
// Paths & defaults
// ---------------------------------------------------------------------------

const GLOBAL_DIR  = join(homedir(), '.config', 'dual-brain');
const GLOBAL_PATH = join(GLOBAL_DIR, 'profile.json');
const projectPath = (cwd) => join(cwd || process.cwd(), '.dualbrain', 'profile.json');

function defaultProfile() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    providers: {
      claude: { plan: '$20', enabled: true  },
      openai: { plan: '$20', enabled: false },
    },
    mode: 'auto',
    bias: 'balanced',
    preferences: [],
  };
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

function migrateProfile(profile) {
  // v5.x compat: convert old `subscriptions` field to `providers`
  if (profile.subscriptions && !profile.providers) {
    profile.providers = {};
    for (const [key, sub] of Object.entries(profile.subscriptions)) {
      profile.providers[key] = {
        plan: sub.plan || '$20',
        enabled: true,
      };
    }
    delete profile.subscriptions;
  }

  if (!profile.schemaVersion || profile.schemaVersion < 1) {
    // v0 → v1: add missing fields with defaults
    profile.schemaVersion = 1;
    profile.mode = profile.mode || 'auto';
    profile.bias = profile.bias || 'balanced';
    profile.preferences = profile.preferences || [];
    profile.providers = profile.providers || {};
  }
  // Future migrations go here:
  // if (profile.schemaVersion < 2) { ... profile.schemaVersion = 2; }
  return profile;
}

// ---------------------------------------------------------------------------
// Load / save
// ---------------------------------------------------------------------------

function loadProfile(cwd) {
  let profile;
  for (const p of [projectPath(cwd), GLOBAL_PATH]) {
    if (existsSync(p)) {
      try { profile = migrateProfile(JSON.parse(readFileSync(p, 'utf8'))); break; } catch { /* skip */ }
    }
  }
  if (!profile) profile = defaultProfile();

  // Read plan tier from auth config files (JWT or organizationRateLimitTier) and
  // apply if it differs from the stored profile value.
  // NOTE: detectPlans() reads rate-limit tier data from the auth config — it infers
  // a price tier ($20/$100/$200) from that signal, not from the subscription name itself.
  // The plan label (e.g. "Max x5") comes from our own mapping, not from Claude/OpenAI.
  const detected = detectPlans();
  for (const [provider, detectedPlan] of Object.entries(detected)) {
    if (!detectedPlan) continue;
    if (!profile.providers[provider]) continue;
    const stored = profile.providers[provider].plan;
    if (stored !== detectedPlan) {
      profile.providers[provider].plan = detectedPlan;
    }
  }

  return profile;
}

function saveProfile(profile, opts = {}) {
  const target = opts.global ? GLOBAL_PATH : projectPath(opts.cwd);
  const dir = target.slice(0, target.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  profile.updatedAt = new Date().toISOString();
  const tmp = target + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(profile, null, 2) + '\n');
  renameSync(tmp, target);
  return target;
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

async function runOnboarding(opts = {}) {
  if (!opts.interactive) return defaultProfile();

  // Accept an externally-provided readline instance (shared with REPL/auth setup)
  // or create one internally if not provided. Only close if we created it.
  const rlProvided = !!opts.rl;
  const rl = opts.rl || createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  const profile = defaultProfile();

  try {
    process.stdout.write('\nDual-Brain Orchestrator — First-time setup\n\n');

    const q1 = (await ask('Which AI subscriptions do you have?\n  (1) Claude only  (2) OpenAI only  (3) Both\n> ')).trim();
    if (q1 === '2') { profile.providers.claude.enabled = false; profile.providers.openai.enabled = true; }
    else if (q1 === '3') { profile.providers.openai.enabled = true; }

    const PLANS = { '1': '$20', '2': '$100', '3': '$200' };
    for (const [key, prov] of Object.entries(profile.providers)) {
      if (!prov.enabled) continue;
      const label = key === 'claude' ? 'Claude' : 'OpenAI/ChatGPT';
      const q2 = (await ask(`\n${label} tier?\n  (1) $20/mo  (2) $100/mo  (3) $200/mo\n> `)).trim();
      prov.plan = PLANS[q2] || '$20';
    }

    const q3 = (await ask('\nDefault optimization?\n  (1) Save usage  (2) Balanced  (3) Best quality\n> ')).trim();
    profile.bias = ({ '1': 'cost-saver', '3': 'quality-first' })[q3] || 'balanced';

    const n = Object.values(profile.providers).filter(p => p.enabled).length;
    profile.mode = n >= 2 ? 'dual' : profile.providers.claude.enabled ? 'solo-claude' : 'solo-openai';
    process.stdout.write('\nProfile saved.\n');
  } finally {
    // Only close if we created the rl instance (not if it was passed in)
    if (!rlProvided) rl.close();
  }
  return profile;
}

async function ensureProfile(cwd, opts = {}) {
  for (const p of [projectPath(cwd), GLOBAL_PATH]) {
    if (existsSync(p)) {
      try { return migrateProfile(JSON.parse(readFileSync(p, 'utf8'))); } catch { /* skip */ }
    }
  }
  const profile = await runOnboarding(opts);
  saveProfile(profile, { cwd, global: opts.global });
  return profile;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

const VALID_SCOPES = ['one-off', 'project', 'global'];

function rememberPreference(text, opts = {}) {
  const scope   = VALID_SCOPES.includes(opts.scope) ? opts.scope : 'project';
  const cwd     = opts.cwd || process.cwd();
  const profile = loadProfile(cwd);
  const needle  = text.toLowerCase();
  const idx     = profile.preferences.findIndex(p =>
    p.text.toLowerCase().includes(needle) || needle.includes(p.text.toLowerCase()));
  if (idx >= 0) profile.preferences[idx] = { text, enabled: true, scope };
  else profile.preferences.push({ text, enabled: true, scope });
  saveProfile(profile, { cwd, global: opts.global || scope === 'global' });
  syncPreferencesToMemory(profile, cwd);
  return profile;
}

function forgetPreference(text, cwd) {
  const profile = loadProfile(cwd);
  const needle  = text.toLowerCase();
  profile.preferences = profile.preferences.filter(p => !p.text.toLowerCase().includes(needle));
  saveProfile(profile, { cwd });
  syncPreferencesToMemory(profile, cwd);
  return profile;
}

function getActivePreferences(cwd) {
  const seen = new Set();
  const result = [];
  for (const p of [GLOBAL_PATH, projectPath(cwd)]) {
    if (!existsSync(p)) continue;
    try {
      for (const pref of JSON.parse(readFileSync(p, 'utf8')).preferences || []) {
        if (pref.enabled && !seen.has(pref.text)) { seen.add(pref.text); result.push(pref); }
      }
    } catch { /* skip */ }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

const PLAN_RANK = { '$20': 1, '$100': 2, '$200': 3 };

function getAvailableProviders(profile) {
  return Object.entries(profile.providers || {})
    .filter(([, p]) => p.enabled)
    .map(([name, p]) => ({ name, plan: p.plan, rank: PLAN_RANK[p.plan] || 1 }));
}

function isSoloBrain(profile) {
  return getAvailableProviders(profile).length === 1;
}

function getHeadModel(profile) {
  const providers = getAvailableProviders(profile);
  if (providers.length === 0) return 'sonnet';
  if (providers.length === 1) return providers[0].name === 'openai' ? 'gpt-4o' : 'sonnet';
  const top = providers.reduce((a, b) => (b.rank > a.rank ? b : a));
  return top.name === 'openai' ? 'gpt-4o' : 'sonnet';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const cwd  = process.cwd();
  const flag = args[0];
  const val  = args[1];

  if (flag === '--init') {
    const profile = await runOnboarding({ interactive: true });
    saveProfile(profile, { cwd });
    return;
  }
  if (flag === '--remember') {
    if (!val) { process.stderr.write('Usage: --remember "text"\n'); process.exit(1); }
    const p = rememberPreference(val, { cwd });
    process.stdout.write(`Preference saved. Total: ${p.preferences.length}\n`);
    return;
  }
  if (flag === '--forget') {
    if (!val) { process.stderr.write('Usage: --forget "text"\n'); process.exit(1); }
    forgetPreference(val, cwd);
    process.stdout.write('Preference removed (if matched).\n');
    return;
  }
  if (flag === '--providers') {
    const providers = getAvailableProviders(loadProfile(cwd));
    if (!providers.length) { process.stdout.write('No providers enabled.\n'); return; }
    providers.forEach(p => process.stdout.write(`${p.name}  plan=${p.plan}\n`));
    return;
  }

  // default: show profile
  const profile   = loadProfile(cwd);
  const providers = getAvailableProviders(profile);
  [
    `mode       : ${profile.mode}`,
    `bias       : ${profile.bias}`,
    `head model : ${getHeadModel(profile)}`,
    `providers  : ${providers.map(p => `${p.name} (${p.plan})`).join(', ') || 'none'}`,
    `prefs      : ${profile.preferences?.filter(p => p.enabled).length || 0} active`,
  ].forEach(l => process.stdout.write(l + '\n'));
}

const isMain = process.argv[1]?.endsWith('profile.mjs');
if (isMain) main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Auto-setup (1-click, no user input required)
// ---------------------------------------------------------------------------

/**
 * Attempt to configure a profile entirely from detected state — no user input.
 *
 * Returns:
 *   {
 *     confident: boolean,   // true when at least one provider was found
 *     profile: object|null, // fully-built profile ready to save, or null
 *     warnings: string[],   // non-fatal issues (e.g. missing provider)
 *     actions: string[],    // human-readable lines for the summary box
 *   }
 *
 * IMPORTANT: this function NEVER stores credentials — it only reads what's
 * already present on disk / in environment variables.
 */
async function autoSetup(cwd) {
  const env  = detectEnvironment();
  const auth = await detectAuth();
  const plans = detectPlans();

  const result = {
    confident: false,
    profile: null,
    warnings: [],
    actions: [],
  };

  // Need at least one provider authenticated
  if (!auth.claude.found && !auth.openai.found) {
    result.warnings.push('No provider credentials found');
    return result;
  }

  // Build profile from detected state
  const profile = defaultProfile();

  // Claude
  if (auth.claude.found) {
    profile.providers.claude.enabled = true;
    profile.providers.claude.plan    = plans.claude || '$20';
    // Plan tier is inferred from auth config signal — show tier with "configured",
    // not a plan name we didn't actually detect.
    const claudeTierLabel = plans.claude ? `${plans.claude} configured` : 'connected';
    result.actions.push(`Claude: ${claudeTierLabel} (${auth.claude.source})`);
  } else {
    profile.providers.claude.enabled = false;
    result.warnings.push('Claude CLI not logged in — run: claude login');
  }

  // OpenAI
  if (auth.openai.found) {
    profile.providers.openai.enabled = true;
    profile.providers.openai.plan    = plans.openai || '$20';
    // Plan tier is inferred from JWT claim in auth config — show tier with "configured",
    // not a plan name we didn't actually detect.
    const openaiTierLabel = plans.openai ? `${plans.openai} configured` : 'connected';
    result.actions.push(`OpenAI: ${openaiTierLabel} (${auth.openai.source})`);
  } else {
    profile.providers.openai.enabled = false;
    result.warnings.push('Codex CLI not logged in — run: codex login');
  }

  // Mode
  const enabledCount = [auth.claude.found, auth.openai.found].filter(Boolean).length;
  profile.mode = enabledCount >= 2 ? 'dual'
    : auth.claude.found ? 'solo-claude'
    : 'solo-openai';
  profile.bias = 'balanced';

  // Environment note
  if (env.isReplit && env.hasReplitTools) {
    result.actions.push('Replit + replit-tools detected');
  } else if (env.isReplit) {
    result.actions.push('Replit environment detected');
  }

  result.confident = true;
  result.profile   = profile;
  return result;
}

// ---------------------------------------------------------------------------
// OAuth token auto-refresh
// ---------------------------------------------------------------------------

/**
 * Silently refresh the Claude OAuth token before it expires.
 * Mirrors the approach used by replit-tools/data-tools claude-auth-refresh.sh,
 * but implemented in JavaScript.
 *
 * Returns one of:
 *   { status: 'valid', hoursRemaining }
 *   { status: 'refreshed', hoursRemaining }
 *   { status: 'expiring_no_refresh' | 'expired', hoursRemaining }
 *   { status: 'no_credentials' | 'parse_error' | 'no_expiry' }
 *   { status: 'refresh_failed', error }
 *
 * @param {string} [cwd]
 */
async function autoRefreshToken(cwd) {
  const home = process.env.HOME || '/root';
  const credPaths = [
    join(home, '.claude', '.credentials.json'),
    join(cwd || '.', '.replit-tools', '.claude-persistent', '.credentials.json'),
  ];

  let credPath = null;
  for (const p of credPaths) {
    if (existsSync(p)) { credPath = p; break; }
  }
  if (!credPath) return { status: 'no_credentials' };

  let creds;
  try {
    creds = JSON.parse(readFileSync(credPath, 'utf8'));
  } catch { return { status: 'parse_error' }; }

  const oauth = creds?.claudeAiOauth;
  if (!oauth?.expiresAt) return { status: 'no_expiry' };

  const now = Date.now();
  const remainingMs = oauth.expiresAt - now;
  const remainingHours = Math.floor(remainingMs / 1000 / 60 / 60);

  // More than 2 hours left — no refresh needed
  if (remainingHours >= 2) {
    return { status: 'valid', hoursRemaining: remainingHours };
  }

  // Need refresh
  if (!oauth.refreshToken) {
    return { status: remainingMs > 0 ? 'expiring_no_refresh' : 'expired', hoursRemaining: remainingHours };
  }

  try {
    const res = await fetch('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: oauth.refreshToken,
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
      }),
    });

    if (!res.ok) return { status: 'refresh_failed', error: `HTTP ${res.status}` };

    const data = await res.json();
    if (!data.access_token) return { status: 'refresh_failed', error: 'no access_token' };

    // Update credentials
    const newExpiresAt = now + (data.expires_in * 1000);
    creds.claudeAiOauth.accessToken = data.access_token;
    if (data.refresh_token) creds.claudeAiOauth.refreshToken = data.refresh_token;
    creds.claudeAiOauth.expiresAt = newExpiresAt;

    // Backup then write
    try { writeFileSync(credPath + '.backup', readFileSync(credPath)); } catch {}
    writeFileSync(credPath, JSON.stringify(creds));

    const newHours = Math.floor((data.expires_in) / 60 / 60);
    return { status: 'refreshed', hoursRemaining: newHours };
  } catch (e) {
    return { status: 'refresh_failed', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// detectExistingAuth — silent onboarding scan
// ---------------------------------------------------------------------------

/**
 * Run a CLI command with a timeout, returning stdout as a string.
 * Resolves with null on timeout, error, or non-zero exit.
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<string|null>}
 */
function _runWithTimeout(cmd, args, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const done = (val) => { if (!settled) { settled = true; resolve(val); } };

    let child;
    try {
      child = execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
        done(err ? null : (stdout || '').trim());
      });
    } catch {
      done(null);
      return;
    }

    // Belt-and-suspenders timeout fallback
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      done(null);
    }, timeoutMs + 500);

    if (child?.on) {
      child.on('close', () => clearTimeout(timer));
    }
  });
}

/**
 * Derive a human-readable plan label from a plan tier string.
 * @param {'claude'|'openai'} provider
 * @param {string} plan  e.g. '$20' | '$100' | '$200'
 */
function _planLabel(provider, plan) {
  const labels = {
    claude: { '$20': 'Claude Pro ($20)', '$100': 'Claude Max x5 ($100)', '$200': 'Claude Max x20 ($200)' },
    openai: { '$20': 'ChatGPT Plus ($20)', '$100': 'ChatGPT Pro ($100)', '$200': 'ChatGPT Pro ($200)' },
  };
  return labels[provider]?.[plan] ?? `${provider} ${plan}`;
}

/**
 * Silently scan for existing auth from all known sources and return what was
 * found, together with smart setup recommendations.
 *
 * Checks (in order, all non-throwing):
 *   1. data-tools / replit-tools  — ~/.claude/credentials.json or
 *      .replit-tools/.claude-persistent/.credentials.json for a session key
 *   2. Claude CLI                 — `claude auth status` with 3 s timeout
 *   3. Codex CLI                  — `codex auth status` with 3 s timeout or
 *                                   ~/.codex/ config files
 *   4. Existing dual-brain config — .dualbrain/profile.json
 *
 * Returns:
 * {
 *   claude:          { found: boolean, source: string|null, plan: string|null, expiresAt: string|null },
 *   openai:          { found: boolean, source: string|null, plan: string|null },
 *   existingProfile: boolean,
 *   recommendations: { headModel: string, budget: string, profile: string },
 * }
 *
 * @param {string} [cwd]
 */
async function detectExistingAuth(cwd) {
  const home = homedir();
  const root = cwd || process.cwd();

  // -------------------------------------------------------------------------
  // Result skeleton
  // -------------------------------------------------------------------------
  const result = {
    claude:          { found: false, source: null, plan: null, expiresAt: null },
    openai:          { found: false, source: null, plan: null },
    existingProfile: false,
    recommendations: { headModel: 'claude-sonnet-4-6', budget: '$20', profile: 'balanced' },
  };

  // -------------------------------------------------------------------------
  // 1. data-tools / replit-tools — credentials.json session key
  // -------------------------------------------------------------------------
  const credPaths = [
    join(root, '.replit-tools', '.claude-persistent', '.credentials.json'),
    join(home, '.claude', '.credentials.json'),
    // legacy replit persistent path
    '/home/runner/workspace/.replit-tools/.claude-persistent/.credentials.json',
  ];
  for (const credPath of credPaths) {
    try {
      const creds = JSON.parse(readFileSync(credPath, 'utf8'));
      const oauth  = creds?.claudeAiOauth;
      if (oauth?.accessToken || oauth?.sessionKey) {
        result.claude.found  = true;
        result.claude.source = credPath.includes('.replit-tools') ? 'data-tools' : 'credentials.json';
        // Expiry
        if (oauth.expiresAt) {
          try { result.claude.expiresAt = new Date(oauth.expiresAt).toISOString(); } catch {}
        }
        break;
      }
    } catch { /* non-fatal */ }
  }

  // -------------------------------------------------------------------------
  // 2. Claude CLI auth detection (config files + `claude auth status`)
  // -------------------------------------------------------------------------
  if (!result.claude.found) {
    // Config-file scan (same paths as detectAuth)
    const claudeConfigPaths = [
      join(root, '.replit-tools', '.claude-persistent', '.claude.json'),
      '/home/runner/workspace/.replit-tools/.claude-persistent/.claude.json',
      join(home, '.claude', '.claude.json'),
    ];
    for (const p of claudeConfigPaths) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf8'));
        if (data?.oauthAccount || (data?.apiKey && typeof data.apiKey === 'string')) {
          result.claude.found  = true;
          result.claude.source = p.includes('.replit-tools') ? 'claude CLI (replit-tools)' : 'claude CLI';
          break;
        }
      } catch { /* non-fatal */ }
    }

    // CLI fallback: `claude auth status`
    if (!result.claude.found) {
      const out = await _runWithTimeout('claude', ['auth', 'status'], 3000);
      if (out && /logged.in|authenticated|signed.in/i.test(out)) {
        result.claude.found  = true;
        result.claude.source = 'claude CLI (auth status)';
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Codex CLI / OpenAI auth detection
  // -------------------------------------------------------------------------
  const codexConfigPaths = [
    join(root, '.replit-tools', '.codex-persistent', 'auth.json'),
    '/home/runner/workspace/.replit-tools/.codex-persistent/auth.json',
    join(home, '.codex', 'auth.json'),
  ];
  for (const p of codexConfigPaths) {
    try {
      const data        = JSON.parse(readFileSync(p, 'utf8'));
      const accessToken = data?.tokens?.access_token || data?.access_token;
      const idToken     = data?.tokens?.id_token     || data?.id_token;
      if (accessToken || idToken) {
        result.openai.found  = true;
        result.openai.source = p.includes('.replit-tools') ? 'codex CLI (replit-tools)' : 'codex CLI';
        break;
      }
    } catch { /* non-fatal */ }
  }

  // CLI fallback: `codex auth status`
  if (!result.openai.found) {
    const out = await _runWithTimeout('codex', ['auth', 'status'], 3000);
    if (out && /logged.in|authenticated|signed.in/i.test(out)) {
      result.openai.found  = true;
      result.openai.source = 'codex CLI (auth status)';
    }
  }

  // -------------------------------------------------------------------------
  // 4. Existing dual-brain profile
  // -------------------------------------------------------------------------
  for (const p of [projectPath(root), GLOBAL_PATH]) {
    if (existsSync(p)) {
      result.existingProfile = true;
      break;
    }
  }

  // -------------------------------------------------------------------------
  // Plan tier inference (re-uses detectPlans which reads auth config files)
  // NOTE: This is NOT subscription detection — we infer a price tier ($20/$100/$200)
  // from rate-limit tier signals in the auth config (organizationRateLimitTier for
  // Claude, JWT chatgpt_plan_type for OpenAI). The CLI does not report the actual
  // plan name or price. Any plan label shown to the user comes from our own mapping.
  // -------------------------------------------------------------------------
  const plans = detectPlans();
  if (result.claude.found && plans.claude) result.claude.plan = plans.claude;
  if (result.openai.found && plans.openai) result.openai.plan = plans.openai;

  // -------------------------------------------------------------------------
  // Smart recommendations
  // -------------------------------------------------------------------------
  const claudeRank = PLAN_RANK[result.claude.plan] || 0;
  const openaiRank = PLAN_RANK[result.openai.plan] || 0;

  if (result.claude.found && !result.openai.found) {
    // Solo Claude
    result.recommendations.headModel = 'claude-sonnet-4-6';
    result.recommendations.budget    = result.claude.plan || '$20';
    result.recommendations.profile   = claudeRank >= 2 ? 'quality-first' : 'balanced';
  } else if (result.openai.found && !result.claude.found) {
    // Solo OpenAI
    result.recommendations.headModel = 'gpt-4o';
    result.recommendations.budget    = result.openai.plan || '$20';
    result.recommendations.profile   = openaiRank >= 2 ? 'quality-first' : 'balanced';
  } else if (result.claude.found && result.openai.found) {
    // Both available — higher-ranked provider drives HEAD model
    if (openaiRank > claudeRank) {
      result.recommendations.headModel = 'gpt-4o';
    } else {
      result.recommendations.headModel = 'claude-sonnet-4-6';
    }
    const topPlan = openaiRank >= claudeRank ? result.openai.plan : result.claude.plan;
    result.recommendations.budget  = topPlan || '$20';
    const topRank = Math.max(claudeRank, openaiRank);
    result.recommendations.profile = topRank >= 2 ? 'quality-first' : 'balanced';
  }
  // else: no auth found — defaults remain (claude-sonnet-4-6 / $20 / balanced)

  return result;
}

export {
  loadProfile, saveProfile, ensureProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectPlans, syncPreferencesToMemory,
  detectAuth, detectEnvironment,
  saveSubscription, listSubscriptions,
  defaultProfile, autoSetup, autoRefreshToken,
  detectExistingAuth,
};
