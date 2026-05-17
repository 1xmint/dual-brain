// governance.mjs — Model tier enforcement + multi-model collaboration

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Tier Definitions ────────────────────────────────────────────────────────

export const MODEL_TIERS = Object.freeze({
  1: {
    label: 'lightweight',
    models: ['claude-haiku-4-5-20251001', 'haiku', 'gpt-4o-mini', 'o4-mini'],
    autoApprove: true,
  },
  2: {
    label: 'standard',
    models: ['claude-sonnet-4-6', 'sonnet', 'gpt-4o', 'gpt-4.1'],
    autoApprove: true,
  },
  3: {
    label: 'heavy',
    models: ['claude-opus-4-6', 'claude-opus-4-7', 'opus', 'o3'],
    autoApprove: false, // requires consent check per profile
  },
});

// Reverse lookup: model ID → tier number
export function getModelTier(modelId) {
  if (!modelId) return 2; // default to standard
  const normalized = String(modelId).toLowerCase();
  for (const [tier, def] of Object.entries(MODEL_TIERS)) {
    if (def.models.some(m => normalized.includes(m))) return Number(tier);
  }
  return 2; // unknown models default to standard
}

// ─── Task Scoring ────────────────────────────────────────────────────────────

export function scoreTask(detection) {
  // detection comes from detect.mjs — has intent, risk, scope, files, etc.
  const scores = {
    complexity: 0,  // 0-3
    risk: 0,        // 0-3
    creativity: 0,  // 0-2
    precision: 0,   // 0-2
    contextVolume: 0, // 0-3
  };

  // Complexity from file count / scope
  const fileCount = detection?.files?.length || detection?.scope?.fileCount || 0;
  if (fileCount >= 6) scores.complexity = 3;
  else if (fileCount >= 3) scores.complexity = 2;
  else if (fileCount >= 1) scores.complexity = 1;

  // Risk from explicit risk field or keywords
  const risk = detection?.risk || detection?.riskLevel || 'low';
  const riskMap = { low: 0, medium: 1, high: 2, critical: 3 };
  scores.risk = riskMap[risk] ?? 0;

  // Boost risk for security/auth/billing keywords
  const text = (detection?.objective || detection?.intent || '').toLowerCase();
  if (/\b(auth|security|credential|secret|billing|payment|migration|delete|drop)\b/.test(text)) {
    scores.risk = Math.max(scores.risk, 2);
  }

  // Creativity from intent type
  const intent = (detection?.intent || detection?.type || '').toLowerCase();
  if (/\b(architect|design|brainstorm|explore|research)\b/.test(intent)) scores.creativity = 2;
  else if (/\b(refactor|plan|decide)\b/.test(intent)) scores.creativity = 1;

  // Precision — one-shot tasks need higher precision
  if (/\b(security|deploy|publish|migration)\b/.test(text)) scores.precision = 2;
  else if (/\b(implement|build|create)\b/.test(text)) scores.precision = 1;

  // Context volume
  const contextSize = detection?.contextTokens || detection?.estimatedContext || 0;
  if (contextSize > 200000) scores.contextVolume = 3;
  else if (contextSize > 50000) scores.contextVolume = 2;
  else if (contextSize > 10000) scores.contextVolume = 1;

  return scores;
}

export function computeRequiredTier(scores) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total <= 2) return 1;
  if (total <= 6) return 2;
  return 3;
}

// ─── Governance Assessment ───────────────────────────────────────────────────

// Profile governance defaults
const GOVERNANCE_PERMISSIONS = {
  'auto':          { 1: 'auto', 2: 'auto', 3: 'ask' },
  'balanced':      { 1: 'auto', 2: 'auto', 3: 'ask' },
  'cost-saver':    { 1: 'auto', 2: 'auto', 3: 'deny' },
  'quality-first': { 1: 'auto', 2: 'auto', 3: 'auto' },
};

