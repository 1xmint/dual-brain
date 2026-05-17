// routing-advisor.mjs — EMA + epsilon-greedy routing advisor
// Learns which model works best for which task type from outcome signals.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { checkFileSurvival } from './outcome.mjs';
import { join } from 'node:path';

const ALPHA = 0.3;
const MIN_EPSILON = 0.1;
const MIN_OBSERVATIONS = 5;
const PRIOR_WEIGHT = 5;

const STATIC_PRIORS = {
  'search:haiku': 0.85,  'search:sonnet': 0.70,  'search:opus': 0.50,
  'execute:haiku': 0.55, 'execute:sonnet': 0.80,  'execute:opus': 0.85,
  'think:haiku': 0.30,   'think:sonnet': 0.70,    'think:opus': 0.90,
  'review:haiku': 0.40,  'review:sonnet': 0.75,   'review:opus': 0.85,
};

const VALID_MODELS = {
  search:  ['haiku', 'sonnet'],
  execute: ['haiku', 'sonnet', 'opus'],
  think:   ['sonnet', 'opus'],
  review:  ['sonnet', 'opus'],
};

function stateFile(cwd) { return join(cwd || process.cwd(), '.dualbrain', 'routing-state.json'); }

function loadState(cwd) {
  try {
    const p = stateFile(cwd);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  } catch { return {}; }
}

function saveState(state, cwd) {
  try {
    const dir = join(cwd || process.cwd(), '.dualbrain');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const p = stateFile(cwd), tmp = p + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    renameSync(tmp, p);
  } catch { /* non-throwing */ }
}

/** Cross-cell bias: average EMA from same-tier cells that have >= 8 observations. */
function getCrossCellBias(state, cellKey, model) {
  const [tier] = cellKey.split(':');
  let biasSum = 0, biasCount = 0;
  for (const [key, models] of Object.entries(state)) {
    if (key.startsWith(tier + ':') && key !== cellKey && models[model]) {
      const entry = models[model];
      if ((entry.observations ?? 0) >= 8) { biasSum += entry.ema; biasCount++; }
    }
  }
  return biasCount > 0 ? biasSum / biasCount : null;
}

const staticPrior = (tier, model) => STATIC_PRIORS[`${tier}:${model}`] ?? 0.5;
const cellObs = (state, key) => Object.values(state[key] ?? {}).reduce((s, m) => s + (m.observations ?? 0), 0);
const blended = (ema, n, tier, model) =>
  (n / (n + PRIOR_WEIGHT)) * ema + (PRIOR_WEIGHT / (n + PRIOR_WEIGHT)) * staticPrior(tier, model);

// taskProfile: { intent, tier, risk, files?, complexity? }
// Returns: { model, reason, confidence, explored }
export function adviseModel(taskProfile, cwd) {
  try {
    const { tier, intent } = taskProfile ?? {};
    const validTier = tier && VALID_MODELS[tier] ? tier : 'execute';
    const cellKey = `${validTier}:${intent ?? 'implement'}`;
    const models = VALID_MODELS[validTier];

    const state = loadState(cwd);
    const totalObs = cellObs(state, cellKey);
    const grandTotal = Object.values(state).reduce((s, cell) =>
      s + Object.values(cell).reduce((t, e) => t + (e.observations ?? 0), 0), 0);

    if (totalObs < MIN_OBSERVATIONS) {
      // When enough global data exists, blend cross-cell bias with static prior
      if (grandTotal > 100) {
        let bestModel = models[0], bestScore = -Infinity;
        for (const m of models) {
          const xbias = getCrossCellBias(state, cellKey, m);
          const prior = staticPrior(validTier, m);
          const score = xbias != null ? (xbias + prior) / 2 : prior;
          if (score > bestScore) { bestScore = score; bestModel = m; }
        }
        return { model: bestModel, reason: 'cross-cell bias', confidence: 0.4, explored: false };
      }
      const best = models.reduce((a, b) => staticPrior(validTier, a) >= staticPrior(validTier, b) ? a : b);
      return { model: best, reason: 'insufficient data, using heuristic', confidence: 0.3, explored: false };
    }

    const epsilon = Math.max(MIN_EPSILON, 0.5 * Math.pow(0.9, totalObs));
    const explored = Math.random() < epsilon;

    if (explored) {
      const model = models[Math.floor(Math.random() * models.length)];
      return { model, reason: 'exploration', confidence: epsilon, explored: true };
    }

    // Exploitation: pick highest blended score
    const cell = state[cellKey] ?? {};
    let bestModel = models[0];
    let bestScore = -Infinity;
    for (const m of models) {
      const entry = cell[m];
      const ema = entry?.ema ?? staticPrior(validTier, m);
      const n = entry?.observations ?? 0;
      const score = blended(ema, n, validTier, m);
      if (score > bestScore) { bestScore = score; bestModel = m; }
    }

    return { model: bestModel, reason: 'exploitation', confidence: 1 - epsilon, explored: false };
  } catch {
    return { model: 'sonnet', reason: 'error fallback', confidence: 0.1, explored: false };
  }
}

