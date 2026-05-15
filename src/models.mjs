/**
 * models.mjs — Static model intelligence registry for the Dual-Brain Orchestrator.
 *
 * Pure in-memory registry of AI model capabilities used by routing modules.
 * No file I/O, no API calls. Updated with each package release.
 */

export const REGISTRY_VERSION = '2026-05-15';
export const REGISTRY_UPDATED = '2026-05-15';

export const MODEL_REGISTRY = Object.freeze({
  'claude-opus-4-6': {
    provider: 'anthropic',
    name: 'Claude Opus 4.6',
    tier: 'frontier',
    contextWindow: 200000,
    maxOutput: 32000,
    strengths: ['complex reasoning', 'architecture', 'code review', 'long context', 'multi-step planning'],
    weaknesses: ['speed', 'cost'],
    costTier: 'high',
    bestFor: ['think', 'review', 'architecture', 'complex debugging'],
    speed: 'slow',
    reasoning: true,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    name: 'Claude Sonnet 4.6',
    tier: 'workhorse',
    contextWindow: 200000,
    maxOutput: 16000,
    strengths: ['balanced speed/quality', 'code generation', 'editing', 'testing'],
    weaknesses: ['less depth on architecture decisions'],
    costTier: 'medium',
    bestFor: ['execute', 'implement', 'test', 'fix'],
    speed: 'medium',
    reasoning: true,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    name: 'Claude Haiku 4.5',
    tier: 'fast',
    contextWindow: 200000,
    maxOutput: 8192,
    strengths: ['speed', 'low cost', 'simple tasks', 'search', 'classification'],
    weaknesses: ['complex reasoning', 'multi-step tasks'],
    costTier: 'low',
    bestFor: ['search', 'classify', 'simple edits', 'grep'],
    speed: 'fast',
    reasoning: false,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'gpt-5.5': {
    provider: 'openai',
    name: 'GPT-5.5',
    tier: 'frontier',
    contextWindow: 1050000,
    maxOutput: 128000,
    strengths: ['massive context', 'complex professional work', 'reasoning', 'web search', 'code interpreter'],
    weaknesses: ['cost', 'latency on complex reasoning'],
    costTier: 'premium',
    bestFor: ['think', 'review', 'research', 'long-context analysis'],
    speed: 'medium',
    reasoning: true,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'o3': {
    provider: 'openai',
    name: 'o3',
    tier: 'reasoning',
    contextWindow: 200000,
    maxOutput: 100000,
    strengths: ['deep reasoning', 'math', 'code', 'science', 'multi-step logic'],
    weaknesses: ['speed', 'cost', 'simple tasks overkill'],
    costTier: 'premium',
    bestFor: ['think', 'complex debugging', 'algorithm design', 'security analysis'],
    speed: 'slow',
    reasoning: true,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'gpt-4o': {
    provider: 'openai',
    name: 'GPT-4o',
    tier: 'workhorse',
    contextWindow: 128000,
    maxOutput: 16384,
    strengths: ['balanced', 'fast', 'multimodal', 'tool use'],
    weaknesses: ['less depth than frontier models'],
    costTier: 'medium',
    bestFor: ['execute', 'implement', 'chat', 'multimodal'],
    speed: 'fast',
    reasoning: false,
    vision: true,
    tools: true,
    agentCapable: true,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    name: 'GPT-4o Mini',
    tier: 'fast',
    contextWindow: 128000,
    maxOutput: 16384,
    strengths: ['very fast', 'very cheap', 'good enough for simple tasks'],
    weaknesses: ['complex reasoning', 'nuanced code review'],
    costTier: 'low',
    bestFor: ['search', 'classify', 'simple tasks', 'formatting'],
    speed: 'fast',
    reasoning: false,
    vision: true,
    tools: true,
    agentCapable: false,
  },
});

const COST_TIER_ORDER = ['low', 'medium', 'high', 'premium'];
const SPEED_ORDER = ['fast', 'medium', 'slow'];
const TIER_ORDER = ['fast', 'workhorse', 'reasoning', 'frontier'];

const MODEL_QUIRKS = {
  'claude-opus-4-6': [
    'Best for architecture decisions',
    'Use for code review when quality matters',
    'Expensive — reserve for high-value tasks',
  ],
  'claude-sonnet-4-6': [
    'Best general-purpose worker',
    'Good balance of speed and quality',
    'Use Agent(model: "sonnet") for work dispatch',
  ],
  'claude-haiku-4-5-20251001': [
    'Best for fast search and classification',
    'Not reliable for multi-step edits',
    'Use for disposable search agents',
  ],
  'gpt-5.5': [
    'Massive 1M+ context window',
    'Good challenger for dual-brain think',
    'Web search and code interpreter available',
  ],
  'o3': [
    'Purpose-built for deep reasoning chains',
    'Strong challenger for security analysis',
    'Slow — avoid for quick tasks',
  ],
  'gpt-4o': [
    'Fast and multimodal',
    'Solid fallback for execute-tier GPT work',
    'Native tool use support',
  ],
  'gpt-4o-mini': [
    'Cheapest GPT option for simple tasks',
    'Not agent-capable — single-shot only',
    'Good for classification and formatting',
  ],
};

export function getModel(modelId) {
  return MODEL_REGISTRY[modelId] ?? null;
}

export function getModelsForTask(taskType, provider = null) {
  const entries = Object.entries(MODEL_REGISTRY);

  const filtered = entries.filter(([, m]) => {
    if (provider && m.provider !== provider) return false;
    return true;
  });

  filtered.sort(([, a], [, b]) => {
    const aMatch = a.bestFor.includes(taskType) ? 1 : 0;
    const bMatch = b.bestFor.includes(taskType) ? 1 : 0;
    if (bMatch !== aMatch) return bMatch - aMatch;

    const aTier = TIER_ORDER.indexOf(a.tier);
    const bTier = TIER_ORDER.indexOf(b.tier);
    if (bTier !== aTier) return bTier - aTier;

    return SPEED_ORDER.indexOf(a.speed) - SPEED_ORDER.indexOf(b.speed);
  });

  return filtered.map(([id, m]) => ({ id, ...m }));
}

export function getBestModel(taskType, constraints = {}) {
  const { provider = null, maxCost = null, preferSpeed = false, requireReasoning = false, minContext = 0 } = constraints;

  let candidates = getModelsForTask(taskType, provider);

  if (requireReasoning) {
    candidates = candidates.filter(m => m.reasoning);
  }

  if (minContext > 0) {
    candidates = candidates.filter(m => m.contextWindow >= minContext);
  }

  if (maxCost) {
    const maxIdx = COST_TIER_ORDER.indexOf(maxCost);
    if (maxIdx !== -1) {
      candidates = candidates.filter(m => COST_TIER_ORDER.indexOf(m.costTier) <= maxIdx);
    }
  }

  if (preferSpeed) {
    candidates.sort((a, b) => SPEED_ORDER.indexOf(a.speed) - SPEED_ORDER.indexOf(b.speed));
  }

  return candidates[0] ?? null;
}

export function compareModels(modelA, modelB) {
  const a = MODEL_REGISTRY[modelA];
  const b = MODEL_REGISTRY[modelB];

  if (!a || !b) {
    return {
      contextAdvantage: 'tie',
      speedAdvantage: 'tie',
      costAdvantage: 'tie',
      reasoningAdvantage: 'tie',
      recommendation: 'One or both model IDs are unknown.',
    };
  }

  const ctxAdv = a.contextWindow > b.contextWindow ? 'a'
    : b.contextWindow > a.contextWindow ? 'b'
    : 'tie';

  const spdA = SPEED_ORDER.indexOf(a.speed);
  const spdB = SPEED_ORDER.indexOf(b.speed);
  const spdAdv = spdA < spdB ? 'a' : spdB < spdA ? 'b' : 'tie';

  const costA = COST_TIER_ORDER.indexOf(a.costTier);
  const costB = COST_TIER_ORDER.indexOf(b.costTier);
  const costAdv = costA < costB ? 'a' : costB < costA ? 'b' : 'tie';

  const rsnAdv = (a.reasoning && !b.reasoning) ? 'a'
    : (b.reasoning && !a.reasoning) ? 'b'
    : 'tie';

  const aAdvantages = [ctxAdv, spdAdv, costAdv, rsnAdv].filter(v => v === 'a').length;
  const bAdvantages = [ctxAdv, spdAdv, costAdv, rsnAdv].filter(v => v === 'b').length;

  let recommendation;
  if (aAdvantages > bAdvantages) {
    recommendation = `Use ${a.name} for ${a.bestFor.slice(0, 2).join('/')}; ${b.name} as a lighter alternative.`;
  } else if (bAdvantages > aAdvantages) {
    recommendation = `Use ${b.name} for ${b.bestFor.slice(0, 2).join('/')}; ${a.name} as a lighter alternative.`;
  } else {
    recommendation = `${a.name} and ${b.name} are comparable — choose based on provider availability.`;
  }

  return { contextAdvantage: ctxAdv, speedAdvantage: spdAdv, costAdvantage: costAdv, reasoningAdvantage: rsnAdv, recommendation };
}

export function getRegistryAge() {
  const updated = new Date(REGISTRY_UPDATED);
  const now = new Date();
  return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
}

const COST_SYMBOL = { low: '$', medium: '$$', high: '$$$', premium: '$$$$' };

function fmtCtx(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M ctx`;
  return `${Math.round(n / 1000)}K ctx`;
}

export function formatModelTable(provider = null) {
  const groups = {};
  for (const [id, m] of Object.entries(MODEL_REGISTRY)) {
    if (provider && m.provider !== provider) continue;
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider].push({ id, ...m });
  }

  const lines = [];
  const providerLabels = { anthropic: 'Claude Models', openai: 'OpenAI Models' };
  const providerOrder = ['anthropic', 'openai'];

  for (const prov of providerOrder) {
    if (!groups[prov]) continue;
    lines.push(`${providerLabels[prov] ?? prov}:`);
    for (const m of groups[prov]) {
      const displayName = m.provider === 'anthropic' ? m.name.replace(/^Claude /, '') : m.name;
      const name = displayName.padEnd(12);
      const tier = m.tier.padEnd(10);
      const ctx = fmtCtx(m.contextWindow).padEnd(10);
      const speed = m.speed.padEnd(8);
      const cost = (COST_SYMBOL[m.costTier] ?? '?').padEnd(6);
      const tasks = m.bestFor.slice(0, 2).join('/');
      lines.push(`  ${name}${tier}${ctx}${speed}${cost}${tasks}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function getModelQuirks(modelId) {
  return MODEL_QUIRKS[modelId] ?? [];
}

export function suggestModel(intent, risk, complexity, availableProviders = ['anthropic', 'openai']) {
  const intentLower = (intent || '').toLowerCase();

  const TASK_MAP = {
    think: ['architect', 'design', 'plan', 'review', 'security', 'audit', 'analysis', 'analyze'],
    execute: ['implement', 'edit', 'fix', 'refactor', 'test', 'build', 'write', 'update', 'create'],
    search: ['search', 'find', 'grep', 'look', 'explore', 'classify', 'format', 'list'],
  };

  let taskType = 'execute';
  for (const [type, keywords] of Object.entries(TASK_MAP)) {
    if (keywords.some(kw => intentLower.includes(kw))) {
      taskType = type;
      break;
    }
  }

  if ((risk === 'critical' || risk === 'high') && taskType !== 'think') {
    taskType = 'think';
  }

  const requireReasoning = complexity === 'complex' || risk === 'critical';
  const preferSpeed = risk === 'low' && complexity === 'simple';
  const maxCost = risk === 'low' && complexity !== 'complex' ? 'medium' : null;

  const candidates = getModelsForTask(taskType)
    .filter(m => availableProviders.includes(m.provider))
    .filter(m => !requireReasoning || m.reasoning)
    .filter(m => !maxCost || COST_TIER_ORDER.indexOf(m.costTier) <= COST_TIER_ORDER.indexOf(maxCost));

  if (preferSpeed) {
    candidates.sort((a, b) => SPEED_ORDER.indexOf(a.speed) - SPEED_ORDER.indexOf(b.speed));
  }

  const best = candidates[0] ?? null;
  if (!best) {
    return { model: null, reason: 'No suitable model found for the given constraints.', alternatives: [] };
  }

  const reason = [
    `Selected ${best.name} for ${taskType}-tier work`,
    risk !== 'low' ? `(${risk} risk)` : null,
    requireReasoning ? '— reasoning required' : null,
  ].filter(Boolean).join(' ');

  const alternatives = candidates.slice(1, 3).map(m => ({ id: m.id, name: m.name }));

  return { model: best.id, reason, alternatives };
}
