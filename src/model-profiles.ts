/**
 * Static capability profiles for AI models used by the dual-brain orchestrator.
 * Used for routing decisions, pairing assessments, and task-model matching.
 *
 * Version bumped when profiles are added/modified — consumers can cache-invalidate on this.
 */

import type { ModelProfile, Provider, LatencyTier, CostTier } from './types.ts';

const PROFILE_VERSION = '1.0.0';

export const PROFILES: ModelProfile[] = [
  {
    id: 'claude-opus-4-6',
    name: 'Opus 4.6',
    provider: 'claude',
    tier: 3,
    contextWindow: 200000,
    maxOutput: 32000,
    supportedModes: ['standard', 'extended-thinking'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.95,
      codeGeneration: 0.9,
      codeReview: 0.93,
      editPrecision: 0.88,
      architecture: 0.95,
      instructionFollowing: 0.91,
      structuredOutput: 0.85,
      steerability: 0.89,
      refactoring: 0.91,
      testGeneration: 0.86,
      documentation: 0.89,
    },
    languages: {
      systems: 0.88,
      scripting: 0.92,
      markup: 0.9,
      niche: 0.78,
    },
    ops: {
      latencyTier: 'slow',
      costTier: 'expensive',
      contextDegradation: 160000,
      parameterSensitive: false,
    },
    quirks: [
      'Excellent at multi-step reasoning chains',
      'May over-engineer simple tasks',
      'Strong at spotting security issues',
      'Best-in-class for architecture planning',
      'Tends to be thorough rather than concise',
    ],
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Sonnet 4.6',
    provider: 'claude',
    tier: 2,
    contextWindow: 200000,
    maxOutput: 16000,
    supportedModes: ['standard', 'extended-thinking'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.82,
      codeGeneration: 0.88,
      codeReview: 0.85,
      editPrecision: 0.86,
      architecture: 0.78,
      instructionFollowing: 0.89,
      structuredOutput: 0.87,
      steerability: 0.9,
      refactoring: 0.85,
      testGeneration: 0.84,
      documentation: 0.85,
    },
    languages: {
      systems: 0.82,
      scripting: 0.9,
      markup: 0.88,
      niche: 0.7,
    },
    ops: {
      latencyTier: 'medium',
      costTier: 'moderate',
      contextDegradation: 150000,
      parameterSensitive: false,
    },
    quirks: [
      'Best balance of speed and quality for most tasks',
      'Good at following complex multi-step instructions',
      'Reliable for production code generation',
      'Less prone to over-engineering than Opus',
    ],
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Haiku 4.5',
    provider: 'claude',
    tier: 1,
    contextWindow: 200000,
    maxOutput: 8192,
    supportedModes: ['standard'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.62,
      codeGeneration: 0.75,
      codeReview: 0.68,
      editPrecision: 0.72,
      architecture: 0.55,
      instructionFollowing: 0.82,
      structuredOutput: 0.83,
      steerability: 0.85,
      refactoring: 0.68,
      testGeneration: 0.7,
      documentation: 0.72,
    },
    languages: {
      systems: 0.65,
      scripting: 0.8,
      markup: 0.82,
      niche: 0.5,
    },
    ops: {
      latencyTier: 'fast',
      costTier: 'cheap',
      contextDegradation: 140000,
      parameterSensitive: false,
    },
    quirks: [
      'Extremely fast for simple tasks',
      'Good at structured output and formatting',
      'May miss subtle bugs in code review',
      'Best for boilerplate, docs, simple edits',
      'Struggles with complex multi-file reasoning',
    ],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    tier: 2,
    contextWindow: 128000,
    maxOutput: 16384,
    supportedModes: ['standard'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.8,
      codeGeneration: 0.86,
      codeReview: 0.82,
      editPrecision: 0.8,
      architecture: 0.76,
      instructionFollowing: 0.92,
      structuredOutput: 0.91,
      steerability: 0.87,
      refactoring: 0.82,
      testGeneration: 0.82,
      documentation: 0.84,
    },
    languages: {
      systems: 0.8,
      scripting: 0.88,
      markup: 0.87,
      niche: 0.72,
    },
    ops: {
      latencyTier: 'medium',
      costTier: 'moderate',
      contextDegradation: 100000,
      parameterSensitive: false,
    },
    quirks: [
      'Excellent at structured output and JSON schemas',
      'Strong instruction following',
      'Multimodal breadth including audio',
      'Can be verbose in explanations',
      'Good breadth across domains',
    ],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 1,
    contextWindow: 128000,
    maxOutput: 16384,
    supportedModes: ['standard'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.6,
      codeGeneration: 0.74,
      codeReview: 0.65,
      editPrecision: 0.7,
      architecture: 0.52,
      instructionFollowing: 0.85,
      structuredOutput: 0.88,
      steerability: 0.83,
      refactoring: 0.65,
      testGeneration: 0.68,
      documentation: 0.72,
    },
    languages: {
      systems: 0.62,
      scripting: 0.78,
      markup: 0.8,
      niche: 0.5,
    },
    ops: {
      latencyTier: 'fast',
      costTier: 'cheap',
      contextDegradation: 90000,
      parameterSensitive: false,
    },
    quirks: [
      'Surprisingly capable for simple coding tasks',
      'Very fast and cost-effective',
      'Good at structured output despite small size',
      'Struggles with complex reasoning chains',
      'Best for classification, formatting, simple generation',
    ],
  },
  {
    id: 'o3',
    name: 'o3',
    provider: 'openai',
    tier: 3,
    contextWindow: 200000,
    maxOutput: 100000,
    supportedModes: ['standard', 'extended-thinking'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.97,
      codeGeneration: 0.88,
      codeReview: 0.9,
      editPrecision: 0.82,
      architecture: 0.92,
      instructionFollowing: 0.83,
      structuredOutput: 0.8,
      steerability: 0.75,
      refactoring: 0.85,
      testGeneration: 0.82,
      documentation: 0.78,
    },
    languages: {
      systems: 0.9,
      scripting: 0.88,
      markup: 0.82,
      niche: 0.8,
    },
    ops: {
      latencyTier: 'slow',
      costTier: 'expensive',
      contextDegradation: 150000,
      parameterSensitive: true,
    },
    quirks: [
      'Exceptional at hard reasoning and math',
      'Chain-of-thought is internal and extensive',
      'Less steerable — may ignore constraints during deep reasoning',
      'Overkill for simple tasks',
      'Best for algorithmic problems, proofs, complex debugging',
      'Structured output less reliable than GPT-4o',
    ],
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    provider: 'openai',
    tier: 2,
    contextWindow: 200000,
    maxOutput: 100000,
    supportedModes: ['standard', 'extended-thinking'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.88,
      codeGeneration: 0.84,
      codeReview: 0.83,
      editPrecision: 0.78,
      architecture: 0.82,
      instructionFollowing: 0.82,
      structuredOutput: 0.79,
      steerability: 0.76,
      refactoring: 0.8,
      testGeneration: 0.78,
      documentation: 0.74,
    },
    languages: {
      systems: 0.84,
      scripting: 0.85,
      markup: 0.8,
      niche: 0.74,
    },
    ops: {
      latencyTier: 'medium',
      costTier: 'moderate',
      contextDegradation: 140000,
      parameterSensitive: true,
    },
    quirks: [
      'Good reasoning at lower cost than o3',
      'Better for reasoning-heavy tasks than GPT-4o',
      'Less reliable at structured output',
      'Internal chain-of-thought can be unpredictable in length',
      'Good choice for complex code tasks on a budget',
    ],
  },
  {
    id: 'gpt-4.5',
    name: 'GPT-4.5',
    provider: 'openai',
    tier: 3,
    contextWindow: 128000,
    maxOutput: 16384,
    supportedModes: ['standard'],
    toolUse: 'native',
    autonomy: 'agent-loop',
    multimodal: ['text', 'vision'],
    traits: {
      reasoningDepth: 0.85,
      codeGeneration: 0.87,
      codeReview: 0.86,
      editPrecision: 0.83,
      architecture: 0.84,
      instructionFollowing: 0.9,
      structuredOutput: 0.89,
      steerability: 0.88,
      refactoring: 0.84,
      testGeneration: 0.83,
      documentation: 0.88,
    },
    languages: {
      systems: 0.84,
      scripting: 0.89,
      markup: 0.88,
      niche: 0.76,
    },
    ops: {
      latencyTier: 'slow',
      costTier: 'expensive',
      contextDegradation: 100000,
      parameterSensitive: false,
    },
    quirks: [
      'Broad world knowledge — good for novel domains',
      'Strong EQ and nuance in writing tasks',
      'Reliable structured output',
      'Less specialized reasoning than o3',
      'Good general-purpose premium model',
      'High cost relative to reasoning ability',
    ],
  },
];

