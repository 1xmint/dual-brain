// cost-tracker.mjs — Lightweight cost estimation and efficiency tracking for .dual-brain/costs.jsonl.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN_COSTS = {
  'claude-opus-4-6':           0.03,
  'claude-sonnet-4-6':         0.006,
  'claude-haiku-4-5-20251001': 0.001,
  'gpt-5.5':                   0.04,
  'o3':                        0.03,
  'gpt-4o':                    0.005,
  'gpt-4o-mini':               0.0003,
  'default':                   0.01,
};

export function estimateTokenCost(model, tokens) {
  const rate = TOKEN_COSTS[model] ?? TOKEN_COSTS['default'];
  return (tokens / 1000) * rate;
}

export function trackCost(action, cwd = process.cwd()) {
  try {
    const dir = join(cwd, '.dual-brain');
    mkdirSync(dir, { recursive: true });
    const entry = {
      timestamp:      new Date().toISOString(),
      action:         action.action         ?? 'execute',
      model:          action.model          ?? 'default',
      tokensEstimated: action.tokensEstimated ?? 0,
      costEstimated:  estimateTokenCost(action.model ?? 'default', action.tokensEstimated ?? 0),
      tier:           action.tier           ?? 'standard',
      wasCacheHit:    action.wasCacheHit    ?? false,
      tokensSaved:    action.tokensSaved    ?? 0,
    };
    appendFileSync(join(dir, 'costs.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  } catch {
    return null;
  }
}

function readCostLines(cwd) {
  const p = join(cwd, '.dual-brain', 'costs.jsonl');
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch { return []; }
}

export function getCostSummary(cwd = process.cwd(), days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const all    = readCostLines(cwd).filter(e => e.timestamp >= cutoff);

  if (all.length === 0) {
    return {
      period: `${days} days`,
      totalCost: 0, totalTokens: 0, totalActions: 0,
      cacheHits: 0, tokensSaved: 0, costSaved: 0, savingsRate: 0,
      byTier: {}, byModel: {}, trend: 'stable',
    };
  }

  let totalCost = 0, totalTokens = 0, cacheHits = 0, tokensSaved = 0;
  const byTier  = {};
  const byModel = {};

  for (const e of all) {
    totalCost    += e.costEstimated   ?? 0;
    totalTokens  += e.tokensEstimated ?? 0;
    if (e.wasCacheHit) { cacheHits++; tokensSaved += e.tokensSaved ?? 0; }

    const tier = e.tier ?? 'standard';
    if (!byTier[tier]) byTier[tier] = { count: 0, tokens: 0, cost: 0 };
    byTier[tier].count  += 1;
    byTier[tier].tokens += e.tokensEstimated ?? 0;
    byTier[tier].cost   += e.costEstimated   ?? 0;

    const model = e.model ?? 'default';
    if (!byModel[model]) byModel[model] = { count: 0, tokens: 0, cost: 0 };
    byModel[model].count  += 1;
    byModel[model].tokens += e.tokensEstimated ?? 0;
    byModel[model].cost   += e.costEstimated   ?? 0;
  }

  const costSaved    = estimateTokenCost('default', tokensSaved);
  const savingsRate  = (tokensSaved + totalTokens) > 0
    ? tokensSaved / (tokensSaved + totalTokens)
    : 0;

  // Trend: compare first half vs second half savings rate
  const mid   = Math.floor(all.length / 2);
  const first = all.slice(0, mid);
  const second = all.slice(mid);
  const halfSavings = (half) => {
    const ts = half.reduce((s, e) => s + (e.tokensSaved ?? 0), 0);
    const tt = half.reduce((s, e) => s + (e.tokensEstimated ?? 0), 0);
    return (ts + tt) > 0 ? ts / (ts + tt) : 0;
  };
  let trend = 'stable';
  if (all.length >= 4) {
    const delta = halfSavings(second) - halfSavings(first);
    if (delta > 0.05)       trend = 'improving';
    else if (delta < -0.05) trend = 'degrading';
  }

  return {
    period: `${days} days`,
    totalCost, totalTokens, totalActions: all.length,
    cacheHits, tokensSaved, costSaved, savingsRate,
    byTier, byModel, trend,
  };
}

export function formatCostReport(summary) {
  const {
    period, totalCost, totalTokens, totalActions,
    cacheHits, tokensSaved, costSaved, savingsRate,
    byTier, byModel, trend,
  } = summary;

  const lines = [`COST EFFICIENCY (${period})`];

  const fmtK = (n) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n));
  const fmtD = (n) => `~$${n.toFixed(2)}`;

  lines.push(`  Total: ${fmtD(totalCost)} (${fmtK(totalTokens)} tokens, ${totalActions} actions)`);

  if (cacheHits > 0) {
    const pct = Math.round(savingsRate * 100);
    lines.push(`  Saved: ${fmtD(costSaved)} (${fmtK(tokensSaved)} tokens from ${cacheHits} cache hits)`);
    lines.push(`  Savings rate: ${pct}%`);
  }

  const tierOrder = ['recall', 'quick', 'standard', 'deep', 'ultra'];
  const tierKeys  = [...new Set([...tierOrder, ...Object.keys(byTier)])].filter(k => byTier[k]);
  if (tierKeys.length > 0) {
    lines.push('');
    lines.push('  Tier breakdown:');
    for (const tier of tierKeys) {
      const t = byTier[tier];
      const isRecall = tier === 'recall' && (t.cost < 0.001 || t.tokens === 0);
      const costStr  = isRecall ? '$0.00  (cache hits!)' : fmtD(t.cost);
      lines.push(`    ${tier.padEnd(10)}${String(t.count).padStart(4)} actions  ${costStr}`);
    }
  }

  const trendIcon = trend === 'improving' ? '↗' : trend === 'degrading' ? '↘' : '→';
  lines.push('');
  if (trend !== 'stable') {
    const pct = Math.round(Math.abs(savingsRate) * 100);
    lines.push(`  Trend: ${trendIcon} ${trend} (savings rate ${trend === 'improving' ? 'up' : 'down'} vs last half)`);
  } else {
    lines.push(`  Trend: ${trendIcon} stable`);
  }

  return lines.join('\n');
}

export function getEfficiencyScore(cwd = process.cwd()) {
  const summary = getCostSummary(cwd, 7);
  if (summary.totalActions === 0) return 50;

  const TIER_WEIGHTS = { recall: 0, quick: 1, standard: 2, deep: 4, ultra: 6 };
  const totalTierCost = Object.entries(summary.byTier).reduce((s, [tier, v]) => {
    return s + (TIER_WEIGHTS[tier] ?? 2) * v.count;
  }, 0);
  const maxPossible = summary.totalActions * (TIER_WEIGHTS['ultra'] ?? 6);
  const tierScore   = maxPossible > 0 ? 1 - (totalTierCost / maxPossible) : 0.5;

  const cacheScore = summary.savingsRate;
  const trendBonus = summary.trend === 'improving' ? 10 : summary.trend === 'degrading' ? -10 : 0;

  const raw = Math.round(
    tierScore   * 40 +
    cacheScore  * 40 +
    20          +
    trendBonus
  );

  return Math.max(1, Math.min(100, raw));
}
