#!/usr/bin/env node
/**
 * budget-balancer.mjs — Core budget balancing module for the Dual-Brain Orchestrator.
 *
 * Tracks rolling usage pressure across Claude and OpenAI providers and recommends
 * which provider should handle incoming work.
 *
 * Exported API:
 *   getProviderStatus()          → current pressure per provider/tier
 *   chooseProvider(taskProfile)  → recommended provider + model + rationale
 *   recordUsageEvent(event)      → append a usage event to today's log
 *
 * Also works as a standalone CLI: node .claude/hooks/budget-balancer.mjs
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_CONFIG = join(__dirname, "..", "orchestrator.json");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Subscription tier definitions with real token budgets.
 * Token limits are per-model-class per rolling window.
 * Sources: Anthropic pricing page, OpenAI subscription docs (May 2025).
 * These are best-effort estimates — providers adjust limits dynamically.
 */
const SUBSCRIPTION_TIERS = {
  claude: {
    "$20":  { label: "Claude Pro $20",     fiveHr: { think: 22_000,  execute: 80_000,   search: 300_000 },   weekly: { think: 150_000,   execute: 600_000,   search: 2_000_000 } },
    "$100": { label: "Claude Max x5",     fiveHr: { think: 88_000,  execute: 350_000,  search: 1_200_000 }, weekly: { think: 600_000,   execute: 2_500_000, search: 8_000_000 } },
    "$200": { label: "Claude Max x20",    fiveHr: { think: 220_000, execute: 900_000,  search: 3_000_000 }, weekly: { think: 1_500_000, execute: 6_000_000, search: 20_000_000 } },
  },
  openai: {
    "$20":  { label: "ChatGPT Plus $20",  fiveHr: { think: 20_000,  execute: 80_000,   search: 300_000 },   weekly: { think: 140_000,   execute: 560_000,   search: 2_000_000 } },
    "$100": { label: "ChatGPT Pro $100", fiveHr: { think: 50_000,  execute: 200_000,  search: 800_000 },   weekly: { think: 350_000,   execute: 1_400_000, search: 5_000_000 } },
    "$200": { label: "ChatGPT Pro $200", fiveHr: { think: 100_000, execute: 400_000,  search: 1_500_000 }, weekly: { think: 700_000,   execute: 2_800_000, search: 10_000_000 } },
  },
};

/** Fallback tokens-per-call when usage log has no real token data for an entry */
const TOKENS_PER_CALL_FALLBACK = {
  search:  2_500,
  execute: 8_000,
  think:  15_000,
};

function getSubscriptionBudgets(config) {
  const claudePlan = config?.subscriptions?.claude?.plan || "$100";
  const openaiPlan = config?.subscriptions?.openai?.plan || "$20";
  const claudeTier = SUBSCRIPTION_TIERS.claude[claudePlan] || SUBSCRIPTION_TIERS.claude["$100"];
  const openaiTier = SUBSCRIPTION_TIERS.openai[openaiPlan] || SUBSCRIPTION_TIERS.openai["$20"];
  return {
    claude: { fiveHr: claudeTier.fiveHr, weekly: claudeTier.weekly, label: claudeTier.label },
    openai: { fiveHr: openaiTier.fiveHr, weekly: openaiTier.weekly, label: openaiTier.label },
  };
}

const DEFAULT_THRESHOLDS = {
  warm:      0.55,
  hot:       0.75,
  throttled: 0.90,
};

/** Default model mapping when orchestrator.json is missing provider config */
const DEFAULT_MODELS = {
  claude: { think: "opus", execute: "sonnet", search: "haiku" },
  openai: { think: "gpt-5.5", execute: "gpt-5.4", search: "gpt-4.1-mini" },
};

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  try {
    return JSON.parse(readFileSync(ORCHESTRATOR_CONFIG, "utf8"));
  } catch {
    return {};
  }
}

function getThresholds(config, provider) {
  return (
    config?.providers?.[provider]?.pressure_thresholds || DEFAULT_THRESHOLDS
  );
}

function getProviderModels(config, provider) {
  return config?.providers?.[provider]?.models || DEFAULT_MODELS[provider];
}

// ---------------------------------------------------------------------------
// Provider / tier detection from model name
// ---------------------------------------------------------------------------

/**
 * Given a model string, return { provider, tier } or null if unrecognised.
 */
