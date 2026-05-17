// recommendations.ts — Proactive settings recommendations from HEAD
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Recommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  action: string;
  impact: string;
}

function readJSON(path: string): unknown {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch { return null; }
}

function dbPath(cwd: string | undefined, ...parts: string[]): string {
  return join(cwd || process.cwd(), '.dualbrain', ...parts);
}

// --- Signal loaders ---

interface RoutingStateEntry {
  ema: number;
  observations: number;
}

function loadRoutingState(cwd: string | undefined): Record<string, Record<string, RoutingStateEntry>> {
  return (readJSON(dbPath(cwd, 'routing-state.json')) || {}) as Record<string, Record<string, RoutingStateEntry>>;
}

interface ThinkMetrics {
  hitRate?: number;
  totalHits?: number;
  totalMisses?: number;
  avgTokensSaved?: number;
  cascadeHits?: number;
}

function loadThinkMetrics(cwd: string | undefined): ThinkMetrics {
  return (readJSON(dbPath(cwd, 'think-metrics.json')) || {}) as ThinkMetrics;
}

interface GovernanceState {
  budgetUsedPct?: number;
  sessionProgressPct?: number;
  workStyle?: string;
}

function loadGovernance(cwd: string | undefined): GovernanceState {
  return (readJSON(dbPath(cwd, 'governance-state.json')) || {}) as GovernanceState;
}

interface SubscriptionState {
  tier?: string;
  maxMultiplier?: number;
}

function loadSubscription(cwd: string | undefined): SubscriptionState {
  return (readJSON(dbPath(cwd, 'subscription.json')) || {}) as SubscriptionState;
}

interface OutcomeRecord {
  success?: boolean;
  reward?: number;
  model?: string;
  cascaded?: boolean;
}

function loadOutcomes(cwd: string | undefined): OutcomeRecord[] {
  try {
    const dir = dbPath(cwd, 'outcomes');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => readJSON(join(dir, f)) as OutcomeRecord | null)
      .filter((v): v is OutcomeRecord => v !== null);
  } catch { return []; }
}

// --- Recommendation rules ---

function thinkROI(metrics: ThinkMetrics): Recommendation | null {
  const { hitRate, totalHits, totalMisses, avgTokensSaved } = metrics;
  if (hitRate == null) return null;
  const observations = (totalHits || 0) + (totalMisses || 0);
  if (observations < 5) return null;

  if (hitRate < 0.4) {
    return {
      id: 'think-roi-low',
      priority: 'medium',
      category: 'efficiency',
      title: 'Think agent underperforming',
      description: `${Math.round(hitRate * 100)}% hit rate — think preflight isn't saving tokens.`,
      action: 'Consider disabling think triggers or narrowing trigger conditions.',
      impact: 'Reduce latency and token overhead on low-complexity tasks.',
    };
  }
  if (hitRate > 0.7) {
    const savings = avgTokensSaved ? `~${Math.round(avgTokensSaved / 1000)}K tokens` : 'tokens';
    return {
      id: 'think-roi-high',
      priority: 'medium',
      category: 'efficiency',
      title: 'Think agent performing well',
      description: `${Math.round(hitRate * 100)}% hit rate, saving ${savings} per refined task.`,
      action: 'No action needed, keep enabled.',
      impact: 'Sustained token efficiency on complex dispatches.',
    };
  }
  return null;
}

function modelMismatch(routingState: Record<string, Record<string, RoutingStateEntry>>): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const [taskType, models] of Object.entries(routingState)) {
    if (taskType.startsWith('_')) continue; // skip metadata keys
    for (const [model, stats] of Object.entries(models)) {
      const { ema, observations } = stats || {};
      if (observations >= 10 && ema < 0.4) {
        recs.push({
          id: `model-mismatch-low-${taskType}-${model}`,
          priority: 'high',
          category: 'routing',
          title: 'Model mismatch detected',
          description: `${model} scores ${ema.toFixed(2)} on ${taskType} tasks.`,
          action: `Route ${taskType} tasks away from ${model}.`,
          impact: 'Better task outcomes by avoiding poor model-task fit.',
        });
      } else if (observations >= 10 && ema > 0.8 && (model === 'haiku' || model.includes('haiku'))) {
        recs.push({
          id: `model-mismatch-promote-${taskType}-${model}`,
          priority: 'high',
          category: 'routing',
          title: 'Cheap model excelling',
          description: `${model} scores ${ema.toFixed(2)} on ${taskType} tasks.`,
          action: `Promote ${model} as default for ${taskType} tier — quality without the cost.`,
          impact: 'Same output quality at lower token cost.',
        });
      }
    }
  }
  return recs;
}

