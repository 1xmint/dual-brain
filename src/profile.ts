#!/usr/bin/env node
/**
 * profile.ts — User profile module for the Dual-Brain Orchestrator.
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
 *   detectCapabilities(cwd)        → available providers (subscription-based only)
 *
 * CLI:
 *   node src/profile.mjs                  # show current profile
 *   node src/profile.mjs --init           # run onboarding
 *   node src/profile.mjs --remember "…"   # add preference
 *   node src/profile.mjs --forget "…"     # remove preference
 *   node src/profile.mjs --providers      # show available providers
 */

import { createInterface, Interface as ReadlineInterface } from 'readline';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

import type { Provider } from './types.js';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Preference {
  text: string;
  enabled: boolean;
  scope: 'one-off' | 'project' | 'global';
}

export interface ProviderConfig {
  enabled: boolean;
  plan?: string;
  label?: string;
  expiresAt?: string;
  subs?: unknown;
}

export interface Profile {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  workStyle: string;
  providers: Record<string, ProviderConfig>;
  mode: string;
  bias: string;
  preferences: Preference[];
  apiGuardrail: boolean;
  settings?: Record<string, unknown>;
  capabilities?: DetectedCapabilities;
  detectedAt?: string;
  forbiddenModels?: string[];
  preferredModels?: string[];
  headModel?: string;
  headEffort?: string;
  intelligenceLevel?: number;
  costBias?: number;
  subscription?: unknown;
  budget?: unknown;
  detectedPlan?: unknown;
  plan?: unknown;
  price?: unknown;
  subscriptions?: Record<string, unknown>;
}

export interface DetectedCapabilities {
  claude: { available: boolean; source: string | null };
  openai: { available: boolean; source: string | null };
  codex: { available: boolean; source: string | null };
  replitTools: { available: boolean; checkpoints: boolean };
  mcpServers: string[];
  claudePlugins: string[];
  codexPlugins: string[];
  shellSnapshots: number;
  configuredHooks: Record<string, number>;
}

export interface EnvironmentInfo {
  isReplit: boolean;
  hasReplitTools: boolean;
  isCI: boolean;
}

export interface AutoSetupResult {
  confident: boolean;
  profile: Profile | null;
  warnings: string[];
  actions: string[];
}

export interface TokenRefreshResult {
  status: string;
  hoursRemaining?: number;
  error?: string;
  delegatedTo?: string;
}

export interface AuthEntry {
  found: boolean;
  source: string | null;
  loginType: 'oauth' | 'cli' | null;
}

export interface AuthDetectionResult {
  claude: AuthEntry;
  openai: AuthEntry;
}

export interface Credential {
  id: string;
  provider: string;
  auth_type: string;
  source: string;
  owner?: string;
  scope?: string;
  plan_hint?: string | null;
  enabled?: boolean;
  health?: string;
  last_checked_at?: string | null;
  secret?: string;
  token?: string;
  api_key?: string;
  password?: string;
}

export interface CredentialStore {
  version: number;
  credentials: Credential[];
}

export interface CapabilityManifest {
  providers: {
    claude: ProviderManifestEntry;
    openai: ProviderManifestEntry;
  };
  preferences: ManifestPreferences;
  policy: ManifestPolicy;
  learning: Record<string, { rate: number; total: number }>;
  setup: {
    hasAnyProvider: boolean;
    recommendedAction: string | null;
    zeroProviderMode: boolean;
  };
  environment: {
    mcpServers: string[];
    claudePlugins: string[];
    codexPlugins: string[];
    shellSnapshots: number;
    configuredHooks: Record<string, number>;
    replitTools: { available: boolean; checkpoints: boolean };
  };
  timestamp: string;
}

interface ProviderManifestEntry {
  available: boolean;
  authenticated: boolean;
  plan: string;
  models: string[];
  health: string;
  budget: { pressure5h: number; pressure7d: number };
  source: string;
}

interface ManifestPreferences {
  bias: string;
  forbiddenModels: string[];
  preferredModels: string[];
  costBias: number;
  confirmBeforeExpensive: boolean;
}

interface ManifestPolicy {
  highRiskRequiresBestAvailable: boolean;
  failoverMode: string;
  dualBrainThreshold: string;
}

export interface EffectivePolicyResult {
  provider: string;
  model: string;
  tier: string;
  reason: string;
  overrides: string[];
}

interface OnboardingOptions {
  interactive?: boolean;
  cwd?: string;
  global?: boolean;
  rl?: ReadlineInterface;
}

interface SaveProfileOptions {
  cwd?: string;
  global?: boolean;
}