function classifyModel(model) {
  if (!model) return null;
  const m = String(model).toLowerCase();

  if (m.includes("opus"))         return { provider: "claude", tier: "think" };
  if (m.includes("sonnet"))       return { provider: "claude", tier: "execute" };
  if (m.includes("haiku"))        return { provider: "claude", tier: "search" };
  if (m.includes("gpt-5.5"))     return { provider: "openai", tier: "think" };
  if (m === "gpt-4.1-mini")      return { provider: "openai", tier: "search" };
  if (m === "gpt-4.1")           return { provider: "openai", tier: "execute" };
  if (m.includes("gpt-5.") || m.includes("gpt-4.")) return { provider: "openai", tier: "execute" };
  if (m.includes("mini"))         return { provider: "openai", tier: "search" };

  return null;
}

/**
 * Return models available for a subscription tier.
 * Pro ($20) → no opus, limited models. Max ($100/$200) → full access.
 */
function getAvailableModels(provider, plan) {
  if (provider === 'claude') {
    if (plan === '$20') return ['haiku', 'sonnet'];
    return ['haiku', 'sonnet', 'opus'];
  }
  if (provider === 'openai') {
    if (plan === '$20') return ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini'];
    return ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.5'];
  }
  return [];
}

function isModelAvailable(model, provider, config) {
  const plan = config?.subscriptions?.[provider]?.plan || (provider === 'claude' ? '$100' : '$20');
  const available = getAvailableModels(provider, plan);
  return available.includes(model);
}

function downgradeModel(model, provider, config) {
  const plan = config?.subscriptions?.[provider]?.plan || (provider === 'claude' ? '$100' : '$20');
  const available = getAvailableModels(provider, plan);
  if (available.includes(model)) return model;

  if (provider === 'claude') {
    if (model === 'opus') return available.includes('sonnet') ? 'sonnet' : 'haiku';
    return 'haiku';
  }
  const rank = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.5'];
  const idx = rank.indexOf(model);
  for (let i = idx - 1; i >= 0; i--) {
    if (available.includes(rank[i])) return rank[i];
  }
  return available[0] || 'gpt-4.1-mini';
}

// ---------------------------------------------------------------------------
// Usage log helpers
// ---------------------------------------------------------------------------

function usageFilePath(date) {
  const d = date || new Date().toISOString().slice(0, 10);
  return join(__dirname, `usage-${d}.jsonl`);
}

/**
 * Read usage entries within a time window.
 * Scans log files covering the window range.
 */
function readEntriesInWindow(windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const entries = [];

  const daysBack = Math.ceil(windowMs / 86_400_000) + 1;
  const seen = new Set();
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    if (seen.has(date)) continue;
    seen.add(date);
    const file = usageFilePath(date);
    if (!existsSync(file)) continue;
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = Date.parse(record.timestamp);
      if (!isNaN(ts) && ts >= cutoff) {
        entries.push(record);
      }
    }
  }
  return entries;
}

function readRecentEntries() {
  return readEntriesInWindow(FIVE_HOURS_MS);
}

// ---------------------------------------------------------------------------
// Exported: getProviderStatus()
// ---------------------------------------------------------------------------

/**
 * Sum actual tokens from usage entries for a provider/tier.
 * Uses real input_tokens + output_tokens when available, falls back to estimate.
 */
function sumTokens(entries) {
  const tokens = {
    claude: { think: 0, execute: 0, search: 0 },
    openai: { think: 0, execute: 0, search: 0 },
  };
  const calls = {
    claude: { think: 0, execute: 0, search: 0 },
    openai: { think: 0, execute: 0, search: 0 },
  };
  const realTokenCalls = {
    claude: { think: 0, execute: 0, search: 0 },
    openai: { think: 0, execute: 0, search: 0 },
  };

  for (const entry of entries) {
    let provider = entry.provider;
    let tier = entry.tier;

    if (!provider && entry.model) {
      const classified = classifyModel(entry.model);
      if (classified) {
        provider = classified.provider;
        tier = classified.tier;
      }
    }

    if (!provider || !tier || !tokens[provider] || tokens[provider][tier] === undefined) continue;

    calls[provider][tier]++;

    const inp = entry.input_tokens;
    const out = entry.output_tokens;
    if (inp != null && out != null && (inp > 0 || out > 0)) {
      tokens[provider][tier] += inp + out;
      realTokenCalls[provider][tier]++;
    } else {
      tokens[provider][tier] += TOKENS_PER_CALL_FALLBACK[tier] || 8_000;
    }
  }

  return { tokens, calls, realTokenCalls };
}

/**
 * Compute rolling pressure for each provider/tier using actual token sums
 * against real subscription budgets. Returns both 5hr and weekly pressure.
 *
 * @returns {object} Status keyed by provider → tier → { pressure, weeklyPressure, state, calls, tokens, budget, weeklyBudget }
 */