// Pricing per million tokens (input/output) for cost estimation
const MODEL_PRICING = {
  'haiku':  { input: 1.00, output: 5.00 },
  'sonnet': { input: 3.00, output: 15.00 },
  'opus':   { input: 5.00, output: 25.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'o3': { input: 2.00, output: 8.00 },
  'o4-mini': { input: 1.10, output: 4.40 },
};

function estimateCost(modelId, estimatedTokens = 8000) {
  const normalized = String(modelId).toLowerCase();
  let pricing = MODEL_PRICING['sonnet']; // default
  for (const [key, p] of Object.entries(MODEL_PRICING)) {
    if (normalized.includes(key)) { pricing = p; break; }
  }
  // Assume 20% input, 80% output for agent tasks
  const inputTokens = estimatedTokens * 0.2;
  const outputTokens = estimatedTokens * 0.8;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function assessGovernance(model, detection, profile) {
  const tier = getModelTier(model);
  const scores = scoreTask(detection);
  const requiredTier = computeRequiredTier(scores);
  const workStyle = profile?.workStyle || profile?.name || 'auto';
  const permissions = GOVERNANCE_PERMISSIONS[workStyle] || GOVERNANCE_PERMISSIONS['auto'];
  const permission = permissions[tier] || 'ask';
  const estimatedCost = estimateCost(model);

  return {
    requestedTier: tier,
    requiredTier,
    overProvisioned: tier > requiredTier,
    underProvisioned: tier < requiredTier,
    permission, // 'auto' | 'ask' | 'deny'
    estimatedCost,
    scores,
    justification: buildJustification(scores, tier, requiredTier),
  };
}

function buildJustification(scores, requestedTier, requiredTier) {
  const parts = [];
  if (scores.risk >= 2) parts.push('high-risk');
  if (scores.complexity >= 2) parts.push('complex');
  if (scores.creativity >= 2) parts.push('creative/architectural');
  if (scores.contextVolume >= 2) parts.push('large-context');
  if (requestedTier > requiredTier) parts.push('over-provisioned');
  if (requestedTier < requiredTier) parts.push('under-provisioned');
  return parts.join(', ') || 'standard task';
}

// ─── Collaboration Assessment ────────────────────────────────────────────────

export function shouldCollaborate(detection, governance, profile) {
  // Never collaborate on tier-1 tasks
  if (governance.requiredTier <= 1) return { collaborate: false };

  // Never collaborate in cost-saver mode unless explicitly requested
  const workStyle = profile?.workStyle || profile?.name || 'auto';
  if (workStyle === 'cost-saver') return { collaborate: false };

  // Check collaboration triggers (need ANY two)
  const triggers = [];
  const text = (detection?.objective || detection?.intent || '').toLowerCase();

  if (/\b(auth|security|credential|billing|migration)\b/.test(text)) triggers.push('irreversibility');
  if (detection?.ambiguity === 'high' || /\b(should we|how to|best approach|tradeoff)\b/.test(text)) triggers.push('ambiguity');
  if (detection?.novelty === 'high' || /\b(new|first time|never done|greenfield)\b/.test(text)) triggers.push('novelty');
  if ((detection?.files?.length || 0) >= 4 && /\b(security|performance|ux)\b/.test(text)) triggers.push('cross-domain');
  if (governance.requestedTier >= 3 && detection?.confidence && detection.confidence < 0.8) triggers.push('low-confidence');

  const shouldDo = triggers.length >= 2;

  return {
    collaborate: shouldDo,
    triggers,
    pattern: shouldDo ? selectPattern(triggers, detection) : null,
    estimatedOverhead: shouldDo ? estimateCost('gpt-4.1') : 0, // secondary model cost
  };
}

function selectPattern(triggers, detection) {
  const text = (detection?.objective || detection?.intent || '').toLowerCase();

  // Security → adversarial review
  if (triggers.includes('irreversibility') && /\b(auth|security|credential)\b/.test(text)) {
    return 'adversarial-review';
  }

  // Architecture/greenfield → second opinion (perspective rotation reserved for Phase 4)
  if (triggers.includes('novelty') || triggers.includes('ambiguity')) {
    return 'second-opinion';
  }

  // Default
  return 'second-opinion';
}

// ─── Governance State (Session Budget Tracking) ──────────────────────────────

const STATE_FILE = '.dualbrain/governance-state.json';
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min gap = new session

export function loadGovernanceState(cwd) {
  const statePath = join(cwd, STATE_FILE);
  try {
    const raw = JSON.parse(readFileSync(statePath, 'utf8'));
    // Check if session is stale
    const lastDispatch = raw.dispatches?.[raw.dispatches.length - 1];
    if (lastDispatch && (Date.now() - Date.parse(lastDispatch.ts)) > SESSION_GAP_MS) {
      // Stale session — reset
      return freshState();
    }
    return raw;
  } catch {
    return freshState();
  }
}

function freshState() {
  return {
    sessionStartedAt: new Date().toISOString(),
    dispatches: [],
    totalEstimatedCost: 0,
    tierCounts: { 1: 0, 2: 0, 3: 0 },
  };
}

export function recordDispatch(cwd, tier, model, estimatedCost, approved = true) {
  const state = loadGovernanceState(cwd);
  state.dispatches.push({
    tier,
    model: String(model),
    estimatedCost,
    approved,
    ts: new Date().toISOString(),
  });
  state.totalEstimatedCost += estimatedCost;
  state.tierCounts[tier] = (state.tierCounts[tier] || 0) + 1;

  const dir = join(cwd, '.dualbrain');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(cwd, STATE_FILE), JSON.stringify(state, null, 2) + '\n');
  return state;
}

export function checkBudget(cwd, orchestratorConfig) {
  const state = loadGovernanceState(cwd);
  const sessionLimit = orchestratorConfig?.budgets?.session_limit_usd || 10;
  const remaining = sessionLimit - state.totalEstimatedCost;

  return {
    spent: state.totalEstimatedCost,
    remaining,
    limit: sessionLimit,
    warning: remaining < sessionLimit * 0.2, // <20% remaining
    blocked: remaining <= 0,
    tierCounts: state.tierCounts,
  };
}

// ─── Format for User Display ─────────────────────────────────────────────────

export function formatGovernancePrompt(governance, collaboration) {
  const tierLabel = MODEL_TIERS[governance.requestedTier]?.label || 'unknown';
  const lines = [];

  lines.push(`[governance] Task requires ${tierLabel} model (tier ${governance.requestedTier}, ~$${governance.estimatedCost.toFixed(2)})`);
  if (governance.justification) lines.push(`  Reason: ${governance.justification}`);
  if (collaboration?.collaborate) {
    lines.push(`  + ${collaboration.pattern} with secondary model (+$${collaboration.estimatedOverhead.toFixed(2)})`);
  }

  return lines.join('\n');
}
