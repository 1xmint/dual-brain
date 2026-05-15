#!/usr/bin/env node
/**
 * decide.mjs — Routing decision module for the Dual-Brain Orchestrator.
 *
 * Given a task detection + user profile, decides which provider/model/effort/mode
 * to use and explains why in one sentence.
 *
 * Exports: decideRoute, getModelCapabilities, getAvailableModels,
 *          estimateBudgetPressure, shouldDualBrain, explainDecision
 *
 * CLI: node src/decide.mjs --profile /path/to/profile.json \
 *        --detection '{"intent":"edit","risk":"low","complexity":"simple","effort":"medium","tier":"execute"}'
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE   = join(__dirname, '..');
const USAGE_DIR   = join(WORKSPACE, '.dualbrain', 'usage');
const FIVE_HRS_MS = 5 * 60 * 60 * 1000;

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
  'gpt-5.4': {
    provider: 'openai',
    tierFit: ['execute', 'think'],
    contextWindow: 200_000,
    strengths: ['refactor', 'debug', 'code-generation', 'test'],
    weaknesses: ['cost'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'],
    costTier: 'medium',
  },
  'gpt-5.5': {
    provider: 'openai',
    tierFit: ['think'],
    contextWindow: 200_000,
    strengths: ['architecture', 'security', 'review', 'planning', 'complex-debug'],
    weaknesses: ['cost', 'latency'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'],
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
  '$20':  ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini'],
  '$100': ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
  '$200': ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
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
 * @param {{ subscriptions?: { claude?: { plan?: string }, openai?: { plan?: string } } }} profile
 * @returns {{ claude: string[], openai: string[] }}
 */
export function getAvailableModels(profile) {
  const claudePlan = profile?.subscriptions?.claude?.plan || '$100';
  const openaiPlan = profile?.subscriptions?.openai?.plan || '$20';
  return {
    claude: CLAUDE_MODELS_BY_PLAN[claudePlan] ?? CLAUDE_MODELS_BY_PLAN['$100'],
    openai: OPENAI_MODELS_BY_PLAN[openaiPlan] ?? OPENAI_MODELS_BY_PLAN['$20'],
  };
}

// ─── Exported: estimateBudgetPressure ─────────────────────────────────────────

/**
 * Read recent usage logs from .dualbrain/usage/ and estimate current pressure.
 * Returns { claude: 0-1, openai: 0-1 }. If no logs, returns 0 for both.
 * @param {object} profile
 * @param {string} [cwd]
 * @returns {{ claude: number, openai: number }}
 */
export function estimateBudgetPressure(profile, cwd) {
  const usageDir = cwd
    ? join(cwd, '.dualbrain', 'usage')
    : USAGE_DIR;

  const claudePlan = profile?.subscriptions?.claude?.plan || '$100';
  const openaiPlan = profile?.subscriptions?.openai?.plan || '$20';

  // Budget ceilings (5-hour execute tier as proxy for overall pressure)
  const BUDGETS = {
    claude: { '$20': 80_000, '$100': 350_000, '$200': 900_000 },
    openai: { '$20': 80_000, '$100': 200_000, '$200': 400_000 },
  };

  const claudeBudget = BUDGETS.claude[claudePlan] ?? 350_000;
  const openaiBudget = BUDGETS.openai[openaiPlan] ?? 80_000;

  if (!existsSync(usageDir)) return { claude: 0, openai: 0 };

  const cutoff = Date.now() - FIVE_HRS_MS;
  let claudeTokens = 0;
  let openaiTokens = 0;

  // Scan last 2 days of usage files
  for (let i = 0; i <= 1; i++) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const file = join(usageDir, `usage-${date}.jsonl`);
    if (!existsSync(file)) continue;
    let raw;
    try { raw = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const ts = Date.parse(rec.timestamp);
      if (isNaN(ts) || ts < cutoff) continue;
      const tokens = (rec.input_tokens ?? 0) + (rec.output_tokens ?? 0)
        || TOKEN_FALLBACK[rec.tier] || TOKEN_FALLBACK.execute;
      if (rec.provider === 'claude' || /haiku|sonnet|opus/i.test(rec.model || '')) {
        claudeTokens += tokens;
      } else {
        openaiTokens += tokens;
      }
    }
  }

  return {
    claude: Math.min(1, claudeTokens / claudeBudget),
    openai: Math.min(1, openaiTokens / openaiBudget),
  };
}

