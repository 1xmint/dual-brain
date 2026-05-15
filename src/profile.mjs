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
 *   getAvailableProviders(profile) → enabled providers
 *   isSoloBrain(profile)           → true if only one provider enabled
 *   getHeadModel(profile)          → suggested head model string
 *   detectCapabilities(cwd)        → what we can actually verify
 *   getOnboardingMessage(caps, ws) → honest 2-3 line status message
 *   needsApiGuardrail(caps)        → true if metered API key detected
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
import { execSync } from 'child_process';

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
// Capability detection — only what we can actually verify
// ---------------------------------------------------------------------------

/**
 * Detect what providers and tools are actually available.
 * Never makes network calls, never claims to know configured plan or price.
 *
 * @param {string} [cwd]
 * @returns {Promise<{
 *   claude:       { available: boolean, source: string|null },
 *   openai:       { available: boolean, source: string|null, metered: boolean },
 *   codex:        { available: boolean, source: string|null },
 *   replitTools:  { available: boolean, checkpoints: boolean },
 * }>}
 */
async function detectCapabilities(cwd) {
  const root = cwd || process.cwd();

  // --- Claude: running inside Claude Code or has ANTHROPIC_API_KEY or ~/.claude dir ---
  let claudeAvailable = false;
  let claudeSource = null;

  if (process.env.CLAUDE_CODE) {
    claudeAvailable = true;
    claudeSource = 'claude-code';
  } else if (process.env.ANTHROPIC_API_KEY) {
    claudeAvailable = true;
    claudeSource = 'env-key';
  } else {
    // Check for ~/.claude directory (Claude Code installation)
    const claudeDir = join(homedir(), '.claude');
    const replitClaudeDir = join(root, '.replit-tools', '.claude-persistent');
    if (existsSync(claudeDir) || existsSync(replitClaudeDir)) {
      claudeAvailable = true;
      claudeSource = existsSync(replitClaudeDir) ? 'claude-code' : 'claude-dir';
    }
  }

  // --- OpenAI: check for OPENAI_API_KEY (metered billing) ---
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiAvailable = !!(openaiKey && openaiKey.length > 0);

  // --- Codex: check if 'codex' is in PATH ---
  let codexAvailable = false;
  let codexSource = null;
  try {
    execSync('which codex', { stdio: 'pipe', timeout: 2000 });
    codexAvailable = true;
    codexSource = 'cli';
  } catch {
    // not in PATH
  }

  // --- replit-tools: check if directory exists or binary in PATH ---
  const replitToolsDir = join(root, '.replit-tools');
  let replitToolsAvailable = existsSync(replitToolsDir);
  if (!replitToolsAvailable) {
    try {
      execSync('which replit-tools', { stdio: 'pipe', timeout: 2000 });
      replitToolsAvailable = true;
    } catch {
      // not in PATH
    }
  }

  // Check for checkpoint capability (replit-specific)
  const checkpointsBin = existsSync(join(replitToolsDir, 'checkpoints'))
    || existsSync('/usr/local/bin/replit-checkpoint');

  return {
    claude: {
      available: claudeAvailable,
      source: claudeSource,
    },
    openai: {
      available: openaiAvailable,
      source: openaiAvailable ? 'env-key' : null,
      metered: openaiAvailable, // API key = metered billing
    },
    codex: {
      available: codexAvailable,
      source: codexSource,
    },
    replitTools: {
      available: replitToolsAvailable,
      checkpoints: checkpointsBin,
    },
  };
}

/**
 * Return true if any metered API key is detected.
 * When true, the system defaults to conservative API usage and should
 * confirm before expensive operations.
 *
 * @param {ReturnType<typeof detectCapabilities> extends Promise<infer T> ? T : never} capabilities
 * @returns {boolean}
 */
function needsApiGuardrail(capabilities) {
  return !!(capabilities?.openai?.metered);
}

/**
 * Generate an honest 2-3 line onboarding/status message based on
 * what we can actually verify.
 *
 * @param {object} capabilities — result of detectCapabilities()
 * @param {string} [workStyle]  — 'balanced' | 'cost-saver' | 'quality-first'
 * @returns {string}
 */
