#!/usr/bin/env node
/**
 * ledger-analysis.mjs — Analyze the decision ledger to improve routing over time.
 *
 * Reads decision-ledger.jsonl, detects patterns, and emits routing weight
 * adjustments that the task-classifier can consume.
 *
 * CLI:
 *   node hooks/ledger-analysis.mjs              # full analysis + write weights
 *   node hooks/ledger-analysis.mjs --summary    # one-paragraph summary
 *   node hooks/ledger-analysis.mjs --since 7d   # only last N days
 *   node hooks/ledger-analysis.mjs --dry-run    # analyze but don't write
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_FILE   = join(__dirname, 'decision-ledger.jsonl');
const WEIGHTS_FILE  = join(__dirname, '..', '.dualbrain', 'routing-weights.json');
const MIN_SAMPLES   = 10;
const FAIL_THRESHOLD = 0.60;
const IMBALANCE_THRESHOLD = 0.80;

// ─── Ledger loading ───────────────────────────────────────────────────────────

function loadLedger(sinceMs = 0) {
  if (!existsSync(LEDGER_FILE)) return [];

  let raw;
  try { raw = readFileSync(LEDGER_FILE, 'utf8'); } catch { return []; }

  const decisions = {};
  const outcomes  = {};

  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      if (sinceMs && new Date(e.timestamp).getTime() < sinceMs) continue;
      if (e.type === 'decision') decisions[e.id] = e;
      else if (e.type === 'outcome') outcomes[e.decision_id] = e;
    } catch {}
  }

  return Object.values(decisions).map(d => ({
    ...d,
    outcome: outcomes[d.id] || null,
  }));
}

function parseSince(flag) {
  if (!flag) return 0;
  const m = flag.match(/^(\d+)([dh])$/);
  if (!m) return 0;
  const mul = m[2] === 'd' ? 86400000 : 3600000;
  return Date.now() - parseInt(m[1]) * mul;
}

// ─── Analysis functions ───────────────────────────────────────────────────────

function analyzeSuccessRates(records) {
  // Per model+intent (task_type) combo
  const buckets = {};
  for (const r of records) {
    if (!r.outcome || r.outcome.success === null) continue;
    const intent = r.task_type || 'unknown';
    const key = `${r.provider}/${r.model}::${intent}`;
    if (!buckets[key]) buckets[key] = { provider: r.provider, model: r.model, intent, success: 0, total: 0 };
    buckets[key].total++;
    if (r.outcome.success) buckets[key].success++;
  }
  return Object.values(buckets).map(b => ({
    ...b,
    rate: b.total ? b.success / b.total : null,
  }));
}

function analyzeEffortCalibration(records) {
  // Group by intent + effort, flag mismatches
  const buckets = {};
  for (const r of records) {
    if (!r.outcome || r.outcome.success === null) continue;
    const intent = r.task_type || 'unknown';
    const effort = r.effort || 'medium';
    const key = `${intent}::${effort}`;
    if (!buckets[key]) buckets[key] = { intent, effort, success: 0, total: 0, totalRetries: 0, totalMs: 0, countMs: 0 };
    buckets[key].total++;
    if (r.outcome.success) buckets[key].success++;
    buckets[key].totalRetries += r.outcome.retries || 0;
    if (r.outcome.actual_duration_ms) {
      buckets[key].totalMs += r.outcome.actual_duration_ms;
      buckets[key].countMs++;
    }
  }

  const suggestions = [];
  const EFFORT_ORDER = ['low', 'medium', 'high'];

  for (const b of Object.values(buckets)) {
    if (b.total < 3) continue;
    const rate = b.success / b.total;
    const avgRetries = b.totalRetries / b.total;
    const avgMs = b.countMs ? b.totalMs / b.countMs : null;

    // Over-prescribed: high success, no retries, fast → downgrade
    if (b.effort === 'high' && rate >= 0.90 && avgRetries < 0.1) {
      suggestions.push({ intent: b.intent, current: b.effort, suggested: 'medium', samples: b.total,
        reason: `${Math.round(rate * 100)}% success with no retries at high effort, downgrade safe` });
    } else if (b.effort === 'medium' && rate >= 0.95 && avgRetries < 0.05) {
      suggestions.push({ intent: b.intent, current: b.effort, suggested: 'low', samples: b.total,
        reason: `${Math.round(rate * 100)}% success with no retries at medium, downgrade safe` });
    }

    // Under-prescribed: low success + high retries → upgrade
    if (b.effort !== 'high' && rate < FAIL_THRESHOLD && avgRetries > 0.5) {
      const idx = EFFORT_ORDER.indexOf(b.effort);
      const next = EFFORT_ORDER[Math.min(idx + 1, 2)];
      suggestions.push({ intent: b.intent, current: b.effort, suggested: next, samples: b.total,
        reason: `${Math.round(rate * 100)}% success with avg ${avgRetries.toFixed(1)} retries, upgrade needed` });
    }
  }

  return suggestions;
}

function analyzeProviderBalance(records) {
  const tiers = {};
  for (const r of records) {
    const tier = r.tier || 'execute';
    if (!tiers[tier]) tiers[tier] = {};
    const p = r.provider || 'unknown';
    tiers[tier][p] = (tiers[tier][p] || 0) + 1;
  }

  const suggestions = [];
  for (const [tier, providers] of Object.entries(tiers)) {
    const total = Object.values(providers).reduce((a, b) => a + b, 0);
    if (total < 5) continue;
    for (const [p, count] of Object.entries(providers)) {
      const share = count / total;
      if (share >= IMBALANCE_THRESHOLD) {
        const other = Object.keys(providers).find(k => k !== p) || 'openai';
        suggestions.push({
          tier,
          dominant: p,
          dominantShare: Math.round(share * 100),
          suggestion: `route more ${tier} tasks to ${other}`,
          reason: `${p} handling ${Math.round(share * 100)}% of ${tier}, ${other} ${tier} tier underused`,
        });
      }
    }
  }

  return suggestions;
}

function analyzeCostEfficiency(records) {
  // Best outcome-per-token by model+intent
  const buckets = {};
  for (const r of records) {
    if (!r.outcome || r.outcome.success === null) continue;
    const tokens = (r.outcome.actual_input_tokens || 0) + (r.outcome.actual_output_tokens || 0);
    if (!tokens) continue;
    const key = `${r.provider}/${r.model}::${r.task_type || 'unknown'}`;
    if (!buckets[key]) buckets[key] = { provider: r.provider, model: r.model, intent: r.task_type || 'unknown',
      totalTokens: 0, success: 0, total: 0 };
    buckets[key].totalTokens += tokens;
    buckets[key].total++;
    if (r.outcome.success) buckets[key].success++;
  }

  return Object.values(buckets)
    .filter(b => b.total >= 3)
    .map(b => ({
      ...b,
      rate: b.success / b.total,
      avgTokens: Math.round(b.totalTokens / b.total),
      // Simple efficiency score: success_rate / normalized_tokens
      efficiency: b.total ? (b.success / b.total) / (b.totalTokens / b.total / 1000) : 0,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);
}

// ─── Recommendation generator ─────────────────────────────────────────────────

function generateRecommendations(records) {
  const recommendations = [];
  const warnings = [];

  // --- Model preference: find best model per intent ---
  const successRates = analyzeSuccessRates(records);
  const intentBuckets = {};
  for (const s of successRates) {
    if (!intentBuckets[s.intent]) intentBuckets[s.intent] = [];
    intentBuckets[s.intent].push(s);
  }

  for (const [intent, combos] of Object.entries(intentBuckets)) {
    const qualified = combos.filter(c => c.total >= 3 && c.rate !== null);
    if (qualified.length < 2) continue;
    qualified.sort((a, b) => b.rate - a.rate);
    const best = qualified[0];
    const worst = qualified[qualified.length - 1];

    // Flag warnings for consistently failing combos
    for (const c of combos) {
      if (c.total >= 5 && c.rate !== null && c.rate < FAIL_THRESHOLD) {
        warnings.push({ type: 'high_failure_rate', model: c.model, intent: c.intent,
          rate: Math.round(c.rate * 100) / 100, samples: c.total });
      }
    }

    // Recommend best if clearly better
    if (best.rate - worst.rate >= 0.15 && best.total >= 3) {
      recommendations.push({
        type: 'model_preference',
        intent,
        provider: best.provider,
        model: best.model,
        confidence: Math.round(best.rate * 100) / 100,
        reason: `${Math.round(best.rate * 100)}% success rate vs ${Math.round(worst.rate * 100)}% for ${worst.provider}/${worst.model}`,
      });
    }
  }

  // --- Effort calibration ---
  const effortSuggestions = analyzeEffortCalibration(records);
  for (const s of effortSuggestions) {
    recommendations.push({
      type: 'effort_adjustment',
      intent: s.intent,
      current: s.current,
      suggested: s.suggested,
      reason: s.reason,
    });
  }

  // --- Provider balance ---
  const balanceSuggestions = analyzeProviderBalance(records);
  for (const s of balanceSuggestions) {
    recommendations.push({
      type: 'provider_balance',
      suggestion: s.suggestion,
      reason: s.reason,
    });
  }

  return { recommendations, warnings };
}

// ─── Summary paragraph ────────────────────────────────────────────────────────

function buildSummary(records, recommendations, warnings) {
  const total = records.length;
  const withOutcome = records.filter(r => r.outcome).length;
  const successes = records.filter(r => r.outcome?.success).length;
  const rate = withOutcome ? Math.round((successes / withOutcome) * 100) : 0;

  const providerCounts = {};
  for (const r of records) providerCounts[r.provider] = (providerCounts[r.provider] || 0) + 1;
  const providerSummary = Object.entries(providerCounts)
    .map(([p, n]) => `${p} (${Math.round((n / total) * 100)}%)`)
    .join(', ');

  const warnCount = warnings.length;
  const recCount  = recommendations.length;

  return `Analyzed ${total} decisions (${withOutcome} with outcomes, ${rate}% success). ` +
    `Provider split: ${providerSummary || 'n/a'}. ` +
    `Generated ${recCount} routing recommendation${recCount !== 1 ? 's' : ''} and ` +
    `${warnCount} warning${warnCount !== 1 ? 's' : ''}. ` +
    (warnings.length ? `High-failure combos: ${warnings.map(w => `${w.model}/${w.intent} (${Math.round(w.rate * 100)}%)`).join(', ')}.` : 'No critical failure patterns detected.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function run(opts = {}) {
  const sinceMs  = parseSince(opts.since);
  const records  = loadLedger(sinceMs);

  if (records.length < MIN_SAMPLES) {
    const msg = { status: 'insufficient_data', samples: records.length, required: MIN_SAMPLES };
    if (opts.summary) {
      console.log(`Insufficient data: only ${records.length} entries (need ${MIN_SAMPLES}).`);
    } else {
      console.log(JSON.stringify(msg, null, 2));
    }
    return;
  }

  const { recommendations, warnings } = generateRecommendations(records);
  const costEfficiency = analyzeCostEfficiency(records);

  const output = {
    generatedAt:    new Date().toISOString(),
    sampleSize:     records.length,
    sinceFilter:    opts.since || null,
    recommendations,
    warnings,
    costEfficiency: costEfficiency.slice(0, 5), // top 5 efficient combos
  };

  if (opts.summary) {
    console.log(buildSummary(records, recommendations, warnings));
    return;
  }

  console.log(JSON.stringify(output, null, 2));

  if (!opts.dryRun) {
    try {
      mkdirSync(dirname(WEIGHTS_FILE), { recursive: true });
      writeFileSync(WEIGHTS_FILE, JSON.stringify(output, null, 2));
      console.error(`\nWrote routing weights → ${WEIGHTS_FILE}`);
    } catch (e) {
      console.error(`\nFailed to write weights: ${e.message}`);
    }
  } else {
    console.error('\n[dry-run] Weights not written.');
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const idx  = (flag) => args.indexOf(flag);

  const opts = {
    summary: args.includes('--summary'),
    dryRun:  args.includes('--dry-run'),
    since:   idx('--since') !== -1 ? args[idx('--since') + 1] : null,
  };

  run(opts);
}
