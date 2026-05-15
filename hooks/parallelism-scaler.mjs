#!/usr/bin/env node
/**
 * parallelism-scaler.mjs — Adaptive concurrency controller for the Dual-Brain Orchestrator.
 *
 * Replaces the fixed MAX_WAVE_PARALLELISM = 4 with a dynamic system that scales
 * concurrency based on real-time provider health, budget pressure, and task outcomes.
 *
 * Exported API:
 *   class ParallelismScaler            → adaptive concurrency controller
 *   createScaler(options)              → factory function
 *   scalerFromBudget()                 → create pre-configured from budget-balancer state
 *
 * CLI:
 *   node hooks/parallelism-scaler.mjs --status
 *   node hooks/parallelism-scaler.mjs --simulate --tasks 10 --failures 2
 */

import { getProviderStatus } from './budget-balancer.mjs';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FAILURE_TYPES = {
  TRANSIENT: 'transient',   // timeout, rate-limit — capacity issue
  LOGIC: 'logic',           // wrong output, test fail — not capacity
  PROVIDER: 'provider',     // API down — severe capacity issue
};

const TREND = {
  RAMPING_UP: 'ramping-up',
  STABLE:     'stable',
  RAMPING_DOWN: 'ramping-down',
  THROTTLED:  'throttled',
};

// Provider pressure thresholds for slot gating
const PRESSURE_CAP_THRESHOLD   = 0.80;  // >80% → cap provider at 1 concurrent task
const PRESSURE_BLOCK_THRESHOLD = 1.00;  // >=100% → 0 tasks for that provider

// ---------------------------------------------------------------------------
// ParallelismScaler
// ---------------------------------------------------------------------------

export class ParallelismScaler {
  /**
   * @param {object} options
   * @param {number} [options.minConcurrency=1]      - Never go below this
   * @param {number} [options.maxConcurrency=8]      - Hard ceiling
   * @param {number} [options.initialConcurrency=2]  - Start conservative
   * @param {number} [options.rampUpThreshold=3]     - Consecutive successes before ramping up
   * @param {number} [options.rampDownThreshold=1]   - Failures before ramping down
   */
  constructor(options = {}) {
    this.minConcurrency     = options.minConcurrency     ?? 1;
    this.maxConcurrency     = options.maxConcurrency     ?? 8;
    this.initialConcurrency = options.initialConcurrency ?? 2;
    this.rampUpThreshold    = options.rampUpThreshold    ?? 3;
    this.rampDownThreshold  = options.rampDownThreshold  ?? 1;

    // Mutable state
    this.currentConcurrency     = this.initialConcurrency;
    this.consecutiveSuccesses   = 0;
    this.consecutiveFailures    = 0;

    // Sliding window of last 10 task results: { taskId, success, provider, durationMs, ts }
    this.recentErrors = [];

    // Per-provider health score 0–100 (100 = fully healthy)
    this.providerHealth = { claude: 100, openai: 100 };

    // Count of currently running tasks per provider
    this.activeTasksByProvider = { claude: 0, openai: 0 };

    // Budget pressure cache keyed by provider (set via recordProviderHealth)
    this._providerPressure  = { claude: 0, openai: 0 };
    this._providerThrottled = { claude: false, openai: false };

    // After a ramp-down, require 2x the normal rampUpThreshold (hysteresis)
    this._inHysteresis = false;

    // Trend tracking
    this._lastTrend = TREND.STABLE;

    // Internal: how many failures in rolling rampDownThreshold window
    this._pendingFailures = 0;
  }

  // ---------------------------------------------------------------------------
  // Core query methods
  // ---------------------------------------------------------------------------

  /**
   * How many more tasks can be launched right now across all providers.
   * Considers currentConcurrency, active task count, and provider budget pressure.
   */
  getAvailableSlots() {
    const activeTasks = this._totalActive();
    const baseSlots   = Math.max(0, this.currentConcurrency - activeTasks);

    // If both providers are throttled, allow 0 new tasks
    if (this._providerThrottled.claude && this._providerThrottled.openai) {
      return 0;
    }

    return baseSlots;
  }

