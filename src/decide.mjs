#!/usr/bin/env node
/**
 * decide.mjs — Routing decision module for the Dual-Brain Orchestrator.
 *
 * Given a task detection + user profile, decides which provider/model/effort/mode
 * to use and explains why in one sentence.
 *
 * Exports: decideRoute, getModelCapabilities, getAvailableModels,
 *          estimateBudgetPressure, shouldDualBrain, explainDecision, getFailoverOrder,
 *          getOptimalSub
 *
 * CLI: node src/decide.mjs --profile /path/to/profile.json \
 *        --detection '{"intent":"edit","risk":"low","complexity":"simple","effort":"medium","tier":"execute"}'
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProviderScore, checkCooldown } from './health.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = join(__dirname, '..');
const USAGE_DIR  = join(WORKSPACE, '.dualbrain', 'usage');
const AUDIT_DIR  = join(WORKSPACE, '.dualbrain', 'audit');
const FIVE_HRS_MS  = 5 * 60 * 60 * 1000;
const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Subscription token quotas (mirrors budget-balancer.mjs) ─────────────────

/** Per-plan aggregate token budgets for the two rolling windows. */
const SUB_QUOTAS = {
  claude: {
    '$20':  { fiveHr: 402_500,   weekly: 2_750_000  },
    '$100': { fiveHr: 1_638_000, weekly: 11_100_000  },
    '$200': { fiveHr: 4_120_000, weekly: 27_500_000  },
  },
  openai: {
    '$20':  { fiveHr: 400_000,   weekly: 2_700_000  },
    '$100': { fiveHr: 1_050_000, weekly: 6_750_000  },
    '$200': { fiveHr: 1_900_000, weekly: 17_500_000  },
  },
};

// ─── Slim Model Capabilities (routing-relevant only) ─────────────────────────