function getProviderStatus() {
  const config = loadConfig();
  const budgets = getSubscriptionBudgets(config);

  const fiveHrEntries = readEntriesInWindow(FIVE_HOURS_MS);
  const weeklyEntries = readEntriesInWindow(SEVEN_DAYS_MS);

  const fiveHr = sumTokens(fiveHrEntries);
  const weekly = sumTokens(weeklyEntries);

  const status = {};

  for (const provider of ["claude", "openai"]) {
    const thresholds = getThresholds(config, provider);
    status[provider] = {};

    for (const tier of ["think", "execute", "search"]) {
      const tokensUsed = fiveHr.tokens[provider][tier];
      const budget = budgets[provider].fiveHr[tier];
      const pressure = budget > 0 ? tokensUsed / budget : 0;

      const weeklyTokens = weekly.tokens[provider][tier];
      const weeklyBudget = budgets[provider].weekly[tier];
      const weeklyPressure = weeklyBudget > 0 ? weeklyTokens / weeklyBudget : 0;

      const effectivePressure = Math.max(pressure, weeklyPressure);

      let state;
      if (effectivePressure >= (thresholds.throttled ?? DEFAULT_THRESHOLDS.throttled)) {
        state = "throttled";
      } else if (effectivePressure >= (thresholds.hot ?? DEFAULT_THRESHOLDS.hot)) {
        state = "hot";
      } else if (effectivePressure >= (thresholds.warm ?? DEFAULT_THRESHOLDS.warm)) {
        state = "warm";
      } else {
        state = "healthy";
      }

      status[provider][tier] = {
        pressure,
        weeklyPressure,
        effectivePressure,
        state,
        calls: fiveHr.calls[provider][tier],
        tokens: tokensUsed,
        budget,
        weeklyTokens,
        weeklyBudget,
        realTokenCalls: fiveHr.realTokenCalls[provider][tier],
      };
    }

    status[provider]._label = budgets[provider].label;
  }

  return status;
}

// ---------------------------------------------------------------------------
// Exported: chooseProvider(taskProfile)
// ---------------------------------------------------------------------------

/**
 * Recommend a provider for an incoming task.
 *
 * @param {object} taskProfile
 * @param {string} taskProfile.tier                  - search | execute | think
 * @param {number} [taskProfile.estimatedDurationMs] - expected task duration
 * @param {string} [taskProfile.contextCoupling]     - low | medium | high
 * @param {string} [taskProfile.isolation]           - low | medium | high
 * @returns {{ provider, model, reason, scores }}
 */
