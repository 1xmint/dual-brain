/**
 * debrief.ts — Agent debrief parsing, integration, and wave summarization.
 */

import type { Tier } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type DebriefStatus = 'success' | 'partial' | 'blocked' | 'pivoted';
type ScopeChange = 'same' | 'larger' | 'smaller' | 'different';

export interface DebriefArtifacts {
  filesChanged: string[];
  filesRead: string[];
  testsRun: number;
}

export interface Debrief {
  status: DebriefStatus;
  findings: string[];
  blockers: string[];
  scopeChange: ScopeChange;
  confidence: number;
  recommendations: string[];
  artifacts: DebriefArtifacts;
  pivotReason: string | undefined;
  unexpectedFindings: string[];
}

interface LedgerEntry {
  topic: string;
  confidence: number;
  resolved: boolean;
  isBlocker?: boolean;
}

interface SituationModel {
  ledger?: LedgerEntry[];
  material?: {
    scopeTrend?: ScopeChange;
    touchedFiles?: string[];
  };
  nextActions?: string[];
  noticings?: string[];
  confidence?: number;
  [key: string]: unknown;
}

export interface WaveOutcome {
  overallStatus: DebriefStatus | 'blocked';
  aggregateConfidence: number;
  allFindings: string[];
  allBlockers: string[];
  scopeDelta: ScopeChange;
  nextActions: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES: DebriefStatus[] = ['success', 'partial', 'blocked', 'pivoted'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyDebrief(): Debrief {
  return {
    status: 'partial',
    findings: [],
    blockers: [],
    scopeChange: 'same',
    confidence: 0.5,
    recommendations: [],
    artifacts: { filesChanged: [], filesRead: [], testsRun: 0 },
    pivotReason: undefined,
    unexpectedFindings: [],
  };
}

// ─── Parse debrief from raw agent output ─────────────────────────────────────

const FILE_PATH_RE = /(?:^|\s)([\w./-]+\.(?:mjs|js|ts|tsx|json|md|py|sh|yaml|yml|css|html))/gm;
const TEST_COUNT_RE = /(\d+)\s*(?:tests?|specs?|assertions?)\s*(?:passed|ran|run|succeeded|ok)/i;

function extractByPatterns(text: string, patterns: RegExp[], minLen: number, maxLen: number, limit: number): string[] {
  const results: string[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const v = m[1].trim();
      if (v.length > minLen && v.length < maxLen) results.push(v);
    }
  }
  return [...new Set(results)].slice(0, limit);
}

const extractFindings = (t: string): string[] => extractByPatterns(t, [
  /(?:found|discovered|identified|noticed|see that|observed)\s+(?:that\s+)?(.+?)(?:\.|$)/gim,
  /^[-•*]\s*(.+)$/gm,
], 10, 300, 20);

const extractBlockers = (t: string): string[] => extractByPatterns(t, [
  /(?:blocked by|couldn't|cannot|unable to|failed to|can't)\s+(.+?)(?:\.|$)/gim,
  /(?:blocker|obstacle|issue|problem):\s*(.+?)(?:\.|$)/gim,
], 5, 200, 10);

const extractRecommendations = (t: string): string[] => extractByPatterns(t, [
  /(?:recommend|suggest|should|next step|consider)\s+(.+?)(?:\.|$)/gim,
  /(?:TODO|ACTION):\s*(.+?)(?:\.|$)/gim,
], 5, 200, 10);

const extractUnexpected = (t: string): string[] => extractByPatterns(t, [
  /(?:also noticed|unexpected|surprisingly|interestingly|aside:)\s+(.+?)(?:\.|$)/gim,
], 10, 200, 5);

function inferStatus(text: string, blockers: string[], findings: string[]): DebriefStatus {
  const lower = text.toLowerCase();
  if (/pivoted|changed approach|switched to/i.test(lower)) return 'pivoted';
  if (blockers.length > 0 && findings.length === 0) return 'blocked';
  if (blockers.length > 0) return 'partial';
  if (/complete|done|success|finished|all (?:tests )?pass/i.test(lower)) return 'success';
  return 'partial';
}

function inferScopeChange(text: string): ScopeChange {
  const lower = text.toLowerCase();
  if (/scope.{0,20}(?:grew|larger|expanded|more than expected)/i.test(lower)) return 'larger';
  if (/scope.{0,20}(?:smaller|reduced|simpler than)/i.test(lower)) return 'smaller';
  if (/(?:different approach|completely different|pivoted to)/i.test(lower)) return 'different';
  return 'same';
}

function inferConfidence(text: string, findings: string[], blockers: string[]): number {
  if (/(?:very confident|high confidence|certain)/i.test(text)) return 0.9;
  if (/(?:uncertain|not sure|low confidence|unsure)/i.test(text)) return 0.3;
  if (blockers.length > 2) return 0.3;
  if (blockers.length > 0) return 0.5;
  if (findings.length > 3) return 0.8;
  return 0.6;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export function parseDebrief(rawOutput: unknown): Debrief {
  if (!rawOutput || typeof rawOutput !== 'string') return emptyDebrief();

  // Try JSON-structured debrief first
  const jsonMatch = rawOutput.match(/```(?:json)?\s*(\{[\s\S]*?"status"[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<Debrief>;
      if (parsed.status && (STATUSES as string[]).includes(parsed.status)) {
        const d = emptyDebrief();
        return {
          ...d,
          ...parsed,
          artifacts: { ...d.artifacts, ...(parsed.artifacts || {}) },
        };
      }
    } catch { /* fall through to prose extraction */ }
  }

  // Best-effort extraction from prose
  const findings = extractFindings(rawOutput);
  const blockers = extractBlockers(rawOutput);
  const recommendations = extractRecommendations(rawOutput);
  const unexpectedFindings = extractUnexpected(rawOutput);

  const filesAll = [...rawOutput.matchAll(FILE_PATH_RE)].map(m => m[1]);
  const lower = rawOutput.toLowerCase();
  const filesChanged = filesAll.filter(f => lower.includes(`wrote ${f.toLowerCase()}`) || lower.includes(`created ${f.toLowerCase()}`) || lower.includes(`modified ${f.toLowerCase()}`) || lower.includes(`edited ${f.toLowerCase()}`));
  const filesRead = filesAll.filter(f => !filesChanged.includes(f));

  const testMatch = rawOutput.match(TEST_COUNT_RE);
  const testsRun = testMatch ? parseInt(testMatch[1], 10) : 0;

  const pivotMatch = rawOutput.match(/pivoted?\s+(?:because|since|due to)\s+(.+?)(?:\.|$)/i);

  return {
    status: inferStatus(rawOutput, blockers, findings),
    findings,
    blockers,
    scopeChange: inferScopeChange(rawOutput),
    confidence: inferConfidence(rawOutput, findings, blockers),
    recommendations,
    artifacts: { filesChanged, filesRead, testsRun },
    pivotReason: pivotMatch ? pivotMatch[1].trim() : undefined,
    unexpectedFindings,
  };
}

// ─── Generate debrief instruction for agent prompts ──────────────────────────

const TIER_EMPHASIS: Record<string, string> = {
  search: 'Focus on: findings, confidence, unexpectedFindings.',
  execute: 'Focus on: artifacts (filesChanged, testsRun), blockers, scopeChange.',
  think: 'Focus on: recommendations, confidence, pivotReason.',
};

export function generateDebriefInstruction(tier: string, contract?: { scope?: string }): string {
  const emphasis = TIER_EMPHASIS[tier] || TIER_EMPHASIS.execute;
  const scope = contract?.scope ? ` Scope: ${contract.scope}.` : '';
  return `\n---\nRESPONSE FORMAT: End your response with a JSON block:\n\`\`\`json\n{"status":"success|partial|blocked|pivoted","findings":[],"blockers":[],"scopeChange":"same|larger|smaller|different","confidence":0.0-1.0,"recommendations":[],"artifacts":{"filesChanged":[],"filesRead":[],"testsRun":0},"pivotReason":"...if pivoted","unexpectedFindings":[]}\n\`\`\`\n${emphasis}${scope}`;
}

// ─── Integrate debrief into HEAD's situation model ───────────────────────────

export function integrateDebrief(currentSituation: SituationModel, debrief: Debrief): SituationModel {
  const sit: SituationModel = structuredClone(currentSituation);

  // Update confidence on related ledger entries
  if (!sit.ledger) sit.ledger = [];
  for (const finding of debrief.findings) {
    const existing = sit.ledger.find(e => e.topic && finding.toLowerCase().includes(e.topic.toLowerCase()));
    if (existing) {
      existing.confidence = Math.min(1, (existing.confidence || 0.5) + 0.1);
      existing.resolved = true;
    } else {
      sit.ledger.push({ topic: finding.slice(0, 80), confidence: debrief.confidence, resolved: false });
    }
  }

  // Blockers create new uncertainty entries
  for (const blocker of debrief.blockers) {
    sit.ledger.push({ topic: blocker.slice(0, 80), confidence: 0.3, resolved: false, isBlocker: true });
  }

  // Scope delta
  if (debrief.scopeChange !== 'same') {
    if (!sit.material) sit.material = {};
    sit.material.scopeTrend = debrief.scopeChange;
    if (debrief.artifacts?.filesChanged) {
      sit.material.touchedFiles = [
        ...new Set([...(sit.material.touchedFiles || []), ...debrief.artifacts.filesChanged]),
      ];
    }
  }

  // Recommendations -> next wave planning
  if (!sit.nextActions) sit.nextActions = [];
  sit.nextActions.push(...debrief.recommendations);

  // Unexpected findings -> noticings
  if (debrief.unexpectedFindings?.length) {
    if (!sit.noticings) sit.noticings = [];
    sit.noticings.push(...debrief.unexpectedFindings);
  }

  // Overall confidence update
  sit.confidence = sit.confidence
    ? sit.confidence * 0.7 + debrief.confidence * 0.3
    : debrief.confidence;

  return sit;
}

// ─── Summarize a parallel wave of debriefs ───────────────────────────────────

export function summarizeWaveOutcome(debriefs: Debrief[] | null | undefined): WaveOutcome {
  if (!debriefs || debriefs.length === 0) {
    return {
      overallStatus: 'blocked',
      aggregateConfidence: 0,
      allFindings: [],
      allBlockers: [],
      scopeDelta: 'same',
      nextActions: [],
    };
  }

  const statusPriority: Record<string, number> = { blocked: 0, pivoted: 1, partial: 2, success: 3 };
  const worstStatus = debriefs.reduce<DebriefStatus>((worst, d) =>
    (statusPriority[d.status] ?? 2) < (statusPriority[worst] ?? 2) ? d.status : worst,
    'success'
  );

  const allFindings = [...new Set(debriefs.flatMap(d => d.findings || []))];
  const allBlockers = [...new Set(debriefs.flatMap(d => d.blockers || []))];
  const nextActions = [...new Set(debriefs.flatMap(d => d.recommendations || []))];

  const aggregateConfidence = debriefs.reduce((sum, d) => sum + (d.confidence || 0.5), 0) / debriefs.length;

  // Scope: any non-same scope wins, larger beats smaller, different beats all
  const scopeDeltas = debriefs.map(d => d.scopeChange || 'same').filter(s => s !== 'same');
  let scopeDelta: ScopeChange = 'same';
  if (scopeDeltas.includes('different')) scopeDelta = 'different';
  else if (scopeDeltas.includes('larger')) scopeDelta = 'larger';
  else if (scopeDeltas.includes('smaller')) scopeDelta = 'smaller';

  return {
    overallStatus: worstStatus,
    aggregateConfidence: Math.round(aggregateConfidence * 100) / 100,
    allFindings,
    allBlockers,
    scopeDelta,
    nextActions,
  };
}
