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
 * Detect actual subscription plans from Claude Code and Codex config files.
 * Returns { claude: '$20'|'$100'|'$200'|null, openai: '$20'|'$100'|'$200'|null }.
 * Returns nulls for any provider whose config cannot be read — never throws.
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

  // Auto-detect plans from provider config files and apply if detected.
  const detected = detectPlans();
  for (const [provider, detectedPlan] of Object.entries(detected)) {
    if (!detectedPlan) continue;
    if (!profile.providers[provider]) continue;
    const stored = profile.providers[provider].plan;
    if (stored !== detectedPlan) {
      const labels = {
        claude: {
          '$20': 'Claude Pro ($20)', '$100': 'Claude Max x5 ($100)', '$200': 'Claude Max x20 ($200)',
        },
        openai: {
          '$20': 'ChatGPT Plus ($20)', '$100': 'ChatGPT Pro ($100)', '$200': 'ChatGPT Pro ($200)',
        },
      };
      const label = labels[provider]?.[detectedPlan] ?? `${provider} ${detectedPlan}`;
      process.stderr.write(`[dual-brain] Detected ${label} plan\n`);
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

  const rl = createInterface({ input: process.stdin, output: process.stdout });
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
    rl.close();
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
  if (providers.length === 1) return providers[0].name === 'openai' ? 'gpt-5.4' : 'sonnet';
  const top = providers.reduce((a, b) => (b.rank > a.rank ? b : a));
  return top.name === 'openai' ? 'gpt-5.4' : 'sonnet';
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

export {
  loadProfile, saveProfile, ensureProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectPlans, syncPreferencesToMemory,
};
