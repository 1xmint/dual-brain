// strategy.mjs — Dispatch strategy library + selection
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Strategy definitions ──────────────────────────────────────────────────────

export const STRATEGIES = {
  direct: {
    id: 'direct',
    label: 'Direct dispatch',
    description: 'Single agent, single task. Best for clear, focused work.',
    applicability: { maxFiles: 3, maxComplexity: 'moderate', maxRisk: 'medium' },
    cost: 1.0,
  },
  cascade: {
    id: 'cascade',
    label: 'Think → Execute cascade',
    description: 'Cheap thinker refines spec, then worker executes. Best for routine-but-multi-step tasks.',
    applicability: { minFiles: 1, minComplexity: 'moderate', maxRisk: 'high' },
    cost: 1.3,
  },
  split: {
    id: 'split',
    label: 'Decompose → parallel dispatch',
    description: 'Break into sub-tasks, dispatch each at optimal tier. Best for large multi-file changes.',
    applicability: { minFiles: 4, minComplexity: 'complex' },
    cost: 2.0,
  },
  'dual-review': {
    id: 'dual-review',
    label: 'Execute → adversarial review',
    description: 'Worker implements, second model reviews. Best for high-risk/security code.',
    applicability: { minRisk: 'high' },
    cost: 1.5,
  },
  'architect-editor': {
    id: 'architect-editor',
    label: 'Architect reasons → editor implements',
    description: 'Opus/o3 reasons freely, sonnet/haiku formats the edits. Best for complex architecture + implementation.',
    applicability: { minComplexity: 'complex', minFiles: 3 },
    cost: 1.8,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const COMPLEXITY_RANK = { trivial: 0, simple: 1, moderate: 2, complex: 3 };
const RISK_RANK       = { low: 0, medium: 1, high: 2, critical: 3 };

const COST_CAPS = {
  frugal:        1.0,
  'cost-saver':  1.3,
  balanced:      2.0,
  'quality-first': 3.0,
  maximum:       Infinity,
  aggressive:    Infinity, // maps to maximum behaviour
  fullpower:     Infinity,
  fast:          1.3,
};

const SECURITY_KEYWORDS = /\b(auth|security|billing|payment|credential|secret|token|encrypt|permission|oauth|jwt)\b/i;

function costCap(workStyle) {
  return COST_CAPS[workStyle] ?? 2.0;
}

function fileCount(detection) {
  return detection?.fileCount ?? detection?.files ?? 0;
}

function complexityRank(detection) {
  return COMPLEXITY_RANK[detection?.complexity] ?? 1;
}

function riskRank(detection) {
  return RISK_RANK[detection?.risk] ?? 0;
}

function prompt(detection) {
  return detection?.prompt ?? detection?.description ?? '';
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

function scoreStrategies(detection, workStyle) {
  const files  = fileCount(detection);
  const cRank  = complexityRank(detection);
  const rRank  = riskRank(detection);
  const text   = prompt(detection);
  const frugal = workStyle === 'frugal';
  const saver  = workStyle === 'cost-saver' || workStyle === 'fast';

  return {
    direct: 0.5,

    cascade: 0
      + (cRank >= COMPLEXITY_RANK.moderate ? 0.3 : 0)
      + (files >= 2 ? 0.2 : 0)
      - (frugal ? 0.5 : 0),

    split: 0
      + (files >= 4 ? 0.4 : 0)
      + (cRank >= COMPLEXITY_RANK.complex ? 0.3 : 0)
      - (frugal || saver ? 0.5 : 0),

    'dual-review': 0
      + (rRank >= RISK_RANK.high ? 0.5 : 0)
      + (SECURITY_KEYWORDS.test(text) ? 0.3 : 0)
      - (frugal ? 0.3 : 0),

    'architect-editor': 0
      + (cRank >= COMPLEXITY_RANK.complex && files >= 3 ? 0.4 : 0)
      - (saver ? 0.3 : 0),
  };
}

// ─── Export 1: selectStrategy ─────────────────────────────────────────────────

/**
 * Select the best dispatch strategy for a task.
 * @param {object} detection  — from detect.mjs (detectTask output)
 * @param {object} decision   — from decide.mjs (decideRoute output)
 * @param {object} profile    — user profile (workStyle, etc.)
 * @returns {{ strategy: string, reason: string, alternatives: string[] }}
 */
export function selectStrategy(detection, decision, profile) {
  try {
    const workStyle = profile?.workStyle ?? profile?.bias ?? 'balanced';
    const cap       = costCap(workStyle);
    const scores    = scoreStrategies(detection, workStyle);

    // Filter by cost cap, then rank
    const ranked = Object.entries(scores)
      .filter(([id]) => STRATEGIES[id].cost <= cap)
      .sort(([, a], [, b]) => b - a);

    if (!ranked.length) {
      // Fallback — always allow direct
      return { strategy: 'direct', reason: 'Cost cap allows only direct dispatch.', alternatives: [] };
    }

    const [bestId] = ranked[0];
    const alternatives = ranked.slice(1).map(([id]) => id);

    const reasons = {
      direct:           'Clear, focused task within single-agent scope.',
      cascade:          'Multi-step task benefits from spec refinement before execution.',
      split:            'Large file count warrants decomposition into parallel sub-tasks.',
      'dual-review':    'High-risk or security-sensitive work requires adversarial review.',
      'architect-editor': 'Complex architecture + implementation benefits from dual-model reasoning.',
    };

    return {
      strategy:     bestId,
      reason:       reasons[bestId] ?? 'Best match for task profile.',
      alternatives,
    };
  } catch {
    return { strategy: 'direct', reason: 'Fallback to direct dispatch.', alternatives: [] };
  }
}

// ─── Export 2: describeStrategy ───────────────────────────────────────────────

/**
 * Human-readable description of a strategy.
 * @param {string} strategyId
 * @returns {string}
 */
export function describeStrategy(strategyId) {
  const s = STRATEGIES[strategyId];
  if (!s) return `Unknown strategy: ${strategyId}`;
  return `${s.label} (cost ×${s.cost})\n${s.description}`;
}

// ─── Export 3: getStrategyForTask ─────────────────────────────────────────────

/**
 * Convenience: load profile + decision context, select strategy, return with execution plan.
 * @param {object} detection  — from detect.mjs
 * @param {string} [cwd]      — working directory (for profile loading)
 * @returns {{ strategy: string, reason: string, alternatives: string[], plan: { steps: object[] } }}
 */
export function getStrategyForTask(detection, cwd) {
  const dir = cwd ?? process.cwd();
  let profile = {};
  try {
    const p = join(dir, '.dualbrain', 'config.json');
    if (existsSync(p)) profile = JSON.parse(readFileSync(p, 'utf8'));
  } catch { /* non-throwing */ }

  // Minimal decision stub (model resolved from profile if available)
  const decision = { model: profile?.models?.execute ?? 'sonnet' };
  const selected = selectStrategy(detection, decision, profile);

  return { ...selected, plan: buildPlan(selected.strategy, decision) };
}

// ─── Plan builder ─────────────────────────────────────────────────────────────

function buildPlan(strategyId, decision) {
  const m = decision?.model ?? 'sonnet';
  const plans = {
    direct: [
      { role: 'worker',    model: m,            description: 'Execute task' },
    ],
    cascade: [
      { role: 'thinker',  model: 'sonnet',      description: 'Refine spec' },
      { role: 'worker',   model: 'from-think',  description: 'Execute refined spec' },
    ],
    split: [
      { role: 'thinker',  model: 'sonnet',      description: 'Decompose into sub-tasks' },
      { role: 'worker',   model: 'varies',       description: 'Execute each sub-task' },
    ],
    'dual-review': [
      { role: 'worker',   model: m,             description: 'Implement' },
      { role: 'reviewer', model: 'sonnet',      description: 'Adversarial review' },
    ],
    'architect-editor': [
      { role: 'thinker',  model: 'opus',        description: 'Architect solution' },
      { role: 'worker',   model: 'haiku',       description: 'Format edits' },
    ],
  };
  return { steps: plans[strategyId] ?? plans.direct };
}

// ─── Export 4: listStrategies ─────────────────────────────────────────────────

/**
 * List all strategies for display.
 * @returns {{ id: string, label: string, description: string, cost: number }[]}
 */
export function listStrategies() {
  return Object.values(STRATEGIES).map(({ id, label, description, cost }) => ({ id, label, description, cost }));
}