/** @type {Record<string, {provider, tierFit, contextWindow, strengths, weaknesses, effortLevels, costTier}>} */
const MODEL_CAPABILITIES = {
  haiku: {
    provider: 'claude',
    tierFit: ['search'],
    contextWindow: 200_000,
    strengths: ['search', 'format', 'lookup', 'classification', 'grep-analysis'],
    weaknesses: ['complex-edits', 'architecture', 'security', 'multi-file-refactor'],
    effortLevels: null,
    costTier: 'cheap',
  },
  sonnet: {
    provider: 'claude',
    tierFit: ['execute', 'search'],
    contextWindow: 200_000,
    strengths: ['edit', 'refactor', 'test', 'debug', 'code-generation', 'tool-use'],
    weaknesses: ['deep-architecture', 'ambiguous-requirements', 'frontier-reasoning'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'],
    costTier: 'medium',
  },
  opus: {
    provider: 'claude',
    tierFit: ['think', 'execute'],
    contextWindow: 200_000,
    strengths: ['architecture', 'security', 'complex-debug', 'review', 'planning', 'threat-modeling'],
    weaknesses: ['cost', 'overkill-for-simple-tasks'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'],
    costTier: 'expensive',
  },
  'gpt-4.1-mini': {
    provider: 'openai',
    tierFit: ['search'],
    contextWindow: 1_047_576,
    strengths: ['search', 'format', 'classification', 'fast-lookups'],
    weaknesses: ['complex-refactors', 'architecture', 'multi-file-edits'],
    effortLevels: ['low', 'medium', 'high'],
    costTier: 'cheap',
  },
  'gpt-4.1': {
    provider: 'openai',
    tierFit: ['execute', 'search'],
    contextWindow: 1_047_576,
    strengths: ['edit', 'code-generation', 'simple-refactor'],
    weaknesses: ['architecture', 'security', 'complex-debug'],
    effortLevels: ['low', 'medium', 'high'],
    costTier: 'medium',
  },
  'gpt-4o': {
    provider: 'openai',
    tierFit: ['execute', 'think'],
    contextWindow: 128_000,
    strengths: ['refactor', 'debug', 'code-generation', 'test', 'multimodal'],
    weaknesses: ['cost vs mini'],
    effortLevels: ['low', 'medium', 'high'],
    costTier: 'medium',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    tierFit: ['search'],
    contextWindow: 128_000,
    costTier: 'cheap',
    strengths: ['quick-tasks', 'search', 'classification'],
    weaknesses: ['complex-edits', 'architecture'],
    effortLevels: null,
  },
  'o3': {
    provider: 'openai',
    tierFit: ['think'],
    contextWindow: 200_000,
    strengths: ['architecture', 'security', 'review', 'planning', 'complex-debug', 'deep-reasoning'],
    weaknesses: ['cost', 'latency'],
    effortLevels: ['low', 'medium', 'high'],
    costTier: 'expensive',
  },
};

// ─── Subscription Model Access ────────────────────────────────────────────────

const CLAUDE_MODELS_BY_PLAN = {
  '$20':  ['haiku', 'sonnet'],
  '$100': ['haiku', 'sonnet', 'opus'],
  '$200': ['haiku', 'sonnet', 'opus'],
};

const OPENAI_MODELS_BY_PLAN = {
  '$20':  ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'],
  '$100': ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'],
  '$200': ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'],
};

// Token fallback estimates per tier (no real usage data)
const TOKEN_FALLBACK = { search: 2_500, execute: 8_000, think: 15_000 };

// ─── Exported: getModelCapabilities ──────────────────────────────────────────

/**
 * Look up a model's routing-relevant capabilities.
 * @param {string} model
 * @returns {object|null}
 */
export function getModelCapabilities(model) {
  return MODEL_CAPABILITIES[model] ?? null;
}

// ─── Exported: getAvailableModels ─────────────────────────────────────────────

/**
 * Return which models the user can access given their profile's provider plans.
 * @param {{ providers?: { claude?: { plan?: string, enabled?: boolean }, openai?: { plan?: string, enabled?: boolean } } }} profile
 * @returns {{ claude: string[], openai: string[] }}
 */
export function getAvailableModels(profile) {
  const claudePlan = profile?.providers?.claude?.plan || '$100';
  const openaiPlan = profile?.providers?.openai?.plan || '$20';
  return {
    claude: CLAUDE_MODELS_BY_PLAN[claudePlan] ?? CLAUDE_MODELS_BY_PLAN['$100'],
    openai: OPENAI_MODELS_BY_PLAN[openaiPlan] ?? OPENAI_MODELS_BY_PLAN['$20'],
  };
}

// ─── Exported: estimateBudgetPressure (deprecated stub) ──────────────────────

/**
 * @deprecated Replaced by the health-based router in health.mjs.
 * Returns an empty object so callers that still import this don't crash.
 * The budget-balancer.mjs hook file is separate and can keep using usage logs.
 * @returns {{ claude: number, openai: number }}
 */
export function estimateBudgetPressure(_profile, _cwd) {
  return { claude: 0, openai: 0 };
}

// ─── Internal: health-based provider scoring ──────────────────────────────────

/**
 * Return a 0-100 routing score for each provider using health.mjs state.
 * For each provider we check its primary model class for the given tier.
 * @param {'search'|'execute'|'think'} tier
 * @param {string} [cwd]
 * @returns {{ claude: number, openai: number }}
 */
function getHealthScores(tier, cwd) {
  // Map tier to representative model class per provider
  const claudeClass = tier === 'search' ? 'haiku'
    : tier === 'think' ? 'opus'
    : 'sonnet';
  const openaiClass = tier === 'search' ? 'gpt-4o-mini'
    : tier === 'think' ? 'o3'
    : 'gpt-4o';

  // Trigger cooldown expiry check (transitions hot→probing automatically)
  checkCooldown('claude', claudeClass, cwd);
  checkCooldown('openai', openaiClass, cwd);

  return {
    claude: getProviderScore('claude', claudeClass, cwd),
    openai: getProviderScore('openai', openaiClass, cwd),
  };
}

// ─── Exported: shouldDualBrain ────────────────────────────────────────────────

/**
 * Return true if both providers should analyze this task.
 * Requires: (critical risk OR architecture/security intent OR complex+high-risk)
 * AND profile has both providers available with dual mode enabled.
 *
 * designImpact bypasses the hasBothProviders check — it is a mandatory review
 * gate, not optional collaboration. When only one provider is available the
 * caller should check degradedDualBrain on the decision output.
 * @param {{ intent?: string, risk?: string, complexity?: string, designImpact?: boolean }} detection
 * @param {object} profile
 * @returns {boolean}
 */
export function shouldDualBrain(detection, profile) {
  const { intent = '', risk = 'low', complexity = 'simple', designImpact = false } = detection;
  const dualEnabled = profile?.dual_brain_enabled !== false;
  if (!dualEnabled) return false;

  const hasBothProviders = !!(
    profile?.providers?.claude?.enabled &&
    profile?.providers?.claude?.plan &&
    profile?.providers?.openai?.enabled &&
    profile?.providers?.openai?.plan
  );

  if (designImpact) return true;

  if (!hasBothProviders) return false;

  const criticalRisk    = risk === 'critical';
  const archOrSecurity  = ['architecture', 'security'].includes(intent);
  const complexHighRisk = complexity === 'complex' && risk === 'high';

  return criticalRisk || archOrSecurity || complexHighRisk;
}

// ─── Internal: select model for provider ─────────────────────────────────────

const THINK_INTENTS  = ['architecture', 'security', 'review', 'planning', 'compare'];
const SEARCH_INTENTS = ['search', 'format', 'explain', 'lookup'];

function pickClaudeModel(detection, available) {
  const { intent = '', risk = 'low', effort = 'medium' } = detection;
  const needsOpus  = THINK_INTENTS.includes(intent) || risk === 'critical' || effort === 'xhigh';
  const needsHaiku = SEARCH_INTENTS.includes(intent) && !['high', 'critical'].includes(risk);

  if (needsOpus  && available.includes('opus'))  return 'opus';
  if (needsHaiku && available.includes('haiku')) return 'haiku';
  return available.includes('sonnet') ? 'sonnet' : available[available.length - 1];
}

function pickOpenAIModel(detection, available) {
  const { intent = '', risk = 'low', complexity = 'simple', effort = 'medium' } = detection;
  const needsTop    = THINK_INTENTS.includes(intent) || risk === 'critical' || effort === 'xhigh';
  const needsMini   = SEARCH_INTENTS.includes(intent) && effort === 'low';
  const needsCodex  = ['refactor', 'debug'].includes(intent) && complexity !== 'trivial';

  const pref = needsTop    ? 'o3'
             : needsMini   ? 'gpt-4o-mini'
             : needsCodex  ? 'gpt-4o'
             : 'gpt-4o';

  // Walk down rank until we find an available model
  const rank = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];
  const idx = rank.indexOf(pref);
  for (let i = idx; i >= 0; i--) {
    if (available.includes(rank[i])) return rank[i];
  }
  return available[0] ?? 'gpt-4o-mini';
}

function applyHealthDowngrade(model, score, provider, available, isHighStakes) {
  // score=100 healthy, score=50 degraded, score=25 probing, score=0 hot
  // If score is 0 (hot) and this isn't high-stakes, downgrade one tier
  if (score >= 50 || isHighStakes) return model;

  if (provider === 'claude') {
    const claudeRank = ['haiku', 'sonnet', 'opus'];
    const idx = claudeRank.indexOf(model);
    const steps = score === 0 ? 2 : 1;
    const downIdx = Math.max(0, idx - steps);
    for (let i = downIdx; i <= idx; i++) {
      if (available.includes(claudeRank[i])) return claudeRank[i];
    }
    return available[0] ?? 'haiku';
  } else {
    const oaiRank = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];
    const idx = oaiRank.indexOf(model);
    const steps = score === 0 ? 2 : 1;
    const downIdx = Math.max(0, idx - steps);
    for (let i = downIdx; i <= idx; i++) {
      if (available.includes(oaiRank[i])) return oaiRank[i];
    }
    return available[0] ?? 'gpt-4o-mini';
  }
}

