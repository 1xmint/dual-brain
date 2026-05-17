import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { processTurn, loadState } from './head.js';

const DUALBRAIN = join(process.cwd(), '.dualbrain');
const DELIBERATION_FILE = join(DUALBRAIN, 'deliberation.json');

// ── Types ────────────────────────────────────────────────────────────────────

export interface DispatchPlan {
  strategy: string;
  id: string;
  expectedParallel: number;
  waveSize: number;
  subtasks?: string[];
  reason: string;
}

export interface DeliberationArtifact {
  timestamp: number;
  createdAt: number;
  message: string;
  action: unknown;
  result: unknown;
  shouldAskUser: boolean;
  confidence: unknown;
  obligations: unknown[];
  surfaceNoticings: unknown[];
  dispatchPlan: DispatchPlan | null;
  depth: string;
  rationale: string;
  situation: {
    taskShape: unknown;
    urgency: unknown;
    scope: unknown;
  };
}

interface ProcessTurnResult {
  action: { type: string; mode?: string };
  result: {
    confidence?: { score?: number } | null;
    surfaceNoticings?: unknown[];
    depth?: string;
  };
  shouldAskUser: boolean;
  obligations?: unknown[];
  depth: string;
  rationale: string;
  situation?: {
    taskShape?: { scope?: string } | null;
    urgency?: string;
    material?: { touchedFiles?: string[] };
  };
}

interface DispatchContext {
  subtasks?: Array<string | { name?: string; description?: string }>;
  situation?: unknown;
  result?: unknown;
  [key: string]: unknown;
}

/**
 * Write the deliberation artifact after running HEAD's cognitive pipeline.
 * This is the contract between HEAD's thinking and the deliberation-gate hook.
 */
export function writeDeliberation(userMessage: string, context: DispatchContext = {}): ProcessTurnResult {
  const state = loadState();
  const result = processTurn(state, userMessage, context) as ProcessTurnResult;

  // Determine if there are multiple independent sub-tasks that could be parallelized
  const dispatchPlan = _deriveDispatchPlan(result, context);

  // Build the artifact
  const artifact: DeliberationArtifact = {
    timestamp: Date.now(),
    createdAt: Date.now(),
    message: userMessage.slice(0, 500),

    // Core deliberation fields
    action: result.action,
    result: result.result,
    shouldAskUser: result.shouldAskUser,
    confidence: result.result?.confidence || null,

    // Obligations and noticings
    obligations: result.obligations || [],
    surfaceNoticings: result.result?.surfaceNoticings || [],

    // Dispatch plan (parallel-wave support)
    dispatchPlan,

    // Metadata
    depth: result.depth,
    rationale: result.rationale,
    situation: {
      taskShape: result.situation?.taskShape || null,
      urgency: result.situation?.urgency || null,
      scope: result.situation?.taskShape?.scope || null,
    },
  };

  // Write atomically
  mkdirSync(DUALBRAIN, { recursive: true });
  const tmpFile = DELIBERATION_FILE + '.tmp.' + process.pid;
  writeFileSync(tmpFile, JSON.stringify(artifact, null, 2));
  renameSync(tmpFile, DELIBERATION_FILE);

  return result;
}

/**
 * Read the current deliberation artifact.
 */
export function readDeliberation(): DeliberationArtifact | null {
  try {
    if (!existsSync(DELIBERATION_FILE)) return null;
    return JSON.parse(readFileSync(DELIBERATION_FILE, 'utf8')) as DeliberationArtifact;
  } catch {
    return null;
  }
}

/**
 * Check if the current deliberation is fresh (within maxAgeMs).
 */
export function isDeliberationFresh(maxAgeMs = 60_000): boolean {
  const delib = readDeliberation();
  if (!delib) return false;
  const timestamp = delib.timestamp || delib.createdAt || 0;
  return (Date.now() - timestamp) <= maxAgeMs;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Derive a dispatch plan when the situation has multiple independent sub-tasks.
 * Returns null if parallel dispatch is not applicable.
 */
function _deriveDispatchPlan(result: ProcessTurnResult, context: DispatchContext): DispatchPlan | null {
  const situation = result.situation;
  if (!situation) return null;

  // Only generate a parallel plan for multi-file, non-trivial work
  const scope = situation.taskShape?.scope;
  const actionType = result.action?.type;

  if (scope !== 'large' && scope !== 'medium') return null;
  if (actionType !== 'dispatch' && actionType !== 'proceed') return null;

  // Check for independent sub-tasks from context
  const subtasks = context.subtasks || [];
  if (subtasks.length < 2) {
    // Heuristic: large scope with multiple files could be parallel
    const fileCount = situation.material?.touchedFiles?.length || 0;
    if (fileCount < 3) return null;

    return {
      strategy: 'parallel-wave',
      id: Date.now().toString(36),
      expectedParallel: Math.min(fileCount, 5),
      waveSize: Math.min(fileCount, 5),
      reason: `${fileCount} independent files detected`,
    };
  }

  return {
    strategy: 'parallel-wave',
    id: Date.now().toString(36),
    expectedParallel: subtasks.length,
    waveSize: subtasks.length,
    subtasks: subtasks.map(t => typeof t === 'string' ? t : t.name || t.description || ''),
    reason: `${subtasks.length} independent sub-tasks identified`,
  };
}