// reward: number in [0, 1]
export function recordReward(cellKey, model, reward, cwd) {
  try {
    const state = loadState(cwd);
    if (!state[cellKey]) state[cellKey] = {};
    const entry = state[cellKey][model] ?? { ema: reward, observations: 0 };
    entry.ema = ALPHA * reward + (1 - ALPHA) * entry.ema;
    entry.observations = (entry.observations ?? 0) + 1;
    entry.lastUpdated = new Date().toISOString();
    entry.lastReward = reward;
    state[cellKey][model] = entry;
    saveState(state, cwd);
  } catch {
    // non-throwing
  }
}

export function getRoutingStats(cwd) {
  try {
    const state = loadState(cwd);
    const cells = {}, flat = [];
    let totalObservations = 0;
    for (const [cellKey, models] of Object.entries(state)) {
      cells[cellKey] ??= {};
      for (const [model, entry] of Object.entries(models)) {
        const obs = entry.observations ?? 0;
        cells[cellKey][model] = { ema: entry.ema, observations: obs };
        totalObservations += obs;
        flat.push({ cell: cellKey, model, ema: entry.ema, observations: obs });
      }
    }
    flat.sort((a, b) => b.ema - a.ema);
    return { cells, totalObservations, topPerformers: flat.slice(0, 5), worstPerformers: flat.slice(-5).reverse() };
  } catch {
    return { cells: {}, totalObservations: 0, topPerformers: [], worstPerformers: [] };
  }
}

/**
 * Loads cross-session routing state. If the state was last updated in a prior session,
 * applies a mild decay (×0.95) to all EMA scores to account for staleness.
 */
export function loadCrossSessionPriors(cwd) {
  try {
    const state = loadState(cwd);
    const sessionStart = state._sessionStart;
    if (!sessionStart) return state; // no prior session marker
    const lastMs = new Date(sessionStart).getTime();
    if (isNaN(lastMs)) return state;
    const stale = (Date.now() - lastMs) > 60_000; // more than 1 min old = different session
    if (!stale) return state;
    for (const [cellKey, models] of Object.entries(state)) {
      if (cellKey.startsWith('_')) continue;
      for (const entry of Object.values(models)) {
        if (typeof entry.ema === 'number') entry.ema = entry.ema * 0.95;
      }
    }
    return state;
  } catch { return {}; }
}

/**
 * Records session start timestamp and triggers file survival checks.
 * Call once at CLI session start.
 */
export async function markSessionStart(cwd) {
  try {
    const state = loadState(cwd);
    state._sessionStart = new Date().toISOString();
    saveState(state, cwd);
    await checkFileSurvival(cwd).catch(() => {});
  } catch { /* non-throwing */ }
}

export function resetAdvisor(cwd) {
  try {
    saveState({}, cwd);
  } catch {
    // non-throwing
  }
}
