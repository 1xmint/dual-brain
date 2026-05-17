// subscription.ts — Subscription-aware routing defaults
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface SubscriptionConfig {
  label: string;
  provider: string;
  tokenBudget: string;
  recommendedProfile: string;
  modelWeights: Record<string, number>;
  notes: string;
}

export const SUBSCRIPTIONS: Record<string, SubscriptionConfig> = {
  // Claude subscriptions
  'claude-pro': {
    label: 'Claude Pro ($20/mo)',
    provider: 'claude',
    tokenBudget: 'moderate', // 5-hr rolling window, weekly cap
    recommendedProfile: 'balanced',
    modelWeights: { haiku: 0.4, sonnet: 0.5, opus: 0.1 },
    notes: 'One extended Opus session can use 20% of your allocation. Prefer sonnet for routine work.',
  },
  'claude-max-5x': {
    label: 'Claude Max 5x ($100/mo)',
    provider: 'claude',
    tokenBudget: 'generous',
    recommendedProfile: 'quality-first',
    modelWeights: { haiku: 0.2, sonnet: 0.5, opus: 0.3 },
    notes: '5x Pro capacity. Opus is available for complex/creative work without worry.',
  },
  'claude-max-20x': {
    label: 'Claude Max 20x ($200/mo)',
    provider: 'claude',
    tokenBudget: 'unlimited',
    recommendedProfile: 'quality-first',
    modelWeights: { haiku: 0.1, sonnet: 0.4, opus: 0.5 },
    notes: 'Effectively unlimited. Use the best model for every task.',
  },
  'claude-team': {
    label: 'Claude Team ($30/seat/mo)',
    provider: 'claude',
    tokenBudget: 'moderate',
    recommendedProfile: 'balanced',
    modelWeights: { haiku: 0.3, sonnet: 0.5, opus: 0.2 },
    notes: 'Team tier with admin controls. Collaboration triggers recommended.',
  },
  // ChatGPT subscriptions
  'chatgpt-plus': {
    label: 'ChatGPT Plus ($20/mo)',
    provider: 'openai',
    tokenBudget: 'limited', // 50 o3/day on Plus
    recommendedProfile: 'cost-saver',
    modelWeights: { 'o4-mini': 0.6, 'gpt-4.1': 0.3, 'o3': 0.1 },
    notes: '50 o3 messages/day limit. Heavy on o4-mini for routine, save o3 for critical decisions.',
  },
  'chatgpt-pro': {
    label: 'ChatGPT Pro ($200/mo)',
    provider: 'openai',
    tokenBudget: 'generous',
    recommendedProfile: 'quality-first',
    modelWeights: { 'o4-mini': 0.3, 'gpt-4.1': 0.4, 'o3': 0.3 },
    notes: 'Unlimited access to all models. Use o3 freely for complex reasoning.',
  },
  // Dual subscription (both providers)
  'dual-pro': {
    label: 'Both Pro tiers',
    provider: 'both',
    tokenBudget: 'moderate',
    recommendedProfile: 'balanced',
    modelWeights: { haiku: 0.2, sonnet: 0.3, 'gpt-4.1': 0.3, 'o4-mini': 0.2 },
    notes: 'Split load across providers. Route by model strength: Claude for code, GPT for reasoning.',
  },
  'dual-max': {
    label: 'Max + Pro (or both Max)',
    provider: 'both',
    tokenBudget: 'unlimited',
    recommendedProfile: 'quality-first',
    modelWeights: { sonnet: 0.3, opus: 0.2, 'gpt-4.1': 0.2, 'o3': 0.3 },
    notes: 'Full power from both providers. Route by task fit, not by cost.',
  },
};

interface DefaultWeights {
  modelWeights: Record<string, number>;
  profile: string;
  notes: string;
}

const DEFAULT_WEIGHTS: DefaultWeights = {
  modelWeights: { haiku: 0.3, sonnet: 0.5, opus: 0.2 },
  profile: 'balanced',
  notes: 'No subscription configured. Using balanced defaults.',
};

function subFile(cwd: string | undefined): string {
  return join(cwd || process.cwd(), '.dualbrain', 'subscription.json');
}

/** Returns the subscription config object or null. */
export function getSubscription(subType: string): SubscriptionConfig | null {
  return SUBSCRIPTIONS[subType] ?? null;
}

/** Returns { modelWeights, profile, notes } for the subscription. Falls back to balanced defaults. */
export function getRecommendedWeights(subType: string): DefaultWeights {
  const sub = SUBSCRIPTIONS[subType];
  if (!sub) return DEFAULT_WEIGHTS;
  return {
    modelWeights: sub.modelWeights,
    profile: sub.recommendedProfile,
    notes: sub.notes,
  };
}