function chooseProvider(taskProfile = {}) {
  const {
    tier = "execute",
    estimatedDurationMs = 0,
    contextCoupling = "low",
    isolation = "low",
  } = taskProfile;

  const config = loadConfig();
  const status = getProviderStatus();

  let profileBias = 0;
  try {
    const profilePath = join(__dirname, '..', 'dual-brain.profile.json');
    if (existsSync(profilePath)) {
      const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
      const active = profile.active || 'balanced';
      if (active === 'cost-saver') profileBias = -20;
      else if (active === 'quality-first') profileBias = 10;
    }
  } catch {}

  const PRESSURE_PENALTY = {
    healthy:   0,
    warm:     15,
    hot:      40,
    throttled: 100,
  };

  const scores = {};

  for (const provider of ["claude", "openai"]) {
    const tierStatus = status[provider]?.[tier] || { effectivePressure: 0, state: "healthy" };
    const otherProvider = provider === "claude" ? "openai" : "claude";
    const otherTierStatus = status[otherProvider]?.[tier] || { effectivePressure: 0, state: "healthy" };

    let score = 50;

    if (provider === "claude") {
      if (contextCoupling === "high")   score += 20;
      else if (contextCoupling === "medium") score += 10;
    } else {
      if (isolation === "high")   score += 20;
      else if (isolation === "medium") score += 10;
    }

    score -= PRESSURE_PENALTY[tierStatus.state] ?? 0;

    if (provider === 'openai') score += profileBias;

    if (provider === "openai") {
      let minTaskMs = 180_000;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const summaryPath = join(__dirname, `usage-summary-${today}.json`);
        const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
        const latencies = (summary.codex_latencies || []).map(l => l.startup_ms).filter(Boolean);
        if (latencies.length >= 5) {
          const sorted = latencies.sort((a, b) => a - b);
          const p75 = sorted[Math.floor(sorted.length * 0.75)];
          minTaskMs = Math.max(90_000, p75 * 4);
        }
      } catch {}

      if (estimatedDurationMs < minTaskMs) {
        score -= 25;
      } else if (estimatedDurationMs < 600_000) {
        score -= 10;
      }
    }

    if (
      tierStatus.effectivePressure < 0.3 &&
      otherTierStatus.effectivePressure > 0.5
    ) {
      score += 20;
    }

    scores[provider] = Math.round(score);
  }

  // Both-providers-throttled hard stop
  const claudeState = status.claude?.[tier]?.state;
  const openaiState = status.openai?.[tier]?.state;
  if (claudeState === 'throttled' && openaiState === 'throttled') {
    const claudeP = status.claude[tier].effectivePressure;
    const openaiP = status.openai[tier].effectivePressure;
    const lessThrottled = claudeP <= openaiP ? 'claude' : 'openai';
    const m = getProviderModels(config, lessThrottled);
    return {
      provider: lessThrottled,
      model: m?.[tier] || DEFAULT_MODELS[lessThrottled][tier],
      reason: `BOTH PROVIDERS THROTTLED (claude ${Math.round(claudeP * 100)}%, openai ${Math.round(openaiP * 100)}%). Using ${lessThrottled} as least-throttled. Consider waiting or downgrading tier.`,
      scores,
      bothThrottled: true,
    };
  }

  const winner = scores.claude >= scores.openai ? "claude" : "openai";
  const loser  = winner === "claude" ? "openai" : "claude";

  const models = getProviderModels(config, winner);
  let model = models?.[tier] || DEFAULT_MODELS[winner][tier];

  // Gate model by subscription tier
  if (!isModelAvailable(model, winner, config)) {
    const downgraded = downgradeModel(model, winner, config);
    model = downgraded;
  }

  const ws = status[winner]?.[tier] || {};
  const ls = status[loser]?.[tier] || {};

  let reasonParts = [];
  if (winner === "claude" && contextCoupling !== "low") {
    reasonParts.push(`high session context coupling`);
  }
  if (winner === "openai" && isolation !== "low") {
    reasonParts.push(`isolated task`);
  }
  const wp = (ws.effectivePressure ?? 0);
  const lp = (ls.effectivePressure ?? 0);
  if (wp < lp) {
    reasonParts.push(`${winner} ${Math.round(wp * 100)}% vs ${loser} ${Math.round(lp * 100)}%`);
  }
  if (ws.weeklyPressure > ws.pressure) {
    reasonParts.push(`weekly limit is binding (${Math.round(ws.weeklyPressure * 100)}%)`);
  }
  if (!reasonParts.length) {
    reasonParts.push(`${winner} scored ${scores[winner]} vs ${scores[loser]}`);
  }

  return {
    provider: winner,
    model,
    reason: reasonParts.join(", "),
    scores,
  };
}

// ---------------------------------------------------------------------------
// Exported: estimateWaveCost(tasks)
// ---------------------------------------------------------------------------

function estimateWaveCost(tasks) {
  const config = loadConfig();
  const budgets = getSubscriptionBudgets(config);
  const status = getProviderStatus();

  let totalTokens = { claude: 0, openai: 0 };
  for (const task of tasks) {
    const provider = task.provider || 'claude';
    const tier = task.tier || 'execute';
    const estimate = TOKENS_PER_CALL_FALLBACK[tier] || 8_000;
    totalTokens[provider] += estimate;
  }

  const impact = {};
  for (const provider of ['claude', 'openai']) {
    if (totalTokens[provider] === 0) continue;
    const tierStatus = status[provider]?.execute || {};
    const remaining = Math.max(0, (tierStatus.budget || 0) - (tierStatus.tokens || 0));
    const pctOfBudget = tierStatus.budget > 0 ? (totalTokens[provider] / tierStatus.budget) * 100 : 0;
    impact[provider] = {
      estimatedTokens: totalTokens[provider],
      remaining,
      pctOfBudget: Math.round(pctOfBudget * 10) / 10,
      wouldExceed: totalTokens[provider] > remaining,
    };
  }

  return { totalTokens, impact, taskCount: tasks.length };
}

// ---------------------------------------------------------------------------
// Exported: estimateTokensForTask(task)
// ---------------------------------------------------------------------------

function estimateTokensForTask(task) {
  const tier = task?.tier || 'execute';
  const fileCount = Math.max(1, (task?.files?.length || 0));
  const base = TOKENS_PER_CALL_FALLBACK[tier] || 8_000;
  const effortMultiplier = { low: 0.5, medium: 1, high: 1.5, xhigh: 2.5 };
  const mult = effortMultiplier[task?.effort] || 1;
  return Math.round(base * mult * Math.sqrt(fileCount));
}

