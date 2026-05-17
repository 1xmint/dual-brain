#!/usr/bin/env node
/**
 * decide.mjs — Routing decision module for the Dual-Brain Orchestrator.
 *
 * Given a task detection + user profile, decides which provider/model/effort/mode
 * to use and explains why in one sentence.
 *
 * Exports: decideRoute, getModelCapabilities, getAvailableModels,
 *          WORK_STYLES, getWorkStyle, estimateBudgetPressure,
 *          shouldDualBrain, explainDecision, getFailoverOrder
 *
 * CLI: node src/decide.mjs --profile /path/to/profile.json \
 *        --detection '{"intent":"edit","risk":"low","complexity":"simple","effort":"medium","tier":"execute"}'
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProviderScore, checkCooldown } from './health.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = join(__dirname, '..');

// ─── Model Registry (optional, lazy-loaded) ───────────────────────────────────

/**
 * Cached reference to models.mjs exports. Populated on first successful import.
 * Remains null if models.mjs is unavailable — all callers fall back to
 * the existing hardcoded model selection logic in that case.
 */
let modelRegistry = null;
let _registryLoadAttempted = false;

/**
 * Attempt to load models.mjs once. Subsequent calls return immediately.
 * This is intentionally fire-and-forget: decideRoute stays synchronous and
 * reads `modelRegistry` after the Promise resolves.
 */
function _loadModelRegistry() {
  if (_registryLoadAttempted) return;
  _registryLoadAttempted = true;
  import('./models.mjs').then(mod => {
    modelRegistry = mod;
  }).catch(() => {
    // models.mjs unavailable — fall back to hardcoded logic
  });
}

// Kick off the load immediately so it is ready before the first routing call.
_loadModelRegistry();

// ─── Routing Advisor (optional, lazy-loaded) ──────────────────────────────────

/**
 * Cached reference to routing-advisor.mjs exports. Populated on first import.
 * Remains null if unavailable — decideRoute skips advisor consultation in that case.
 */
let routingAdvisor = null;
let _advisorLoadAttempted = false;

function _loadRoutingAdvisor() {
  if (_advisorLoadAttempted) return;
  _advisorLoadAttempted = true;
  import('./routing-advisor.mjs').then(mod => {
    routingAdvisor = mod;
  }).catch(() => {
    // routing-advisor.mjs unavailable — skip learned routing
  });
}

// Kick off the load immediately so it is ready before the first routing call.
_loadRoutingAdvisor();

// ─── Work Styles ─────────────────────────────────────────────────────────────

/**
 * Work styles control how aggressively the router uses stronger models,
 * challenger (dual-brain) reviews, and checkpoints.
 * The user picks a style regardless of provider or plan — no price gating.
 */
export const WORK_STYLES = {
  fast: {
    label: 'Fast',
    defaultWorker: 'claude-sonnet-4-6',
    complexWorker: 'claude-sonnet-4-6',
    challengerPolicy: 'never',
    checkpointPolicy: 'never',
    reviewPolicy: 'skip',
    description: 'Quick answers, single model, minimal reviews',
  },
  balanced: {
    label: 'Balanced',
    defaultWorker: 'claude-sonnet-4-6',
    complexWorker: 'claude-opus-4-6',
    challengerPolicy: 'high-risk',    // only on high/critical risk
    checkpointPolicy: 'risky-ops',    // before risky operations
    reviewPolicy: 'important',        // important changes only
    description: 'Smart routing, reviews on important changes',
  },
  fullpower: {
    label: 'Full Power',
    defaultWorker: 'claude-sonnet-4-6',
    complexWorker: 'claude-opus-4-6',
    challengerPolicy: 'medium-risk',  // medium+ risk
    checkpointPolicy: 'all-edits',    // before all edits
    reviewPolicy: 'non-trivial',      // everything non-trivial
    description: 'Deep reasoning, dual-brain on everything that matters',
  },
};

/**
 * Read the active work style from the profile.
 * Falls back to 'balanced' if not set or unrecognized.
 * @param {object} profile
 * @returns {object} The matching WORK_STYLES entry, with a `key` property added.
 */
export function getWorkStyle(profile) {
  const key = profile?.workStyle || profile?.work_style || 'balanced';
  const style = WORK_STYLES[key] ?? WORK_STYLES.balanced;
  return { ...style, key: WORK_STYLES[key] ? key : 'balanced' };
}

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

