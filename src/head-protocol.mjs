import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { processTurn, loadState } from './head.mjs';

const DUALBRAIN = join(process.cwd(), '.dualbrain');
const DELIBERATION_FILE = join(DUALBRAIN, 'deliberation.json');

/**
 * Write the deliberation artifact after running HEAD's cognitive pipeline.
 * This is the contract between HEAD's thinking and the deliberation-gate hook.
 *
 * @param {string} userMessage - The user's message to deliberate on
 * @param {object} context - Optional context (files, priorFailures, patterns, etc.)
 * @returns {object} The full deliberation result from processTurn
 */
export function writeDeliberation(userMessage, context = {}) {
  const state = loadState();
  const result = processTurn(state, userMessage, context);

  // Determine if there are multiple independent sub-tasks that could be parallelized
  const dispatchPlan = _deriveDispatchPlan(result, context);

  // Build the artifact
  const artifact = {
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
 * @returns {object|null} The deliberation artifact, or null if not found/unreadable.
 */
export function readDeliberation() {
  try {
    if (!existsSync(DELIBERATION_FILE)) return null;
    return JSON.parse(readFileSync(DELIBERATION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Check if the current deliberation is fresh (within maxAgeMs).
 * @param {number} maxAgeMs - Maximum age in milliseconds (default 60000)
 * @returns {boolean} True if deliberation exists and is fresh.
 */
export function isDeliberationFresh(maxAgeMs = 60_000) {
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
function _deriveDispatchPlan(result, context) {
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
    subtasks: subtasks.map(t => typeof t === 'string' ? t : t.name || t.description),
    reason: `${subtasks.length} independent sub-tasks identified`,
  };
}