function applyProfileBias(model, profile, provider, available, tier) {
  const mode = profile?.mode || profile?.profile || 'auto';
  if (mode === 'cost-saver') {
    // Prefer cheapest available that also fits the required tier
    const ranks = {
      claude: ['haiku', 'sonnet', 'opus'],
      openai: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'],
    };
    for (const m of ranks[provider]) {
      if (!available.includes(m)) continue;
      const caps = MODEL_CAPABILITIES[m];
      if (tier && caps && !caps.tierFit.includes(tier)) continue;
      return m;
    }
  }
  if (mode === 'quality-first') {
    // Prefer best available, keep current if already best
    const ranks = {
      claude: ['opus', 'sonnet', 'haiku'],
      openai: ['o3', 'o4-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
    };
    for (const m of ranks[provider]) {
      if (available.includes(m)) return m;
    }
  }
  // Check user preferences (e.g. { prefer: 'opus', for: 'security' })
  const prefs = profile?.preferences || [];
  for (const pref of prefs) {
    if (pref.model && available.includes(pref.model) &&
        pref.for && MODEL_CAPABILITIES[pref.model]?.strengths?.includes(pref.for)) {
      return pref.model;
    }
  }
  return model;
}

function pickEffort(model, detection) {
  const caps = MODEL_CAPABILITIES[model];
  if (!caps?.effortLevels) return null;
  const { risk = 'low', complexity = 'simple', effort } = detection;
  if (effort && caps.effortLevels.includes(effort)) return effort;
  if (risk === 'critical' || complexity === 'complex')    return 'xhigh';
  if (risk === 'high'     || complexity === 'moderate')   return 'high';
  if (risk === 'low'      && complexity === 'trivial')    return 'low';
  return 'medium';
}

function pickModes(model, detection) {
  const { intent = '', complexity = 'simple' } = detection;
  const caps = MODEL_CAPABILITIES[model] ?? {};
  const thinkingModels = ['sonnet', 'opus', 'o3', 'gpt-4o'];
  const lightIntents   = ['search', 'format', 'explain', 'lookup'];

  return {
    extendedThinking: thinkingModels.includes(model)
      && ['moderate', 'complex'].includes(complexity)
      && !lightIntents.includes(intent),
    fastMode:         model === 'opus',
    extendedContext:  ['sonnet', 'opus'].includes(model),
    webSearch:        ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'].includes(model),
  };
}

function pickSandbox(model, detection) {
  const { tier = 'execute' } = detection;
  if (tier === 'search') return 'read-only';
  if (MODEL_CAPABILITIES[model]?.provider === 'openai') return 'danger-full-access';
  return 'workspace-write';
}

function chooseProvider(detection, profile, healthScores) {
  const { tier = 'execute', intent = '' } = detection;
  const claudeScore = healthScores.claude;
  const openaiScore = healthScores.openai;

  // OpenAI not configured or not enabled → always use Claude
  if (!profile?.providers?.openai?.enabled || !profile?.providers?.openai?.plan) return 'claude';

  // Both hot (score=0) → pick the one with the higher score; if tied, prefer Claude
  if (claudeScore === 0 && openaiScore === 0) {
    return claudeScore >= openaiScore ? 'claude' : 'openai';
  }

  // Think-tier strongly prefers Claude (session context coupling), unless Claude is hot
  if (THINK_INTENTS.includes(intent) && claudeScore > 0) return 'claude';

  // Claude hot → route to OpenAI if available
  if (claudeScore === 0 && openaiScore > 0) return 'openai';

  // Isolated execute tasks: route to OpenAI if Claude is degraded/probing but OpenAI is healthy
  if (tier === 'execute' && !THINK_INTENTS.includes(intent)) {
    if (claudeScore < 100 && openaiScore > claudeScore) return 'openai';
  }

  // Default: Claude (lower session-context overhead, higher score wins)
  return claudeScore >= openaiScore ? 'claude' : 'openai';
}

// ─── Exported: explainDecision ────────────────────────────────────────────────

/**
 * Generate a one-sentence explanation for the routing decision.
 * @param {object} decision
 * @param {object} detection
 * @param {object} profile
 * @returns {string}
 */
export function explainDecision(decision, detection, profile) {
  const { provider, model, effort, dualBrain } = decision;
  const { intent = 'task', risk = 'low', complexity = 'simple', tier = 'execute' } = detection;
  const healthScores = decision._healthScores || {};
  const mode = profile?.mode || profile?.profile || 'auto';

  const modelLabel = effort ? `${model} ${effort}` : model;

  if (dualBrain) {
    return `Using ${modelLabel} with dual-brain review because this ${intent} change is ${risk} risk.`;
  }
  // Health-based explanations
  const claudeScore = healthScores.claude ?? 100;
  const providerScore = healthScores[provider] ?? 100;
  if (claudeScore === 0 && provider === 'openai') {
    return `Using ${modelLabel} because Claude is rate-limited and this is an isolated ${tier} task.`;
  }
  if (providerScore < 50) {
    return `Using ${modelLabel} (downgraded due to rate-limit cooldown) for this ${complexity} ${intent}.`;
  }
  if (mode === 'cost-saver') {
    return `Using ${modelLabel} because cost-saver mode prefers cheaper models for ${risk}-risk work.`;
  }
  if (mode === 'quality-first') {
    return `Using ${modelLabel} because quality-first mode prefers stronger models for ${intent}.`;
  }
  if (THINK_INTENTS.includes(intent)) {
    return `Using ${modelLabel} because ${intent} tasks need deep reasoning and Claude is healthy.`;
  }
  if (tier === 'search' || SEARCH_INTENTS.includes(intent)) {
    return `Using ${modelLabel} because this is a simple ${intent} with low risk.`;
  }
  return `Using ${modelLabel} because ${provider} is healthy and this is a routine ${intent}.`;
}

// ─── Exported: parsePreferences ──────────────────────────────────────────────

/**
 * Parse free-text user preferences into routing-relevant signals.
 * @param {Array<{text: string, enabled: boolean, scope: string}>} preferences
 * @returns {{
 *   biasOverride: 'cost-saver'|'quality-first'|null,
 *   preferProvider: 'claude'|'openai'|null,
 *   avoidProvider: 'claude'|'openai'|null,
 *   alwaysDualBrain: boolean,
 *   neverDualBrain: boolean,
 *   preferModel: 'opus'|'sonnet'|'haiku'|null,
 * }}
 */
export function parsePreferences(preferences) {
  const active = (preferences || []).filter(p => p.enabled);
  const signals = {
    biasOverride:    null,
    preferProvider:  null,
    avoidProvider:   null,
    alwaysDualBrain: false,
    neverDualBrain:  false,
    preferModel:     null,
  };

  for (const pref of active) {
    const t = pref.text.toLowerCase();
    // Cost/quality bias signals
    if (/cheap|save|budget|frugal|economical|cost/i.test(t))      signals.biasOverride   = 'cost-saver';
    if (/quality|best|thorough|careful|premium/i.test(t))         signals.biasOverride   = 'quality-first';
    // Provider preference signals
    if (/prefer claude|use claude|claude first/i.test(t))          signals.preferProvider = 'claude';
    if (/prefer (openai|gpt|chatgpt)|use (openai|gpt)/i.test(t))  signals.preferProvider = 'openai';
    if (/avoid claude|no claude/i.test(t))                         signals.avoidProvider  = 'claude';
    if (/avoid (openai|gpt)|no (openai|gpt)/i.test(t))            signals.avoidProvider  = 'openai';
    // Dual-brain signals
    if (/always/.test(t) && /(consensus|dual.brain|two.brain|dual)/i.test(t)) signals.alwaysDualBrain = true;
    if (/never (consensus|dual)|skip (review|consensus)|solo/i.test(t)) signals.neverDualBrain = true;
    // Model preference signals
    if (/prefer opus|use opus/i.test(t))                           signals.preferModel    = 'opus';
    if (/prefer sonnet|use sonnet/i.test(t))                       signals.preferModel    = 'sonnet';
    if (/prefer haiku|use haiku/i.test(t))                         signals.preferModel    = 'haiku';
  }
  return signals;
}

// ─── Exported: getOptimalSub ─────────────────────────────────────────────────

/**
 * Read usage log entries within a given window (ms).
 * Scans .dualbrain/usage/usage-YYYY-MM-DD.jsonl files.
 * @param {number} windowMs
 * @returns {Array<object>}
 */
function _readUsageInWindow(windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entries = [];
  const daysBack = Math.ceil(windowMs / 86_400_000) + 1;
  const seen = new Set();
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    if (seen.has(date)) continue;
    seen.add(date);
    const file = join(USAGE_DIR, `usage-${date}.jsonl`);
    if (!existsSync(file)) continue;
    let raw;
    try { raw = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(rec.timestamp);
      if (!isNaN(ts) && ts >= cutoff) entries.push(rec);
    }
  }
  return entries;
}

