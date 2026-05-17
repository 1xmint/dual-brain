#!/usr/bin/env node
// continuity.ts — Session continuity for dual-brain.
// Generates handoff receipts so the next session can pick up seamlessly
// when a session hits context limits, crashes, or is manually ended.
//
// Exports: generateHandoff, saveHandoff, getLatestHandoff, getHandoffAge,
//          buildCompactionSurvivalKit, buildResumeBrief, pruneHandoffs,
//          extractRoutingPatterns

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadNarrative } from './narrative.js';

// ─── Session chaining ─────────────────────────────────────────────────────────

export interface HandoffSessionState {
  taskDescription?: string;
  filesChanged?: string[];
  testsRun?: string[];
  decisions?: object[];
  unresolved?: string[];
  routingHistory?: {
    lastProvider?: string;
    lastModel?: string;
    failedProviders?: string[];
  };
  activePreferences?: string[];
  resumeHint?: string;
  narrative?: string;
}

export interface Handoff {
  version: number;
  timestamp: string;
  task: string | null;
  progress: {
    filesChanged: string[];
    testsRun: string[];
    decisions: object[];
  };
  unresolved: string[];
  routing: {
    lastProvider: string | null;
    lastModel: string | null;
    failedProviders: string[];
  };
  preferences: string[];
  resumeHint: string | null;
  narrative: string | null;
}

/**
 * Generate a compact handoff object from current session state.
 * Designed to fit in ~500 tokens when serialized.
 */
export function generateHandoff(sessionState: HandoffSessionState): Handoff {
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
 */
export function saveHandoff(handoff: Handoff, cwd?: string): string {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  mkdirSync(dir, { recursive: true });
  const filename = `handoff-${Date.now()}.json`;
  writeFileSync(join(dir, filename), JSON.stringify(handoff, null, 2));
  return join(dir, filename);
}

/**
 * Load the most recent handoff from .dualbrain/handoffs/.
 * Returns null when no handoffs exist or all are unreadable.
 */
export function getLatestHandoff(cwd?: string): Handoff | null {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[0]), 'utf8')) as Handoff;
  } catch {
    return null;
  }
}

/**
 * Return the age of a handoff in hours.
 * Returns Infinity when the handoff has no timestamp.
 */
export function getHandoffAge(handoff: Handoff | null): number {
  if (!handoff?.timestamp) return Infinity;
  return (Date.now() - Date.parse(handoff.timestamp)) / 3600000;
}

// ─── Smart compaction ─────────────────────────────────────────────────────────

export interface CompactionState {
  activeTask?: string;
  routingRules?: string[];
  criticalDecisions?: string[];
  filesInProgress?: string[];
  preferences?: string[];
  warnings?: string[];
}

/**
 * Build a compaction-safe summary string to inject before context compression.
 */
export function buildCompactionSurvivalKit(state: CompactionState): string {
  const lines: string[] = [];
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
 */
export function buildResumeBrief(cwd?: string): string | null {
  const handoff = getLatestHandoff(cwd);
  if (!handoff) return null;

  const ageHours = getHandoffAge(handoff);
  if (ageHours > 48) return null; // too stale to be useful

  const lines: string[] = [];
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
 */
export function pruneHandoffs(cwd?: string, keep = 10): number {
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

export interface RoutingPattern {
  type: string;
  value: string;
  count: number;
}

export interface RoutingPatterns {
  patterns: RoutingPattern[];
  confidence: number;
  sampleSize: number;
}

/**
 * Extract routing patterns from handoff history to inform provider/model selection.
 */
export function extractRoutingPatterns(cwd?: string): RoutingPatterns {
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
        return JSON.parse(readFileSync(join(dir, f), 'utf8')) as Handoff;
      } catch {
        return null;
      }
    })
    .filter((h): h is Handoff => h !== null);

  // Count provider/model usage patterns
  const providerCounts: Record<string, number> = {};
  const modelCounts: Record<string, number> = {};
  const failureCounts: Record<string, number> = {};

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

  const patterns: RoutingPattern[] = [];

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