// ─── Canonical Work Model Names ──────────────────────────────────────────────

/**
 * These are the authoritative model IDs used when dispatching work.
 * The session model (what the user runs Claude Code with) is separate and
 * does not need to be changed — the router assigns work models independently.
 *
 * Role → model mapping:
 *   execute  → claude-sonnet-4-6       (native tool use, reliable workhorse)
 *   think    → claude-opus-4-6         (deep reasoning, complex single-brain tasks)
 *   search   → claude-haiku-4-5-20251001 / gpt-4o-mini  (cheap, fast, disposable)
 *   challenger → o3 or gpt-4o          (independence — different training = different blind spots)
 */
const WORK_MODELS = {
  execute:    'claude-sonnet-4-6',
  think:      'claude-opus-4-6',
  search:     'claude-haiku-4-5-20251001',
  challengerGpt: 'o3',       // preferred challenger; falls back to gpt-4o when o3 unavailable
  challengerGptFallback: 'gpt-4o',
  searchGpt:  'gpt-4o-mini', // GPT-side search/classify
};

/** Always recommend Sonnet as the session model. */
const RECOMMENDED_SESSION_MODEL = 'claude-sonnet-4-6';
const RECOMMENDED_SESSION_REASON =
  'Sonnet has native tool use and is the most cost-effective session model for orchestrating work agents.';

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
 * Return which models the user can access.
 * All known models are available by default; providers can explicitly restrict
 * via profile.providers.<provider>.models (array of allowed model short names).
 * This does NOT gate on price or configured plan — we cannot verify those from here.
 * @param {{ providers?: { claude?: { enabled?: boolean, models?: string[] }, openai?: { enabled?: boolean, models?: string[] } } }} profile
 * @returns {{ claude: string[], openai: string[] }}
 */
export function getAvailableModels(profile) {
  const ALL_CLAUDE = ['haiku', 'sonnet', 'opus'];
  const ALL_OPENAI = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];

  const claudeModels = profile?.providers?.claude?.models;
  const openaiModels = profile?.providers?.openai?.models;

  return {
    claude: Array.isArray(claudeModels) ? claudeModels : ALL_CLAUDE,
    openai: Array.isArray(openaiModels) ? openaiModels : ALL_OPENAI,
  };
}

// ─── Internal: challenger model selection ────────────────────────────────────

/**
 * Pick the best challenger model from the opposing provider.
 * Claude primary → GPT challenger (o3 preferred, gpt-4o fallback).
 * GPT primary → Claude Opus challenger (Sonnet fallback).
 * Falls back gracefully when the other provider is not available.
 *
 * @param {string} primaryProvider  'claude'|'openai'
 * @param {object} available        Result of getAvailableModels()
 * @returns {string|null}
 */
function pickChallengerModel(primaryProvider, available) {
  if (primaryProvider === 'claude') {
    // Claude is primary → use GPT as challenger
    if (available.openai.includes(WORK_MODELS.challengerGpt))         return WORK_MODELS.challengerGpt;
    if (available.openai.includes(WORK_MODELS.challengerGptFallback)) return WORK_MODELS.challengerGptFallback;
    return null; // OpenAI not available
  } else {
    // OpenAI is primary → use Claude Opus as challenger
    if (available.claude.includes('opus')) return WORK_MODELS.think;
    if (available.claude.includes('sonnet')) return WORK_MODELS.execute;
    return null; // Claude not available
  }
}

/**
 * Decide whether to trigger a challenger based on the work style policy and task risk.
 * When only one provider is available, challenger is never triggered (no cross-provider review possible).
 * @param {string} challengerPolicy  'never'|'high-risk'|'medium-risk'
 * @param {'low'|'medium'|'high'|'critical'} risk
 * @param {boolean} hasBothProviders
 * @returns {boolean}
 */
