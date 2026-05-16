#!/usr/bin/env node
// continuity.mjs — Session continuity for dual-brain.
// Generates handoff receipts so the next session can pick up seamlessly
// when a session hits context limits, crashes, or is manually ended.
//
// Exports: generateHandoff, saveHandoff, getLatestHandoff, getHandoffAge,
//          buildCompactionSurvivalKit, buildResumeBrief, pruneHandoffs,
//          extractRoutingPatterns

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadNarrative } from './narrative.mjs';

// ─── Session chaining ─────────────────────────────────────────────────────────

/**
 * Generate a compact handoff object from current session state.
 * Designed to fit in ~500 tokens when serialized.
 *
 * @param {object} sessionState
 * @param {string}   [sessionState.taskDescription]
 * @param {string[]} [sessionState.filesChanged]
 * @param {string[]} [sessionState.testsRun]
 * @param {object[]} [sessionState.decisions]         Most recent routing decisions
 * @param {string[]} [sessionState.unresolved]        Open questions / blockers
 * @param {object}   [sessionState.routingHistory]
 * @param {string}     [sessionState.routingHistory.lastProvider]
 * @param {string}     [sessionState.routingHistory.lastModel]
 * @param {string[]}   [sessionState.routingHistory.failedProviders]
 * @param {string[]} [sessionState.activePreferences]
 * @param {string}   [sessionState.resumeHint]        e.g. "continue implementing auth refactor"
 * @returns {object}
 */
export function generateHandoff(sessionState) {
  return {
    version: 2,
    timestamp: new Date().toISOString(),
    task: sessionState.taskDescription || null,
    progress: {
      filesChanged: (sessionState.filesChanged || []).slice(0, 20),
      testsRun: sessionState.testsRun || [],
      decisions: (sessionState.decisions || []).slice(0, 5),
    },
    unresolved: (sessionState.unresolved || []).slice(0, 5),
    routing: {
      lastProvider: sessionState.routingHistory?.lastProvider || null,
      lastModel: sessionState.routingHistory?.lastModel || null,
      failedProviders: sessionState.routingHistory?.failedProviders || [],
    },
    preferences: sessionState.activePreferences || [],
    resumeHint: sessionState.resumeHint || null,
    narrative: sessionState.narrative || loadNarrative() || null,
  };
}

// ─── Handoff persistence ──────────────────────────────────────────────────────

/**
 * Persist a handoff object to .dualbrain/handoffs/.
 * @param {object} handoff   Result of generateHandoff()
 * @param {string} [cwd]     Project root (defaults to process.cwd())
 * @returns {string}         Absolute path of the written file
 */
export function saveHandoff(handoff, cwd) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  mkdirSync(dir, { recursive: true });
  const filename = `handoff-${Date.now()}.json`;
  writeFileSync(join(dir, filename), JSON.stringify(handoff, null, 2));
  return join(dir, filename);
}

/**
 * Load the most recent handoff from .dualbrain/handoffs/.
 * Returns null when no handoffs exist or all are unreadable.
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function getLatestHandoff(cwd) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Return the age of a handoff in hours.
 * Returns Infinity when the handoff has no timestamp.
 * @param {object|null} handoff
 * @returns {number}  Hours since handoff was generated
 */
export function getHandoffAge(handoff) {
  if (!handoff?.timestamp) return Infinity;
  return (Date.now() - Date.parse(handoff.timestamp)) / 3600000;
}

// ─── Smart compaction ─────────────────────────────────────────────────────────

/**
 * Build a compaction-safe summary string to inject before context compression.
 * The content must survive being summarised by a compression pass, so keep it
 * terse, high-signal, and easy to re-state.
 *
 * @param {object} state
 * @param {string}   [state.activeTask]
 * @param {string[]} [state.routingRules]
 * @param {string[]} [state.criticalDecisions]
 * @param {string[]} [state.filesInProgress]
 * @param {string[]} [state.preferences]
 * @param {string[]} [state.warnings]
 * @returns {string}
 */
export function buildCompactionSurvivalKit(state) {
  const lines = [];
  lines.push('[DUAL-BRAIN CONTINUITY]');

  if (state.activeTask) {
    lines.push(`TASK: ${state.activeTask}`);
  }
  if (state.routingRules?.length) {
    lines.push(`ROUTING: ${state.routingRules.join('; ')}`);
  }
  if (state.criticalDecisions?.length) {
    lines.push(`DECISIONS: ${state.criticalDecisions.join('; ')}`);
  }
  if (state.filesInProgress?.length) {
    lines.push(`FILES: ${state.filesInProgress.join(', ')}`);
  }
  if (state.preferences?.length) {
    lines.push(`PREFS: ${state.preferences.join('; ')}`);
  }
  if (state.warnings?.length) {
    lines.push(`WARNINGS: ${state.warnings.join('; ')}`);
  }

  lines.push('[/DUAL-BRAIN CONTINUITY]');
  return lines.join('\n');
}

