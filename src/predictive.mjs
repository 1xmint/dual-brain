/** Predictive Dispatch — Layer 3: anticipates failure modes BEFORE dispatching. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIAG_DIR = join(process.cwd(), '.dualbrain', 'diagnostic');
const STATE_PATH = join(DIAG_DIR, 'current.json');
const WEIGHTS_PATH = join(DIAG_DIR, 'pattern-weights.json');

export function loadSessionPatterns() {
  const empty = { frequencies: [], avgSeverity: 0, precedingTools: {}, timeTrends: [] };
  if (!existsSync(STATE_PATH)) return empty;

  let state;
  try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')); }
  catch { return empty; }

  const noticings = state.noticings || [];
  if (!noticings.length) return empty;

  const counts = {};
  const severityMap = { low: 1, medium: 2, high: 3 };
  let totalSeverity = 0;
  for (const n of noticings) {
    counts[n.type] = (counts[n.type] || 0) + 1;
    totalSeverity += severityMap[n.severity] || 1;
  }
  const frequencies = Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const toolCalls = state.toolCalls || [];
  const precedingTools = {};
  for (const n of noticings) {
    const before = toolCalls.filter(tc => tc.ts < n.ts).slice(-3).map(tc => tc.tool);
    if (!precedingTools[n.type]) precedingTools[n.type] = [];
    precedingTools[n.type].push(...before);
  }

  const sessionStart = state.startedAt || noticings[0]?.ts || 0;
  const sessionEnd = state.lastActivity || noticings[noticings.length - 1]?.ts || Date.now();
  const duration = sessionEnd - sessionStart || 1;
  const timeTrends = noticings.map(n => ({
    type: n.type, position: (n.ts - sessionStart) / duration,
  }));

  return { frequencies, avgSeverity: totalSeverity / noticings.length, precedingTools, timeTrends };
}

function loadWeights() {
  if (!existsSync(WEIGHTS_PATH)) return {};
  try { return JSON.parse(readFileSync(WEIGHTS_PATH, 'utf8')); }
  catch { return {}; }
}

export function predictFailureModes(agentSpec, context = {}) {
  const predictions = [];
  const patterns = context.patterns || loadSessionPatterns();
  const weights = loadWeights();
  const objective = agentSpec.objective || '';
  const scope = agentSpec.scope || {};
  const files = scope.files || [];
  const tier = agentSpec.tier || '';
  const priorFailures = context.priorFailures || [];
  const activeWaves = context.activeWaves || [];
  const lastReadAge = context.lastReadAge || 0; // ms

  const applyWeight = (mode, base) => {
    const w = weights[mode];
    if (!w) return base;
    // Shift likelihood based on historical accuracy
    return Math.min(1, Math.max(0, base + (w.accuracy - 0.5) * 0.3));
  };

  // scope-explosion
  const multiTarget = files.length > 3 || /\band\b|multiple|several|all/i.test(objective);
  const priorScopeCreep = patterns.frequencies.some(f => f.type === 'scope-creep' && f.count >= 2);
  if (multiTarget || priorScopeCreep) {
    const base = multiTarget && priorScopeCreep ? 0.8 : 0.7;
    predictions.push({
      mode: 'scope-explosion',
      likelihood: applyWeight('scope-explosion', base),
      basis: multiTarget
        ? `Objective references ${files.length || 'multiple'} targets`
        : 'Prior waves encountered scope creep',
      prevention: `If scope grows beyond ${Math.max(files.length, 3)} files, STOP and report back rather than continuing.`,
    });
  }

  // missing-context
  const noFiles = files.length === 0;
  const executeWithoutSearch = tier === 'execute' && !(context.priorSearchWave);
  if (noFiles || executeWithoutSearch) {
    const base = 0.6;
    predictions.push({
      mode: 'missing-context',
      likelihood: applyWeight('missing-context', base),
      basis: noFiles
        ? 'No files specified in scope — agent may waste tokens searching'
        : 'Execute tier dispatched without prior search wave',
      prevention: `Read the current state of target files before making changes. If unsure what to modify, list candidates first.`,
    });
  }

  // wrong-approach
  const hasStuckLoop = patterns.frequencies.some(f => f.type === 'stuck-loop' && f.count >= 2);
  const objectiveFailed = priorFailures.some(f =>
    f.objective && objective.toLowerCase().includes(f.objective.toLowerCase().slice(0, 20))
  );
  if (hasStuckLoop || objectiveFailed) {
    const base = objectiveFailed ? 0.8 : 0.6;
    predictions.push({
      mode: 'wrong-approach',
      likelihood: applyWeight('wrong-approach', base),
      basis: objectiveFailed
        ? 'Prior attempt at this objective failed'
        : 'Diagnostic shows stuck-loop pattern in session',
      prevention: `Try a fundamentally different approach than previous attempts. If stuck after 2 tries, report back with what was tried.`,
    });
  }

  // blocked-dependency
  const refsOtherWave = activeWaves.some(w =>
    objective.toLowerCase().includes(w.output?.toLowerCase()?.slice(0, 20) || '___none')
  );
  if (refsOtherWave) {
    predictions.push({
      mode: 'blocked-dependency',
      likelihood: applyWeight('blocked-dependency', 0.5),
      basis: 'Objective references output from an in-progress wave',
      prevention: `If blocked by a dependency from another wave, pivot to independent work or report the blocker.`,
    });
  }

  // stale-assumption
  if (lastReadAge > 5 * 60 * 1000 && files.length > 0) {
    predictions.push({
      mode: 'stale-assumption',
      likelihood: applyWeight('stale-assumption', 0.4),
      basis: `Files in scope were last read ${Math.round(lastReadAge / 60000)}m ago — may have changed`,
      prevention: `Re-read ${files.slice(0, 3).join(', ')} before assuming current state.`,
    });
  }

  return predictions;
}

export function generatePreventions(predictions) {
  const actionable = predictions
    .filter(p => p.likelihood >= 0.4)
    .sort((a, b) => b.likelihood - a.likelihood)
    .slice(0, 5);

  if (!actionable.length) return '';

  const lines = actionable.map(p => `- [${p.prevention}]`);
  return `⚠ Pre-flight awareness:\n${lines.join('\n')}`;
}

export function scoreDispatchReadiness(agentSpec, wavePlan = {}, predictions = []) {
  const blockers = [];
  const warnings = [];
  let score = 1.0;

  const files = agentSpec.scope?.files || [];
  const priorSearch = wavePlan.completedSearchWave || false;
  const hasContext = files.length > 0 || priorSearch;

  // Scope researched?
  if (!hasContext) {
    blockers.push('No files in scope and no prior search wave — context unknown');
    score -= 0.3;
  }

  // High-likelihood predictions
  const highRisk = predictions.filter(p => p.likelihood >= 0.7);
  const medRisk = predictions.filter(p => p.likelihood >= 0.4 && p.likelihood < 0.7);

  for (const p of highRisk) {
    blockers.push(`High-risk: ${p.mode} (${Math.round(p.likelihood * 100)}%) — ${p.basis}`);
    score -= 0.25;
  }
  for (const p of medRisk) {
    warnings.push(`${p.mode} (${Math.round(p.likelihood * 100)}%) — ${p.basis}`);
    score -= 0.1;
  }

  // Unresolved blockers from prior waves
  const unresolvedBlockers = wavePlan.unresolvedBlockers || [];
  for (const b of unresolvedBlockers) {
    blockers.push(`Unresolved from prior wave: ${b}`);
    score -= 0.2;
  }

  score = Math.max(0, Math.min(1, score));
  const ready = score >= 0.5 && blockers.length === 0;

  let suggestion = '';
  if (!ready) {
    if (blockers.some(b => b.includes('context unknown'))) {
      suggestion = 'Run a search/read wave first to establish context before executing.';
    } else if (highRisk.length) {
      suggestion = `Address high-risk predictions: ${highRisk.map(p => p.mode).join(', ')}. Add preventions to prompt or restructure scope.`;
    } else {
      suggestion = 'Resolve listed blockers before dispatching.';
    }
  }

  return { ready, score, blockers, warnings, suggestion };
}

export function evolvePatterns(newDebrief, predictions) {
  const weights = loadWeights();

  for (const pred of predictions) {
    if (!weights[pred.mode]) {
      weights[pred.mode] = { correct: 0, incorrect: 0, accuracy: 0.5 };
    }

    const w = weights[pred.mode];
    const occurred = debriefContainsPattern(newDebrief, pred.mode);

    if (occurred && pred.likelihood >= 0.4) {
      w.correct++;
    } else if (!occurred && pred.likelihood >= 0.4) {
      w.incorrect++;
    } else if (occurred && pred.likelihood < 0.4) {
      // Missed prediction — we should have predicted higher
      w.incorrect++;
    }

    const total = w.correct + w.incorrect;
    w.accuracy = total > 0 ? w.correct / total : 0.5;
  }

  mkdirSync(DIAG_DIR, { recursive: true });
  writeFileSync(WEIGHTS_PATH, JSON.stringify(weights, null, 2));
}

function debriefContainsPattern(debrief, mode) {
  if (!debrief) return false;
  const modeMap = {
    'scope-explosion': ['scope-creep', 'scope_explosion', 'expanded'],
    'missing-context': ['missing-context', 'no_context', 'searched'],
    'wrong-approach': ['stuck-loop', 'wrong_approach', 'retry'],
    'blocked-dependency': ['blocked', 'dependency', 'waiting'],
    'stale-assumption': ['stale', 'outdated', 'changed'],
  };
  const text = JSON.stringify([...(debrief.issues || []), ...(debrief.patterns || [])]).toLowerCase();
  return (modeMap[mode] || [mode]).some(k => text.includes(k));
}
