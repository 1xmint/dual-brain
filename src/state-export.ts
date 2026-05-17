/**
 * state-export.ts — JSON state export for external consumers (web panels, dashboards).
 *
 * Writes orchestrator state to `.dual-brain/state/` as typed JSON files.
 * All writes are atomic (write .tmp then rename) for crash safety.
 * All functions are non-throwing.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { getAllProviderStates, type ProviderState } from './provider-manager.js';
import { getRoutingStats } from './routing-advisor.js';
import { listRooms, getWorkerStatuses, type RoomSummary } from './room.js';
import { getCostSummary } from './cost-tracker.js';

// ─── Exported JSON shapes (contract with external consumers) ──────────────

export interface ExportedProviderEntry {
  provider: string;
  status: string;
  lastCheck: string;
  lastSuccess: string;
  cooldownUntil?: string;
  remainingCapacity: number;
  recentDispatches: number;
  consecutiveFailures: number;
}

export interface ExportedProviders {
  exportedAt: string;
  providers: ExportedProviderEntry[];
}

export interface ExportedRoutingPerformer {
  cell: string;
  model: string;
  ema: number;
  observations: number;
}

export interface ExportedRouting {
  exportedAt: string;
  totalObservations: number;
  topPerformers: ExportedRoutingPerformer[];
  worstPerformers: ExportedRoutingPerformer[];
  cells: Record<string, Record<string, { ema: number; observations: number }>>;
}

export interface ExportedRoomEntry {
  id: string;
  status: string;
  taskDescription: string;
  created: string;
  workerCount: number;
  workerStatuses: Record<string, string>;
}

export interface ExportedRooms {
  exportedAt: string;
  rooms: ExportedRoomEntry[];
}

export interface ExportedDecisionEntry {
  timestamp: string;
  promptSummary: string;
  model: string;
  provider: string;
  tier: string;
  reason: string;
}

export interface ExportedDecisions {
  exportedAt: string;
  decisions: ExportedDecisionEntry[];
}

export interface ExportedCosts {
  exportedAt: string;
  period: string;
  totalCost: number;
  totalTokens: number;
  totalActions: number;
  cacheHits: number;
  tokensSaved: number;
  costSaved: number;
  savingsRate: number;
  byTier: Record<string, { count: number; tokens: number; cost: number }>;
  byModel: Record<string, { count: number; tokens: number; cost: number }>;
  trend: string;
}

export interface ExportedOutcomeEntry {
  timestamp: string;
  roomId: string;
  outcome: Record<string, unknown>;
}

export interface ExportedOutcomes {
  exportedAt: string;
  outcomes: ExportedOutcomeEntry[];
}

export interface ExportedState {
  exportedAt: string;
  providers: ExportedProviders;
  routing: ExportedRouting;
  rooms: ExportedRooms;
  decisions: ExportedDecisions;
  costs: ExportedCosts;
  outcomes: ExportedOutcomes;
}

// ─── Constants ────────────────────────────────────────────────────────────

const STATE_DIR = '.dual-brain/state';
const MAX_DECISIONS = 50;
const MAX_OUTCOMES = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────

function stateDir(cwd?: string): string {
  return join(cwd || process.cwd(), STATE_DIR);
}

function stateFile(name: string, cwd?: string): string {
  return join(stateDir(cwd), name);
}

/**
 * Atomic write: write to .tmp then rename for crash safety.
 */
function atomicWrite(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const json = JSON.stringify(data, null, 2) + '\n';
  writeFileSync(tmp, json, 'utf8');
  renameSync(tmp, filePath);
}

/**
 * Safely read and parse a JSON file. Returns null on any error.
 */
function readJson<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Truncate a prompt to a short summary for the decisions log.
 */
function summarizePrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 120) return cleaned;
  return cleaned.slice(0, 117) + '...';
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Export full orchestrator state to `.dual-brain/state/`.
 * Writes providers.json, routing.json, rooms.json, decisions.json, costs.json.
 * Non-throwing: returns true on success, false on failure.
 */
