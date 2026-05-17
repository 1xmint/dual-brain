#!/usr/bin/env node
/**
 * decide.ts — Routing decision module for the Dual-Brain Orchestrator.
 *
 * Given a task detection + user profile, decides which provider/model/effort/mode
 * to use and explains why in one sentence.
 *
 * Exports: decideRoute, getModelCapabilities, getAvailableModels,
 *          WORK_STYLES, getWorkStyle, estimateBudgetPressure,
 *          shouldDualBrain, explainDecision, getFailoverOrder
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore — health.mjs not yet migrated
import { getProviderScore, checkCooldown } from './health.js';

import type { Provider, Tier, Risk, Complexity, DispatchDecision, FailoverOption } from './types.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKSPACE  = join(__dirname, '..');

// ─── Model Registry (optional, lazy-loaded) ───────────────────────────────────

let modelRegistry: typeof import('./models.js') | null = null;
let _registryLoadAttempted = false;

function _loadModelRegistry(): void {
  if (_registryLoadAttempted) return;
  _registryLoadAttempted = true;
  import('./models.js').then(mod => {
    modelRegistry = mod;
  }).catch(() => {});
}

_loadModelRegistry();

// ─── Routing Advisor (optional, lazy-loaded) ──────────────────────────────────

interface RoutingAdvisorModule {
  adviseModel(context: { intent: string; tier: string; risk: string }, cwd?: string): {
    confidence: number;
    model: string | null;
    reason: string;
    explored: boolean;
  };
}

let routingAdvisor: RoutingAdvisorModule | null = null;
let _advisorLoadAttempted = false;

function _loadRoutingAdvisor(): void {
  if (_advisorLoadAttempted) return;
  _advisorLoadAttempted = true;
  // @ts-ignore — routing-advisor.mjs not yet migrated
  import('./routing-advisor.js').then(mod => {
    routingAdvisor = mod as unknown as RoutingAdvisorModule;
  }).catch(() => {});
}

_loadRoutingAdvisor();

// ─── Work Styles ─────────────────────────────────────────────────────────────

export interface WorkStyleDef {
  label: string;
  defaultWorker: string;
  complexWorker: string;
  challengerPolicy: 'never' | 'high-risk' | 'medium-risk';
  checkpointPolicy: 'never' | 'risky-ops' | 'all-edits';
  reviewPolicy: string;
  description: string;
}

export const WORK_STYLES: Record<string, WorkStyleDef> = {
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
    challengerPolicy: 'high-risk',
    checkpointPolicy: 'risky-ops',
    reviewPolicy: 'important',
    description: 'Smart routing, reviews on important changes',
  },
  fullpower: {
    label: 'Full Power',
    defaultWorker: 'claude-sonnet-4-6',
    complexWorker: 'claude-opus-4-6',
    challengerPolicy: 'medium-risk',
    checkpointPolicy: 'all-edits',
    reviewPolicy: 'non-trivial',
    description: 'Deep reasoning, dual-brain on everything that matters',
  },
};

export interface WorkStyleWithKey extends WorkStyleDef {
  key: string;
}

export function getWorkStyle(profile: { workStyle?: string; work_style?: string } | undefined): WorkStyleWithKey {
  const key = profile?.workStyle || profile?.work_style || 'balanced';
  const style = WORK_STYLES[key] ?? WORK_STYLES.balanced;
  return { ...style, key: WORK_STYLES[key] ? key : 'balanced' };
}

// ─── Model Capabilities ─────────────────────────────────────────────────────

interface ModelCapability {
  provider: string;
  tierFit: string[];
  contextWindow: number;
  strengths: string[];
  weaknesses: string[];
  effortLevels: string[] | null;
  costTier: string;
}

const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  haiku: {
    provider: 'claude', tierFit: ['search'], contextWindow: 200_000,
    strengths: ['search', 'format', 'lookup', 'classification', 'grep-analysis'],
    weaknesses: ['complex-edits', 'architecture', 'security', 'multi-file-refactor'],
    effortLevels: null, costTier: 'cheap',
  },
  sonnet: {
    provider: 'claude', tierFit: ['execute', 'search'], contextWindow: 200_000,
    strengths: ['edit', 'refactor', 'test', 'debug', 'code-generation', 'tool-use'],
    weaknesses: ['deep-architecture', 'ambiguous-requirements', 'frontier-reasoning'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'], costTier: 'medium',
  },
  opus: {
    provider: 'claude', tierFit: ['think', 'execute'], contextWindow: 200_000,
    strengths: ['architecture', 'security', 'complex-debug', 'review', 'planning', 'threat-modeling'],
    weaknesses: ['cost', 'overkill-for-simple-tasks'],
    effortLevels: ['low', 'medium', 'high', 'xhigh'], costTier: 'expensive',
  },
  'gpt-4.1-mini': {
    provider: 'openai', tierFit: ['search'], contextWindow: 1_047_576,
    strengths: ['search', 'format', 'classification', 'fast-lookups'],
    weaknesses: ['complex-refactors', 'architecture', 'multi-file-edits'],
    effortLevels: ['low', 'medium', 'high'], costTier: 'cheap',
  },
  'gpt-4.1': {
    provider: 'openai', tierFit: ['execute', 'search'], contextWindow: 1_047_576,
    strengths: ['edit', 'code-generation', 'simple-refactor'],
    weaknesses: ['architecture', 'security', 'complex-debug'],
    effortLevels: ['low', 'medium', 'high'], costTier: 'medium',
  },
  'gpt-4o': {
    provider: 'openai', tierFit: ['execute', 'think'], contextWindow: 128_000,
    strengths: ['refactor', 'debug', 'code-generation', 'test', 'multimodal'],
    weaknesses: ['cost vs mini'],
    effortLevels: ['low', 'medium', 'high'], costTier: 'medium',
  },
  'gpt-4o-mini': {
    provider: 'openai', tierFit: ['search'], contextWindow: 128_000, costTier: 'cheap',
    strengths: ['quick-tasks', 'search', 'classification'],
    weaknesses: ['complex-edits', 'architecture'],
    effortLevels: null,
  },
  'o3': {
    provider: 'openai', tierFit: ['think'], contextWindow: 200_000,
    strengths: ['architecture', 'security', 'review', 'planning', 'complex-debug', 'deep-reasoning'],
    weaknesses: ['cost', 'latency'],
    effortLevels: ['low', 'medium', 'high'], costTier: 'expensive',
  },
};

const WORK_MODELS = {
  execute: 'claude-sonnet-4-6',
  think: 'claude-opus-4-6',
  search: 'claude-haiku-4-5-20251001',
  challengerGpt: 'o3',
  challengerGptFallback: 'gpt-4o',
  searchGpt: 'gpt-4o-mini',
};

export function getModelCapabilities(model: string): ModelCapability | null {
  return MODEL_CAPABILITIES[model] ?? null;
}

export function getAvailableModels(profile: { providers?: Record<string, { enabled?: boolean; models?: string[] }> }): { claude: string[]; openai: string[] } {
  const ALL_CLAUDE = detectClaudeModels() || ['haiku', 'sonnet', 'opus'];
  const ALL_OPENAI = detectCodexModels() || ['gpt-5.5', 'gpt-5.4', 'gpt-5.2-codex', 'gpt-5.1-codex-max', 'gpt-5.1-codex', 'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini', 'o3'];

  const claudeModels = profile?.providers?.claude?.models;
  const openaiModels = profile?.providers?.openai?.models;

  return {
    claude: Array.isArray(claudeModels) ? claudeModels : ALL_CLAUDE,
    openai: Array.isArray(openaiModels) ? openaiModels : ALL_OPENAI,
  };
}

let _claudeModelCache: { models: string[] | null; checkedAt: number; source: string } = {
  models: null,
  checkedAt: 0,
  source: 'fallback',
};

let _codexModelCache: { models: string[] | null; checkedAt: number } = { models: null, checkedAt: 0 };

function detectClaudeModels(): string[] | null {
  const now = Date.now();
  if (now - _claudeModelCache.checkedAt < 60_000) return _claudeModelCache.models;
  _claudeModelCache.checkedAt = now;
  try {
    const raw = execSync('claude --help', { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    if (!raw.includes('--model')) {
      _claudeModelCache.models = null;
      _claudeModelCache.source = 'unavailable';
      return null;
    }
    const aliases = ['default', 'haiku', 'sonnet', 'opus']
      .filter(alias => alias === 'default' || raw.toLowerCase().includes(alias) || ['haiku', 'sonnet', 'opus'].includes(alias));
    _claudeModelCache.models = aliases.length ? aliases : ['haiku', 'sonnet', 'opus'];
    _claudeModelCache.source = 'claude-cli-aliases';
  } catch {
    _claudeModelCache.models = null;
    _claudeModelCache.source = 'fallback';
  }
  return _claudeModelCache.models;
}

function detectCodexModels(): string[] | null {
  const now = Date.now();
  if (now - _codexModelCache.checkedAt < 60_000) return _codexModelCache.models;
  _codexModelCache.checkedAt = now;
  try {
    const raw = execSync('codex debug models', { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(raw) as { models?: Array<{ slug?: string; visibility?: string }> };
    const models = (parsed.models || [])
      .map(m => m.slug)
      .filter((slug): slug is string => !!slug && /^(gpt|o\d)/i.test(slug));
    const unique = [...new Set(models)];
    _codexModelCache.models = unique.length ? unique : null;
  } catch {
    _codexModelCache.models = null;
  }
  return _codexModelCache.models;
}

function rankOpenAIModels(models: string[], purpose: 'head' | 'search' | 'execute' | 'think'): string[] {
  const patterns: Record<typeof purpose, RegExp[]> = {
    head: [
      /^gpt-5\.5$/i, /^gpt-5\.4$/i, /^gpt-5\.2-codex$/i, /^gpt-5\.1-codex-max$/i, /^gpt-5\.1-codex$/i,
      /^gpt-5\.2$/i, /^gpt-5\.1$/i, /^gpt-5$/i, /^o3$/i, /^gpt-4o$/i,
    ],
    search: [
      /mini/i, /nano/i, /^gpt-4o-mini$/i, /^gpt-4\.1-mini$/i, /^o4-mini$/i, /^gpt-5\.5$/i,
    ],
    execute: [
      /^gpt-5\.5$/i, /^gpt-5\.4$/i, /codex/i, /^gpt-5\.2$/i, /^gpt-5\.1$/i, /^gpt-4\.1$/i, /^gpt-4o$/i,
    ],
    think: [
      /^gpt-5\.5$/i, /^gpt-5\.4$/i, /^gpt-5\.2-codex$/i, /^gpt-5\.1-codex-max$/i, /^o3$/i, /codex/i,
    ],
  };
  return [...models].sort((a, b) => {
    const score = (m: string) => {
      const idx = patterns[purpose].findIndex(re => re.test(m));
      return idx === -1 ? 999 : idx;
    };
    return score(a) - score(b);
  });
}

export interface HeadRecommendation {
  provider: 'claude' | 'openai';
  model: string;
  effort?: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  reason: string;
  alternatives: Array<{ provider: 'claude' | 'openai'; model: string; reason: string }>;
}

export function recommendHeadModel(
  profile: { mode?: string; providers?: Record<string, { enabled?: boolean; models?: string[]; plan?: string }> },
): HeadRecommendation {
  const available = getAvailableModels(profile);
  const claudeEnabled = profile?.providers?.claude?.enabled !== false && available.claude.length > 0;
  const openaiEnabled = profile?.providers?.openai?.enabled !== false && available.openai.length > 0;
  const mode = String(profile?.mode || 'auto');
  const openaiHead = rankOpenAIModels(available.openai, mode === 'cost-saver' ? 'search' : 'head')[0];
  const claudeHead =
    mode === 'quality-first' && available.claude.includes('opus') ? 'opus' :
    available.claude.includes('sonnet') ? 'sonnet' :
    available.claude.includes('default') ? 'default' :
    available.claude[0];

  const alternatives: HeadRecommendation['alternatives'] = [];
  if (claudeEnabled && claudeHead) {
    alternatives.push({
      provider: 'claude',
      model: claudeHead,
      reason: claudeHead === 'sonnet' ? 'stable Claude Code daily-driver alias' : 'available Claude Code alias',
    });
  }
  if (openaiEnabled && openaiHead) {
    alternatives.push({
      provider: 'openai',
      model: openaiHead,
      reason: 'detected from local Codex model catalog',
    });
  }

  if (openaiEnabled && openaiHead && mode !== 'cost-saver') {
    return {
      provider: 'openai',
      model: openaiHead,
      effort: openaiHead.includes('5.') ? 'medium' : undefined,
      confidence: _codexModelCache.models ? 'high' : 'medium',
      source: _codexModelCache.models ? 'codex debug models' : 'static fallback',
      reason: `${openaiHead} is the strongest available GPT head candidate from the local Codex catalog; keep Claude available for comparison and failover.`,
      alternatives,
    };
  }

  if (claudeEnabled && claudeHead) {
    return {
      provider: 'claude',
      model: claudeHead,
      confidence: _claudeModelCache.source === 'claude-cli-aliases' ? 'high' : 'medium',
      source: _claudeModelCache.source,
      reason: `${claudeHead} is the best Claude Code head alias available locally; use GPT as the secondary execution/review brain.`,
      alternatives,
    };
  }

  return {
    provider: 'openai',
    model: openaiHead || 'gpt-5.5',
    effort: 'medium',
    confidence: 'low',
    source: 'fallback',
    reason: 'No live provider catalog was available, so this is a fallback recommendation.',
    alternatives,
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function pickChallengerModel(primaryProvider: string, available: { claude: string[]; openai: string[] }): string | null {
  if (primaryProvider === 'claude') {
    if (available.openai.includes(WORK_MODELS.challengerGpt)) return WORK_MODELS.challengerGpt;
    if (available.openai.includes(WORK_MODELS.challengerGptFallback)) return WORK_MODELS.challengerGptFallback;
    return null;
  } else {
    if (available.claude.includes('opus')) return WORK_MODELS.think;
    if (available.claude.includes('sonnet')) return WORK_MODELS.execute;
    return null;
  }
}

function shouldTriggerChallenger(challengerPolicy: string, risk: string, hasBothProviders: boolean): boolean {
  if (challengerPolicy === 'never' || !hasBothProviders) return false;
  if (challengerPolicy === 'high-risk') return ['high', 'critical'].includes(risk);
  if (challengerPolicy === 'medium-risk') return ['medium', 'high', 'critical'].includes(risk);
  return false;
}

export function estimateBudgetPressure(_profile: unknown, _cwd?: string): { claude: number; openai: number } {
  return { claude: 0, openai: 0 };
}

function getHealthScores(tier: string, cwd?: string): { claude: number; openai: number } {
  const claudeClass = tier === 'search' ? 'haiku' : tier === 'think' ? 'opus' : 'sonnet';
  const openaiClass = tier === 'search' ? 'gpt-4o-mini' : tier === 'think' ? 'o3' : 'gpt-4o';
  checkCooldown('claude', claudeClass, cwd);
  checkCooldown('openai', openaiClass, cwd);
  return {
    claude: getProviderScore('claude', claudeClass, cwd),
    openai: getProviderScore('openai', openaiClass, cwd),
  };
}

export function shouldDualBrain(detection: { intent?: string; risk?: string; complexity?: string; designImpact?: boolean }, profile: { dual_brain_enabled?: boolean; providers?: Record<string, { enabled?: boolean; plan?: string }> }): boolean {
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

  const criticalRisk = risk === 'critical';
  const archOrSecurity = ['architecture', 'security'].includes(intent);
  const complexHighRisk = complexity === 'complex' && risk === 'high';

  return criticalRisk || archOrSecurity || complexHighRisk;
}

const THINK_INTENTS = ['architecture', 'security', 'review', 'planning', 'compare'];
const SEARCH_INTENTS = ['search', 'format', 'explain', 'lookup'];

function pickClaudeModel(detection: { intent?: string; risk?: string; effort?: string }, available: string[]): string {
  const { intent = '', risk = 'low', effort = 'medium' } = detection;
  const needsOpus = THINK_INTENTS.includes(intent) || risk === 'critical' || effort === 'xhigh';
  const needsHaiku = SEARCH_INTENTS.includes(intent) && !['high', 'critical'].includes(risk);
  if (needsOpus && available.includes('opus')) return 'opus';
  if (needsHaiku && available.includes('haiku')) return 'haiku';
  return available.includes('sonnet') ? 'sonnet' : available[available.length - 1];
}

function pickOpenAIModel(detection: { intent?: string; risk?: string; complexity?: string; effort?: string }, available: string[]): string {
  const { intent = '', risk = 'low', complexity = 'simple', effort = 'medium' } = detection;
  const needsTop = THINK_INTENTS.includes(intent) || risk === 'critical' || effort === 'xhigh';
  const needsMini = SEARCH_INTENTS.includes(intent) && effort === 'low';
  const needsCodex = ['refactor', 'debug'].includes(intent) && complexity !== 'trivial';
  const purpose = needsTop ? 'think' : needsMini ? 'search' : needsCodex ? 'execute' : 'head';
  return rankOpenAIModels(available, purpose)[0] ?? available[0] ?? 'gpt-5.5';
}

function toShortName(model: string, provider: string): string {
  if (!model) return model;
  const m = model.toLowerCase();
  if (provider === 'claude') {
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('opus')) return 'opus';
    if (m.includes('sonnet')) return 'sonnet';
  }
  return model;
}

function toFullModelId(shortName: string, provider: string, tier: string): string {
  if (!modelRegistry) return shortName;
  const registryProvider = provider === 'claude' ? 'anthropic' : 'openai';
  const taskType = tier === 'search' ? 'search' : tier === 'think' ? 'think' : 'execute';
  const candidates = modelRegistry.getModelsForTask(taskType, registryProvider);
  const match = candidates.find(m => m.id.toLowerCase().includes(shortName.toLowerCase()));
  return match ? match.id : shortName;
}

function applyHealthDowngrade(model: string, score: number, provider: string, available: string[], isHighStakes: boolean): string {
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
    const oaiRank = rankOpenAIModels(available, 'execute').reverse();
    const idx = oaiRank.indexOf(model);
    const steps = score === 0 ? 2 : 1;
    const downIdx = Math.max(0, idx - steps);
    for (let i = downIdx; i <= idx; i++) {
      if (available.includes(oaiRank[i])) return oaiRank[i];
    }
    return available[0] ?? 'gpt-4o-mini';
  }
}

function applyProfileBias(model: string, profile: Record<string, unknown>, provider: string, available: string[], tier?: string): string {
  const mode = (profile?.mode || profile?.profile || 'auto') as string;
  if (mode === 'cost-saver') {
    const ranks: Record<string, string[]> = {
      claude: ['haiku', 'sonnet', 'opus'],
      openai: rankOpenAIModels(available, 'search'),
    };
    for (const m of ranks[provider]) {
      if (!available.includes(m)) continue;
      const caps = MODEL_CAPABILITIES[m];
      if (tier && caps && !caps.tierFit.includes(tier)) continue;
      return m;
    }
  }
  if (mode === 'quality-first') {
    const ranks: Record<string, string[]> = {
      claude: ['opus', 'sonnet', 'haiku'],
      openai: rankOpenAIModels(available, 'think'),
    };
    for (const m of ranks[provider]) {
      if (available.includes(m)) return m;
    }
  }
  const prefs = (profile?.preferences as Array<{ model?: string; for?: string }>) || [];
  for (const pref of prefs) {
    if (pref.model && available.includes(pref.model) &&
        pref.for && MODEL_CAPABILITIES[pref.model]?.strengths?.includes(pref.for)) {
      return pref.model;
    }
  }
  return model;
}

function pickEffort(model: string, detection: Record<string, unknown>): string | null {
  const caps = MODEL_CAPABILITIES[model];
  if (!caps?.effortLevels) return null;
  const { risk = 'low', complexity = 'simple', effort } = detection as { risk?: string; complexity?: string; effort?: string };
  if (effort && caps.effortLevels.includes(effort)) return effort;
  if (risk === 'critical' || complexity === 'complex') return 'xhigh';
  if (risk === 'high' || complexity === 'moderate') return 'high';
  if (risk === 'low' && complexity === 'trivial') return 'low';
  return 'medium';
}

function pickModes(model: string, detection: Record<string, unknown>): Record<string, boolean> {
  const { intent = '', complexity = 'simple' } = detection as { intent?: string; complexity?: string };
  const thinkingModels = ['sonnet', 'opus', 'o3', 'gpt-4o'];
  const lightIntents = ['search', 'format', 'explain', 'lookup'];
  return {
    extendedThinking: thinkingModels.includes(model)
      && ['moderate', 'complex'].includes(complexity)
      && !lightIntents.includes(intent),
    fastMode: model === 'opus',
    extendedContext: ['sonnet', 'opus'].includes(model),
    webSearch: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'].includes(model),
  };
}

function pickSandbox(model: string, detection: Record<string, unknown>): string {
  const { tier = 'execute' } = detection as { tier?: string };
  if (tier === 'search') return 'read-only';
  if (MODEL_CAPABILITIES[model]?.provider === 'openai') return 'workspace-write';
  return 'workspace-write';
}

function chooseProvider(detection: Record<string, unknown>, profile: Record<string, unknown>, healthScores: { claude: number; openai: number }): string {
  const { tier = 'execute', intent = '' } = detection as { tier?: string; intent?: string };
  const claudeScore = healthScores.claude;
  const openaiScore = healthScores.openai;
  const providers = profile?.providers as Record<string, { enabled?: boolean }> | undefined;
  if (!providers?.openai?.enabled) return 'claude';
  if (claudeScore === 0 && openaiScore === 0) {
    return claudeScore >= openaiScore ? 'claude' : 'openai';
  }
  if (THINK_INTENTS.includes(intent) && claudeScore > 0) return 'claude';
  if (claudeScore === 0 && openaiScore > 0) return 'openai';
  if (tier === 'execute' && !THINK_INTENTS.includes(intent)) {
    if (claudeScore < 100 && openaiScore > claudeScore) return 'openai';
  }
  return claudeScore >= openaiScore ? 'claude' : 'openai';
}

export function explainDecision(decision: Record<string, unknown>, detection: Record<string, unknown>, profile: Record<string, unknown>): string {
  const { provider, model, effort, dualBrain, workStyle, challengerModel } = decision as {
    provider: string; model: string; effort: string | null; dualBrain: boolean; workStyle: string; challengerModel?: string | null;
  };
  const { intent = 'task', risk = 'low', complexity = 'simple', tier = 'execute' } = detection as {
    intent?: string; risk?: string; complexity?: string; tier?: string;
  };
  const healthScores = (decision._healthScores || {}) as Record<string, number>;
  const mode = (profile?.mode || profile?.profile || 'auto') as string;
  const ws = (decision._workStyle ?? getWorkStyle(profile as { workStyle?: string })) as WorkStyleWithKey;
  const wsLabel = ws.label ?? workStyle ?? 'Balanced';
  const modelLabel = effort ? `${model} ${effort}` : model;

  if (dualBrain && challengerModel) {
    return `${wsLabel} mode: ${modelLabel} for ${intent}, ${challengerModel} challenger on ${risk}-risk changes.`;
  }
  if (dualBrain) {
    return `${wsLabel} mode: ${modelLabel} with dual-brain review because this ${intent} change is ${risk} risk.`;
  }
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

export interface PreferenceSignals {
  biasOverride: 'cost-saver' | 'quality-first' | null;
  preferProvider: 'claude' | 'openai' | null;
  avoidProvider: 'claude' | 'openai' | null;
  alwaysDualBrain: boolean;
  neverDualBrain: boolean;
  preferModel: string | null;
}

export function parsePreferences(preferences: Array<{ text: string; enabled: boolean; scope: string }> | undefined): PreferenceSignals {
  const active = (preferences || []).filter(p => p.enabled);
  const signals: PreferenceSignals = {
    biasOverride: null, preferProvider: null, avoidProvider: null,
    alwaysDualBrain: false, neverDualBrain: false, preferModel: null,
  };
  for (const pref of active) {
    const t = pref.text.toLowerCase();
    if (/cheap|save|budget|frugal|economical|cost/i.test(t)) signals.biasOverride = 'cost-saver';
    if (/quality|best|thorough|careful|premium/i.test(t)) signals.biasOverride = 'quality-first';
    if (/prefer claude|use claude|claude first/i.test(t)) signals.preferProvider = 'claude';
    if (/prefer (openai|gpt|chatgpt)|use (openai|gpt)/i.test(t)) signals.preferProvider = 'openai';
    if (/avoid claude|no claude/i.test(t)) signals.avoidProvider = 'claude';
    if (/avoid (openai|gpt)|no (openai|gpt)/i.test(t)) signals.avoidProvider = 'openai';
    if (/always/.test(t) && /(consensus|dual.brain|two.brain|dual)/i.test(t)) signals.alwaysDualBrain = true;
    if (/never (consensus|dual)|skip (review|consensus)|solo/i.test(t)) signals.neverDualBrain = true;
    if (/prefer opus|use opus/i.test(t)) signals.preferModel = 'opus';
    if (/prefer sonnet|use sonnet/i.test(t)) signals.preferModel = 'sonnet';
    if (/prefer haiku|use haiku/i.test(t)) signals.preferModel = 'haiku';
  }
  return signals;
}

function applyCriticalRiskFloor(model: string, provider: string, available: string[], risk: string): string {
  if (risk !== 'critical') return model;
  const cheapModels: Record<string, string> = { claude: 'haiku', openai: 'gpt-4.1-mini' };
  const floorModels: Record<string, string> = { claude: 'sonnet', openai: 'gpt-4.1' };
  if (model === cheapModels[provider]) {
    const floor = floorModels[provider];
    const escalated = available.includes(floor) ? floor : available[available.length - 1] ?? model;
    process.stderr.write(
      `[dual-brain] Warning: cost-saver selected ${model} for a critical-risk task. Escalating to ${escalated} (safety floor).\n`
    );
    return escalated;
  }
  return model;
}

// ─── Exported: decideRoute ────────────────────────────────────────────────────

export function decideRoute({ profile = {}, detection = {}, cwd, thinkResult, sessionContext = null }: {
  profile?: Record<string, unknown>;
  detection?: Record<string, unknown>;
  cwd?: string;
  thinkResult?: { tier?: string } | null;
  sessionContext?: Record<string, unknown> | null;
} = {}): Record<string, unknown> {
  const available = getAvailableModels(profile as { providers?: Record<string, { enabled?: boolean; models?: string[] }> });
  const workStyle = getWorkStyle(profile as { workStyle?: string });
  const prefSignals = parsePreferences(profile.preferences as Array<{ text: string; enabled: boolean; scope: string }> | undefined);
  const profileWithEffectiveBias = prefSignals.biasOverride
    ? { ...profile, mode: prefSignals.biasOverride }
    : profile;

  const { tier = 'execute', risk = 'low', complexity = 'simple', effort: detectionEffort } = detection as {
    tier?: string; risk?: string; complexity?: string; effort?: string;
  };
  const isHighStakes = ['critical', 'high'].includes(risk);
  const needsDeepReasoning =
    THINK_INTENTS.includes((detection as { intent?: string }).intent || '') ||
    risk === 'critical' ||
    (complexity === 'complex' && ['high', 'critical'].includes(risk)) ||
    detectionEffort === 'xhigh';

  const healthScores = getHealthScores(tier, cwd);
  let provider = chooseProvider(detection, profileWithEffectiveBias, healthScores);

  if (prefSignals.preferProvider) {
    const preferred = prefSignals.preferProvider;
    const prefEnabled = (profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.[preferred]?.enabled;
    const prefScore = healthScores[preferred as keyof typeof healthScores] ?? 0;
    if (prefEnabled && prefScore > 0) provider = preferred;
  }
  if (prefSignals.avoidProvider && provider === prefSignals.avoidProvider) {
    const other = prefSignals.avoidProvider === 'claude' ? 'openai' : 'claude';
    const otherEnabled = (profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.[other]?.enabled;
    const otherScore = healthScores[other as keyof typeof healthScores] ?? 0;
    if (otherEnabled && otherScore > 0) provider = other;
  }

  const _fallbackClaude = (() => {
    const wantOpus = needsDeepReasoning && workStyle.key !== 'fast';
    const fb = wantOpus && available.claude.includes('opus') ? 'opus' : 'sonnet';
    return available.claude.includes(fb) ? fb : (available.claude[available.claude.length - 1] ?? 'sonnet');
  })();
  const _fallbackOpenAI = (() => {
    const purpose = needsDeepReasoning || workStyle.key === 'fullpower' ? 'think' : tier === 'search' ? 'search' : 'head';
    return rankOpenAIModels(available.openai, purpose)[0] ?? available.openai[0] ?? 'gpt-5.5';
  })();

  let model: string;
  if (modelRegistry) {
    const registryProvider = provider === 'claude' ? 'anthropic' : 'openai';
    const taskType = tier === 'search' ? 'search' : tier === 'think' ? 'think' : 'execute';
    const constraints: Record<string, unknown> = {
      provider: registryProvider,
      ...(tier === 'search' && { preferSpeed: true }),
      ...(tier === 'think' && { requireReasoning: true }),
      ...(!needsDeepReasoning && workStyle.key === 'fast' && { maxCost: 'medium' }),
    };
    const registryResult = modelRegistry.getBestModel(taskType, constraints as Parameters<typeof modelRegistry.getBestModel>[1]);
    if (registryResult) {
      model = registryResult.id;
    } else {
      model = provider === 'claude' ? _fallbackClaude : _fallbackOpenAI;
    }
  } else {
    model = provider === 'claude' ? _fallbackClaude : _fallbackOpenAI;
  }

  model = toShortName(model, provider);
  model = applyHealthDowngrade(model, healthScores[provider as keyof typeof healthScores], provider, available[provider as keyof typeof available], isHighStakes);
  model = applyProfileBias(model, profileWithEffectiveBias as Record<string, unknown>, provider, available[provider as keyof typeof available], (detection as { tier?: string }).tier);

  let thinkTier: string | null = null;
  try { if (thinkResult?.tier) thinkTier = thinkResult.tier; } catch {}

  if (thinkTier && !isHighStakes) {
    const claudeRankAsc = ['haiku', 'sonnet', 'opus'];
    const openaiRankAsc = rankOpenAIModels(available.openai, 'execute').reverse();

    if (thinkTier === 'recall' && provider === 'claude') {
      const target = 'haiku';
      const currentIdx = claudeRankAsc.indexOf(model);
      const targetIdx = claudeRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.claude.includes(target)) model = target;
    } else if (thinkTier === 'recall' && provider === 'openai') {
      const target = rankOpenAIModels(available.openai, 'search')[0] ?? 'gpt-4o-mini';
      const currentIdx = openaiRankAsc.indexOf(model);
      const targetIdx = openaiRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.openai.includes(target)) model = target;
    } else if (thinkTier === 'quick' && provider === 'claude') {
      const target = 'sonnet';
      const currentIdx = claudeRankAsc.indexOf(model);
      const targetIdx = claudeRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.claude.includes(target)) model = target;
    } else if (thinkTier === 'quick' && provider === 'openai') {
      const target = rankOpenAIModels(available.openai, 'head')[0] ?? 'gpt-5.5';
      const currentIdx = openaiRankAsc.indexOf(model);
      const targetIdx = openaiRankAsc.indexOf(target);
      if (targetIdx !== -1 && targetIdx < currentIdx && available.openai.includes(target)) model = target;
    }
  }

  // Session context escalation (abbreviated for brevity — same logic as .mjs)
  if (sessionContext) {
    const sessionAttempts = Array.isArray(sessionContext.priorAttempts) ? sessionContext.priorAttempts as Array<{ failed?: boolean; status?: string; provider?: string; model?: string }> : [];
    const sessionFailures = sessionAttempts.filter(a => a && (a.failed || a.status === 'failed'));
    const sessionSuccesses = sessionAttempts.filter(a => a && !a.failed && a.status !== 'failed');

    if (sessionFailures.length >= 2 && !isHighStakes) {
      if (provider === 'claude') {
        const claudeRank = ['haiku', 'sonnet', 'opus'];
        const currentIdx = claudeRank.indexOf(toShortName(model, 'claude'));
        if (currentIdx !== -1 && currentIdx < claudeRank.length - 1) {
          const escalated = claudeRank[currentIdx + 1];
          if (available.claude.includes(escalated)) model = escalated;
        }
      } else {
        const oaiRank = rankOpenAIModels(available.openai, 'execute').reverse();
        const currentIdx = oaiRank.indexOf(model);
        if (currentIdx !== -1 && currentIdx < oaiRank.length - 1) {
          const escalated = oaiRank[currentIdx + 1];
          if (available.openai.includes(escalated)) model = escalated;
        }
      }
    }

    if (sessionSuccesses.length > 0) {
      const lastSuccess = sessionSuccesses[sessionSuccesses.length - 1];
      if (lastSuccess.provider && lastSuccess.model && !isHighStakes) {
        const successProvider = lastSuccess.provider;
        const successModel = lastSuccess.model;
        const providerEnabled = (profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.[successProvider]?.enabled;
        const providerHealthy = (healthScores[successProvider as keyof typeof healthScores] ?? 0) > 0;
        if (providerEnabled && providerHealthy) {
          const shortSuccess = toShortName(successModel, successProvider);
          if ((available as Record<string, string[]>)[successProvider]?.includes(shortSuccess)) {
            provider = successProvider;
            model = shortSuccess;
          }
        }
      }
    }
  }

  model = applyCriticalRiskFloor(model, provider, available[provider as keyof typeof available], (detection as { risk?: string }).risk || 'low');

  if (prefSignals.preferModel) {
    const wantedModel = prefSignals.preferModel;
    if ((available[provider as keyof typeof available])?.includes(wantedModel)) {
      model = wantedModel;
    }
  }

  model = toFullModelId(model, provider, tier);

  let _advisorOverride: Record<string, unknown> | null = null;
  if (routingAdvisor && provider === 'claude') {
    try {
      const advice = routingAdvisor.adviseModel(
        { intent: (detection as { intent?: string }).intent || '', tier, risk: (detection as { risk?: string }).risk || 'low' },
        cwd
      );
      if (advice.confidence > 0.3 && advice.model) {
        const advisorShort = advice.model;
        const previousModel = toShortName(model, 'claude');
        if (advisorShort !== previousModel && available.claude.includes(advisorShort)) {
          const overrideFullId = toFullModelId(advisorShort, 'claude', tier);
          _advisorOverride = { from: model, to: overrideFullId, reason: advice.reason, explored: advice.explored };
          model = overrideFullId;
        }
      }
    } catch { /* non-blocking */ }
  }

  const hasBothProviders = !!(
    (profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.claude?.enabled &&
    (profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.openai?.enabled
  );

  const challengerTriggered = shouldTriggerChallenger(workStyle.challengerPolicy, risk, hasBothProviders);
  const legacyDualBrain = !!((detection as { designImpact?: boolean }).designImpact && profile?.dual_brain_enabled !== false);

  let dual = challengerTriggered || legacyDualBrain || shouldDualBrain(
    detection as { intent?: string; risk?: string; complexity?: string; designImpact?: boolean },
    profile as { dual_brain_enabled?: boolean; providers?: Record<string, { enabled?: boolean; plan?: string }> }
  );
  if (prefSignals.alwaysDualBrain) dual = true;
  if (prefSignals.neverDualBrain) dual = false;
  if (dual && !hasBothProviders && !legacyDualBrain) dual = false;

  const degradedDualBrain = !!(legacyDualBrain && !hasBothProviders);
  const challengerModel = dual ? pickChallengerModel(provider, available) : null;

  const effort = pickEffort(model, detection);
  const modes = pickModes(model, detection);
  const sandbox = pickSandbox(model, detection);

  const decision: Record<string, unknown> = {
    provider,
    model,
    effort,
    tier,
    dualBrain: dual,
    ...(degradedDualBrain && { degradedDualBrain: true }),
    ...(challengerModel && { challengerModel }),
    workStyle: workStyle.key,
    modes,
    sandbox,
    explanation: '',
    _healthScores: healthScores,
    _workStyle: workStyle,
    ...(_advisorOverride && { _advisorOverride }),
  };

  decision.explanation = explainDecision(decision, detection, profileWithEffectiveBias as Record<string, unknown>);

  const { _healthScores, _workStyle, ...result } = decision;
  return result;
}

// ─── Exported: getFailoverOrder ──────────────────────────────────────────────

export function getFailoverOrder(decision: { provider: string; model: string; tier?: string }, profile: Record<string, unknown>): Array<{ provider: string; model: string; label: string }> {
  const { provider: failedProvider, model: failedModel, tier = 'execute' } = decision;
  const available = getAvailableModels(profile as { providers?: Record<string, { enabled?: boolean; models?: string[] }> });

  const claudeRankByTier: Record<string, string[]> = {
    think: ['opus', 'sonnet', 'haiku'],
    execute: ['sonnet', 'opus', 'haiku'],
    search: ['haiku', 'sonnet', 'opus'],
  };
  const openaiRankByTier: Record<string, string[]> = {
    think: rankOpenAIModels(available.openai, 'think'),
    execute: rankOpenAIModels(available.openai, 'execute'),
    search: rankOpenAIModels(available.openai, 'search'),
  };

  const claudeRank = claudeRankByTier[tier] ?? claudeRankByTier.execute;
  const openaiRank = openaiRankByTier[tier] ?? openaiRankByTier.execute;

  const claudeEnabled = !!((profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.claude?.enabled);
  const openaiEnabled = !!((profile?.providers as Record<string, { enabled?: boolean }> | undefined)?.openai?.enabled);

  const fallbacks: Array<{ provider: string; model: string; label: string }> = [];

  if (failedProvider === 'claude') {
    for (const m of claudeRank) {
      if (m === failedModel || !available.claude.includes(m)) continue;
      fallbacks.push({ provider: 'claude', model: m, label: `Claude ${m}` });
    }
    if (openaiEnabled) {
      for (const m of openaiRank) {
        if (!available.openai.includes(m)) continue;
        fallbacks.push({ provider: 'openai', model: m, label: `OpenAI ${m}` });
      }
    }
  } else {
    for (const m of openaiRank) {
      if (m === failedModel || !available.openai.includes(m)) continue;
      fallbacks.push({ provider: 'openai', model: m, label: `OpenAI ${m}` });
    }
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
  let profilePath: string | undefined, detectionJson: string | undefined, cwd: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) { profilePath = args[++i]; }
    if (args[i] === '--detection' && args[i + 1]) { detectionJson = args[++i]; }
    if (args[i] === '--cwd' && args[i + 1]) { cwd = args[++i]; }
  }

  let profile: Record<string, unknown> = {};
  let detection: Record<string, unknown> = {};

  if (profilePath) {
    try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch (e) {
      console.error(`Failed to load profile: ${(e as Error).message}`);
      process.exit(1);
    }
  }
  if (detectionJson) {
    try { detection = JSON.parse(detectionJson); } catch (e) {
      console.error(`Failed to parse detection JSON: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  const result = decideRoute({ profile, detection, cwd });
  console.log(JSON.stringify(result, null, 2));
}