function shouldTriggerChallenger(challengerPolicy, risk, hasBothProviders) {
  if (challengerPolicy === 'never' || !hasBothProviders) return false;
  if (challengerPolicy === 'high-risk')   return ['high', 'critical'].includes(risk);
  if (challengerPolicy === 'medium-risk') return ['medium', 'high', 'critical'].includes(risk);
  return false;
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

/**
 * Normalize a full model ID (e.g. 'claude-sonnet-4-6') to the short name used
 * by the internal ranking arrays (e.g. 'sonnet'). Pass-through for names already
 * in short form or OpenAI model IDs that don't need normalization.
 * @param {string} model
 * @param {string} provider  'claude'|'openai'
 * @returns {string}
 */
function toShortName(model, provider) {
  if (!model) return model;
  const m = model.toLowerCase();
  if (provider === 'claude') {
    if (m.includes('haiku'))  return 'haiku';
    if (m.includes('opus'))   return 'opus';
    if (m.includes('sonnet')) return 'sonnet';
  }
  // OpenAI and already-short names pass through unchanged
  return model;
}

/**
 * Resolve a short model name back to the best full model ID from the registry.
 * Used after the internal pipeline (health downgrade, profile bias, etc.) finalizes
 * the short name, to restore the full ID when the registry is available.
 * @param {string} shortName  e.g. 'sonnet', 'opus', 'haiku'
 * @param {string} provider   'claude'|'openai'
 * @param {string} tier       'search'|'execute'|'think'
 * @returns {string}          Full model ID, or shortName if registry unavailable
 */
function toFullModelId(shortName, provider, tier) {
  if (!modelRegistry) return shortName;
  const registryProvider = provider === 'claude' ? 'anthropic' : 'openai';
  // Map short name back to a taskType for the registry lookup
  const taskType = tier === 'search' ? 'search' : tier === 'think' ? 'think' : 'execute';
  const candidates = modelRegistry.getModelsForTask(taskType, registryProvider);
  // Find the registry entry whose name substring matches the short name
  const match = candidates.find(m => m.id.toLowerCase().includes(shortName.toLowerCase()));
  return match ? match.id : shortName;
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
  if (!profile?.providers?.openai?.enabled) return 'claude';

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
  const { provider, model, effort, dualBrain, workStyle, challengerModel } = decision;
  const { intent = 'task', risk = 'low', complexity = 'simple', tier = 'execute' } = detection;
  const healthScores = decision._healthScores || {};
  const mode = profile?.mode || profile?.profile || 'auto';

  const ws = decision._workStyle ?? getWorkStyle(profile);
  const wsLabel = ws.label ?? workStyle ?? 'Balanced';
  const modelLabel = effort ? `${model} ${effort}` : model;

  if (dualBrain && challengerModel) {
    return `${wsLabel} mode: ${modelLabel} for ${intent}, ${challengerModel} challenger on ${risk}-risk changes.`;
  }
  if (dualBrain) {
    return `${wsLabel} mode: ${modelLabel} with dual-brain review because this ${intent} change is ${risk} risk.`;
  }
  // Health-based explanations
  const claudeScore = healthScores.claude ?? 100;
  const providerScore = healthScores[provider] ?? 100;
  if (claudeScore === 0 && provider === 'openai') {
    return `${wsLabel} mode: using ${modelLabel} because Claude is rate-limited and this is an isolated ${tier} task.`;
  }
  if (providerScore < 50) {
    return `${wsLabel} mode: using ${modelLabel} (downgraded due to rate-limit cooldown) for this ${complexity} ${intent}.`;
  }
  if (mode === 'cost-saver') {
    return `${wsLabel} mode: using ${modelLabel} (cost-saver bias) for ${risk}-risk ${intent}.`;
  }
  if (mode === 'quality-first') {
    return `${wsLabel} mode: using ${modelLabel} (quality-first bias) for ${intent}.`;
  }
  if (THINK_INTENTS.includes(intent)) {
    return `${wsLabel} mode: ${modelLabel} for ${intent} — deep reasoning needed.`;
  }
  if (tier === 'search' || SEARCH_INTENTS.includes(intent)) {
    return `${wsLabel} mode: ${modelLabel} for lightweight ${intent} lookup.`;
  }
  return `${wsLabel} mode: ${modelLabel} for ${intent} (${risk} risk, ${provider} healthy).`;
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
 * @param {{ profile: object, detection: object, cwd?: string, thinkResult?: object, sessionContext?: object }} input
 * @returns {object} Routing decision
 */
export function decideRoute({ profile = {}, detection = {}, cwd, thinkResult, sessionContext = null } = {}) {
  const available = getAvailableModels(profile);

  // Resolve active work style
  const workStyle = getWorkStyle(profile);

  // Parse free-text user preferences into routing signals
  const prefSignals = parsePreferences(profile.preferences);

  // Apply bias override from preferences (takes precedence over profile.bias)
  const profileWithEffectiveBias = prefSignals.biasOverride
    ? { ...profile, mode: prefSignals.biasOverride }
    : profile;

  const { tier = 'execute', risk = 'low', complexity = 'simple', effort: detectionEffort } = detection;
  const isHighStakes = ['critical', 'high'].includes(risk);

  // Determine whether to use the complexWorker (Opus) or defaultWorker (Sonnet).
  // "High reasoning depth" means: think-tier intent, high/critical risk, or complex+high-risk.
  const needsDeepReasoning =
    THINK_INTENTS.includes(detection.intent || '') ||
    risk === 'critical' ||
    (complexity === 'complex' && ['high', 'critical'].includes(risk)) ||
    detectionEffort === 'xhigh';

  // Get health scores for current tier
  const healthScores = getHealthScores(tier, cwd);

  // Choose provider (using the bias-patched profile so chooseProvider sees the right mode)
  let provider = chooseProvider(detection, profileWithEffectiveBias, healthScores);

  // Apply preferProvider / avoidProvider signals from preferences
  if (prefSignals.preferProvider) {
    const preferred = prefSignals.preferProvider;
    const prefEnabled = profile?.providers?.[preferred]?.enabled;
    const prefScore   = healthScores[preferred] ?? 0;
    if (prefEnabled && prefScore > 0) provider = preferred;
  }
  if (prefSignals.avoidProvider && provider === prefSignals.avoidProvider) {
    const other = prefSignals.avoidProvider === 'claude' ? 'openai' : 'claude';
    const otherEnabled = profile?.providers?.[other]?.enabled;
    const otherScore   = healthScores[other] ?? 0;
    if (otherEnabled && otherScore > 0) provider = other;
  }

  // Select base model using work style worker assignments.
  // For Claude primary: use complexWorker (opus) on deep reasoning, defaultWorker (sonnet) otherwise.
  // For OpenAI primary: mirror the same logic using GPT equivalents.
  //
  // Hardcoded fallback models (used when model registry is unavailable):
  const _fallbackClaude = (() => {
    const wantOpus = needsDeepReasoning && workStyle.key !== 'fast';
    const fb = wantOpus && available.claude.includes('opus') ? 'opus' : 'sonnet';
    return available.claude.includes(fb) ? fb : (available.claude[available.claude.length - 1] ?? 'sonnet');
  })();
  const _fallbackOpenAI = (() => {
    const wantO3 = needsDeepReasoning && workStyle.key === 'fullpower';
    const fb = wantO3 && available.openai.includes('o3') ? 'o3' : 'gpt-4o';
    return available.openai.includes(fb) ? fb : (available.openai[available.openai.length - 1] ?? 'gpt-4o');
  })();

  let model;
  if (modelRegistry) {
    // Use registry to pick best model for the tier/provider.
    // Map decide.mjs tier to registry taskType and constraints.
    const registryProvider = provider === 'claude' ? 'anthropic' : 'openai';
    const taskType = tier === 'search' ? 'search'
      : tier === 'think'  ? 'think'
      : 'execute';
    const constraints = {
      provider: registryProvider,
      ...(tier === 'search' && { preferSpeed: true }),
      ...(tier === 'think'  && { requireReasoning: true }),
      ...(!needsDeepReasoning && workStyle.key === 'fast' && { maxCost: 'medium' }),
    };
    const registryResult = modelRegistry.getBestModel(taskType, constraints);
    if (registryResult) {
      // Registry returns full model IDs (e.g. 'claude-sonnet-4-6').
      // dispatch.mjs mapToAgentModel handles both short names and full IDs.
      model = registryResult.id;
    } else {
      // Registry found no match — use hardcoded fallback
      model = provider === 'claude' ? _fallbackClaude : _fallbackOpenAI;
    }
  } else {
    // Registry unavailable — use existing hardcoded selection
    model = provider === 'claude' ? _fallbackClaude : _fallbackOpenAI;
  }

  // The internal pipeline (health downgrade, profile bias, safety floor) operates on
  // short model names ('haiku', 'sonnet', 'opus', 'gpt-4o', etc.) and the available[]
  // arrays use the same short names. Normalize a full model ID to short name first so
  // that rank lookups work correctly, then restore the full ID at the end.
  model = toShortName(model, provider);

  // Apply health-based downgrade (only if score < 50 and not high-stakes)
  model = applyHealthDowngrade(model, healthScores[provider], provider, available[provider], isHighStakes);

  // Apply profile mode bias (cost-saver / quality-first / preferences) using patched profile
  model = applyProfileBias(model, profileWithEffectiveBias, provider, available[provider], detection.tier);

  // Think-engine tier hint: use as a HINT to allow cheaper model when think-engine
  // classifies the task as recall/quick. Never escalate — only downgrade when safe to do so.
  let thinkTier = null;
  try {
    if (thinkResult?.tier) thinkTier = thinkResult.tier;
  } catch (e) {}

  if (thinkTier && !isHighStakes) {
    const claudeRankAsc = ['haiku', 'sonnet', 'opus'];
    const openaiRankAsc = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];

    if (thinkTier === 'recall' && provider === 'claude') {
      // recall → haiku is fine if available
      const target = 'haiku';
      const currentIdx = claudeRankAsc.indexOf(model);
      const targetIdx  = claudeRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.claude.includes(target)) {
        model = target;
      }
    } else if (thinkTier === 'recall' && provider === 'openai') {
      const target = 'gpt-4o-mini';
      const currentIdx = openaiRankAsc.indexOf(model);
      const targetIdx  = openaiRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.openai.includes(target)) {
        model = target;
      }
    } else if (thinkTier === 'quick' && provider === 'claude') {
      // quick → sonnet is sufficient
      const target = 'sonnet';
      const currentIdx = claudeRankAsc.indexOf(model);
      const targetIdx  = claudeRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.claude.includes(target)) {
        model = target;
      }
    } else if (thinkTier === 'quick' && provider === 'openai') {
      const target = 'gpt-4o';
      const currentIdx = openaiRankAsc.indexOf(model);
      const targetIdx  = openaiRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.openai.includes(target)) {
        model = target;
      }
    }
    // 'standard', 'deep', 'ultra' — leave model unchanged; existing routing already picked correctly
  }

  // Session context: escalate or prefer model based on cross-session history
  if (sessionContext) {
    const sessionAttempts = Array.isArray(sessionContext.priorAttempts) ? sessionContext.priorAttempts : [];
    const sessionFailures = sessionAttempts.filter(a => a && (a.failed || a.status === 'failed'));
    const sessionSuccesses = sessionAttempts.filter(a => a && !a.failed && a.status !== 'failed');

    // Prior failures on similar work → escalate from sonnet to opus (Claude) or gpt-4o to o3 (OpenAI)
    if (sessionFailures.length >= 2 && !isHighStakes) {
      if (provider === 'claude') {
        const claudeRank = ['haiku', 'sonnet', 'opus'];
        const currentIdx = claudeRank.indexOf(toShortName(model, 'claude'));
        if (currentIdx !== -1 && currentIdx < claudeRank.length - 1) {
          const escalated = claudeRank[currentIdx + 1];
          if (available.claude.includes(escalated)) model = escalated;
        }
      } else {
        const oaiRank = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];
        const currentIdx = oaiRank.indexOf(model);
        if (currentIdx !== -1 && currentIdx < oaiRank.length - 1) {
          const escalated = oaiRank[currentIdx + 1];
          if (available.openai.includes(escalated)) model = escalated;
        }
      }
    }

    // Prior successful approach → prefer same provider/model that worked before
    if (sessionSuccesses.length > 0) {
      const lastSuccess = sessionSuccesses[sessionSuccesses.length - 1];
      if (lastSuccess.provider && lastSuccess.model && !isHighStakes) {
        const successProvider = lastSuccess.provider;
        const successModel = lastSuccess.model;
        const providerEnabled = profile?.providers?.[successProvider]?.enabled;
        const providerHealthy = (healthScores[successProvider] ?? 0) > 0;
        if (providerEnabled && providerHealthy) {
          const shortSuccess = toShortName(successModel, successProvider);
          if (available[successProvider]?.includes(shortSuccess)) {
            provider = successProvider;
            model = shortSuccess;
          }
        }
      }
    }
  }

  // Safety floor: critical-risk tasks must never use haiku/gpt-4.1-mini even in cost-saver mode
  model = applyCriticalRiskFloor(model, provider, available[provider], detection.risk);

  // Apply preferModel signal from preferences (override after all other picks)
  if (prefSignals.preferModel) {
    const wantedModel = prefSignals.preferModel;
    if (available[provider]?.includes(wantedModel)) {
      model = wantedModel;
    }
  }

  // Restore full model ID from registry if the pipeline kept the same short name it started with.
  // If the pipeline changed the model (downgrade/bias/floor), resolve the new short name to a full ID.
  model = toFullModelId(model, provider, tier);

  // ── Routing advisor: consult learned EMA model for this task type ─────────
  // Non-blocking: only overrides when advisor has enough observations (confidence > 0.3).
  // Uses short model names; advisor only covers Claude models (haiku/sonnet/opus).
  let _advisorOverride = null;
  if (routingAdvisor && provider === 'claude') {
    try {
      const advice = routingAdvisor.adviseModel(
        { intent: detection.intent, tier, risk: detection.risk },
        cwd
      );
      if (advice.confidence > 0.3 && advice.model) {
        const advisorShort = advice.model; // advisor returns short names
        const previousModel = toShortName(model, 'claude');
        if (advisorShort !== previousModel && available.claude.includes(advisorShort)) {
          const overrideFullId = toFullModelId(advisorShort, 'claude', tier);
          _advisorOverride = { from: model, to: overrideFullId, reason: advice.reason, explored: advice.explored };
          model = overrideFullId;
        }
      }
    } catch { /* non-blocking */ }
  }

  // ── Challenger / dual-brain decision ─────────────────────────────────────
  const hasBothProviders = !!(
    profile?.providers?.claude?.enabled &&
    profile?.providers?.openai?.enabled
  );

  // Work-style challenger: triggered by challengerPolicy + risk level
  const challengerTriggered = shouldTriggerChallenger(
    workStyle.challengerPolicy,
    risk,
    hasBothProviders,
  );

  // Legacy designImpact dual-brain gate (mandatory review, bypass hasBothProviders check)
  const legacyDualBrain = !!(detection.designImpact && profile?.dual_brain_enabled !== false);

  // Preference overrides
  let dual = challengerTriggered || legacyDualBrain || shouldDualBrain(detection, profile);
  if (prefSignals.alwaysDualBrain) dual = true;
  if (prefSignals.neverDualBrain)  dual = false;

  // When only one provider available and challenger was the reason, downgrade to single-brain
  if (dual && !hasBothProviders && !legacyDualBrain) dual = false;

  const degradedDualBrain = !!(legacyDualBrain && !hasBothProviders);

  // Pick challenger model (from the opposing provider)
  const challengerModel = dual ? pickChallengerModel(provider, available) : null;

  // Determine effort, modes, sandbox
  const effort  = pickEffort(model, detection);
  const modes   = pickModes(model, detection);
  const sandbox = pickSandbox(model, detection);

  const decision = {
    provider,
    model,
    effort,
    tier,
    dualBrain: dual,
    ...(degradedDualBrain && { degradedDualBrain: true }),
    ...(challengerModel    && { challengerModel }),
    workStyle: workStyle.key,
    modes,
    sandbox,
    explanation: '',
    _healthScores: healthScores,
    _workStyle: workStyle,
    ...(_advisorOverride   && { _advisorOverride }),
  };

  decision.explanation = explainDecision(decision, detection, profileWithEffectiveBias);

  // Remove internal fields from public output
  const { _healthScores, _workStyle, ...result } = decision;
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

  const claudeEnabled = !!(profile?.providers?.claude?.enabled);
  const openaiEnabled = !!(profile?.providers?.openai?.enabled);

  const fallbacks = [];

  if (failedProvider === 'claude') {
    // Same-provider fallbacks: other Claude models (skip the one that just failed)
    for (const m of claudeRank) {
      if (m === failedModel) continue;
      if (!available.claude.includes(m)) continue;
      fallbacks.push({ provider: 'claude', model: m, label: `Claude ${m}` });
    }
    // Cross-provider fallbacks: OpenAI models
    if (openaiEnabled) {
      for (const m of openaiRank) {
        if (!available.openai.includes(m)) continue;
        fallbacks.push({ provider: 'openai', model: m, label: `OpenAI ${m}` });
      }
    }
  } else {
    // Same-provider fallbacks: other OpenAI models (skip the one that just failed)
    for (const m of openaiRank) {
      if (m === failedModel) continue;
      if (!available.openai.includes(m)) continue;
      fallbacks.push({ provider: 'openai', model: m, label: `OpenAI ${m}` });
    }
    // Cross-provider fallbacks: Claude models
    if (claudeEnabled) {
      for (const m of claudeRank) {
        if (!available.claude.includes(m)) continue;
        fallbacks.push({ provider: 'claude', model: m, label: `Claude ${m}` });
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