function budgetTrajectory(governance: GovernanceState): Recommendation | null {
  const { budgetUsedPct, sessionProgressPct, workStyle } = governance;
  if (budgetUsedPct == null) return null;

  if (budgetUsedPct > 60 && sessionProgressPct != null && sessionProgressPct < 50) {
    return {
      id: 'budget-critical',
      priority: 'high',
      category: 'budget',
      title: 'Budget burning fast',
      description: `${Math.round(budgetUsedPct)}% budget used, ~${Math.round(sessionProgressPct)}% through estimated work.`,
      action: 'Switch to cost-saver mode: `dual-brain config set workStyle cost-saver`.',
      impact: 'Avoid hitting budget ceiling before work completes.',
    };
  }
  if (budgetUsedPct < 20 && workStyle === 'cost-saver') {
    return {
      id: 'budget-underutilized',
      priority: 'low',
      category: 'budget',
      title: 'Budget well under control',
      description: `Only ${Math.round(budgetUsedPct)}% budget used in cost-saver mode.`,
      action: 'You could afford quality-first mode for this session.',
      impact: 'Better output quality while staying within budget.',
    };
  }
  return null;
}

function failurePattern(outcomes: OutcomeRecord[]): Recommendation | null {
  if (!outcomes.length) return null;
  const recent = outcomes.slice(-20);
  const failures = recent.filter(o => o.success === false || (o.reward != null && o.reward < 0.3));
  const failRate = failures.length / recent.length;

  if (failRate > 0.3) {
    const modelCounts: Record<string, number> = {};
    failures.forEach(o => { if (o.model) modelCounts[o.model] = (modelCounts[o.model] || 0) + 1; });
    const worstModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0];
    const modelNote = worstModel && worstModel[1] >= 3
      ? ` Failures cluster on ${worstModel[0]}.`
      : '';
    return {
      id: 'failure-pattern',
      priority: 'high',
      category: 'quality',
      title: 'High failure rate detected',
      description: `${Math.round(failRate * 100)}% of recent tasks failed.${modelNote}`,
      action: worstModel && worstModel[1] >= 3
        ? `Route away from ${worstModel[0]} — or check task ambiguity.`
        : 'Review task clarity and model-task fit.',
      impact: 'Fewer retries, less wasted compute.',
    };
  }
  return null;
}

function subscriptionUtilization(subscription: SubscriptionState, routingState: Record<string, Record<string, RoutingStateEntry>>): Recommendation | null {
  const { tier, maxMultiplier } = subscription;
  if (!tier) return null;

  const routingCells = Object.entries(routingState)
    .filter(([k]) => !k.startsWith('_')) // skip metadata keys
    .map(([, v]) => v);

  const opusUses = routingCells
    .flatMap(m => Object.entries(m))
    .filter(([model]) => model === 'opus' || model.includes('opus'))
    .reduce((s, [, stats]) => s + (stats.observations || 0), 0);

  const totalUses = routingCells
    .flatMap(m => Object.values(m))
    .reduce((s, stats) => s + (stats.observations || 0), 0);

  if (!totalUses) return null;
  const opusPct = opusUses / totalUses;

  if ((tier === 'max' || (maxMultiplier && maxMultiplier >= 20)) && opusPct < 0.15) {
    return {
      id: 'subscription-underutilized',
      priority: 'medium',
      category: 'profile',
      title: 'Subscription underutilized',
      description: `Max ${maxMultiplier || ''}x plan but opus used only ${Math.round(opusPct * 100)}% of dispatches.`,
      action: 'Consider quality-first mode for better output.',
      impact: 'Get more value from your subscription tier.',
    };
  }
  if ((tier === 'free' || tier === 'pro') && opusPct > 0.4) {
    return {
      id: 'subscription-aggressive',
      priority: 'medium',
      category: 'profile',
      title: 'Routing aggressively for plan',
      description: `${Math.round(opusPct * 100)}% opus usage on a ${tier} plan.`,
      action: 'Switch to balanced or cost-saver to stay within limits.',
      impact: 'Avoid rate limits and unexpected cost overruns.',
    };
  }
  return null;
}