/**
 * Sum tokens used by a specific provider from usage entries.
 * @param {Array<object>} entries
 * @param {string} provider
 * @returns {number}
 */
function _sumProviderTokens(entries, provider) {
  let total = 0;
  for (const e of entries) {
    if (e.provider !== provider) continue;
    const inp = e.input_tokens ?? 0;
    const out = e.output_tokens ?? 0;
    total += inp + out > 0 ? inp + out : 8_000; // fallback estimate
  }
  return total;
}

/**
 * Log an autopilot routing decision to .dualbrain/audit/budget-autopilot.jsonl.
 * @param {object} entry
 */
function _logAutopilot(entry) {
  try {
    if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    appendFileSync(join(AUDIT_DIR, 'budget-autopilot.jsonl'), line + '\n', 'utf8');
  } catch {
    // Non-fatal: logging should never block routing
  }
}

/**
 * Given a provider and profile, pick the subscription with the most remaining
 * quota — use-it-or-lose-it scoring: `remaining * (1 / hoursUntilReset)`.
 *
 * Handles single-sub and multi-sub profiles uniformly. When only one sub
 * exists, returns it immediately (no log written for single-sub case since
 * there is no real routing decision to make).
 *
 * @param {'claude'|'openai'} provider
 * @param {'search'|'execute'|'think'} tier
 * @param {object} profile
 * @returns {{
 *   subIndex: number,
 *   plan: string,
 *   label: string|null,
 *   fiveHrUsed: number,
 *   weeklyUsed: number,
 *   fiveHrQuota: number,
 *   weeklyQuota: number,
 *   fiveHrRemaining: number,
 *   weeklyRemaining: number,
 *   score: number,
 *   reason: string,
 * }|null}
 */