// Index for fast lookup
const profileIndex = new Map<string, ModelProfile>(PROFILES.map(p => [p.id, p]));

/**
 * Look up a model profile by ID. Supports fuzzy matching:
 * 'opus' matches 'claude-opus-4-6', 'sonnet' matches 'claude-sonnet-4-6', etc.
 */
export function getProfile(modelId: string | null | undefined): ModelProfile | null {
  if (!modelId) return null;

  // Exact match first
  if (profileIndex.has(modelId)) return profileIndex.get(modelId)!;

  // Fuzzy: find profiles whose id or name contains the query (case-insensitive)
  const query = modelId.toLowerCase();
  const matches = PROFILES.filter(
    p => p.id.toLowerCase().includes(query) || p.name.toLowerCase().includes(query)
  );

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    // Prefer exact substring match on id
    const idMatch = matches.find(p => p.id.toLowerCase() === query);
    if (idMatch) return idMatch;
    // Return shortest id (most specific match)
    matches.sort((a, b) => a.id.length - b.id.length);
    return matches[0];
  }

  return null;
}

interface TraitComparisonEntry {
  [modelId: string]: number | string;
  delta: number;
  advantage: string;
}

interface CompareResult {
  models: [string, string];
  traits: Record<string, TraitComparisonEntry>;
  languages: Record<string, TraitComparisonEntry>;
  summary: Record<string, { advantages: string[]; tier: number; cost: CostTier; speed: LatencyTier }>;
}