// ─── Exported: shouldDualBrain ────────────────────────────────────────────────

/**
 * Return true if both providers should analyze this task.
 * Requires: (critical risk OR architecture/security intent OR complex+high-risk)
 * AND profile has both providers available with dual mode enabled.
 * @param {{ intent?: string, risk?: string, complexity?: string }} detection
 * @param {object} profile
 * @returns {boolean}
 */
export function shouldDualBrain(detection, profile) {
  const { intent = '', risk = 'low', complexity = 'simple' } = detection;
  const dualEnabled = profile?.dual_brain_enabled !== false;
  const hasBothProviders = !!(
    profile?.subscriptions?.claude?.plan &&
    profile?.subscriptions?.openai?.plan
  );
  if (!dualEnabled || !hasBothProviders) return false;

  const criticalRisk      = risk === 'critical';
  const archOrSecurity    = ['architecture', 'security'].includes(intent);
  const complexHighRisk   = complexity === 'complex' && risk === 'high';

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

  const pref = needsTop    ? 'gpt-5.5'
             : needsMini   ? 'gpt-4.1-mini'
             : needsCodex  ? 'gpt-5.3-codex'
             : 'gpt-5.4';

  // Walk down rank until we find an available model
  const rank = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'];
  const idx = rank.indexOf(pref);
  for (let i = idx; i >= 0; i--) {
    if (available.includes(rank[i])) return rank[i];
  }
  return available[0] ?? 'gpt-4.1-mini';
}

function applyPressureDowngrade(model, pressure, provider, available, isHighStakes) {
  if (pressure <= 0.7 || isHighStakes) return model;

  if (provider === 'claude') {
    const claudeRank = ['haiku', 'sonnet', 'opus'];
    const idx = claudeRank.indexOf(model);
    const steps = pressure > 0.9 ? 2 : 1;
    const downIdx = Math.max(0, idx - steps);
    for (let i = downIdx; i <= idx; i++) {
      if (available.includes(claudeRank[i])) return claudeRank[i];
    }
    return available[0] ?? 'haiku';
  } else {
    const oaiRank = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'];
    const idx = oaiRank.indexOf(model);
    const steps = pressure > 0.9 ? 2 : 1;
    const downIdx = Math.max(0, idx - steps);
    for (let i = downIdx; i <= idx; i++) {
      if (available.includes(oaiRank[i])) return oaiRank[i];
    }
    return available[0] ?? 'gpt-4.1-mini';
  }
}