// ---------------------------------------------------------------------------
// Exported: recordUsageEvent(event)
// ---------------------------------------------------------------------------

/**
 * Append a usage event to today's daily log file.
 * Automatically adds `provider` field if not present.
 *
 * @param {object} event - Usage event (see cost-logger.mjs schema)
 */
function recordUsageEvent(event = {}) {
  // Infer provider from model name if not supplied
  let provider = event.provider;
  if (!provider && event.model) {
    const classified = classifyModel(event.model);
    provider = classified?.provider || "claude";
  }
  if (!provider) provider = "claude";

  const entry = JSON.stringify({
    schema_version: 2,
    timestamp: event.timestamp || new Date().toISOString(),
    provider,
    ...event,
  });

  const file = usageFilePath();
  mkdirSync(dirname(file), { recursive: true });

  try {
    appendFileSync(file, entry + "\n", { encoding: "utf8", flag: "a" });
  } catch (err) {
    // Non-fatal — log to stderr but don't crash callers
    process.stderr.write(`[budget-balancer] Failed to write usage event: ${err.message}\n`);
  }
}

// ---------------------------------------------------------------------------
// CLI rendering helpers
// ---------------------------------------------------------------------------

function pressureBar(pressure, width = 10) {
  const filled = Math.min(width, Math.round(pressure * width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function stateLabel(state) {
  return state.padEnd(8);
}

function formatPercent(pressure) {
  return String(Math.round(pressure * 100)).padStart(3) + "%";
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function printStatusTable(status) {
  const LINE_WIDTH = 62;
  const border = "═".repeat(LINE_WIDTH - 2);
  const blank  = " ".repeat(LINE_WIDTH - 4);

  const h = (text) => {
    const padded = ` ${text}`.padEnd(LINE_WIDTH - 4);
    return `║ ${padded} ║`;
  };

  const row = (label, tier) => {
    const s = status[label]?.[tier] || { effectivePressure: 0, pressure: 0, state: "healthy", tokens: 0, budget: 0 };
    const bar = pressureBar(s.effectivePressure);
    const pct = formatPercent(s.effectivePressure);
    const lbl = stateLabel(s.state);
    const used = formatTokens(s.tokens || 0);
    const cap = formatTokens(s.budget || 0);
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const line = `  ${tierLabel.padEnd(7)}: ${bar} ${pct} ${lbl} ${used}/${cap}`;
    return h(line);
  };

  const weeklyRow = (label, tier) => {
    const s = status[label]?.[tier] || {};
    if (!s.weeklyPressure || s.weeklyPressure <= 0) return null;
    const pct = Math.round((s.weeklyPressure || 0) * 100);
    const used = formatTokens(s.weeklyTokens || 0);
    const cap = formatTokens(s.weeklyBudget || 0);
    return h(`          weekly: ${pct}% (${used}/${cap})`);
  };

  const claudeLabel = status.claude?._label || "Claude Max $100";
  const openaiLabel = status.openai?._label || "ChatGPT Plus $20";

  const rec = chooseProvider({ tier: "execute", estimatedDurationMs: 300_000, isolation: "high", contextCoupling: "low" });
  const recText = `Route execution to ${rec.provider === "openai" ? "OpenAI" : "Claude"}`;

  const lines = [
    `╔${border}╗`,
    h("           Provider Balance Status"),
    h("           (token-based, real limits)"),
    `╠${border}╣`,
    h(claudeLabel),
    row("claude", "think"),
    weeklyRow("claude", "think"),
    row("claude", "execute"),
    weeklyRow("claude", "execute"),
    row("claude", "search"),
    h(blank),
    h(openaiLabel),
    row("openai", "think"),
    weeklyRow("openai", "think"),
    row("openai", "execute"),
    weeklyRow("openai", "execute"),
    row("openai", "search"),
    `╠${border}╣`,
    h(`Recommendation: ${recText}`),
    h(`Reason: ${rec.reason}`),
    `╚${border}╝`,
  ];

  console.log(lines.filter(Boolean).join("\n"));
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const status = getProviderStatus();
  printStatusTable(status);
}

// Run as CLI only when invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[budget-balancer] ${err.message}\n`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export { getProviderStatus, chooseProvider, recordUsageEvent, getSubscriptionBudgets, estimateWaveCost, estimateTokensForTask, isModelAvailable, downgradeModel, SUBSCRIPTION_TIERS };
