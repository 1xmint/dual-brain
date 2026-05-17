// signal.mjs — Compound outcome signal scoring
// Combines multiple weak signals into one reliable reward score.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export const EXPECTED_DURATION_MS = { search: 15000, execute: 45000, think: 30000, review: 40000 };

export function scoreDurationRatio(durationMs, tier) {
  try {
    const expected = EXPECTED_DURATION_MS[tier] ?? EXPECTED_DURATION_MS.execute;
    const ratio = durationMs / expected;
    if (ratio >= 0.5 && ratio <= 1.5) return 1.0;
    if (ratio < 0.2) return 0.5;
    if (ratio > 3.0) return 0.3;
    if (ratio < 0.5) return 0.5 + ((ratio - 0.2) / (0.5 - 0.2)) * 0.5;
    // ratio 1.5–3.0
    return 1.0 - ((ratio - 1.5) / (3.0 - 1.5)) * 0.7;
  } catch {
    return null;
  }
}

export function measureFileSurvival(outcome, cwd) {
  try {
    const files = Array.isArray(outcome.filesChanged)
      ? outcome.filesChanged
      : [];
    if (files.length === 0) return 1.0;

    let changed;
    try {
      changed = new Set(
        execSync('git diff --name-only', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
          .split('\n')
          .map(f => f.trim())
          .filter(Boolean)
      );
    } catch {
      changed = new Set();
    }

    const survived = files.filter(f => {
      const abs = join(cwd, f);
      return existsSync(abs) && !changed.has(f);
    });
    return survived.length / files.length;
  } catch {
    return null;
  }
}

export function scoreOutcome(outcome, context = {}) {
  try {
    const tier = outcome.tier ?? 'execute';
    const signals = [];

    // Signal 1: exit success (weight 0.3)
    let exitVal;
    if (outcome.success === true) exitVal = 1.0;
    else if (outcome.status === 'partial') exitVal = 0.4;
    else exitVal = 0.0;
    signals.push({ name: 'exitSuccess', value: exitVal, weight: 0.3 });

    // Signal 2: duration ratio (weight 0.25)
    const durationMs = outcome.durationMs ?? 0;
    const durVal = durationMs > 0 ? scoreDurationRatio(durationMs, tier) : null;
    signals.push({ name: 'durationRatio', value: durVal, weight: 0.25 });

    // Signal 3: token efficiency (weight 0.25)
    let effVal = null;
    const filesChanged = outcome.filesChanged ?? 0;
    const fileCount = Array.isArray(filesChanged) ? filesChanged.length : (typeof filesChanged === 'number' ? filesChanged : 0);
    if (!(fileCount === 0 && tier === 'think')) {
      const tokensUsed =
        outcome.tokensUsed?.output ??
        (durationMs > 0 ? Math.round(durationMs / 100) : null);
      if (tokensUsed !== null) {
        const efficiency = fileCount / Math.max(1, tokensUsed / 1000);
        if (efficiency > 2) effVal = 1.0;
        else if (efficiency >= 0.5) effVal = 0.5 + ((efficiency - 0.5) / 1.5) * 0.5;
        else if (efficiency < 0.1) effVal = 0.2;
        else effVal = 0.2 + ((efficiency - 0.1) / 0.4) * 0.3;
      }
    }
    signals.push({ name: 'tokenEfficiency', value: effVal, weight: 0.25 });

    // Signal 4: file survival (weight 0.2) — delayed, may be null
    const survivalVal = context.fileSurvival ?? null;
    signals.push({ name: 'fileSurvival', value: survivalVal, weight: 0.2 });

    // Compound score with weight redistribution
    const active = signals.filter(s => s.value !== null);
    const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
    const reward = totalWeight > 0
      ? active.reduce((sum, s) => sum + (s.value * s.weight / totalWeight), 0)
      : 0;
    const confidence = totalWeight;

    return {
      reward: Math.min(1, Math.max(0, reward)),
      confidence: Math.min(1, confidence),
      signals: {
        exitSuccess: exitVal,
        durationRatio: durVal,
        tokenEfficiency: effVal,
        fileSurvival: survivalVal,
      },
    };
  } catch {
    return { reward: 0, confidence: 0, signals: { exitSuccess: false, durationRatio: null, tokenEfficiency: null, fileSurvival: null } };
  }
}