export function exportState(cwd?: string): boolean {
  try {
    const now = new Date().toISOString();
    const resolvedCwd = cwd || process.cwd();

    // ── providers.json
    const providerStates = getAllProviderStates(resolvedCwd);
    const providers: ExportedProviders = {
      exportedAt: now,
      providers: providerStates.map((ps: ProviderState) => ({
        provider: ps.provider,
        status: ps.status,
        lastCheck: ps.lastCheck,
        lastSuccess: ps.lastSuccess,
        cooldownUntil: ps.cooldownUntil,
        remainingCapacity: ps.remainingCapacity,
        recentDispatches: ps.recentDispatches,
        consecutiveFailures: ps.consecutiveFailures,
      })),
    };
    atomicWrite(stateFile('providers.json', resolvedCwd), providers);

    // ── routing.json
    const stats = getRoutingStats(resolvedCwd);
    const routing: ExportedRouting = {
      exportedAt: now,
      totalObservations: stats.totalObservations,
      topPerformers: stats.topPerformers,
      worstPerformers: stats.worstPerformers,
      cells: stats.cells,
    };
    atomicWrite(stateFile('routing.json', resolvedCwd), routing);

    // ── rooms.json
    const roomSummaries = listRooms(resolvedCwd);
    const roomEntries: ExportedRoomEntry[] = roomSummaries.map((rs: RoomSummary) => ({
      id: rs.id,
      status: rs.status,
      taskDescription: rs.taskDescription,
      created: rs.created,
      workerCount: rs.workerCount,
      workerStatuses: getWorkerStatuses(rs.id, resolvedCwd),
    }));
    const rooms: ExportedRooms = {
      exportedAt: now,
      rooms: roomEntries,
    };
    atomicWrite(stateFile('rooms.json', resolvedCwd), rooms);

    // ── decisions.json — preserve existing, just update exportedAt
    const existingDecisions = readJson<ExportedDecisions>(stateFile('decisions.json', resolvedCwd));
    const decisions: ExportedDecisions = {
      exportedAt: now,
      decisions: existingDecisions?.decisions ?? [],
    };
    atomicWrite(stateFile('decisions.json', resolvedCwd), decisions);

    // ── costs.json
    const costSummary = getCostSummary(resolvedCwd, 7);
    const costs: ExportedCosts = {
      exportedAt: now,
      period: costSummary.period,
      totalCost: costSummary.totalCost,
      totalTokens: costSummary.totalTokens,
      totalActions: costSummary.totalActions,
      cacheHits: costSummary.cacheHits,
      tokensSaved: costSummary.tokensSaved,
      costSaved: costSummary.costSaved,
      savingsRate: costSummary.savingsRate,
      byTier: costSummary.byTier,
      byModel: costSummary.byModel,
      trend: costSummary.trend,
    };
    atomicWrite(stateFile('costs.json', resolvedCwd), costs);

    return true;
  } catch {
    return false;
  }
}

/**
 * Append a routing decision to decisions.json (ring buffer, max 50 entries).
 * Non-throwing.
 */
export function exportDecision(
  decision: { provider?: string; model?: string; tier?: string; explanation?: string; [key: string]: unknown },
  prompt: string,
  cwd?: string,
): void {
  try {
    const resolvedCwd = cwd || process.cwd();
    const filePath = stateFile('decisions.json', resolvedCwd);

    const existing = readJson<ExportedDecisions>(filePath);
    const entries = existing?.decisions ?? [];

    const entry: ExportedDecisionEntry = {
      timestamp: new Date().toISOString(),
      promptSummary: summarizePrompt(prompt),
      model: (decision.model as string) ?? 'unknown',
      provider: (decision.provider as string) ?? 'unknown',
      tier: (decision.tier as string) ?? 'unknown',
      reason: (decision.explanation as string) ?? '',
    };

    entries.push(entry);

    // Ring buffer: keep only the last MAX_DECISIONS entries
    const trimmed = entries.length > MAX_DECISIONS
      ? entries.slice(entries.length - MAX_DECISIONS)
      : entries;

    const output: ExportedDecisions = {
      exportedAt: new Date().toISOString(),
      decisions: trimmed,
    };

    atomicWrite(filePath, output);
  } catch {
    // non-throwing
  }
}

/**
 * Append an outcome to outcomes.json log.
 * Non-throwing.
 */
export function exportOutcome(
  roomId: string,
  outcome: Record<string, unknown>,
  cwd?: string,
): void {
  try {
    const resolvedCwd = cwd || process.cwd();
    const filePath = stateFile('outcomes.json', resolvedCwd);

    const existing = readJson<ExportedOutcomes>(filePath);
    const entries = existing?.outcomes ?? [];

    const entry: ExportedOutcomeEntry = {
      timestamp: new Date().toISOString(),
      roomId,
      outcome,
    };

    entries.push(entry);

    // Keep bounded (MAX_OUTCOMES)
    const trimmed = entries.length > MAX_OUTCOMES
      ? entries.slice(entries.length - MAX_OUTCOMES)
      : entries;

    const output: ExportedOutcomes = {
      exportedAt: new Date().toISOString(),
      outcomes: trimmed,
    };

    atomicWrite(filePath, output);
  } catch {
    // non-throwing
  }
}

/**
 * Read all exported state files and return a combined object.
 * Suitable for HTTP API or MCP tool responses.
 * Non-throwing: returns partial data if some files are missing/corrupt.
 */
export function getExportedState(cwd?: string): ExportedState {
  const resolvedCwd = cwd || process.cwd();
  const now = new Date().toISOString();

  const providers = readJson<ExportedProviders>(stateFile('providers.json', resolvedCwd))
    ?? { exportedAt: now, providers: [] };

  const routing = readJson<ExportedRouting>(stateFile('routing.json', resolvedCwd))
    ?? { exportedAt: now, totalObservations: 0, topPerformers: [], worstPerformers: [], cells: {} };

  const rooms = readJson<ExportedRooms>(stateFile('rooms.json', resolvedCwd))
    ?? { exportedAt: now, rooms: [] };

  const decisions = readJson<ExportedDecisions>(stateFile('decisions.json', resolvedCwd))
    ?? { exportedAt: now, decisions: [] };

  const costs = readJson<ExportedCosts>(stateFile('costs.json', resolvedCwd))
    ?? { exportedAt: now, period: '7 days', totalCost: 0, totalTokens: 0, totalActions: 0, cacheHits: 0, tokensSaved: 0, costSaved: 0, savingsRate: 0, byTier: {}, byModel: {}, trend: 'stable' };

  const outcomes = readJson<ExportedOutcomes>(stateFile('outcomes.json', resolvedCwd))
    ?? { exportedAt: now, outcomes: [] };

  return {
    exportedAt: now,
    providers,
    routing,
    rooms,
    decisions,
    costs,
    outcomes,
  };
}