export function getOptimalSub(provider, tier, profile) {
  const providerCfg = profile?.providers?.[provider];
  if (!providerCfg) return null;

  // Normalise to an array of subs
  const subs = providerCfg.subs?.length
    ? providerCfg.subs
    : providerCfg.plan
      ? [{ plan: providerCfg.plan, label: providerCfg.label || null }]
      : [];

  if (subs.length === 0) return null;

  // Short-circuit for single-sub: skip usage read and logging overhead
  if (subs.length === 1) {
    const s = subs[0];
    const plan = s.plan || '$100';
    const quotas = SUB_QUOTAS[provider]?.[plan] ?? { fiveHr: 1_000_000, weekly: 7_000_000 };
    return {
      subIndex: 0,
      plan,
      label: s.label ?? null,
      fiveHrUsed: 0,
      weeklyUsed: 0,
      fiveHrQuota: quotas.fiveHr,
      weeklyQuota: quotas.weekly,
      fiveHrRemaining: quotas.fiveHr,
      weeklyRemaining: quotas.weekly,
      score: quotas.fiveHr,
      reason: 'only sub available',
    };
  }

  // Multi-sub: read usage logs once for both windows
  const fiveHrEntries = _readUsageInWindow(FIVE_HRS_MS);
  const weeklyEntries = _readUsageInWindow(SEVEN_DAY_MS);

  // We cannot distinguish sub-level usage from the log (no subIndex field),
  // so we divide total provider usage evenly across subs as a best-effort proxy.
  const fiveHrTotal = _sumProviderTokens(fiveHrEntries, provider);
  const weeklyTotal = _sumProviderTokens(weeklyEntries, provider);
  const perSubFiveHr = Math.round(fiveHrTotal / subs.length);
  const perSubWeekly = Math.round(weeklyTotal / subs.length);

  // Score each sub
  const now = Date.now();
  const fiveHrResetMs = FIVE_HRS_MS; // window always resets from now in a rolling sense
  const weeklyResetMs = SEVEN_DAY_MS;

  let best = null;
  let bestScore = -Infinity;
  const alternatives = [];

  subs.forEach((s, i) => {
    const plan = s.plan || '$100';
    const quotas = SUB_QUOTAS[provider]?.[plan] ?? { fiveHr: 1_000_000, weekly: 7_000_000 };

    const fiveHrRemaining = Math.max(0, quotas.fiveHr - perSubFiveHr);
    const weeklyRemaining = Math.max(0, quotas.weekly - perSubWeekly);

    // Binding constraint: whichever window is tighter
    const remaining = Math.min(fiveHrRemaining, weeklyRemaining);

    // Hours until the tighter window resets (rolling → effectively "now + window")
    const hoursUntilReset = fiveHrRemaining <= weeklyRemaining
      ? (fiveHrResetMs / 3_600_000)
      : (weeklyResetMs / 3_600_000);

    // Use-it-or-lose-it: higher score = more remaining + resets sooner
    const score = hoursUntilReset > 0 ? remaining * (1 / hoursUntilReset) : remaining;

    const pctRemaining = quotas.fiveHr > 0
      ? Math.round((fiveHrRemaining / quotas.fiveHr) * 100)
      : 100;
    const resets = fiveHrRemaining <= weeklyRemaining ? '5h' : '7d';
    const reason = `${pctRemaining}% remaining, resets in ${resets === '5h' ? 5 : 168}h`;

    const info = {
      subIndex: i,
      plan,
      label: s.label ?? null,
      fiveHrUsed: perSubFiveHr,
      weeklyUsed: perSubWeekly,
      fiveHrQuota: quotas.fiveHr,
      weeklyQuota: quotas.weekly,
      fiveHrRemaining,
      weeklyRemaining,
      score,
      reason,
    };

    alternatives.push(info);

    if (score > bestScore) {
      bestScore = score;
      best = info;
    }
  });

  // Log the autopilot decision
  if (best) {
    _logAutopilot({
      provider,
      tier,
      subIndex: best.subIndex,
      plan: best.plan,
      label: best.label,
      reason: best.reason,
      alternatives: alternatives.map(a => ({
        subIndex: a.subIndex,
        plan: a.plan,
        label: a.label,
        score: Math.round(a.score),
        fiveHrRemaining: a.fiveHrRemaining,
        weeklyRemaining: a.weeklyRemaining,
      })),
    });
  }

  return best;
}