interface CompareError {
  error: string;
}

/**
 * Compare two models, returning relative strengths across all dimensions.
 */
export function compareModels(idA: string, idB: string): CompareResult | CompareError {
  const a = getProfile(idA);
  const b = getProfile(idB);
  if (!a || !b) {
    return { error: `Model not found: ${!a ? idA : idB}` };
  }

  const traitComparison: Record<string, TraitComparisonEntry> = {};
  for (const [trait, scoreA] of Object.entries(a.traits)) {
    const scoreB = (b.traits as Record<string, number>)[trait] ?? 0;
    const diff = scoreA - scoreB;
    traitComparison[trait] = {
      [a.id]: scoreA,
      [b.id]: scoreB,
      delta: Math.round(diff * 100) / 100,
      advantage: diff > 0.02 ? a.id : diff < -0.02 ? b.id : 'tie',
    };
  }

  const languageComparison: Record<string, TraitComparisonEntry> = {};
  for (const [lang, scoreA] of Object.entries(a.languages)) {
    const scoreB = (b.languages as Record<string, number>)[lang] ?? 0;
    const diff = scoreA - scoreB;
    languageComparison[lang] = {
      [a.id]: scoreA,
      [b.id]: scoreB,
      delta: Math.round(diff * 100) / 100,
      advantage: diff > 0.02 ? a.id : diff < -0.02 ? b.id : 'tie',
    };
  }

  // Summarize advantages
  const aAdvantages = Object.entries(traitComparison)
    .filter(([, v]) => v.advantage === a.id)
    .map(([k]) => k);
  const bAdvantages = Object.entries(traitComparison)
    .filter(([, v]) => v.advantage === b.id)
    .map(([k]) => k);

  return {
    models: [a.id, b.id],
    traits: traitComparison,
    languages: languageComparison,
    summary: {
      [a.id]: { advantages: aAdvantages, tier: a.tier, cost: a.ops.costTier, speed: a.ops.latencyTier },
      [b.id]: { advantages: bAdvantages, tier: b.tier, cost: b.ops.costTier, speed: b.ops.latencyTier },
    },
  };
}

interface FindBestOptions {
  provider?: Provider;
  tier?: number;
  maxTier?: number;
  costTier?: CostTier;
}

/**
 * Find the best model for a given trait, with optional constraints.
 */