/** Writes { subscription, configuredAt } to .dualbrain/subscription.json. */
export function saveUserSubscription(subType: string, cwd: string | undefined): void {
  const dir = join(cwd || process.cwd(), '.dualbrain');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    subFile(cwd),
    JSON.stringify({ subscription: subType, configuredAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

/** Reads the saved subscription. Returns subType string or null. */
export function loadUserSubscription(cwd: string | undefined): string | null {
  try {
    const p = subFile(cwd);
    if (!existsSync(p)) return null;
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return data.subscription ?? null;
  } catch {
    return null;
  }
}

interface RoutingStatsInput {
  cells?: Record<string, Record<string, { observations?: number }>>;
}

/**
 * Generates a text recommendation based on subscription + current routing stats.
 * routingStats: return value of getRoutingStats() from routing-advisor.mjs
 */
export function generateRecommendation(subType: string, routingStats: RoutingStatsInput | null | undefined): string {
  const sub = SUBSCRIPTIONS[subType];
  if (!sub) return 'No subscription configured. Run `dual-brain subscription set <type>` to enable smart routing defaults.';

  // Tally actual model usage from routing stats cells
  const actualUsage: Record<string, number> = {};
  let totalObs = 0;
  for (const models of Object.values(routingStats?.cells ?? {})) {
    for (const [model, entry] of Object.entries(models)) {
      actualUsage[model] = (actualUsage[model] ?? 0) + (entry.observations ?? 0);
      totalObs += entry.observations ?? 0;
    }
  }

  if (totalObs === 0) {
    return `You're on ${sub.label}. No routing history yet — recommended profile is ${sub.recommendedProfile}. ${sub.notes}`;
  }

  // Compute actual share per model
  const actualShare: Record<string, number> = {};
  for (const [model, count] of Object.entries(actualUsage)) {
    actualShare[model] = count / totalObs;
  }

  const rec = sub.modelWeights;
  const budget = sub.tokenBudget;
  const lines: string[] = [];

  // Check expensive model utilization vs. recommended
  const expensiveModels = ['opus', 'o3'];
  for (const model of expensiveModels) {
    const recW = rec[model] ?? 0;
    const actW = actualShare[model] ?? 0;

    if (recW > 0 && budget === 'unlimited' && actW < recW * 0.5) {
      lines.push(
        `You're on ${sub.label} but only using ${model} ${Math.round(actW * 100)}% of the time` +
        ` (recommended: ${Math.round(recW * 100)}%). You're paying for capacity you're not using.` +
        ` Consider switching to ${sub.recommendedProfile} mode.`
      );
    } else if (recW < 0.2 && budget === 'limited' && actW > recW * 2 && actW > 0.1) {
      lines.push(
        `Your ${sub.label} subscription is token-limited. ${model} usage at ${Math.round(actW * 100)}%` +
        ` may exhaust daily limits — recommended cap is ~${Math.round(recW * 100)}%.`
      );
    }
  }

  // Cheap model suggestions on budget-constrained plans
  const cheapModels = ['haiku', 'o4-mini'];
  if (budget === 'moderate' || budget === 'limited') {
    for (const model of cheapModels) {
      const recW = rec[model] ?? 0;
      const actW = actualShare[model] ?? 0;
      if (recW > 0 && actW < recW * 0.5) {
        lines.push(
          `Your ${sub.label} subscription has a ${budget} budget. Increasing ${model} usage` +
          ` (currently ${Math.round(actW * 100)}%, recommended ${Math.round(recW * 100)}%)` +
          ` for search and routine tasks would preserve your allocation.`
        );
        break; // one cheap-model tip is enough
      }
    }
  }

  // Dominant model confirmation — find the most-used model
  const topModel = Object.entries(actualShare).sort((a, b) => b[1] - a[1])[0];
  if (lines.length === 0 && topModel) {
    lines.push(
      `Your ${sub.label} subscription is well-matched. ${Math.round(topModel[1] * 100)}% of dispatches` +
      ` use ${topModel[0]} — a good fit for your ${budget} budget. ${sub.notes}`
    );
  }

  return lines.slice(0, 3).join(' ');
}

interface SubscriptionListEntry {
  key: string;
  label: string;
  provider: string;
}

/** Returns array of { key, label, provider } for display in UX. */
export function listSubscriptions(): SubscriptionListEntry[] {
  return Object.entries(SUBSCRIPTIONS).map(([key, sub]) => ({
    key,
    label: sub.label,
    provider: sub.provider,
  }));
}