function applyProfileBias(model, profile, provider, available) {
  const mode = profile?.mode || profile?.profile || 'auto';
  if (mode === 'cost-saver') {
    // Prefer cheapest available
    const ranks = {
      claude: ['haiku', 'sonnet', 'opus'],
      openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
    };
    for (const m of ranks[provider]) {
      if (available.includes(m)) return m;
    }
  }
  if (mode === 'quality-first') {
    // Prefer best available, keep current if already best
    const ranks = {
      claude: ['opus', 'sonnet', 'haiku'],
      openai: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.4-mini', 'gpt-5.2', 'gpt-4.1', 'gpt-4.1-mini'],
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
  const thinkingModels = ['sonnet', 'opus', 'gpt-5.5', 'gpt-5.4'];
  const lightIntents   = ['search', 'format', 'explain', 'lookup'];

  return {
    extendedThinking: thinkingModels.includes(model)
      && ['moderate', 'complex'].includes(complexity)
      && !lightIntents.includes(intent),
    fastMode:         model === 'opus',
    extendedContext:  ['sonnet', 'opus'].includes(model),
    webSearch:        ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.4-mini'].includes(model),
  };
}

function pickSandbox(model, detection) {
  const { tier = 'execute' } = detection;
  if (tier === 'search') return 'read-only';
  if (MODEL_CAPABILITIES[model]?.provider === 'openai') return 'danger-full-access';
  return 'workspace-write';
}

function chooseProvider(detection, profile, pressure) {
  const { tier = 'execute', intent = '' } = detection;
  const claudePressure = pressure.claude;
  const openaiPressure = pressure.openai;

  // Both throttled → pick least throttled
  if (claudePressure > 0.9 && openaiPressure > 0.9) {
    return claudePressure <= openaiPressure ? 'claude' : 'openai';
  }

  // Think-tier strongly prefers Claude (session context coupling)
  if (THINK_INTENTS.includes(intent) && claudePressure < 0.9) return 'claude';

  // Claude throttled → route to OpenAI
  if (claudePressure > 0.9) return 'openai';
  // OpenAI not configured → use Claude
  if (!profile?.subscriptions?.openai?.plan) return 'claude';

  // Isolated execute tasks can go to OpenAI if Claude is warm
  if (tier === 'execute' && !THINK_INTENTS.includes(intent)) {
    if (claudePressure > 0.55 && openaiPressure < claudePressure) return 'openai';
  }

  // Default: Claude (lower session-context overhead)
  return 'claude';
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
  const pressure = decision._pressure || { claude: 0, openai: 0 };
  const mode = profile?.mode || profile?.profile || 'auto';

  const modelLabel = effort ? `${model} ${effort}` : model;

  if (dualBrain) {
    return `Using ${modelLabel} with dual-brain review because this ${intent} change is ${risk} risk.`;
  }
  if (pressure.claude > 0.9 && provider === 'openai') {
    return `Using ${modelLabel} because Claude is throttled and this is an isolated ${tier} task.`;
  }
  if (pressure[provider] > 0.7) {
    return `Using ${modelLabel} (downgraded due to budget pressure) for this ${complexity} ${intent}.`;
  }
  if (mode === 'cost-saver') {
    return `Using ${modelLabel} because cost-saver mode prefers cheaper models for ${risk}-risk work.`;
  }
  if (mode === 'quality-first') {
    return `Using ${modelLabel} because quality-first mode prefers stronger models for ${intent}.`;
  }
  if (THINK_INTENTS.includes(intent)) {
    return `Using ${modelLabel} because ${intent} tasks need deep reasoning and Claude has budget headroom.`;
  }
  if (tier === 'search' || SEARCH_INTENTS.includes(intent)) {
    return `Using ${modelLabel} because this is a simple ${intent} with low risk.`;
  }
  return `Using ${modelLabel} because Claude has budget headroom and this is a routine ${intent}.`;
}

// ─── Exported: decideRoute ────────────────────────────────────────────────────

/**
 * Main routing decision function.
 * @param {{ profile: object, detection: object, cwd?: string }} input
 * @returns {object} Routing decision
 */
export function decideRoute({ profile = {}, detection = {}, cwd } = {}) {
  const available    = getAvailableModels(profile);
  const pressure     = estimateBudgetPressure(profile, cwd);
  const dual         = shouldDualBrain(detection, profile);
  const { tier = 'execute', risk = 'low' } = detection;
  const isHighStakes = ['critical', 'high'].includes(risk);

  // Choose provider
  const provider = chooseProvider(detection, profile, pressure);

  // Select base model
  let model = provider === 'claude'
    ? pickClaudeModel(detection, available.claude)
    : pickOpenAIModel(detection, available.openai);

  // Apply budget pressure downgrade
  model = applyPressureDowngrade(model, pressure[provider], provider, available[provider], isHighStakes);

  // Apply profile mode bias (cost-saver / quality-first / preferences)
  model = applyProfileBias(model, profile, provider, available[provider]);

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
    modes,
    sandbox,
    explanation: '',
    _pressure: pressure,
  };

  decision.explanation = explainDecision(decision, detection, profile);

  // Remove internal field from public output
  const { _pressure, ...result } = decision;
  return result;
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