// ─── Internal: safety floor for critical-risk tasks ───────────────────────────

/**
 * Ensure critical-risk tasks are never handled by the cheapest (haiku/gpt-4.1-mini) model.
 * Cost-saver mode is the main culprit; escalate silently but emit a stderr warning.
 * @param {string} model
 * @param {string} provider
 * @param {string[]} available
 * @param {'low'|'medium'|'high'|'critical'} risk
 * @returns {string}
 */
function applyCriticalRiskFloor(model, provider, available, risk) {
  if (risk !== 'critical') return model;

  const cheapModels = { claude: 'haiku', openai: 'gpt-4.1-mini' };
  const floorModels = { claude: 'sonnet', openai: 'gpt-4.1' };

  if (model === cheapModels[provider]) {
    const floor = floorModels[provider];
    const escalated = available.includes(floor) ? floor : available[available.length - 1] ?? model;
    process.stderr.write(
      `[dual-brain] Warning: cost-saver selected ${model} for a critical-risk task. ` +
      `Escalating to ${escalated} (safety floor).\n`
    );
    return escalated;
  }
  return model;
}

// ─── Exported: decideRoute ────────────────────────────────────────────────────

/**
 * Main routing decision function.
 * @param {{ profile: object, detection: object, cwd?: string }} input
 * @returns {object} Routing decision
 */