  /**
   * How many tasks this specific provider can handle right now.
   * Based on provider health score, active tasks, and throttle state.
   *
   * @param {'claude'|'openai'} provider
   * @returns {number}
   */
  getProviderSlots(provider) {
    if (!['claude', 'openai'].includes(provider)) return 0;

    // Throttled → 0 slots
    if (this._providerThrottled[provider]) return 0;

    const pressure = this._providerPressure[provider] ?? 0;
    const health   = this.providerHealth[provider]    ?? 100;
    const active   = this.activeTasksByProvider[provider] ?? 0;

    // High pressure → cap at 1
    if (pressure >= PRESSURE_CAP_THRESHOLD) {
      return Math.max(0, 1 - active);
    }

    // Scale max slots by health score: 100 health = full slots, 0 health = 0 slots
    const healthFraction  = health / 100;
    const providerMax     = Math.max(1, Math.round(this.currentConcurrency * healthFraction));
    return Math.max(0, providerMax - active);
  }

  // ---------------------------------------------------------------------------
  // Outcome recording
  // ---------------------------------------------------------------------------

  /**
   * Record a successful task completion.
   * After rampUpThreshold consecutive successes, increment currentConcurrency.
   *
   * @param {string} taskId
   * @param {'claude'|'openai'} provider
   * @param {number} durationMs
   */
  recordSuccess(taskId, provider, durationMs = 0) {
    this._decrementActive(provider);
    this._pushResult({ taskId, success: true, provider, durationMs, ts: Date.now() });

    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this._pendingFailures    = 0;

    // Slightly recover provider health on success
    if (provider && this.providerHealth[provider] !== undefined) {
      this.providerHealth[provider] = Math.min(100, this.providerHealth[provider] + 5);
    }

    const effectiveThreshold = this._inHysteresis
      ? this.rampUpThreshold * 2
      : this.rampUpThreshold;

    if (this.consecutiveSuccesses >= effectiveThreshold) {
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        this._lastTrend = TREND.RAMPING_UP;
      } else {
        this._lastTrend = TREND.STABLE;
      }
      this.consecutiveSuccesses = 0;
      this._inHysteresis = false;   // successfully ramped back up → exit hysteresis
    }
  }

  /**
   * Record a task failure.
   *
   * @param {string} taskId
   * @param {'claude'|'openai'} provider
   * @param {Error|string} error
   * @param {'transient'|'logic'|'provider'} failureType
   */
  recordFailure(taskId, provider, error = '', failureType = FAILURE_TYPES.TRANSIENT) {
    this._decrementActive(provider);
    this._pushResult({ taskId, success: false, provider, error: String(error), ts: Date.now() });

    this.consecutiveSuccesses = 0;

    if (failureType === FAILURE_TYPES.LOGIC) {
      // Logic failure: not a capacity issue — don't touch concurrency
      return;
    }

    // Transient or provider failure: reduce provider health
    if (provider && this.providerHealth[provider] !== undefined) {
      const penalty = failureType === FAILURE_TYPES.PROVIDER ? 50 : 20;
      this.providerHealth[provider] = Math.max(0, this.providerHealth[provider] - penalty);
    }

    if (failureType === FAILURE_TYPES.PROVIDER) {
      // Immediately halve concurrency for this provider
      // We halve the global concurrency as a proxy (provider-level is capped via health)
      this.providerHealth[provider] = Math.max(0, Math.floor(this.providerHealth[provider] / 2));
      this._rampDown('provider failure — API down');
      return;
    }

    // Transient failure
    this._pendingFailures++;
    this.consecutiveFailures++;

    if (this._pendingFailures >= this.rampDownThreshold) {
      this._rampDown('transient failure — timeout or rate-limit');
      this._pendingFailures = 0;
    }
  }

  /**
   * Update provider health from external budget-balancer data.
   *
   * @param {'claude'|'openai'} provider
   * @param {{ pressure: number, isThrottled: boolean, remainingTokens: number }} metrics
   */
  recordProviderHealth(provider, metrics = {}) {
    if (!['claude', 'openai'].includes(provider)) return;

    const pressure    = metrics.pressure    ?? 0;
    const isThrottled = metrics.isThrottled ?? false;

    this._providerPressure[provider]  = pressure;
    this._providerThrottled[provider] = isThrottled || pressure >= PRESSURE_BLOCK_THRESHOLD;

    // Compute health score from pressure (100 at 0%, 0 at 100%)
    const pressureHealth = Math.max(0, Math.round((1 - pressure) * 100));
    // Blend with existing health (external signal + internal observation)
    this.providerHealth[provider] = Math.round(
      (pressureHealth * 0.7) + (this.providerHealth[provider] * 0.3)
    );

    // If both throttled → trend is throttled
    if (this._providerThrottled.claude && this._providerThrottled.openai) {
      this._lastTrend = TREND.THROTTLED;
    }
  }

  // ---------------------------------------------------------------------------
  // Recommendation / observability
  // ---------------------------------------------------------------------------

  /**
   * Return current slot recommendation across providers.
   *
   * @returns {{ totalSlots: number, byProvider: { claude: number, openai: number }, reason: string, trend: string }}
   */
  recommend() {
    const claudeSlots = this.getProviderSlots('claude');
    const openaiSlots = this.getProviderSlots('openai');
    const totalSlots  = this.getAvailableSlots();

    const reasons = [];

    if (this._providerThrottled.claude && this._providerThrottled.openai) {
      reasons.push('both providers throttled — holding');
    } else {
      if (this._providerThrottled.claude) reasons.push('claude throttled (0 slots)');
      if (this._providerThrottled.openai) reasons.push('openai throttled (0 slots)');
      if (this._providerPressure.claude >= PRESSURE_CAP_THRESHOLD && !this._providerThrottled.claude) {
        reasons.push(`claude pressure at ${Math.round(this._providerPressure.claude * 100)}% — capped at 1`);
      }
      if (this._providerPressure.openai >= PRESSURE_CAP_THRESHOLD && !this._providerThrottled.openai) {
        reasons.push(`openai pressure at ${Math.round(this._providerPressure.openai * 100)}% — capped at 1`);
      }
    }

    if (this._inHysteresis) {
      reasons.push(`hysteresis active — need ${this.rampUpThreshold * 2} successes to ramp up`);
    }

    if (!reasons.length) {
      reasons.push(`concurrency ${this.currentConcurrency}, ${this.consecutiveSuccesses} consecutive successes`);
    }

    // Trend
    let trend = this._lastTrend;
    if (this._providerThrottled.claude && this._providerThrottled.openai) {
      trend = TREND.THROTTLED;
    }

    return {
      totalSlots,
      byProvider: { claude: claudeSlots, openai: openaiSlots },
      reason: reasons.join('; '),
      trend,
    };
  }

  /**
   * Return full internal state for observability and debugging.
   */
  getStats() {
    return {
      currentConcurrency:   this.currentConcurrency,
      minConcurrency:       this.minConcurrency,
      maxConcurrency:       this.maxConcurrency,
      consecutiveSuccesses: this.consecutiveSuccesses,
      consecutiveFailures:  this.consecutiveFailures,
      inHysteresis:         this._inHysteresis,
      effectiveRampUpThreshold: this._inHysteresis
        ? this.rampUpThreshold * 2
        : this.rampUpThreshold,
      providerHealth:       { ...this.providerHealth },
      activeTasksByProvider:{ ...this.activeTasksByProvider },
      providerPressure:     { ...this._providerPressure },
      providerThrottled:    { ...this._providerThrottled },
      recentResults:        this.recentErrors.map(r => ({ ...r })),
      trend:                this._lastTrend,
      availableSlots:       this.getAvailableSlots(),
      recommendation:       this.recommend(),
    };
  }

  // ---------------------------------------------------------------------------
  // Active task tracking (call before dispatching / after completing)
  // ---------------------------------------------------------------------------

  /** Mark a task as started for a provider. Call before dispatching. */
  markStarted(provider) {
    if (provider && this.activeTasksByProvider[provider] !== undefined) {
      this.activeTasksByProvider[provider]++;
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _totalActive() {
    return (this.activeTasksByProvider.claude ?? 0) +
           (this.activeTasksByProvider.openai ?? 0);
  }

  _decrementActive(provider) {
    if (provider && this.activeTasksByProvider[provider] !== undefined) {
      this.activeTasksByProvider[provider] = Math.max(
        0,
        this.activeTasksByProvider[provider] - 1
      );
    }
  }

  _pushResult(result) {
    this.recentErrors.push(result);
    if (this.recentErrors.length > 10) {
      this.recentErrors.shift();
    }
  }

  _rampDown(reason) {
    if (this.currentConcurrency > this.minConcurrency) {
      this.currentConcurrency--;
      this._lastTrend = TREND.RAMPING_DOWN;
      this._inHysteresis = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a ParallelismScaler with the given options.
 *
 * @param {object} options - See ParallelismScaler constructor
 * @returns {ParallelismScaler}
 */
export function createScaler(options = {}) {
  return new ParallelismScaler(options);
}

// ---------------------------------------------------------------------------
// Integration helper: scalerFromBudget()
// ---------------------------------------------------------------------------

/**
 * Create a scaler pre-configured from current budget-balancer state.
 * Reads provider pressure and sets initial concurrency based on available headroom.
 *
 * @returns {ParallelismScaler}
 */
export function scalerFromBudget() {
  let status;
  try {
    status = getProviderStatus();
  } catch {
    // Budget-balancer unavailable — return a conservative default scaler
    return new ParallelismScaler({ initialConcurrency: 2 });
  }

  // Use execute-tier pressure as the primary signal for concurrency sizing
  const claudeExec = status?.claude?.execute ?? {};
  const openaiExec = status?.openai?.execute ?? {};

  const claudePressure = claudeExec.effectivePressure ?? 0;
  const openaiPressure = openaiExec.effectivePressure ?? 0;

  // Both available pressures determine initial concurrency
  // Low pressure → start at 4; medium → 3; hot → 2; throttled → 1
  const avgPressure = (claudePressure + openaiPressure) / 2;
  let initialConcurrency;
  if (avgPressure < 0.30) {
    initialConcurrency = 4;
  } else if (avgPressure < 0.55) {
    initialConcurrency = 3;
  } else if (avgPressure < 0.80) {
    initialConcurrency = 2;
  } else {
    initialConcurrency = 1;
  }

  const scaler = new ParallelismScaler({ initialConcurrency });

  // Apply current budget state to provider health
  for (const provider of ['claude', 'openai']) {
    const exec = status?.[provider]?.execute ?? {};
    scaler.recordProviderHealth(provider, {
      pressure:        exec.effectivePressure ?? 0,
      isThrottled:     exec.state === 'throttled',
      remainingTokens: Math.max(0, (exec.budget ?? 0) - (exec.tokens ?? 0)),
    });
  }

  return scaler;
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function formatBar(value, max, width = 10) {
  const filled = Math.min(width, Math.round((value / Math.max(1, max)) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatTrend(trend) {
  const map = {
    [TREND.RAMPING_UP]:   '↑ ramping-up',
    [TREND.STABLE]:       '→ stable',
    [TREND.RAMPING_DOWN]: '↓ ramping-down',
    [TREND.THROTTLED]:    '✕ throttled',
  };
  return map[trend] || trend;
}

function printStatusReport(scaler) {
  const stats = scaler.getStats();
  const rec   = stats.recommendation;
  const LINE  = 60;
  const border = '═'.repeat(LINE - 2);

  const h = (text) => {
    const padded = ` ${text}`.padEnd(LINE - 4);
    return `║ ${padded} ║`;
  };

  const lines = [
    `╔${border}╗`,
    h('         Parallelism Scaler Status'),
    `╠${border}╣`,
    h(`  Current concurrency : ${stats.currentConcurrency} (min ${stats.minConcurrency}, max ${stats.maxConcurrency})`),
    h(`  Available slots     : ${stats.availableSlots}`),
    h(`  Trend               : ${formatTrend(stats.trend)}`),
    h(`  Hysteresis          : ${stats.inHysteresis ? `yes (need ${stats.effectiveRampUpThreshold} successes)` : 'no'}`),
    h(`  Consec. successes   : ${stats.consecutiveSuccesses} / ${stats.effectiveRampUpThreshold} threshold`),
    `╠${border}╣`,
    h('  Provider Health'),
    h(`  Claude  : ${formatBar(stats.providerHealth.claude, 100)} ${String(stats.providerHealth.claude).padStart(3)}% health  pressure ${Math.round(stats.providerPressure.claude * 100)}%  slots ${rec.byProvider.claude}`),
    h(`  OpenAI  : ${formatBar(stats.providerHealth.openai, 100)} ${String(stats.providerHealth.openai).padStart(3)}% health  pressure ${Math.round(stats.providerPressure.openai * 100)}%  slots ${rec.byProvider.openai}`),
    `╠${border}╣`,
    h(`  Recommendation: ${rec.totalSlots} total slots`),
    h(`  Reason: ${rec.reason}`),
    `╚${border}╝`,
  ];

  console.log(lines.join('\n'));
}

function runSimulation(options) {
  const { tasks = 10, failures = 2, maxConcurrency = 8 } = options;

  console.log(`\nSimulation: ${tasks} tasks, ${failures} injected failures, max concurrency ${maxConcurrency}\n`);

  const scaler = createScaler({ maxConcurrency });
  const results = [];

  // Distribute failures evenly across task sequence
  const failureSet = new Set();
  for (let i = 0; i < failures; i++) {
    failureSet.add(Math.floor((tasks / (failures + 1)) * (i + 1)));
  }

  for (let i = 0; i < tasks; i++) {
    const taskId   = `task-${i + 1}`;
    const provider = i % 2 === 0 ? 'claude' : 'openai';
    const isFailure = failureSet.has(i);

    scaler.markStarted(provider);

    const before = scaler.currentConcurrency;

    if (isFailure) {
      scaler.recordFailure(taskId, provider, new Error('simulated timeout'), FAILURE_TYPES.TRANSIENT);
    } else {
      scaler.recordSuccess(taskId, provider, 1200 + Math.random() * 800);
    }

    const after = scaler.currentConcurrency;
    const delta = after - before;
    const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? String(delta) : '  ';
    const status  = isFailure ? 'FAIL' : 'OK  ';
    const icon    = isFailure ? '✕' : '✓';

    results.push({ taskId, provider, status, concurrencyBefore: before, concurrencyAfter: after });
    console.log(`  ${icon} ${taskId.padEnd(8)} [${provider.padEnd(6)}] ${status}  concurrency: ${before} → ${after} (${deltaStr})  trend: ${scaler._lastTrend}`);
  }

  console.log('');
  printStatusReport(scaler);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    const scaler = scalerFromBudget();
    printStatusReport(scaler);
    return;
  }

  if (args.includes('--simulate')) {
    const tasksIdx    = args.indexOf('--tasks');
    const failuresIdx = args.indexOf('--failures');
    const maxIdx      = args.indexOf('--max-concurrency');

    const tasks    = tasksIdx    >= 0 ? parseInt(args[tasksIdx + 1], 10)    || 10 : 10;
    const failures = failuresIdx >= 0 ? parseInt(args[failuresIdx + 1], 10) || 2  : 2;
    const maxConcurrency = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) || 8 : 8;

    runSimulation({ tasks, failures, maxConcurrency });
    return;
  }

  // Default: show status
  const scaler = scalerFromBudget();
  printStatusReport(scaler);
}

// Run as CLI only when invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[parallelism-scaler] ${err.message}\n`);
    process.exit(1);
  });
}