function cascadeEffectiveness(metrics: ThinkMetrics, outcomes: OutcomeRecord[]): Recommendation | null {
  const { cascadeHits } = metrics;
  if (!cascadeHits || cascadeHits < 3) return null;

  const cascaded = outcomes.filter(o => o.cascaded === true);
  if (cascaded.length < 3) return null;

  const avgReward = cascaded.reduce((s, o) => s + (o.reward || 0), 0) / cascaded.length;
  if (avgReward > 0.7) {
    return {
      id: 'cascade-effective',
      priority: 'low',
      category: 'efficiency',
      title: 'Cascade routing working well',
      description: `${cascadeHits} cascade hits, ${avgReward.toFixed(2)} avg reward on cascaded tasks.`,
      action: 'Keep cascade enabled — it\'s delivering quality results.',
      impact: 'Continued token efficiency on eligible tasks.',
    };
  }
  return {
    id: 'cascade-poor',
    priority: 'low',
    category: 'efficiency',
    title: 'Cascade delivering poor results',
    description: `${cascadeHits} cascade hits but only ${avgReward.toFixed(2)} avg reward.`,
    action: 'Consider disabling cascade: `dual-brain config set cascade false`.',
    impact: 'Better outcomes by routing cascade tasks to full models.',
  };
}

// --- Export 1: generateRecommendations ---

export function generateRecommendations(cwd: string | undefined): Recommendation[] {
  try {
    const routingState  = loadRoutingState(cwd);
    const thinkMetrics  = loadThinkMetrics(cwd);
    const governance    = loadGovernance(cwd);
    const subscription  = loadSubscription(cwd);
    const outcomes      = loadOutcomes(cwd);

    const recs: (Recommendation | null)[] = [
      ...modelMismatch(routingState),
      failurePattern(outcomes),
      budgetTrajectory(governance),
      thinkROI(thinkMetrics),
      subscriptionUtilization(subscription, routingState),
      cascadeEffectiveness(thinkMetrics, outcomes),
    ];

    const filtered = recs.filter((r): r is Recommendation => r !== null);

    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  } catch { return []; }
}

// --- Export 2: formatRecommendations ---

const ICONS: Record<string, string> = { high: '⚡', medium: '💡', low: '📊' };

export function formatRecommendations(recs: Recommendation[]): string {
  const top = recs.slice(0, 4);
  if (!top.length) {
    return '╭─ Recommendations ─────────────────────────────────────────────╮\n' +
           '│  No recommendations — configuration looks healthy.            │\n' +
           '╰───────────────────────────────────────────────────────────────╯';
  }

  const WIDTH = 63;
  // Truncate + pad to fit inside box: WIDTH - 4 accounts for '| ' and ' |'
  const INNER = WIDTH - 4;
  const clip = (str: string): string => str.length > INNER ? str.slice(0, INNER - 1) + '…' : str;
  const pad = (str: string): string => clip(str).padEnd(INNER);
  const line = (content: string): string => `│ ${pad(content)} │`;

  const lines: string[] = [
    '╭─ Recommendations ' + '─'.repeat(WIDTH - 20) + '╮',
    line(''),
  ];

  for (const rec of top) {
    const icon = ICONS[rec.priority] || '•';
    lines.push(line(`${icon} ${rec.priority.toUpperCase()}: ${rec.title}`));
    lines.push(line(`   ${rec.description}`));
    lines.push(line(`   → ${rec.action}`));
    lines.push(line(''));
  }

  lines.push('╰' + '─'.repeat(WIDTH - 2) + '╯');
  return lines.join('\n');
}

// --- Export 3: getTopRecommendation ---

export function getTopRecommendation(cwd: string | undefined): Recommendation | null {
  const recs = generateRecommendations(cwd);
  return recs.length ? recs[0] : null;
}