export function findBestFor(trait: string, options: FindBestOptions = {}): ModelProfile | null {
  let candidates = [...PROFILES];

  if (options.provider) {
    candidates = candidates.filter(p => p.provider === options.provider);
  }
  if (options.tier !== undefined) {
    candidates = candidates.filter(p => p.tier === options.tier);
  }
  if (options.maxTier !== undefined) {
    candidates = candidates.filter(p => p.tier <= options.maxTier!);
  }
  if (options.costTier) {
    candidates = candidates.filter(p => p.ops.costTier === options.costTier);
  }

  if (candidates.length === 0) return null;

  // Special pseudo-traits
  if (trait === 'speed') {
    const order: Record<string, number> = { fast: 3, medium: 2, slow: 1 };
    candidates.sort((a, b) => (order[b.ops.latencyTier] || 0) - (order[a.ops.latencyTier] || 0));
    return candidates[0];
  }
  if (trait === 'cost') {
    const order: Record<string, number> = { cheap: 3, moderate: 2, expensive: 1 };
    candidates.sort((a, b) => (order[b.ops.costTier] || 0) - (order[a.ops.costTier] || 0));
    return candidates[0];
  }
  if (trait === 'context') {
    candidates.sort((a, b) => b.contextWindow - a.contextWindow);
    return candidates[0];
  }

  // Check traits object
  if ((candidates[0].traits as Record<string, number>)[trait] !== undefined) {
    candidates.sort((a, b) => ((b.traits as Record<string, number>)[trait] || 0) - ((a.traits as Record<string, number>)[trait] || 0));
    return candidates[0];
  }

  // Check languages object
  if ((candidates[0].languages as Record<string, number>)[trait] !== undefined) {
    candidates.sort((a, b) => ((b.languages as Record<string, number>)[trait] || 0) - ((a.languages as Record<string, number>)[trait] || 0));
    return candidates[0];
  }

  return null;
}

interface PairingAssessment {
  models: [string, string];
  balance: 'complementary' | 'redundant' | 'lopsided';
  description: string;
  strengths: string[];
  gaps: string[];
}

interface PairingError {
  error: string;
}

/**
 * Assess how well two models pair together for dual-brain work.
 */
export function getPairingAssessment(idA: string, idB: string): PairingAssessment | PairingError {
  const a = getProfile(idA);
  const b = getProfile(idB);
  if (!a || !b) {
    return { error: `Model not found: ${!a ? idA : idB}` };
  }

  // Calculate trait overlap
  const traitKeys = Object.keys(a.traits);
  let overlapCount = 0;
  let complementCount = 0;
  const aStrengths: string[] = [];
  const bStrengths: string[] = [];

  for (const trait of traitKeys) {
    const diff = Math.abs((a.traits as Record<string, number>)[trait] - (b.traits as Record<string, number>)[trait]);
    if (diff < 0.05) {
      overlapCount++;
    } else {
      complementCount++;
      if ((a.traits as Record<string, number>)[trait] > (b.traits as Record<string, number>)[trait]) {
        aStrengths.push(trait);
      } else {
        bStrengths.push(trait);
      }
    }
  }

  // Determine tier balance
  const tierDiff = Math.abs(a.tier - b.tier);

  // Determine balance type
  let balance: 'complementary' | 'redundant' | 'lopsided';
  if (complementCount > overlapCount && tierDiff >= 1) {
    balance = 'complementary';
  } else if (overlapCount > complementCount && tierDiff === 0) {
    balance = 'redundant';
  } else {
    balance = 'lopsided';
  }

  // Refine: same tier + same provider is likely redundant
  if (a.tier === b.tier && a.provider === b.provider) {
    balance = 'redundant';
  }

  // Different tiers with complementary traits is ideal
  if (tierDiff >= 1 && complementCount >= 3) {
    balance = 'complementary';
  }

  // Build description
  let description: string;
  if (balance === 'complementary') {
    description = `${a.name} and ${b.name} complement each other well — ${a.name} excels at ${aStrengths.slice(0, 2).join(', ') || 'depth'} while ${b.name} covers ${bStrengths.slice(0, 2).join(', ') || 'breadth'}.`;
  } else if (balance === 'redundant') {
    description = `${a.name} and ${b.name} have significant overlap — using both provides little marginal value.`;
  } else {
    const stronger = a.tier > b.tier ? a : b;
    const weaker = a.tier > b.tier ? b : a;
    description = `${stronger.name} dominates ${weaker.name} in most dimensions — the pairing is unbalanced.`;
  }

  // Identify gaps (traits where both score below 0.75)
  const gaps = traitKeys.filter(t => (a.traits as Record<string, number>)[t] < 0.75 && (b.traits as Record<string, number>)[t] < 0.75);

  // Strengths of the pairing (traits where at least one scores above 0.88)
  const strengths = traitKeys.filter(t => (a.traits as Record<string, number>)[t] >= 0.88 || (b.traits as Record<string, number>)[t] >= 0.88);

  return {
    models: [a.id, b.id],
    balance,
    description,
    strengths,
    gaps,
  };
}

/**
 * Returns the current profile version for cache invalidation.
 */
export function getProfileVersion(): string {
  return PROFILE_VERSION;
}

export default PROFILES;