// ─── Resume brief builder ─────────────────────────────────────────────────────

/**
 * Check for a recent handoff and build a resume context string for a new session.
 * Returns null when no usable handoff exists (missing, too stale, or unreadable).
 *
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function buildResumeBrief(cwd) {
  const handoff = getLatestHandoff(cwd);
  if (!handoff) return null;

  const ageHours = getHandoffAge(handoff);
  if (ageHours > 48) return null; // too stale to be useful

  const lines = [];
  const ageLabel =
    ageHours < 1
      ? 'just now'
      : ageHours < 24
        ? `${Math.round(ageHours)}h ago`
        : `${Math.round(ageHours / 24)}d ago`;

  lines.push(`Resuming from previous session (${ageLabel}):`);

  // Narrative first — most valuable context for immersion
  if (handoff.narrative) {
    lines.push(`  Context: ${handoff.narrative.slice(0, 300)}`);
  }

  if (handoff.task) lines.push(`  Task: ${handoff.task}`);
  if (handoff.resumeHint) lines.push(`  Next: ${handoff.resumeHint}`);
  if (handoff.progress?.filesChanged?.length) {
    const shown = handoff.progress.filesChanged.slice(0, 5);
    const extra = handoff.progress.filesChanged.length > 5
      ? ` (+${handoff.progress.filesChanged.length - 5} more)`
      : '';
    lines.push(`  Changed: ${shown.join(', ')}${extra}`);
  }
  if (handoff.unresolved?.length) {
    lines.push(`  Unresolved: ${handoff.unresolved.join('; ')}`);
  }
  if (handoff.routing?.failedProviders?.length) {
    lines.push(`  Note: ${handoff.routing.failedProviders.join(', ')} failed last session`);
  }

  return lines.join('\n');
}

// ─── Handoff cleanup ──────────────────────────────────────────────────────────

/**
 * Remove old handoff files, keeping only the most recent `keep` entries.
 * @param {string} [cwd]
 * @param {number} [keep=10]
 * @returns {number}  Count of files pruned
 */
export function pruneHandoffs(cwd, keep = 10) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse();
  let pruned = 0;
  for (const f of files.slice(keep)) {
    try {
      unlinkSync(join(dir, f));
      pruned++;
    } catch {
      // Skip files that can't be removed — best-effort
    }
  }
  return pruned;
}

// ─── Cross-session learning ───────────────────────────────────────────────────

/**
 * Extract routing patterns from handoff history to inform provider/model selection.
 *
 * @param {string} [cwd]
 * @returns {{
 *   patterns: Array<{ type: string, value: string, count: number }>,
 *   confidence: number,
 *   sampleSize: number
 * }}
 */
export function extractRoutingPatterns(cwd) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return { patterns: [], confidence: 0, sampleSize: 0 };

  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 20);

  const handoffs = files
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Count provider/model usage patterns
  const providerCounts = {};
  const modelCounts = {};
  const failureCounts = {};

  for (const h of handoffs) {
    if (h.routing?.lastProvider) {
      providerCounts[h.routing.lastProvider] = (providerCounts[h.routing.lastProvider] || 0) + 1;
    }
    if (h.routing?.lastModel) {
      modelCounts[h.routing.lastModel] = (modelCounts[h.routing.lastModel] || 0) + 1;
    }
    for (const fp of (h.routing?.failedProviders || [])) {
      failureCounts[fp] = (failureCounts[fp] || 0) + 1;
    }
  }

  const patterns = [];

  // Most used provider
  const topProvider = Object.entries(providerCounts).sort((a, b) => b[1] - a[1])[0];
  if (topProvider) {
    patterns.push({ type: 'preferred_provider', value: topProvider[0], count: topProvider[1] });
  }

  // Most used model
  const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0];
  if (topModel) {
    patterns.push({ type: 'preferred_model', value: topModel[0], count: topModel[1] });
  }

  // Frequently failing provider (threshold: 3+ failures)
  const topFailure = Object.entries(failureCounts).sort((a, b) => b[1] - a[1])[0];
  if (topFailure && topFailure[1] >= 3) {
    patterns.push({ type: 'unreliable_provider', value: topFailure[0], count: topFailure[1] });
  }

  return {
    patterns,
    confidence: Math.min(1, handoffs.length / 10),
    sampleSize: handoffs.length,
  };
}
