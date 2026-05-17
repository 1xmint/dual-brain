// strategy.ts — Dispatch strategy library + selection
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Risk, Complexity, Tier } from './types.js';

// ─── Strategy definitions ──────────────────────────────────────────────────────

interface StrategyApplicability {
  maxFiles?: number;
  maxComplexity?: string;
  maxRisk?: string;
  minFiles?: number;
  minComplexity?: string;
  minRisk?: string;
}

interface StrategyDef {
  id: string;
  label: string;
  description: string;
  applicability: StrategyApplicability;
  cost: number;
}

export const STRATEGIES: Record<string, StrategyDef> = {
  direct: { id: 'direct', label: 'Direct dispatch', description: 'Single agent, single task. Best for clear, focused work.', applicability: { maxFiles: 3, maxComplexity: 'moderate', maxRisk: 'medium' }, cost: 1.0 },
  cascade: { id: 'cascade', label: 'Think → Execute cascade', description: 'Cheap thinker refines spec, then worker executes. Best for routine-but-multi-step tasks.', applicability: { minFiles: 1, minComplexity: 'moderate', maxRisk: 'high' }, cost: 1.3 },
  split: { id: 'split', label: 'Decompose → parallel dispatch', description: 'Break into sub-tasks, dispatch each at optimal tier. Best for large multi-file changes.', applicability: { minFiles: 4, minComplexity: 'complex' }, cost: 2.0 },
  'dual-review': { id: 'dual-review', label: 'Execute → adversarial review', description: 'Worker implements, second model reviews. Best for high-risk/security code.', applicability: { minRisk: 'high' }, cost: 1.5 },
  'architect-editor': { id: 'architect-editor', label: 'Architect reasons → editor implements', description: 'Opus/o3 reasons freely, sonnet/haiku formats the edits. Best for complex architecture + implementation.', applicability: { minComplexity: 'complex', minFiles: 3 }, cost: 1.8 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const COMPLEXITY_RANK: Record<string, number> = { trivial: 0, simple: 1, moderate: 2, complex: 3 };
const RISK_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

const COST_CAPS: Record<string, number> = {
  frugal: 1.0, 'cost-saver': 1.3, balanced: 2.0, 'quality-first': 3.0, maximum: Infinity, aggressive: Infinity, fullpower: Infinity, fast: 1.3,
};

const SECURITY_KEYWORDS = /\b(auth|security|billing|payment|credential|secret|token|encrypt|permission|oauth|jwt)\b/i;

function costCap(workStyle: string): number { return COST_CAPS[workStyle] ?? 2.0; }

interface Detection {
  fileCount?: number;
  files?: number;
  complexity?: string;
  risk?: string;
  prompt?: string;
  description?: string;
}

function fileCount(detection: Detection): number { return detection?.fileCount ?? detection?.files ?? 0; }
function complexityRank(detection: Detection): number { return COMPLEXITY_RANK[detection?.complexity ?? ''] ?? 1; }
function riskRank(detection: Detection): number { return RISK_RANK[detection?.risk ?? ''] ?? 0; }
function prompt(detection: Detection): string { return detection?.prompt ?? detection?.description ?? ''; }

// ─── Scoring ───────────────────────────────────────────────────────────────────

function scoreStrategies(detection: Detection, workStyle: string): Record<string, number> {
  const files  = fileCount(detection);
  const cRank  = complexityRank(detection);
  const rRank  = riskRank(detection);
  const text   = prompt(detection);
  const frugal = workStyle === 'frugal';
  const saver  = workStyle === 'cost-saver' || workStyle === 'fast';

  return {
    direct: 0.5,
    cascade: 0 + (cRank >= COMPLEXITY_RANK.moderate ? 0.3 : 0) + (files >= 2 ? 0.2 : 0) - (frugal ? 0.5 : 0),
    split: 0 + (files >= 4 ? 0.4 : 0) + (cRank >= COMPLEXITY_RANK.complex ? 0.3 : 0) - (frugal || saver ? 0.5 : 0),
    'dual-review': 0 + (rRank >= RISK_RANK.high ? 0.5 : 0) + (SECURITY_KEYWORDS.test(text) ? 0.3 : 0) - (frugal ? 0.3 : 0),
    'architect-editor': 0 + (cRank >= COMPLEXITY_RANK.complex && files >= 3 ? 0.4 : 0) - (saver ? 0.3 : 0),
  };
}

// ─── Export 1: selectStrategy ─────────────────────────────────────────────────

interface StrategyResult { strategy: string; reason: string; alternatives: string[] }

export function selectStrategy(detection: Detection, decision: { model?: string }, profile: { workStyle?: string; bias?: string }): StrategyResult {
  try {
    const workStyle = profile?.workStyle ?? profile?.bias ?? 'balanced';
    const cap = costCap(workStyle);
    const scores = scoreStrategies(detection, workStyle);
    const ranked = Object.entries(scores).filter(([id]) => STRATEGIES[id].cost <= cap).sort(([, a], [, b]) => b - a);
    if (!ranked.length) return { strategy: 'direct', reason: 'Cost cap allows only direct dispatch.', alternatives: [] };
    const [bestId] = ranked[0];
    const alternatives = ranked.slice(1).map(([id]) => id);
    const reasons: Record<string, string> = {
      direct: 'Clear, focused task within single-agent scope.',
      cascade: 'Multi-step task benefits from spec refinement before execution.',
      split: 'Large file count warrants decomposition into parallel sub-tasks.',
      'dual-review': 'High-risk or security-sensitive work requires adversarial review.',
      'architect-editor': 'Complex architecture + implementation benefits from dual-model reasoning.',
    };
    return { strategy: bestId, reason: reasons[bestId] ?? 'Best match for task profile.', alternatives };
  } catch {
    return { strategy: 'direct', reason: 'Fallback to direct dispatch.', alternatives: [] };
  }
}

export function describeStrategy(strategyId: string): string {
  const s = STRATEGIES[strategyId];
  if (!s) return `Unknown strategy: ${strategyId}`;
  return `${s.label} (cost ×${s.cost})\n${s.description}`;
}

interface PlanStep { role: string; model: string; description: string }
interface StrategyWithPlan extends StrategyResult { plan: { steps: PlanStep[] } }

export function getStrategyForTask(detection: Detection, cwd?: string): StrategyWithPlan {
  const dir = cwd ?? process.cwd();
  let profile: Record<string, unknown> = {};
  try {
    const p = join(dir, '.dualbrain', 'config.json');
    if (existsSync(p)) profile = JSON.parse(readFileSync(p, 'utf8'));
  } catch {}
  const decision = { model: (profile?.models as Record<string, string>)?.execute ?? 'sonnet' };
  const selected = selectStrategy(detection, decision, profile as { workStyle?: string });
  return { ...selected, plan: buildPlan(selected.strategy, decision) };
}

function buildPlan(strategyId: string, decision: { model?: string }): { steps: PlanStep[] } {
  const m = decision?.model ?? 'sonnet';
  const plans: Record<string, PlanStep[]> = {
    direct: [{ role: 'worker', model: m, description: 'Execute task' }],
    cascade: [{ role: 'thinker', model: 'sonnet', description: 'Refine spec' }, { role: 'worker', model: 'from-think', description: 'Execute refined spec' }],
    split: [{ role: 'thinker', model: 'sonnet', description: 'Decompose into sub-tasks' }, { role: 'worker', model: 'varies', description: 'Execute each sub-task' }],
    'dual-review': [{ role: 'worker', model: m, description: 'Implement' }, { role: 'reviewer', model: 'sonnet', description: 'Adversarial review' }],
    'architect-editor': [{ role: 'thinker', model: 'opus', description: 'Architect solution' }, { role: 'worker', model: 'haiku', description: 'Format edits' }],
  };
  return { steps: plans[strategyId] ?? plans.direct };
}

export function listStrategies(): { id: string; label: string; description: string; cost: number }[] {
  return Object.values(STRATEGIES).map(({ id, label, description, cost }) => ({ id, label, description, cost }));
}