function getOnboardingMessage(capabilities, workStyle = 'balanced') {
  const found = [];
  if (capabilities?.claude?.available)  found.push('Claude Code');
  if (capabilities?.openai?.available)  found.push('OpenAI API');
  if (capabilities?.codex?.available && !capabilities?.openai?.available) found.push('Codex CLI');

  const styleLabels = {
    'balanced':      'Balanced — smart routing, reviews on important changes',
    'cost-saver':    'Cost-saver — prefers faster models, skips dual-brain for low-risk tasks',
    'quality-first': 'Quality-first — dual-brain for medium+ risk, stricter reviews',
  };
  const modeLabel = styleLabels[workStyle] || styleLabels['balanced'];

  const lines = [];
  if (found.length === 0) {
    lines.push('No providers detected');
    lines.push('  Set ANTHROPIC_API_KEY or install Claude Code to get started');
    return lines.join('\n');
  }

  lines.push(`Found: ${found.join(', ')}`);
  lines.push(`  Mode: ${modeLabel}`);

  // Tip: suggest OpenAI if only Claude is available
  if (capabilities?.claude?.available && !capabilities?.openai?.available && !capabilities?.codex?.available) {
    lines.push('  Tip: Add OPENAI_API_KEY for dual-brain collaboration');
  }

  // Warn about metered billing
  if (capabilities?.openai?.metered) {
    lines.push('  Note: OpenAI API key detected — usage is metered, guardrails enabled');
  }

  return lines.join('\n');
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
    schemaVersion: 2,
    createdAt: now,
    updatedAt: now,
    workStyle: 'balanced',
    providers: {
      claude: { enabled: true  },
      openai: { enabled: false },
    },
    mode: 'auto',
    bias: 'balanced',
    preferences: [],
    apiGuardrail: false,
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
      profile.providers[key] = { enabled: true };
      // Drop plan/price fields — we no longer track subscription tier
      void sub;
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

  if (profile.schemaVersion < 2) {
    // v1 → v2: remove fake subscription fields, add workStyle + apiGuardrail
    profile.schemaVersion = 2;
    profile.workStyle = profile.workStyle || profile.bias || 'balanced';
    profile.apiGuardrail = profile.apiGuardrail ?? false;

    // Strip price/plan/budget fields — they were never accurate
    for (const prov of Object.values(profile.providers || {})) {
      delete prov.plan;
      delete prov.label;
      delete prov.expiresAt;
      delete prov.subs;
    }
    delete profile.plan;
    delete profile.price;
    delete profile.subscription; // doctor:verified — removing legacy field from stored config
    delete profile.budget;
    delete profile.detectedPlan;
  }

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

    // Detect what's actually available
    const capabilities = await detectCapabilities(opts.cwd);

    // Show what we found honestly
    const foundProviders = [];
    if (capabilities.claude.available)  foundProviders.push('Claude Code');
    if (capabilities.openai.available)  foundProviders.push('OpenAI API (metered)');
    if (capabilities.codex.available && !capabilities.openai.available) foundProviders.push('Codex CLI');

    if (foundProviders.length > 0) {
      process.stdout.write(`Detected: ${foundProviders.join(', ')}\n\n`);
    } else {
      process.stdout.write('No providers detected automatically.\n\n');
    }

    // Enable providers based on what's available
    profile.providers.claude.enabled = capabilities.claude.available;
    profile.providers.openai.enabled = capabilities.openai.available || capabilities.codex.available;
    profile.apiGuardrail = needsApiGuardrail(capabilities);

    // If detection missed something, ask
    if (!capabilities.claude.available && !capabilities.openai.available && !capabilities.codex.available) {
      const q1 = (await ask('Which AI providers do you have access to?\n  (1) Claude Code only  (2) OpenAI API only  (3) Both  (4) Neither\n> ')).trim();
      if (q1 === '1') { profile.providers.claude.enabled = true; }
      else if (q1 === '2') { profile.providers.claude.enabled = false; profile.providers.openai.enabled = true; profile.apiGuardrail = true; }
      else if (q1 === '3') { profile.providers.claude.enabled = true; profile.providers.openai.enabled = true; profile.apiGuardrail = true; }
    }

    const q3 = (await ask('\nDefault work style?\n  (1) Save usage  (2) Balanced  (3) Best quality\n> ')).trim();
    profile.bias = ({ '1': 'cost-saver', '3': 'quality-first' })[q3] || 'balanced';
    profile.workStyle = profile.bias;

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

function getAvailableProviders(profile) {
  return Object.entries(profile.providers || {})
    .filter(([, p]) => p.enabled)
    .map(([name, p]) => ({ name, ...p }));
}

function isSoloBrain(profile) {
  return getAvailableProviders(profile).length === 1;
}

function getHeadModel(profile) {
  const providers = getAvailableProviders(profile);
  if (providers.length === 0) return 'sonnet';
  if (providers.length === 1) return providers[0].name === 'openai' ? 'gpt-4o' : 'sonnet';
  // Both available — default to Claude (we're running in Claude Code)
  return 'sonnet';
}

// ---------------------------------------------------------------------------
// Capability-based auto-setup (replaces subscription-based autoSetup)
// ---------------------------------------------------------------------------

/**
 * Silently configure a profile from detected capabilities — no user input.
 *
 * Returns:
 *   {
 *     confident: boolean,   // true when at least one provider was found
 *     profile: object|null, // fully-built profile ready to save, or null
 *     warnings: string[],   // non-fatal issues
 *     actions: string[],    // human-readable lines for the summary box
 *   }
 */
async function autoSetup(cwd) {
  const capabilities = await detectCapabilities(cwd);
  const env = detectEnvironment();

  const result = {
    confident: false,
    profile: null,
    warnings: [],
    actions: [],
  };

  // Need at least one provider
  if (!capabilities.claude.available && !capabilities.openai.available && !capabilities.codex.available) {
    result.warnings.push('No provider credentials found');
    return result;
  }

  const profile = defaultProfile();

  // Claude
  if (capabilities.claude.available) {
    profile.providers.claude.enabled = true;
    result.actions.push(`Claude: available (${capabilities.claude.source})`);
  } else {
    profile.providers.claude.enabled = false;
    result.warnings.push('Claude not detected — install Claude Code or set ANTHROPIC_API_KEY');
  }

  // OpenAI / Codex
  if (capabilities.openai.available) {
    profile.providers.openai.enabled = true;
    result.actions.push('OpenAI: API key detected (metered billing — guardrails enabled)');
  } else if (capabilities.codex.available) {
    profile.providers.openai.enabled = true;
    result.actions.push('Codex CLI: available');
  } else {
    profile.providers.openai.enabled = false;
    result.warnings.push('OpenAI not detected — add OPENAI_API_KEY or install Codex CLI');
  }

  // Mode
  const enabledCount = Object.values(profile.providers).filter(p => p.enabled).length;
  profile.mode = enabledCount >= 2 ? 'dual'
    : profile.providers.claude.enabled ? 'solo-claude'
    : 'solo-openai';
  profile.bias = 'balanced';
  profile.workStyle = 'balanced';
  profile.apiGuardrail = needsApiGuardrail(capabilities);
  profile.capabilities = capabilities;
  profile.detectedAt = new Date().toISOString();

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
// OAuth token auto-refresh (unchanged — token refresh is still valid)
// ---------------------------------------------------------------------------

/**
 * Silently refresh the Claude OAuth token before it expires.
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
  // Delegate to replit-tools auth refresh script when available,
  // to avoid competing token refreshes from two different code paths.
  try {
    const { getAuthStatus, inspectReplitTools } = await import('./replit.mjs');
    const tools = inspectReplitTools(cwd || process.cwd());
    if (tools.authRefresh?.available) {
      const status = getAuthStatus(cwd || process.cwd());
      if (status.available) {
        // replit-tools owns the refresh cycle — report current status and exit
        const hoursRemaining = status.expiresAt
          ? Math.max(0, Math.floor((Date.parse(status.expiresAt) - Date.now()) / 3_600_000))
          : null;
        if (status.tokenStatus === 'valid') {
          return { status: 'valid', hoursRemaining: hoursRemaining ?? 999, delegatedTo: 'replit-tools' };
        }
        if (status.tokenStatus === 'expired') {
          // replit-tools will handle the actual refresh on its own schedule;
          // we note the state but do not attempt our own refresh.
          return { status: 'expiring_no_refresh', hoursRemaining: 0, delegatedTo: 'replit-tools' };
        }
        // expiring or unknown — note delegation and skip our own refresh attempt
        return { status: 'valid', hoursRemaining: hoursRemaining ?? 1, delegatedTo: 'replit-tools' };
      }
    }
  } catch {
    // replit.mjs unavailable — fall through to direct refresh
  }

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
// detectAuth — kept for backward compat, now delegates to detectCapabilities
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
// Removed: detectExistingAuth, detectPlans, decodeJwtPayload, saveSubscription,
//          listSubscriptions, _planLabel, _runWithTimeout
// These claimed to detect subscription tier/price from auth files — that was
// never accurate. Use detectCapabilities() instead for honest detection.
// ---------------------------------------------------------------------------

// Thin stubs retained only so any callers that weren't updated yet
// fail gracefully with a clear message rather than a crash.

/** @deprecated Use detectCapabilities() instead. */
async function detectExistingAuth(cwd) {
  const caps = await detectCapabilities(cwd);
  return {
    claude: {
      found: caps.claude.available,
      source: caps.claude.source,
      plan: null,   // not detectable
      expiresAt: null,
    },
    openai: {
      found: caps.openai.available || caps.codex.available,
      source: caps.openai.source || caps.codex.source,
      plan: null,   // not detectable
    },
    existingProfile: [projectPath(cwd), GLOBAL_PATH].some(p => existsSync(p)),
    recommendations: {
      headModel: caps.claude.available ? 'claude-sonnet-4-6' : 'gpt-4o',
      // budget field removed — we don't track subscription price
      profile: 'balanced',
    },
  };
}

/** @deprecated Price-based plan tiers removed. Returns null for all providers. */
function detectPlans() {
  return { claude: null, openai: null };
}

/** @deprecated Plan tracking removed. Use provider enabled flag instead. */
function saveSubscription(provider, config, cwd) {
  const profile = loadProfile(cwd);
  if (!profile.providers[provider]) profile.providers[provider] = { enabled: true };
  profile.providers[provider].enabled = true;
  saveProfile(profile, { cwd: cwd || process.cwd() });
  return profile;
}

/** @deprecated Plan tracking removed. Use getAvailableProviders() instead. */
function listSubscriptions(cwd) {
  const profile = loadProfile(cwd);
  return profile.providers || {};
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
    const profile = await runOnboarding({ interactive: true, cwd });
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
    providers.forEach(p => process.stdout.write(`${p.name}  enabled=${p.enabled}\n`));
    return;
  }
  if (flag === '--capabilities') {
    const caps = await detectCapabilities(cwd);
    process.stdout.write(JSON.stringify(caps, null, 2) + '\n');
    return;
  }

  // default: show profile
  const profile   = loadProfile(cwd);
  const providers = getAvailableProviders(profile);
  const caps = await detectCapabilities(cwd);
  [
    `mode       : ${profile.mode}`,
    `workStyle  : ${profile.workStyle || profile.bias}`,
    `head model : ${getHeadModel(profile)}`,
    `providers  : ${providers.map(p => p.name).join(', ') || 'none'}`,
    `prefs      : ${profile.preferences?.filter(p => p.enabled).length || 0} active`,
    `guardrail  : ${needsApiGuardrail(caps) ? 'enabled (metered API key detected)' : 'off'}`,
    '',
    getOnboardingMessage(caps, profile.workStyle || profile.bias),
  ].forEach(l => process.stdout.write(l + '\n'));
}

const isMain = process.argv[1]?.endsWith('profile.mjs');
if (isMain) main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  loadProfile, saveProfile, ensureProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectCapabilities, getOnboardingMessage, needsApiGuardrail,
  syncPreferencesToMemory,
  detectAuth, detectEnvironment,
  autoSetup, autoRefreshToken,
  // backward-compat stubs (deprecated)
  detectExistingAuth, detectPlans, saveSubscription, listSubscriptions,
  defaultProfile,
};