export function decideRoute({ profile = {}, detection = {}, cwd } = {}) {
  const available     = getAvailableModels(profile);

  // Parse free-text user preferences into routing signals
  const prefSignals = parsePreferences(profile.preferences);

  // Apply bias override from preferences (takes precedence over profile.bias)
  const profileWithEffectiveBias = prefSignals.biasOverride
    ? { ...profile, mode: prefSignals.biasOverride }
    : profile;

  // dual-brain: start with the natural shouldDualBrain result, then apply preference overrides
  let dual = shouldDualBrain(detection, profile);
  if (prefSignals.alwaysDualBrain) dual = true;
  if (prefSignals.neverDualBrain)  dual = false;

  const { tier = 'execute', risk = 'low' } = detection;
  const isHighStakes  = ['critical', 'high'].includes(risk);

  // Get health scores for current tier
  const healthScores = getHealthScores(tier, cwd);

  // Choose provider (using the bias-patched profile so chooseProvider sees the right mode)
  let provider = chooseProvider(detection, profileWithEffectiveBias, healthScores);

  // Apply preferProvider / avoidProvider signals from preferences
  if (prefSignals.preferProvider) {
    const preferred = prefSignals.preferProvider;
    const prefEnabled = profile?.providers?.[preferred]?.enabled && profile?.providers?.[preferred]?.plan;
    const prefScore   = healthScores[preferred] ?? 0;
    // Use preferred provider if it is configured and has any health score (even degraded)
    if (prefEnabled && prefScore > 0) provider = preferred;
  }
  if (prefSignals.avoidProvider && provider === prefSignals.avoidProvider) {
    // Switch to the other provider only if it is configured and healthy
    const other = prefSignals.avoidProvider === 'claude' ? 'openai' : 'claude';
    const otherEnabled = profile?.providers?.[other]?.enabled && profile?.providers?.[other]?.plan;
    const otherScore   = healthScores[other] ?? 0;
    if (otherEnabled && otherScore > 0) provider = other;
  }

  // Select base model (use bias-patched profile for model selection too)
  let model = provider === 'claude'
    ? pickClaudeModel(detection, available.claude)
    : pickOpenAIModel(detection, available.openai);

  // Apply health-based downgrade (only if score < 50 and not high-stakes)
  model = applyHealthDowngrade(model, healthScores[provider], provider, available[provider], isHighStakes);

  // Apply profile mode bias (cost-saver / quality-first / preferences) using patched profile
  model = applyProfileBias(model, profileWithEffectiveBias, provider, available[provider], detection.tier);

  // Safety floor: critical-risk tasks must never use haiku/gpt-4.1-mini even in cost-saver mode
  model = applyCriticalRiskFloor(model, provider, available[provider], detection.risk);

  // Apply preferModel signal from preferences (override after all other picks)
  if (prefSignals.preferModel) {
    const wantedModel = prefSignals.preferModel;
    if (available[provider]?.includes(wantedModel)) {
      model = wantedModel;
    }
  }

  // Determine effort, modes, sandbox
  const effort  = pickEffort(model, detection);
  const modes   = pickModes(model, detection);
  const sandbox = pickSandbox(model, detection);

  const hasBothProviders = !!(
    profile?.providers?.claude?.enabled &&
    profile?.providers?.claude?.plan &&
    profile?.providers?.openai?.enabled &&
    profile?.providers?.openai?.plan
  );
  const degradedDualBrain = !!(dual && detection.designImpact && !hasBothProviders);

  // Budget autopilot: pick optimal sub when multiple subs exist for chosen provider
  const optimalSub = getOptimalSub(provider, tier, profile);

  const decision = {
    provider,
    model,
    effort,
    tier,
    dualBrain: dual,
    ...(degradedDualBrain && { degradedDualBrain: true }),
    ...(optimalSub && optimalSub.label != null && { subLabel: optimalSub.label }),
    ...(optimalSub && { subIndex: optimalSub.subIndex }),
    modes,
    sandbox,
    explanation: '',
    _healthScores: healthScores,
  };

  decision.explanation = explainDecision(decision, detection, profileWithEffectiveBias);

  // Remove internal field from public output
  const { _healthScores, ...result } = decision;
  return result;
}