interface RememberPreferenceOptions {
  scope?: string;
  cwd?: string;
  global?: boolean;
}

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
function _memoryDir(cwd?: string): string | null {
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
function syncPreferencesToMemory(profile: Profile, cwd?: string): void {
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
function detectEnvironment(): EnvironmentInfo {
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
 */
async function detectCapabilities(cwd?: string): Promise<DetectedCapabilities> {
  const root = cwd || process.cwd();

  // --- Claude: running inside Claude Code session or CLI installed ---
  let claudeAvailable = false;
  let claudeSource: string | null = null;

  if (process.env.CLAUDE_CODE) {
    claudeAvailable = true;
    claudeSource = 'claude-code';
  } else {
    // Check for ~/.claude directory (Claude Code installation) or Replit Claude
    const claudeDir = join(homedir(), '.claude');
    const replitClaudeDir = join(root, '.replit-tools', '.claude-persistent');
    if (existsSync(claudeDir) || existsSync(replitClaudeDir)) {
      claudeAvailable = true;
      claudeSource = existsSync(replitClaudeDir) ? 'claude-code' : 'claude-dir';
    }
  }

  // --- Codex: check if 'codex' is in PATH ---
  let codexAvailable = false;
  let codexSource: string | null = null;
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

  // --- MCP servers: check Claude settings files ---
  let mcpServers: string[] = [];
  try {
    const claudeSettings = join(homedir(), '.claude', 'settings.json');
    if (existsSync(claudeSettings)) {
      const settings = JSON.parse(readFileSync(claudeSettings, 'utf8'));
      if (settings.mcpServers) {
        mcpServers = Object.keys(settings.mcpServers);
      }
    }
    // Also check project-local
    const localSettings = join(root, '.claude', 'settings.json');
    if (existsSync(localSettings)) {
      const local = JSON.parse(readFileSync(localSettings, 'utf8'));
      if (local.mcpServers) {
        mcpServers.push(...Object.keys(local.mcpServers));
      }
    }
  } catch {}

  // --- Claude plugins: check installed plugin marketplaces ---
  let claudePlugins: string[] = [];
  try {
    const pluginDir = join(root, '.replit-tools', '.claude-persistent', 'plugins', 'marketplaces');
    if (existsSync(pluginDir)) {
      const marketplaces = readdirSync(pluginDir);
      for (const m of marketplaces) {
        const mDir = join(pluginDir, m, 'plugins');
        if (existsSync(mDir)) {
          claudePlugins.push(...readdirSync(mDir));
        }
      }
    }
  } catch {}

  // --- Codex plugins: check available plugins ---
  let codexPlugins: string[] = [];
  try {
    const pluginDir = join(root, '.replit-tools', '.codex-persistent', '.tmp', 'plugins', 'plugins');
    if (existsSync(pluginDir)) {
      codexPlugins = readdirSync(pluginDir).filter(f => !f.startsWith('.'));
    }
  } catch {}

  // --- Shell snapshots: count .sh files ---
  let shellSnapshots = 0;
  try {
    const snapDir = join(root, '.replit-tools', '.claude-persistent', 'shell-snapshots');
    if (existsSync(snapDir)) {
      shellSnapshots = readdirSync(snapDir).filter(f => f.endsWith('.sh')).length;
    }
  } catch {}

  // --- Configured hooks: count by type from settings.local.json ---
  const configuredHooks: Record<string, number> = { PreToolUse: 0, PostToolUse: 0, Stop: 0, Notification: 0 };
  try {
    const localSettings = join(root, '.claude', 'settings.local.json');
    if (existsSync(localSettings)) {
      const s = JSON.parse(readFileSync(localSettings, 'utf8'));
      for (const hookType of Object.keys(configuredHooks)) {
        configuredHooks[hookType] = s.hooks?.[hookType]?.length || 0;
      }
    }
  } catch {}

  return {
    claude: {
      available: claudeAvailable,
      source: claudeSource,
    },
    openai: {
      available: codexAvailable,
      source: codexAvailable ? 'codex-cli' : null,
    },
    codex: {
      available: codexAvailable,
      source: codexSource,
    },
    replitTools: {
      available: replitToolsAvailable,
      checkpoints: checkpointsBin,
    },
    mcpServers,
    claudePlugins,
    codexPlugins,
    shellSnapshots,
    configuredHooks,
  };
}

/**
 * Generate an honest 2-3 line onboarding/status message based on
 * what we can actually verify.
 */
function getOnboardingMessage(capabilities: DetectedCapabilities | null, workStyle: string = 'balanced'): string {
  const found: string[] = [];
  if (capabilities?.claude?.available)  found.push('Claude · subscription');
  if (capabilities?.codex?.available)   found.push('OpenAI · Codex subscription');

  const styleLabels: Record<string, string> = {
    'balanced':      'Balanced — smart routing, reviews on important changes',
    'cost-saver':    'Cost-saver — prefers faster models, skips dual-brain for low-risk tasks',
    'quality-first': 'Quality-first — dual-brain for medium+ risk, stricter reviews',
  };
  const modeLabel = styleLabels[workStyle] || styleLabels['balanced'];

  const lines: string[] = [];
  if (found.length === 0) {
    lines.push('No providers detected');
    lines.push('  Run: claude login   or install Claude Code to get started');
    return lines.join('\n');
  }

  lines.push(`Found: ${found.join(', ')}`);
  lines.push(`  Mode: ${modeLabel}`);

  // Tip: suggest Codex if only Claude is available
  if (capabilities?.claude?.available && !capabilities?.codex?.available) {
    lines.push('  Tip: Run codex login for dual-brain collaboration');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Paths & defaults
// ---------------------------------------------------------------------------

const GLOBAL_DIR  = join(homedir(), '.config', 'dual-brain');
const GLOBAL_PATH = join(GLOBAL_DIR, 'profile.json');
const projectPath = (cwd?: string): string => join(cwd || process.cwd(), '.dualbrain', 'profile.json');

function defaultProfile(): Profile {
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

function migrateProfile(profile: Profile): Profile {
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
      delete (prov as unknown as Record<string, unknown>).plan;
      delete (prov as unknown as Record<string, unknown>).label;
      delete (prov as unknown as Record<string, unknown>).expiresAt;
      delete (prov as unknown as Record<string, unknown>).subs;
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

function loadProfile(cwd?: string): Profile {
  let profile: Profile | undefined;
  for (const p of [projectPath(cwd), GLOBAL_PATH]) {
    if (existsSync(p)) {
      try { profile = migrateProfile(JSON.parse(readFileSync(p, 'utf8'))); break; } catch { /* skip */ }
    }
  }
  if (!profile) profile = defaultProfile();
  return profile;
}

function saveProfile(profile: Profile, opts: SaveProfileOptions = {}): string {
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

async function runOnboarding(opts: OnboardingOptions = {}): Promise<Profile> {
  if (!opts.interactive) return defaultProfile();

  // Accept an externally-provided readline instance (shared with REPL/auth setup)
  // or create one internally if not provided. Only close if we created it.
  const rlProvided = !!opts.rl;
  const rl = opts.rl || createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));
  const profile = defaultProfile();

  try {
    process.stdout.write('\nDual-Brain Orchestrator — First-time setup\n\n');

    // Detect what's actually available
    const capabilities = await detectCapabilities(opts.cwd);

    // Show what we found honestly
    const foundProviders: string[] = [];
    if (capabilities.claude.available)  foundProviders.push('Claude · subscription');
    if (capabilities.codex.available)   foundProviders.push('OpenAI · Codex subscription');

    if (foundProviders.length > 0) {
      process.stdout.write(`Detected: ${foundProviders.join(', ')}\n\n`);
    } else {
      process.stdout.write('No providers detected automatically.\n\n');
    }

    // Enable providers based on what's available
    profile.providers.claude.enabled = capabilities.claude.available;
    profile.providers.openai.enabled = capabilities.codex.available;

    // If detection missed something, ask
    if (!capabilities.claude.available && !capabilities.codex.available) {
      const q1 = (await ask('Which AI providers do you have access to?\n  (1) Claude only  (2) OpenAI Codex only  (3) Both  (4) Neither\n> ')).trim();
      if (q1 === '1') { profile.providers.claude.enabled = true; }
      else if (q1 === '2') { profile.providers.claude.enabled = false; profile.providers.openai.enabled = true; }
      else if (q1 === '3') { profile.providers.claude.enabled = true; profile.providers.openai.enabled = true; }
    }

    const q3 = (await ask('\nDefault work style?\n  (1) Save usage  (2) Balanced  (3) Best quality\n> ')).trim();
    profile.bias = ({ '1': 'cost-saver', '3': 'quality-first' } as Record<string, string>)[q3] || 'balanced';
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

async function ensureProfile(cwd?: string, opts: OnboardingOptions = {}): Promise<Profile> {
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

function rememberPreference(text: string, opts: RememberPreferenceOptions = {}): Profile {
  const scope   = VALID_SCOPES.includes(opts.scope || '') ? (opts.scope as Preference['scope']) : 'project';
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

function forgetPreference(text: string, cwd?: string): Profile {
  const profile = loadProfile(cwd);
  const needle  = text.toLowerCase();
  profile.preferences = profile.preferences.filter(p => !p.text.toLowerCase().includes(needle));
  saveProfile(profile, { cwd });
  syncPreferencesToMemory(profile, cwd);
  return profile;
}

function getActivePreferences(cwd?: string): Preference[] {
  const seen = new Set<string>();
  const result: Preference[] = [];
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

interface ProviderEntry extends ProviderConfig {
  name: string;
}

function getAvailableProviders(profile: Profile): ProviderEntry[] {
  return Object.entries(profile.providers || {})
    .filter(([, p]) => p.enabled)
    .map(([name, p]) => ({ name, ...p }));
}

function isSoloBrain(profile: Profile): boolean {
  return getAvailableProviders(profile).length === 1;
}

function getHeadModel(profile: Profile): string {
  if (profile.headModel) return profile.headModel;
  const level = Math.max(1, Math.min(5, Number(profile.intelligenceLevel ?? profile.settings?.intelligenceLevel ?? 3) || 3));
  const providers = getAvailableProviders(profile);
  if (providers.length === 0) return 'sonnet';
  const openaiHead = level >= 4 ? 'gpt-5.5' : level >= 3 ? 'gpt-5.4' : 'gpt-5.4-mini';
  const claudeHead = level >= 4 ? 'opus' : 'sonnet';
  if (providers.length === 1) return providers[0].name === 'openai' ? openaiHead : claudeHead;
  return openaiHead;
}

// ---------------------------------------------------------------------------
// Capability-based auto-setup (replaces subscription-based autoSetup)
// ---------------------------------------------------------------------------

/**
 * Silently configure a profile from detected capabilities — no user input.
 */
async function autoSetup(cwd?: string): Promise<AutoSetupResult> {
  const capabilities = await detectCapabilities(cwd);
  const env = detectEnvironment();

  const result: AutoSetupResult = {
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
    result.warnings.push('Claude not detected — run: claude login');
  }

  // OpenAI / Codex
  if (capabilities.codex.available) {
    profile.providers.openai.enabled = true;
    result.actions.push('Codex CLI: available (subscription)');
  } else {
    profile.providers.openai.enabled = false;
    result.warnings.push('OpenAI not detected — run: codex login');
  }

  // Mode
  const enabledCount = Object.values(profile.providers).filter(p => p.enabled).length;
  profile.mode = enabledCount >= 2 ? 'dual'
    : profile.providers.claude.enabled ? 'solo-claude'
    : 'solo-openai';
  profile.bias = 'balanced';
  profile.workStyle = 'balanced';
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
 */
async function autoRefreshToken(cwd?: string): Promise<TokenRefreshResult> {
  // Delegate to replit-tools auth refresh script when available,
  // to avoid competing token refreshes from two different code paths.
  try {
    // @ts-ignore
    const { getAuthStatus, inspectReplitTools } = await import('./replit.js');
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

  let credPath: string | null = null;
  for (const p of credPaths) {
    if (existsSync(p)) { credPath = p; break; }
  }
  if (!credPath) return { status: 'no_credentials' };

  let creds: Record<string, unknown>;
  try {
    creds = JSON.parse(readFileSync(credPath, 'utf8'));
  } catch { return { status: 'parse_error' }; }

  const oauth = (creds as Record<string, unknown>)?.claudeAiOauth as Record<string, unknown> | undefined;
  if (!oauth?.expiresAt) return { status: 'no_expiry' };

  const now = Date.now();
  const remainingMs = (oauth.expiresAt as number) - now;
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

    const data = await res.json() as Record<string, unknown>;
    if (!data.access_token) return { status: 'refresh_failed', error: 'no access_token' };

    // Update credentials
    const newExpiresAt = now + ((data.expires_in as number) * 1000);
    (oauth as Record<string, unknown>).accessToken = data.access_token;
    if (data.refresh_token) (oauth as Record<string, unknown>).refreshToken = data.refresh_token;
    (oauth as Record<string, unknown>).expiresAt = newExpiresAt;

    // Backup then write
    try { writeFileSync(credPath + '.backup', readFileSync(credPath)); } catch {}
    writeFileSync(credPath, JSON.stringify(creds));

    const newHours = Math.floor((data.expires_in as number) / 60 / 60);
    return { status: 'refreshed', hoursRemaining: newHours };
  } catch (e: unknown) {
    return { status: 'refresh_failed', error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// detectAuth — kept for backward compat, now delegates to detectCapabilities
// ---------------------------------------------------------------------------

/**
 * Detect CLI login status for Claude and Codex.
 * Checks config files on disk — never makes network calls.
 */
async function detectAuth(): Promise<AuthDetectionResult> {
  const results: AuthDetectionResult = {
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
async function detectExistingAuth(cwd?: string): Promise<Record<string, unknown>> {
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
function detectPlans(): Record<string, null> {
  return { claude: null, openai: null };
}

/** @deprecated Plan tracking removed. Use provider enabled flag instead. */
function saveSubscription(provider: string, config: unknown, cwd?: string): Profile {
  const profile = loadProfile(cwd);
  if (!profile.providers[provider]) profile.providers[provider] = { enabled: true };
  profile.providers[provider].enabled = true;
  saveProfile(profile, { cwd: cwd || process.cwd() });
  return profile;
}

/** @deprecated Plan tracking removed. Use getAvailableProviders() instead. */
function listSubscriptions(cwd?: string): Record<string, ProviderConfig> {
  const profile = loadProfile(cwd);
  return profile.providers || {};
}

// ---------------------------------------------------------------------------
// Credential Registry
// ---------------------------------------------------------------------------

const credentialsPath = (cwd?: string): string => join(cwd || process.cwd(), '.dualbrain', 'credentials.json');

function defaultCredentials(): CredentialStore {
  return { version: 1, credentials: [] };
}

export function loadCredentials(cwd: string = process.cwd()): CredentialStore {
  try {
    const p = credentialsPath(cwd);
    if (!existsSync(p)) return defaultCredentials();
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return defaultCredentials();
  }
}

export function saveCredentials(data: CredentialStore, cwd: string = process.cwd()): string | undefined {
  try {
    const p = credentialsPath(cwd);
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Ensure no raw secret values are stored
    const safe = {
      ...data,
      credentials: (data.credentials || []).map(c => {
        const clean = { ...c };
        delete clean.secret;
        delete clean.token;
        delete clean.api_key;
        delete clean.password;
        return clean;
      }),
    };
    const tmp = p + '.tmp.' + process.pid;
    writeFileSync(tmp, JSON.stringify(safe, null, 2) + '\n');
    renameSync(tmp, p);
    return p;
  } catch { /* non-fatal */ }
}

export function addCredential(cred: Credential, cwd: string = process.cwd()): Credential {
  const required: (keyof Credential)[] = ['id', 'provider', 'auth_type', 'source'];
  for (const f of required) {
    if (!cred[f]) throw new Error(`addCredential: missing required field '${f}'`);
  }
  const data = loadCredentials(cwd);
  const idx = data.credentials.findIndex(c => c.id === cred.id);
  const entry: Credential = {
    id: cred.id,
    provider: cred.provider,
    auth_type: cred.auth_type,
    source: cred.source,
    owner: cred.owner || 'user',
    scope: cred.scope || 'local',
    plan_hint: cred.plan_hint || null,
    enabled: cred.enabled !== false,
    health: cred.health || 'unknown',
    last_checked_at: cred.last_checked_at || null,
  };
  if (idx >= 0) data.credentials[idx] = entry;
  else data.credentials.push(entry);
  saveCredentials(data, cwd);
  return entry;
}

export function removeCredential(id: string, cwd: string = process.cwd()): void {
  const data = loadCredentials(cwd);
  data.credentials = data.credentials.filter(c => c.id !== id);
  saveCredentials(data, cwd);
}

export function getHealthyCredentials(provider: string | null = null, cwd: string = process.cwd()): Credential[] {
  const data = loadCredentials(cwd);
  return data.credentials.filter(c =>
    c.enabled !== false &&
    c.health !== 'unhealthy' &&
    (provider === null || c.provider === provider)
  );
}

export async function checkCredentialHealth(cred: Credential, cwd: string = process.cwd()): Promise<Credential> {
  let health = 'unknown';
  try {
    if (cred.auth_type === 'cli_oauth') {
      try { execSync('claude --version', { stdio: 'pipe', timeout: 3000 }); } catch { return { ...cred, health: 'unhealthy', last_checked_at: new Date().toISOString() }; }
      try {
        // @ts-ignore
        const { getAuthStatus } = await import('./replit.js');
        const status = getAuthStatus(cwd);
        health = (status.available && status.tokenStatus !== 'expired') ? 'healthy' : 'degraded';
      } catch {
        health = 'healthy'; // cli works, auth check unavailable
      }
    }
  } catch { health = 'unknown'; }
  return { ...cred, health, last_checked_at: new Date().toISOString() };
}

export async function detectCredentials(cwd: string = process.cwd()): Promise<Credential[]> {
  const found: Credential[] = [];

  // Claude CLI / oauth
  const claudeDir       = join(homedir(), '.claude');
  const replitClaudeDir = join(cwd, '.replit-tools', '.claude-persistent');
  const claudeAvail = process.env.CLAUDE_CODE || existsSync(claudeDir) || existsSync(replitClaudeDir);
  if (claudeAvail) {
    let health = 'unknown';
    try { execSync('claude --version', { stdio: 'pipe', timeout: 3000 }); health = 'healthy'; } catch { health = 'degraded'; }
    found.push({
      id: 'claude-local-user',
      provider: 'claude',
      auth_type: 'cli_oauth',
      source: 'local_cli',
      owner: 'user',
      scope: 'local',
      plan_hint: null,
      enabled: true,
      health,
      last_checked_at: new Date().toISOString(),
    });
  }

  // Codex CLI (subscription-based OpenAI access)
  try {
    execSync('which codex', { stdio: 'pipe', timeout: 2000 });
    let codexHealth = 'unknown';
    try { execSync('codex --version', { stdio: 'pipe', timeout: 3000 }); codexHealth = 'healthy'; } catch { codexHealth = 'degraded'; }
    found.push({
      id: 'openai-codex-cli',
      provider: 'openai',
      auth_type: 'cli_oauth',
      source: 'local_cli',
      owner: 'user',
      scope: 'local',
      plan_hint: null,
      enabled: true,
      health: codexHealth,
      last_checked_at: new Date().toISOString(),
    });
  } catch { /* codex not in PATH */ }

  return found;
}

export function getCredentialSummary(cwd: string = process.cwd()): {
  total: number;
  byProvider: Record<string, number>;
  healthy: number;
  degraded: number;
  teamCapacity: string;
} {
  const data = loadCredentials(cwd);
  const creds = data.credentials || [];
  const byProvider: Record<string, number> = { claude: 0, openai: 0 };
  let healthy = 0, degraded = 0;
  for (const c of creds) {
    if (c.enabled === false) continue;
    if (byProvider[c.provider] !== undefined) byProvider[c.provider]++;
    if (c.health === 'healthy') healthy++;
    else if (c.health === 'degraded' || c.health === 'unknown') degraded++;
  }
  const total = creds.filter(c => c.enabled !== false).length;
  let teamCapacity = 'none';
  if (healthy >= 4) teamCapacity = 'high';
  else if (healthy >= 2) teamCapacity = 'medium';
  else if (healthy >= 1) teamCapacity = 'low';
  return { total, byProvider, healthy, degraded, teamCapacity };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Capability Manifest — single runtime view of all provider/subscription state
// ---------------------------------------------------------------------------

/** 60-second in-process cache for the manifest. */
let _manifestCache: CapabilityManifest | null = null;
let _manifestCachedAt = 0;
const MANIFEST_TTL_MS = 60_000;

/**
 * Build a normalized capability manifest that consolidates provider health,
 * subscription config, user preferences, policy, and learning data.
 */
export async function getCapabilityManifest(cwd: string = process.cwd()): Promise<CapabilityManifest> {
  const now = Date.now();
  if (_manifestCache && now - _manifestCachedAt < MANIFEST_TTL_MS) {
    return _manifestCache;
  }

  // ── Read orchestrator.json for subscription config ─────────────────────
  let orchConfig: Record<string, unknown> = {};
  try {
    const orchPath = join(cwd, 'orchestrator.json');
    orchConfig = JSON.parse(readFileSync(orchPath, 'utf8'));
  } catch { /* missing or malformed — fall through */ }

  const orchSubs   = (orchConfig.subscriptions ?? {}) as Record<string, Record<string, unknown>>;
  const orchProv   = (orchConfig.providers     ?? {}) as Record<string, Record<string, unknown>>;

  // ── Plan normalizer (orchestrator.json uses "$100", "max-5x", "pro" etc) ─
  function normalizePlan(raw: unknown): string {
    if (!raw) return 'unknown';
    const s = String(raw).toLowerCase();
    if (s.includes('max') && s.includes('20')) return 'max20';
    if (s.includes('max') && (s.includes('5') || s.includes('5x'))) return 'max5';
    if (s.includes('pro')) return 'pro';
    if (s.includes('plus')) return 'plus';
    if (s === '$20' || s === '20') return 'pro';
    if (s === '$100' || s === '100') return 'max5';
    if (s === '$200' || s === '200') return 'max20';
    return 'unknown';
  }

  // ── Environment capabilities (MCP, plugins, hooks, snapshots) ─────────
  const envCaps = await detectCapabilities(cwd);

  // ── Health states ──────────────────────────────────────────────────────
  let healthStates: Record<string, { status?: string }> = {};
  try {
    // @ts-ignore
    const { getHealth } = await import('./health.js');
    healthStates = getHealth(cwd).states ?? {};
  } catch { /* health.mjs unavailable */ }

  function deriveHealth(providerKey: string): string {
    // Aggregate across all model classes for the provider
    const entries = Object.entries(healthStates)
      .filter(([k]) => k.startsWith(providerKey + ':'))
      .map(([, v]) => v?.status ?? 'healthy');
    if (entries.length === 0) return 'healthy';
    if (entries.some(s => s === 'hot'))      return 'rate-limited';
    if (entries.some(s => s === 'degraded')) return 'degraded';
    if (entries.some(s => s === 'probing'))  return 'degraded';
    return 'healthy';
  }

  // ── Budget pressure from health file (simple proxy) ────────────────────
  function deriveBudget(providerKey: string): { pressure5h: number; pressure7d: number } {
    const hotEntries = Object.entries(healthStates)
      .filter(([k]) => k.startsWith(providerKey + ':'))
      .filter(([, v]) => v?.status === 'hot');
    if (hotEntries.length === 0) return { pressure5h: 0, pressure7d: 0 };
    // Clamp to 0.9 when hot — we don't have real token data here
    const pressure = Math.min(0.9, 0.5 + hotEntries.length * 0.15);
    return { pressure5h: pressure, pressure7d: pressure * 0.6 };
  }

  // ── Credential registry (when available, overrides detection) ─────────
  const _credData = loadCredentials(cwd);
  const _hasCreds = _credData.credentials && _credData.credentials.length > 0;

  // ── Claude provider ────────────────────────────────────────────────────
  const claudeProvider: ProviderManifestEntry = { available: false, authenticated: false, plan: 'unknown',
    models: ['opus', 'sonnet', 'haiku'], health: 'healthy',
    budget: { pressure5h: 0, pressure7d: 0 }, source: 'none' };

  try {
    // available: CLAUDE_CODE env, claude CLI, or replit-tools claude dir
    const claudeDir       = join(homedir(), '.claude');
    const replitClaudeDir = join(cwd, '.replit-tools', '.claude-persistent');
    if (process.env.CLAUDE_CODE) {
      claudeProvider.available = true;
      claudeProvider.source    = 'credentials';
    } else if (existsSync(claudeDir) || existsSync(replitClaudeDir)) {
      claudeProvider.available = true;
      claudeProvider.source    = existsSync(replitClaudeDir) ? 'replit-tools' : 'credentials';
    } else {
      try { execSync('which claude', { stdio: 'pipe', timeout: 2000 }); claudeProvider.available = true; claudeProvider.source = 'credentials'; } catch { /* not found */ }
    }

    // authenticated: use getAuthHealthStatus
    // @ts-ignore
    const { getAuthHealthStatus } = await import('./health.js');
    const authStatus = await getAuthHealthStatus(cwd);
    claudeProvider.authenticated = authStatus.ok;
    if (authStatus.source === 'replit-tools') claudeProvider.source = 'replit-tools';
  } catch { /* getAuthHealthStatus unavailable */ }

  claudeProvider.plan   = normalizePlan(orchProv.claude?.subscription ?? orchSubs.claude?.plan);
  claudeProvider.health = claudeProvider.authenticated ? deriveHealth('claude') : 'down';
  claudeProvider.budget = deriveBudget('claude');

  // Override with registry data when credentials.json exists
  if (_hasCreds) {
    const claudeCreds = _credData.credentials.filter(c => c.provider === 'claude' && c.enabled !== false);
    if (claudeCreds.length > 0) {
      claudeProvider.available    = true;
      claudeProvider.authenticated = claudeCreds.some(c => c.health === 'healthy');
      claudeProvider.health = claudeCreds.some(c => c.health === 'healthy') ? deriveHealth('claude')
        : claudeCreds.some(c => c.health === 'degraded') ? 'degraded' : 'down';
      const planHint = claudeCreds.find(c => c.plan_hint)?.plan_hint;
      if (planHint) claudeProvider.plan = normalizePlan(planHint);
      claudeProvider.source = claudeCreds[0].source;
    }
  }

  // ── OpenAI provider ────────────────────────────────────────────────────
  const openaiProvider: ProviderManifestEntry = { available: false, authenticated: false, plan: 'unknown',
    models: ['gpt-5.5', 'o3', 'gpt-4o', 'gpt-4o-mini'], health: 'healthy',
    budget: { pressure5h: 0, pressure7d: 0 }, source: 'none' };

  try {
    let codexAvailable = false;
    try { execSync('which codex', { stdio: 'pipe', timeout: 2000 }); codexAvailable = true; } catch { /* not in PATH */ }

    openaiProvider.available      = codexAvailable;
    openaiProvider.authenticated  = codexAvailable;
    openaiProvider.source         = codexAvailable ? 'codex-cli' : 'none';
  } catch { /* detection failed */ }

  openaiProvider.plan   = normalizePlan(orchProv.openai?.subscription ?? orchSubs.openai?.plan);
  openaiProvider.health = openaiProvider.authenticated ? deriveHealth('openai') : 'down';
  openaiProvider.budget = deriveBudget('openai');

  // Override with registry data when credentials.json exists
  if (_hasCreds) {
    const openaiCreds = _credData.credentials.filter(c => c.provider === 'openai' && c.enabled !== false);
    if (openaiCreds.length > 0) {
      openaiProvider.available    = true;
      openaiProvider.authenticated = openaiCreds.some(c => c.health === 'healthy');
      openaiProvider.health = openaiCreds.some(c => c.health === 'healthy') ? deriveHealth('openai')
        : openaiCreds.some(c => c.health === 'degraded') ? 'degraded' : 'down';
      const planHint = openaiCreds.find(c => c.plan_hint)?.plan_hint;
      if (planHint) openaiProvider.plan = normalizePlan(planHint);
      openaiProvider.source = openaiCreds[0].source;
    }
  }

  // ── Preferences ────────────────────────────────────────────────────────
  let preferences: ManifestPreferences = { bias: 'auto', forbiddenModels: [], preferredModels: [],
    costBias: 0.5, confirmBeforeExpensive: false };
  try {
    const profile = loadProfile(cwd);
    const bias = profile.bias ?? profile.workStyle ?? 'auto';
    preferences.bias = ['auto','balanced','cost-saver','quality-first'].includes(bias) ? bias : 'auto';
    preferences.forbiddenModels    = profile.forbiddenModels  ?? [];
    preferences.preferredModels    = profile.preferredModels  ?? [];
    preferences.costBias           = profile.costBias         ?? (bias === 'cost-saver' ? 0.8 : bias === 'quality-first' ? 0.1 : 0.5);
    preferences.confirmBeforeExpensive = profile.apiGuardrail ?? false;
  } catch { /* profile unavailable */ }

  // ── Policy ─────────────────────────────────────────────────────────────
  const policy: ManifestPolicy = {
    highRiskRequiresBestAvailable: true,
    failoverMode: 'tell',
    dualBrainThreshold: 'high',
  };

  // ── Learning ───────────────────────────────────────────────────────────
  let learning: Record<string, { rate: number; total: number }> = {};
  try {
    // @ts-ignore
    const { getModelSuccessRates } = await import('./doctor.js');
    learning = getModelSuccessRates(cwd);
  } catch { /* doctor.mjs unavailable */ }

  // ── Setup summary ──────────────────────────────────────────────────────
  const hasAnyProvider = (claudeProvider.available && claudeProvider.authenticated) ||
                         (openaiProvider.available && openaiProvider.authenticated);

  let recommendedAction: string | null = null;
  if (!claudeProvider.available && !openaiProvider.available) {
    recommendedAction = 'connect-claude';
  } else if (!claudeProvider.authenticated && !openaiProvider.authenticated) {
    recommendedAction = 'refresh-auth';
  } else if (!openaiProvider.available) {
    recommendedAction = 'connect-openai';
  }

  const manifest: CapabilityManifest = {
    providers: { claude: claudeProvider, openai: openaiProvider },
    preferences,
    policy,
    learning,
    setup: {
      hasAnyProvider,
      recommendedAction,
      zeroProviderMode: !hasAnyProvider,
    },
    environment: {
      mcpServers:      envCaps.mcpServers,
      claudePlugins:   envCaps.claudePlugins,
      codexPlugins:    envCaps.codexPlugins,
      shellSnapshots:  envCaps.shellSnapshots,
      configuredHooks: envCaps.configuredHooks,
      replitTools:     envCaps.replitTools,
    },
    timestamp: new Date().toISOString(),
  };

  _manifestCache    = manifest;
  _manifestCachedAt = now;
  return manifest;
}

/**
 * Compute the effective routing policy for a specific task, applying rules in order:
 * 1. Safety constraints (high-risk -> best available model)
 * 2. Provider availability
 * 3. Task tier fit (search->haiku, execute->sonnet, think->opus)
 * 4. User preferences (cost bias, forbidden models)
 * 5. Learning (prefer models with >=90% success rate for this task type)
 */
export function getEffectivePolicy(manifest: CapabilityManifest, taskContext: { tier?: string; risk?: string; taskType?: string } = {}): EffectivePolicyResult {
  const { providers, preferences, policy, learning } = manifest;
  const tier     = taskContext.tier     ?? 'execute';
  const risk     = taskContext.risk     ?? 'medium';
  const taskType = taskContext.taskType ?? 'general';
  const overrides: string[] = [];

  // Tier -> default model mapping
  const tierModelMap: Record<string, string> = { search: 'haiku', execute: 'sonnet', think: 'opus' };
  let preferredModel    = tierModelMap[tier] ?? 'sonnet';
  let preferredProvider = 'claude';

  // 1. Safety: high/critical risk -> best available model
  if (policy.highRiskRequiresBestAvailable && (risk === 'high' || risk === 'critical')) {
    preferredModel = 'opus';
    overrides.push(`risk=${risk} → upgraded to opus`);
  }

  // 2. Provider availability — fall back to openai if claude is down
  const claudeOk = providers.claude.available && providers.claude.authenticated &&
                   providers.claude.health !== 'down';
  const openaiOk = providers.openai.available && providers.openai.authenticated &&
                   providers.openai.health !== 'down';

  if (!claudeOk && openaiOk) {
    preferredProvider = 'openai';
    // Remap model names for openai
    const openaiTierMap: Record<string, string> = { search: 'gpt-4o-mini', execute: 'gpt-4o', think: 'gpt-5.5' };
    preferredModel = risk === 'high' || risk === 'critical' ? 'gpt-5.5' : (openaiTierMap[tier] ?? 'gpt-4o');
    overrides.push('claude unavailable → routed to openai');
  } else if (!claudeOk && !openaiOk) {
    return { provider: 'none', model: 'none', tier, reason: 'no providers available', overrides };
  }

  // 3. Task fit already applied via tierModelMap above

  // 4. User preferences: forbidden models, cost bias
  const forbidden = preferences.forbiddenModels ?? [];
  if (forbidden.includes(preferredModel)) {
    // Downgrade one step
    const fallback = preferredProvider === 'claude'
      ? (preferredModel === 'opus' ? 'sonnet' : 'haiku')
      : (preferredModel === 'gpt-5.5' ? 'gpt-4o' : 'gpt-4o-mini');
    overrides.push(`${preferredModel} forbidden → downgraded to ${fallback}`);
    preferredModel = fallback;
  }

  if (preferences.costBias > 0.7 && preferredModel === 'opus' && risk !== 'high' && risk !== 'critical') {
    preferredModel = 'sonnet';
    overrides.push('cost-bias > 0.7 → downgraded from opus to sonnet');
  }

  // 5. Learning: if another model has >=90% success for this task type, prefer it
  const successRates = learning ?? {};
  let bestLearnedModel: string | null = null;
  let bestRate = 0.9; // threshold
  for (const [model, stats] of Object.entries(successRates)) {
    if (stats.rate >= bestRate && stats.total >= 5 && !forbidden.includes(model)) {
      // Only prefer if it's on the right provider
      const isClaudeModel = ['opus', 'sonnet', 'haiku'].includes(model);
      if ((preferredProvider === 'claude' && isClaudeModel) ||
          (preferredProvider === 'openai' && !isClaudeModel)) {
        bestLearnedModel = model;
        bestRate = stats.rate;
      }
    }
  }
  if (bestLearnedModel && bestLearnedModel !== preferredModel) {
    overrides.push(`learning: ${bestLearnedModel} has ${Math.round(bestRate * 100)}% success → preferred`);
    preferredModel = bestLearnedModel;
  }

  const reason = overrides.length > 0
    ? overrides[0]
    : `tier=${tier} → ${preferredProvider}/${preferredModel}`;

  return { provider: preferredProvider, model: preferredModel, tier, reason, overrides };
}

async function main(): Promise<void> {
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
    `guardrail  : off`,
    '',
    getOnboardingMessage(caps, profile.workStyle || profile.bias),
  ].forEach(l => process.stdout.write(l + '\n'));
}

const isMain = process.argv[1]?.endsWith('profile.mjs') || process.argv[1]?.endsWith('profile.ts');
if (isMain) main().catch(e => { process.stderr.write((e as Error).message + '\n'); process.exit(1); });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  loadProfile, saveProfile, ensureProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectCapabilities, getOnboardingMessage,
  syncPreferencesToMemory,
  detectAuth, detectEnvironment,
  autoSetup, autoRefreshToken,
  // backward-compat stubs (deprecated)
  detectExistingAuth, detectPlans, saveSubscription, listSubscriptions,
  defaultProfile,
  // credential registry (functions already exported inline above)
};