// ─── Exported: getFailoverOrder ──────────────────────────────────────────────

/**
 * Given a failed routing decision and the active profile, return an ordered list
 * of fallback options to try next.
 *
 * Priority order:
 *   1. Other subscriptions of the same provider (e.g. Claude Max #2 before Claude Pro)
 *   2. Other provider (OpenAI or Claude, whichever wasn't tried)
 *
 * Within each group, options are ordered by capability match for the tier
 * (best fit first, cheapest last).
 *
 * @param {object} decision  The routing decision that just failed (provider, model, tier)
 * @param {object} profile   Active profile with providers/subscriptions info
 * @returns {Array<{ provider: string, model: string, plan: string, label: string }>}
 */
export function getFailoverOrder(decision, profile) {
  const { provider: failedProvider, model: failedModel, tier = 'execute' } = decision;
  const available = getAvailableModels(profile);

  // Build a ranked model list for Claude (best capability for tier → cheapest)
  const claudeRankByTier = {
    think:   ['opus', 'sonnet', 'haiku'],
    execute: ['sonnet', 'opus', 'haiku'],
    search:  ['haiku', 'sonnet', 'opus'],
  };
  const openaiRankByTier = {
    think:   ['o3', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
    execute: ['gpt-4o', 'gpt-4.1', 'o3', 'gpt-4.1-mini', 'gpt-4o-mini'],
    search:  ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o3'],
  };

  const claudeRank = claudeRankByTier[tier] ?? claudeRankByTier.execute;
  const openaiRank = openaiRankByTier[tier] ?? openaiRankByTier.execute;

  const claudeEnabled = !!(profile?.providers?.claude?.enabled && profile?.providers?.claude?.plan);
  const openaiEnabled = !!(profile?.providers?.openai?.enabled && profile?.providers?.openai?.plan);
  const claudePlan    = profile?.providers?.claude?.plan ?? '$20';
  const openaiPlan    = profile?.providers?.openai?.plan ?? '$20';

  const fallbacks = [];

  if (failedProvider === 'claude') {
    // Same-provider fallbacks: other Claude models (skip the one that just failed)
    for (const m of claudeRank) {
      if (m === failedModel) continue;
      if (!available.claude.includes(m)) continue;
      fallbacks.push({ provider: 'claude', model: m, plan: claudePlan, label: `Claude ${m} (${claudePlan})` });
    }
    // Cross-provider fallbacks: OpenAI models
    if (openaiEnabled) {
      for (const m of openaiRank) {
        if (!available.openai.includes(m)) continue;
        fallbacks.push({ provider: 'openai', model: m, plan: openaiPlan, label: `OpenAI ${m} (${openaiPlan})` });
      }
    }
  } else {
    // Same-provider fallbacks: other OpenAI models (skip the one that just failed)
    for (const m of openaiRank) {
      if (m === failedModel) continue;
      if (!available.openai.includes(m)) continue;
      fallbacks.push({ provider: 'openai', model: m, plan: openaiPlan, label: `OpenAI ${m} (${openaiPlan})` });
    }
    // Cross-provider fallbacks: Claude models
    if (claudeEnabled) {
      for (const m of claudeRank) {
        if (!available.claude.includes(m)) continue;
        fallbacks.push({ provider: 'claude', model: m, plan: claudePlan, label: `Claude ${m} (${claudePlan})` });
      }
    }
  }

  return fallbacks;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let profilePath, detectionJson, cwd;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile'   && args[i + 1]) { profilePath   = args[++i]; }
    if (args[i] === '--detection' && args[i + 1]) { detectionJson = args[++i]; }
    if (args[i] === '--cwd'       && args[i + 1]) { cwd           = args[++i]; }
  }

  let profile   = {};
  let detection = {};

  if (profilePath) {
    try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch (e) {
      console.error(`Failed to load profile: ${e.message}`);
      process.exit(1);
    }
  }
  if (detectionJson) {
    try { detection = JSON.parse(detectionJson); } catch (e) {
      console.error(`Failed to parse detection JSON: ${e.message}`);
      process.exit(1);
    }
  }

  const result = decideRoute({ profile, detection, cwd });
  console.log(JSON.stringify(result, null, 2));
}
