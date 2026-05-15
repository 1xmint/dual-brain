#!/usr/bin/env node

/**
 * DAG Scheduler — replaces flat wave execution with a ready-queue scheduler
 * that maximizes parallelism by tracking fine-grained task dependencies.
 *
 * Usage:
 *   node hooks/dag-scheduler.mjs --from-manifest <manifestId>
 *   node hooks/dag-scheduler.mjs --visualize <manifestId>
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const STATE_DIR = join(ROOT_DIR, '.dualbrain');
const MANIFEST_DIR = join(STATE_DIR, 'manifests');
const CHECKPOINT_DIR = join(STATE_DIR, 'checkpoints');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TASK_DURATION_MS = 120_000; // 2 minutes fallback
const MIN_PARALLELISM = 1;
const DEFAULT_MAX_PARALLELISM = 4;
const CHECKPOINT_EVERY_N_COMPLETIONS = 3;
const SUCCESS_RAMP_THRESHOLD = 0.85; // ramp up parallelism above this success rate
const FAILURE_RAMP_THRESHOLD = 0.40; // ramp down below this success rate

const STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped', // downstream of a failed task
});

// ─── Utility helpers ─────────────────────────────────────────────────────────

function isoNow() {
  return new Date().toISOString();
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function uniq(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function trimText(value, max = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function ensureStateDirs() {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function loadManifest(manifestId) {
  const path = join(MANIFEST_DIR, `${manifestId}.json`);
  if (!existsSync(path)) {
    throw new Error(`Manifest not found: ${manifestId}`);
  }
  const manifest = safeJsonParse(readFileSync(path, 'utf8'), null);
  if (!manifest) {
    throw new Error(`Manifest is unreadable: ${manifestId}`);
  }
  return manifest;
}

/**
 * Check whether two file paths conflict (same file, parent/child directory, or sibling).
 * Matches the logic in wave-orchestrator.mjs for consistency.
 */
function pathsConflict(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return true;
  const aDir = a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : a;
  const bDir = b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : b;
  return Boolean(aDir && aDir === bDir);
}

function ownershipOverlaps(ownsA, ownsB) {
  for (const a of ownsA) {
    for (const b of ownsB) {
      if (pathsConflict(a, b)) return true;
    }
  }
  return false;
}

// ─── class TaskDAG ────────────────────────────────────────────────────────────

/**
 * Core DAG data structure for task dependency management.
 *
 * Each node holds:
 *   taskId, description, dependencies, owns, reads,
 *   tier, riskLevel, estimatedDurationMs, provider, model, effort
 *
 * Internal state per node:
 *   status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
 *   result: any
 *   error: any
 *   startedAt, completedAt: ISO strings
 *   durationMs: number
 */
export class TaskDAG {
  constructor() {
    /** @type {Map<string, object>} taskId → node */
    this._nodes = new Map();
    /** @type {Map<string, Set<string>>} taskId → Set of taskIds it depends on */
    this._deps = new Map();
    /** @type {Map<string, Set<string>>} taskId → Set of taskIds that depend on it */
    this._rdeps = new Map();
    /** @type {Set<string>} files currently locked by running tasks */
    this._lockedFiles = new Set();
    /** @type {Map<string, string>} file → taskId that holds the lock */
    this._fileLockOwner = new Map();
    /** @type {Map<string, number>} cached critical path lengths from each node */
    this._cpCache = null;
  }

  // ── Mutation ────────────────────────────────────────────────────────────────

  /**
   * Add a task node. Idempotent if same taskId.
   * @param {object} task
   */
  addTask(task) {
    if (!task || !task.taskId) {
      throw new Error('addTask: task.taskId is required');
    }
    const node = {
      taskId: task.taskId,
      description: task.description || task.title || task.taskId,
      dependencies: uniq(task.dependencies || []),
      owns: uniq(task.owns || task.files || []),
      reads: uniq(task.reads || []),
      tier: task.tier || 'execute',
      riskLevel: task.riskLevel || task.risk || 'low',
      estimatedDurationMs: task.estimatedDurationMs || DEFAULT_TASK_DURATION_MS,
      provider: task.provider || null,
      model: task.model || null,
      effort: task.effort || null,
      topic: task.topic || null,
      // runtime state
      status: task.status || STATUS.PENDING,
      result: task.result || null,
      error: task.error || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      durationMs: task.durationMs || null,
      retryCount: task.retryCount || 0,
    };
    this._nodes.set(node.taskId, node);
    if (!this._deps.has(node.taskId)) this._deps.set(node.taskId, new Set());
    if (!this._rdeps.has(node.taskId)) this._rdeps.set(node.taskId, new Set());

    // Register declared dependencies
    for (const depId of node.dependencies) {
      this._deps.get(node.taskId).add(depId);
      if (!this._rdeps.has(depId)) this._rdeps.set(depId, new Set());
      this._rdeps.get(depId).add(node.taskId);
    }

    this._cpCache = null;
    return this;
  }

  /**
   * Explicitly add a dependency edge (fromId depends on toId).
   * @param {string} fromId  the task that needs toId to finish first
   * @param {string} toId    the task that must complete before fromId starts
   */
  addDependency(fromId, toId) {
    if (!this._nodes.has(fromId)) throw new Error(`addDependency: unknown task '${fromId}'`);
    if (!this._nodes.has(toId)) throw new Error(`addDependency: unknown task '${toId}'`);
    this._deps.get(fromId).add(toId);
    this._rdeps.get(toId).add(fromId);
    const node = this._nodes.get(fromId);
    if (!node.dependencies.includes(toId)) node.dependencies.push(toId);
    this._cpCache = null;
    return this;
  }

  // ── Status transitions ──────────────────────────────────────────────────────

  /**
   * Mark a task as running and lock its owned files.
   * @param {string} taskId
   */
  markRunning(taskId) {
    const node = this._getNode(taskId);
    node.status = STATUS.RUNNING;
    node.startedAt = isoNow();
    for (const file of node.owns) {
      this._lockedFiles.add(file);
      this._fileLockOwner.set(file, taskId);
    }
    this._cpCache = null;
    return this;
  }

  /**
   * Mark a task as completed, release file locks, invalidate CP cache.
   * @param {string} taskId
   * @param {*} result
   * @returns {string[]} taskIds that are newly ready (all deps now satisfied)
   */
  markCompleted(taskId, result = null) {
    const node = this._getNode(taskId);
    node.status = STATUS.COMPLETED;
    node.result = result;
    node.completedAt = isoNow();
    if (node.startedAt) {
      node.durationMs = Date.now() - new Date(node.startedAt).getTime();
    }
    this._releaseLocks(taskId);
    this._cpCache = null;
    return this._findNewlyReady(taskId);
  }

  /**
   * Mark a task as failed, release locks, propagate skip to impacted tasks.
   * @param {string} taskId
   * @param {*} error
   * @returns {{ newlyReady: string[], skipped: string[] }}
   */
  markFailed(taskId, error = null) {
    const node = this._getNode(taskId);
    node.status = STATUS.FAILED;
    node.error = error;
    node.completedAt = isoNow();
    if (node.startedAt) {
      node.durationMs = Date.now() - new Date(node.startedAt).getTime();
    }
    this._releaseLocks(taskId);

    // Cascade skips to all strictly downstream tasks
    const impacted = this.getImpactedTasks(taskId);
    const skipped = [];
    for (const downstreamId of impacted) {
      const downstream = this._nodes.get(downstreamId);
      if (downstream && downstream.status === STATUS.PENDING) {
        downstream.status = STATUS.SKIPPED;
        downstream.error = `Upstream task '${taskId}' failed`;
        skipped.push(downstreamId);
      }
    }

    this._cpCache = null;
    return { newlyReady: [], skipped };
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * Return tasks whose all dependencies are completed AND whose owned files
   * don't conflict with any currently running task's owned files.
   * @returns {object[]} array of task nodes
   */
  getReadyTasks() {
    const ready = [];
    for (const [taskId, node] of this._nodes) {
      if (node.status !== STATUS.PENDING) continue;

      // All dependencies must be completed (not just not-running)
      const deps = this._deps.get(taskId) || new Set();
      let depsOk = true;
      for (const depId of deps) {
        const dep = this._nodes.get(depId);
        // Unknown dep IDs are treated as satisfied (external deps)
        if (dep && dep.status !== STATUS.COMPLETED) {
          depsOk = false;
          break;
        }
      }
      if (!depsOk) continue;

      // Owned files must not conflict with any currently locked file
      if (this._hasFileConflict(node.owns)) continue;

      ready.push(node);
    }
    return ready;
  }

  /**
   * Return tasks that are waiting because dependencies are not yet done.
   * @returns {object[]}
   */
  getBlockedTasks() {
    const blocked = [];
    for (const [taskId, node] of this._nodes) {
      if (node.status !== STATUS.PENDING) continue;
      const deps = this._deps.get(taskId) || new Set();
      for (const depId of deps) {
        const dep = this._nodes.get(depId);
        if (dep && dep.status !== STATUS.COMPLETED) {
          blocked.push(node);
          break;
        }
      }
    }
    return blocked;
  }

  /**
   * Return all downstream taskIds that (transitively) depend on taskId.
   * Does NOT include taskId itself.
   * @param {string} taskId
   * @returns {string[]}
   */
  getImpactedTasks(taskId) {
    const visited = new Set();
    const queue = [...(this._rdeps.get(taskId) || [])];
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const downId of (this._rdeps.get(id) || [])) {
        if (!visited.has(downId)) queue.push(downId);
      }
    }
    return [...visited];
  }

  /**
   * Find the longest (critical) path through remaining incomplete tasks,
   * returning the sequence of taskIds from start to end.
   * Uses topological sort + longest-path on remaining subgraph.
   * @returns {{ path: string[], totalDurationMs: number }}
   */
  getCriticalPath() {
    const weights = this._computeCriticalPathWeights();
    // Find the node with the maximum weight
    let maxWeight = -1;
    let tail = null;
    for (const [taskId, w] of weights) {
      const node = this._nodes.get(taskId);
      if (!node || node.status === STATUS.COMPLETED || node.status === STATUS.SKIPPED) continue;
      if (w > maxWeight) {
        maxWeight = w;
        tail = taskId;
      }
    }
    if (!tail) return { path: [], totalDurationMs: 0 };

    // Reconstruct path by walking back through predecessors
    const pred = this._computePredecessors();
    const path = [];
    let current = tail;
    while (current) {
      path.unshift(current);
      current = pred.get(current) || null;
    }
    return { path, totalDurationMs: maxWeight };
  }

  /**
   * Validate the DAG:
   *   1. No cycles
   *   2. All declared dependencies reference known taskIds
   *   3. No two pending tasks own the exact same file (ownership conflict)
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    // Check for unknown dependency references
    for (const [taskId, deps] of this._deps) {
      for (const depId of deps) {
        if (!this._nodes.has(depId)) {
          errors.push(`Task '${taskId}' depends on unknown task '${depId}'`);
        }
      }
    }

    // Check for cycles using DFS with coloring (white=0, gray=1, black=2)
    const color = new Map();
    const dfsStack = [];
    const visit = (id) => {
      if (color.get(id) === 2) return; // already fully processed
      if (color.get(id) === 1) {
        // cycle found — reconstruct cycle from stack
        const cycleStart = dfsStack.indexOf(id);
        const cycle = dfsStack.slice(cycleStart).concat(id);
        errors.push(`Cycle detected: ${cycle.join(' → ')}`);
        return;
      }
      color.set(id, 1);
      dfsStack.push(id);
      for (const depId of (this._deps.get(id) || [])) {
        visit(depId);
      }
      dfsStack.pop();
      color.set(id, 2);
    };
    for (const taskId of this._nodes.keys()) {
      if (!color.has(taskId)) visit(taskId);
    }

    // Check for ownership conflicts among pending tasks
    const pendingNodes = [...this._nodes.values()].filter(n => n.status === STATUS.PENDING);
    for (let i = 0; i < pendingNodes.length; i++) {
      for (let j = i + 1; j < pendingNodes.length; j++) {
        const a = pendingNodes[i];
        const b = pendingNodes[j];
        if (!a.dependencies.includes(b.taskId) && !b.dependencies.includes(a.taskId)) {
          // Not directly ordered — check for ownership overlap
          for (const fa of a.owns) {
            for (const fb of b.owns) {
              if (pathsConflict(fa, fb)) {
                errors.push(
                  `Ownership conflict: '${a.taskId}' and '${b.taskId}' both own '${fa === fb ? fa : `${fa} ~ ${fb}`}' with no ordering dependency`,
                );
              }
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Generate a wave-style grouping purely for display.
   * Assigns tasks to wave indices based on their longest dependency chain depth.
   * @returns {Array<{ waveIndex: number, tasks: object[] }>}
   */
  toWaveView() {
    // Compute topological depth of each node
    const depth = new Map();
    const sorted = this._topoSort();

    for (const taskId of sorted) {
      const deps = this._deps.get(taskId) || new Set();
      let maxDepDepth = -1;
      for (const depId of deps) {
        maxDepDepth = Math.max(maxDepDepth, depth.get(depId) ?? -1);
      }
      depth.set(taskId, maxDepDepth + 1);
    }

    const waveMap = new Map();
    for (const [taskId, d] of depth) {
      if (!waveMap.has(d)) waveMap.set(d, []);
      waveMap.get(d).push(this._nodes.get(taskId));
    }

    return [...waveMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([waveIndex, tasks]) => ({ waveIndex, tasks }));
  }

  /**
   * Summary statistics.
   * @returns {{ total, ready, running, completed, failed, skipped, blocked, criticalPathLength }}
   */
  getStats() {
    let running = 0, completed = 0, failed = 0, skipped = 0;
    for (const node of this._nodes.values()) {
      if (node.status === STATUS.RUNNING) running++;
      else if (node.status === STATUS.COMPLETED) completed++;
      else if (node.status === STATUS.FAILED) failed++;
      else if (node.status === STATUS.SKIPPED) skipped++;
    }
    const ready = this.getReadyTasks().length;
    const blocked = this.getBlockedTasks().length;
    const { totalDurationMs } = this.getCriticalPath();
    return {
      total: this._nodes.size,
      ready,
      running,
      completed,
      failed,
      skipped,
      blocked,
      criticalPathLength: totalDurationMs,
    };
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  /**
   * Export DAG state as plain object (for checkpointing / manifest embedding).
   */
  toJSON() {
    return {
      nodes: [...this._nodes.values()].map(n => ({
        ...n,
        dependencies: [...(this._deps.get(n.taskId) || [])],
      })),
    };
  }

  /**
   * Restore a DAG from toJSON() output.
   * @param {object} json
   * @returns {TaskDAG}
   */
  static fromJSON(json) {
    const dag = new TaskDAG();
    for (const node of json.nodes || []) {
      dag.addTask(node);
    }
    return dag;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _getNode(taskId) {
    const node = this._nodes.get(taskId);
    if (!node) throw new Error(`Unknown task: '${taskId}'`);
    return node;
  }

  _releaseLocks(taskId) {
    const node = this._nodes.get(taskId);
    if (!node) return;
    for (const file of node.owns) {
      if (this._fileLockOwner.get(file) === taskId) {
        this._lockedFiles.delete(file);
        this._fileLockOwner.delete(file);
      }
    }
  }

  _hasFileConflict(owns) {
    for (const file of owns) {
      for (const locked of this._lockedFiles) {
        if (pathsConflict(file, locked)) return true;
      }
    }
    return false;
  }

  _findNewlyReady(completedTaskId) {
    const candidates = [...(this._rdeps.get(completedTaskId) || [])];
    return candidates.filter(taskId => {
      const node = this._nodes.get(taskId);
      if (!node || node.status !== STATUS.PENDING) return false;
      const deps = this._deps.get(taskId) || new Set();
      return [...deps].every(depId => {
        const dep = this._nodes.get(depId);
        return !dep || dep.status === STATUS.COMPLETED;
      });
    });
  }

  /**
   * Topological sort (Kahn's algorithm) over all nodes.
   * Returns taskIds in topological order.
   */
  _topoSort() {
    const inDegree = new Map();
    for (const taskId of this._nodes.keys()) inDegree.set(taskId, 0);
    for (const [taskId, deps] of this._deps) {
      for (const depId of deps) {
        if (this._nodes.has(depId)) {
          inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
        }
      }
    }
    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const sorted = [];
    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(id);
      for (const rdepId of (this._rdeps.get(id) || [])) {
        const newDeg = (inDegree.get(rdepId) || 1) - 1;
        inDegree.set(rdepId, newDeg);
        if (newDeg === 0) queue.push(rdepId);
      }
    }
    // Append any remaining nodes (handles disconnected subgraphs gracefully)
    for (const taskId of this._nodes.keys()) {
      if (!sorted.includes(taskId)) sorted.push(taskId);
    }
    return sorted;
  }

  /**
   * Compute the longest-path weight (in ms) ending at each node.
   * Considers only nodes that are not yet completed/skipped.
   * @returns {Map<string, number>}
   */
  _computeCriticalPathWeights() {
    if (this._cpCache) return this._cpCache;
    const sorted = this._topoSort();
    const dist = new Map();

    for (const taskId of sorted) {
      const node = this._nodes.get(taskId);
      if (!node) continue;
      if (node.status === STATUS.COMPLETED || node.status === STATUS.SKIPPED) {
        dist.set(taskId, 0);
        continue;
      }
      const duration = node.status === STATUS.RUNNING ? 0 : (node.estimatedDurationMs || DEFAULT_TASK_DURATION_MS);
      let maxPred = 0;
      for (const depId of (this._deps.get(taskId) || [])) {
        maxPred = Math.max(maxPred, dist.get(depId) || 0);
      }
      dist.set(taskId, maxPred + duration);
    }

    this._cpCache = dist;
    return dist;
  }

  /**
   * For each node, compute which predecessor gives the longest path (for path reconstruction).
   * @returns {Map<string, string|null>}
   */
  _computePredecessors() {
    const sorted = this._topoSort();
    const dist = this._computeCriticalPathWeights();
    const pred = new Map();

    for (const taskId of sorted) {
      const node = this._nodes.get(taskId);
      if (!node) continue;
      let bestPredId = null;
      let bestDist = -1;
      for (const depId of (this._deps.get(taskId) || [])) {
        const d = dist.get(depId) || 0;
        if (d > bestDist) {
          bestDist = d;
          bestPredId = depId;
        }
      }
      pred.set(taskId, bestPredId);
    }
    return pred;
  }
}

// ─── class DAGScheduler ───────────────────────────────────────────────────────

/**
 * Scheduler that executes tasks from a TaskDAG using a ready-queue model.
 *
 * @param {TaskDAG} dag
 * @param {object} options
 * @param {number}   [options.maxParallelism=4]
 * @param {Function} [options.onTaskReady]     async (task) → void
 * @param {Function} [options.onTaskComplete]  async (task, result) → void
 * @param {Function} [options.onTaskFailed]    async (task, error) → void
 * @param {Function} [options.onCheckpoint]    async (stats) → void
 * @param {Function} [options.budgetCheck]     () → { recommend: 'claude'|'gpt'|'either', pressure: number }
 * @param {Function} [options.executeTask]     async (task) → result  (override for testing)
 */
export class DAGScheduler {
  constructor(dag, options = {}) {
    this._dag = dag;
    this._maxParallelism = options.maxParallelism ?? DEFAULT_MAX_PARALLELISM;
    this._currentParallelism = Math.min(2, this._maxParallelism); // ramp-up start
    this._onTaskReady = options.onTaskReady || null;
    this._onTaskComplete = options.onTaskComplete || null;
    this._onTaskFailed = options.onTaskFailed || null;
    this._onCheckpoint = options.onCheckpoint || null;
    this._budgetCheck = options.budgetCheck || null;
    this._executeTask = options.executeTask || this._defaultExecuteTask.bind(this);

    // Metrics for adaptive parallelism
    this._successCount = 0;
    this._failureCount = 0;
    this._conflictCount = 0;
    this._completionsSinceCheckpoint = 0;
    this._lastDepthCompleted = -1;

    // For progress reporting
    this._startedAt = null;
    this._runningTasks = new Map(); // taskId → Promise
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Main scheduler loop. Runs until all tasks are done or unresolvable.
   * @returns {Promise<{ completed: number, failed: number, skipped: number }>}
   */
  async run() {
    this._startedAt = Date.now();
    this._log('DAG Scheduler starting…');

    const stats = this._dag.getStats();
    this._log(`  ${stats.total} tasks | max parallelism: ${this._maxParallelism}`);

    while (true) {
      const stats = this._dag.getStats();

      // Terminal conditions
      if (stats.running === 0 && stats.ready === 0) {
        if (stats.blocked > 0) {
          this._log(`\n⚠  ${stats.blocked} tasks remain blocked — possible cycle or all dependencies failed.`);
        }
        break;
      }

      // Fill available slots
      const availableSlots = this._currentParallelism - stats.running;
      if (availableSlots > 0) {
        const ready = this._dag.getReadyTasks();
        const toStart = this.pickNextTasks(ready, availableSlots);

        for (const task of toStart) {
          this._startTask(task);
        }
      }

      // If nothing is running and nothing to start, we're stuck
      if (this._runningTasks.size === 0) break;

      // Wait for any running task to finish
      await Promise.race([...this._runningTasks.values()]);
    }

    const final = this._dag.getStats();
    this._log(
      `\nScheduler done in ${((Date.now() - this._startedAt) / 1000).toFixed(1)}s — ` +
      `${final.completed} completed, ${final.failed} failed, ${final.skipped} skipped`
    );
    return { completed: final.completed, failed: final.failed, skipped: final.skipped };
  }

  /**
   * Score and pick the best tasks to run next from the available ready list.
   * Scoring formula:
   *   score = criticalPathWeight * 3
   *         + dependencyUnblockValue * 2
   *         + (1 / estimatedDurationMs) * 1  (shorter tasks fill gaps)
   *         - conflictRisk * 2
   *         - providerPressure * 1
   *
   * @param {object[]} available  ready task nodes
   * @param {number}   maxSlots   how many we can start
   * @returns {object[]}          chosen task nodes (up to maxSlots, non-conflicting)
   */
  pickNextTasks(available, maxSlots) {
    if (available.length === 0 || maxSlots <= 0) return [];

    const cpWeights = this._dag._computeCriticalPathWeights();
    const maxCpWeight = Math.max(...[...cpWeights.values()], 1);
    const budgetInfo = this._budgetCheck ? this._budgetCheck() : null;

    const scored = available.map(task => {
      const cpWeight = (cpWeights.get(task.taskId) || 0) / maxCpWeight;

      const unblockValue = this._dag.getImpactedTasks(task.taskId).length /
        Math.max(this._dag._nodes.size, 1);

      const durationScore = 1 / Math.max(task.estimatedDurationMs || DEFAULT_TASK_DURATION_MS, 1000);

      // Rough conflict risk: fraction of owned files that are near any locked file
      const totalOwned = task.owns.length;
      let conflictsNear = 0;
      if (totalOwned > 0) {
        for (const file of task.owns) {
          for (const locked of this._dag._lockedFiles) {
            if (pathsConflict(file, locked)) conflictsNear++;
          }
        }
      }
      const conflictRisk = totalOwned > 0 ? conflictsNear / totalOwned : 0;

      // Provider pressure penalty
      let providerPressure = 0;
      if (budgetInfo && task.provider) {
        const p = budgetInfo[task.provider];
        if (p && typeof p.pressure === 'number') providerPressure = p.pressure;
      }

      const score =
        cpWeight * 3 +
        unblockValue * 2 +
        durationScore * 1 -
        conflictRisk * 2 -
        providerPressure * 1;

      return { task, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Pick greedily, respecting that selected tasks must not conflict with each other
    const chosen = [];
    const chosenFiles = [];

    for (const { task } of scored) {
      if (chosen.length >= maxSlots) break;
      // Check that this task's files don't conflict with already-chosen tasks
      let conflicts = false;
      for (const file of task.owns) {
        for (const cf of chosenFiles) {
          if (pathsConflict(file, cf)) { conflicts = true; break; }
        }
        if (conflicts) break;
      }
      if (!conflicts) {
        chosen.push(task);
        chosenFiles.push(...task.owns);
      }
    }

    return chosen;
  }

  /**
   * Dynamically adjust parallelism based on recent success/failure rates.
   * Called after each task completion or failure.
   */
  adjustParallelism() {
    const total = this._successCount + this._failureCount;
    if (total < 2) return; // not enough data

    const successRate = this._successCount / total;

    if (successRate >= SUCCESS_RAMP_THRESHOLD && this._conflictCount === 0) {
      // Ramp up
      this._currentParallelism = Math.min(this._currentParallelism + 1, this._maxParallelism);
    } else if (successRate <= FAILURE_RAMP_THRESHOLD || this._conflictCount > 2) {
      // Ramp down
      this._currentParallelism = Math.max(this._currentParallelism - 1, MIN_PARALLELISM);
    }
  }

  /**
   * Return true if we've crossed a logical wave boundary or hit the N-completion threshold.
   * A "logical wave boundary" is when all tasks at a particular dependency depth are done.
   * @returns {boolean}
   */
  shouldCheckpoint() {
    if (this._completionsSinceCheckpoint >= CHECKPOINT_EVERY_N_COMPLETIONS) return true;

    // Check if a full wave-depth layer just cleared
    const waveView = this._dag.toWaveView();
    for (const { waveIndex, tasks } of waveView) {
      if (waveIndex <= this._lastDepthCompleted) continue;
      const allDone = tasks.every(t =>
        t.status === STATUS.COMPLETED || t.status === STATUS.FAILED || t.status === STATUS.SKIPPED
      );
      if (allDone) {
        this._lastDepthCompleted = waveIndex;
        return true;
      }
    }

    return false;
  }

  /**
   * Current scheduler state for display.
   * @returns {object}
   */
  getProgress() {
    const stats = this._dag.getStats();
    const cp = this._dag.getCriticalPath();
    const elapsedMs = this._startedAt ? Date.now() - this._startedAt : 0;
    return {
      ...stats,
      currentParallelism: this._currentParallelism,
      criticalPath: cp.path,
      criticalPathMs: cp.totalDurationMs,
      elapsedMs,
      successCount: this._successCount,
      failureCount: this._failureCount,
      conflictCount: this._conflictCount,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  _startTask(task) {
    this._dag.markRunning(task.taskId);
    if (this._onTaskReady) this._onTaskReady(task).catch(() => {});
    this._log(`  > [${task.taskId}] starting (${task.tier}, ${task.riskLevel})`);

    const promise = (async () => {
      try {
        const result = await this._executeTask(task);
        const newlyReady = this._dag.markCompleted(task.taskId, result);
        this._successCount++;
        this._completionsSinceCheckpoint++;
        this._log(`  ✓ [${task.taskId}] completed — ${newlyReady.length} task(s) newly ready`);

        if (this._onTaskComplete) {
          await this._onTaskComplete(task, result).catch(() => {});
        }

        this.adjustParallelism();

        if (this.shouldCheckpoint() && this._onCheckpoint) {
          this._completionsSinceCheckpoint = 0;
          await this._onCheckpoint(this.getProgress()).catch(() => {});
        }
      } catch (err) {
        const { skipped } = this._dag.markFailed(task.taskId, err?.message || String(err));
        this._failureCount++;
        this._completionsSinceCheckpoint++;
        this._log(`  ✕ [${task.taskId}] failed — ${skipped.length} downstream task(s) skipped`);

        if (this._onTaskFailed) {
          await this._onTaskFailed(task, err).catch(() => {});
        }

        this.adjustParallelism();
      } finally {
        this._runningTasks.delete(task.taskId);
      }
    })();

    this._runningTasks.set(task.taskId, promise);
  }

  /**
   * Default task executor — no-op placeholder.
   * Override via options.executeTask for real dispatch.
   * @param {object} _task
   * @returns {Promise<object>}
   */
  async _defaultExecuteTask(_task) {
    // Simulate work for testing
    const duration = _task.estimatedDurationMs || 1000;
    await new Promise(resolve => setTimeout(resolve, Math.min(duration, 100)));
    return { provider: _task.provider || 'claude', status: 'simulated' };
  }

  _log(msg) {
    process.stdout.write(`${msg}\n`);
  }
}

// ─── Factory functions ────────────────────────────────────────────────────────

/**
 * Convert an existing wave-orchestrator manifest into a TaskDAG.
 * Backward compatible — works with any manifest produced by wave-orchestrator.mjs.
 *
 * @param {object} manifest  loaded manifest object
 * @returns {TaskDAG}
 */
export function fromManifest(manifest) {
  const dag = new TaskDAG();

  const allTasks = (manifest.waves || []).flatMap(wave => wave.tasks || []);

  for (const task of allTasks) {
    dag.addTask({
      taskId: task.taskId,
      description: task.description,
      dependencies: task.dependencies || [],
      owns: task.owns || [],
      reads: task.reads || [],
      tier: task.tier || 'execute',
      riskLevel: task.riskLevel || 'low',
      estimatedDurationMs: task.durationMs || DEFAULT_TASK_DURATION_MS,
      provider: task.provider,
      model: task.model,
      effort: task.effort,
      topic: task.topic,
      status: task.status || STATUS.PENDING,
      result: task.result || null,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      durationMs: task.durationMs || null,
      retryCount: task.retryCount || 0,
    });
  }

  // Wire up explicit wave ordering: every task in wave N+1 that has no declared
  // dependencies gets an implicit dependency on all tasks in wave N that own files
  // it also touches (conservative backward-compat ordering).
  const waves = manifest.waves || [];
  for (let wi = 1; wi < waves.length; wi++) {
    const prevWaveTasks = waves[wi - 1].tasks || [];
    const currWaveTasks = waves[wi].tasks || [];
    for (const curr of currWaveTasks) {
      if ((curr.dependencies || []).length === 0) {
        for (const prev of prevWaveTasks) {
          // Only add wave-ordering dep if there's no explicit dep already
          try {
            dag.addDependency(curr.taskId, prev.taskId);
          } catch {
            // Ignore if nodes don't exist
          }
        }
      }
    }
  }

  return dag;
}

/**
 * Build a TaskDAG from a flat list of tasks and an optional ownership map.
 * Replaces planWaves() in wave-orchestrator.mjs.
 *
 * @param {object[]} tasks     array of task objects (with taskId, dependencies, etc.)
 * @param {object}   ownership optional { byTask: { [taskId]: { owns, reads } } }
 * @returns {TaskDAG}
 */
export function fromTasks(tasks, ownership = null) {
  const dag = new TaskDAG();

  for (const task of tasks) {
    const owned = ownership?.byTask?.[task.taskId]?.owns || task.owns || task.files || [];
    const reads = ownership?.byTask?.[task.taskId]?.reads || task.reads || [];
    dag.addTask({
      ...task,
      owns: owned,
      reads,
    });
  }

  return dag;
}

// ─── ASCII Visualiser ─────────────────────────────────────────────────────────

/**
 * Render a simple ASCII representation of the DAG.
 *
 * Output style:
 *   task-1 ──┬── task-3 ──── task-5
 *   task-2 ──┘
 *   task-4 ──────────────── task-6
 *
 * @param {TaskDAG} dag
 * @returns {string}
 */
function renderAsciiDAG(dag) {
  const waveView = dag.toWaveView();
  if (waveView.length === 0) return '(empty DAG)';

  const STATUS_CHAR = {
    [STATUS.PENDING]: 'o',
    [STATUS.RUNNING]: '>',
    [STATUS.COMPLETED]: 'v',
    [STATUS.FAILED]: 'x',
    [STATUS.SKIPPED]: '-',
  };

  // Build columns: each wave is a column
  const cols = waveView.map(({ tasks }) => tasks);
  const numCols = cols.length;

  // For each task, assign row = its position within its wave column
  const taskRow = new Map();
  const taskCol = new Map();
  let maxRows = 0;
  for (let ci = 0; ci < cols.length; ci++) {
    for (let ri = 0; ri < cols[ci].length; ri++) {
      taskRow.set(cols[ci][ri].taskId, ri);
      taskCol.set(cols[ci][ri].taskId, ci);
    }
    maxRows = Math.max(maxRows, cols[ci].length);
  }

  // Render as a grid of label cells
  const COL_WIDTH = 18;
  const lines = [];

  for (let row = 0; row < maxRows; row++) {
    let line = '';
    for (let col = 0; col < numCols; col++) {
      const task = cols[col][row];
      if (!task) {
        // empty slot — check if any task on this row extends through this col
        line += ' '.repeat(COL_WIDTH);
        continue;
      }
      const sc = STATUS_CHAR[task.status] || 'o';
      const label = `[${sc}] ${task.taskId}`.slice(0, COL_WIDTH - 4);
      const connector = col < numCols - 1 ? ' --> ' : '';
      line += label.padEnd(COL_WIDTH - connector.length) + connector;
    }
    lines.push(line.trimEnd());
  }

  // Add a legend
  const legend = [
    '',
    'Legend: [o]=pending  [>]=running  [v]=completed  [x]=failed  [-]=skipped',
  ];

  // Render dependency summary
  const depLines = [];
  for (const [taskId, deps] of dag._deps) {
    if (deps.size > 0) {
      depLines.push(`  ${taskId} depends on: ${[...deps].join(', ')}`);
    }
  }
  if (depLines.length > 0) {
    legend.push('', 'Dependencies:');
    legend.push(...depLines);
  }

  return lines.join('\n') + legend.join('\n');
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write([
      'dag-scheduler.mjs — DAG-based task scheduler for dual-brain',
      '',
      'Usage:',
      '  node hooks/dag-scheduler.mjs --from-manifest <manifestId>',
      '  node hooks/dag-scheduler.mjs --visualize <manifestId>',
      '',
      'Options:',
      '  --from-manifest <id>   Load manifest and run scheduler (dry-run, no real dispatch)',
      '  --visualize <id>       Print ASCII DAG and exit',
      '  --validate <id>        Validate DAG structure (cycles, conflicts)',
      '  --stats <id>           Print DAG statistics',
      '',
    ].join('\n'));
    process.exit(0);
  }

  ensureStateDirs();

  const fromManifestIdx = args.indexOf('--from-manifest');
  const visualizeIdx = args.indexOf('--visualize');
  const validateIdx = args.indexOf('--validate');
  const statsIdx = args.indexOf('--stats');

  if (visualizeIdx >= 0) {
    const manifestId = args[visualizeIdx + 1];
    if (!manifestId) {
      process.stderr.write('Error: --visualize requires a manifest ID\n');
      process.exit(1);
    }
    const manifest = loadManifest(manifestId);
    const dag = fromManifest(manifest);
    process.stdout.write(`\nDAG Visualization for manifest: ${manifestId}\n`);
    process.stdout.write(`${'─'.repeat(60)}\n`);
    process.stdout.write(renderAsciiDAG(dag) + '\n');
    return;
  }

  if (validateIdx >= 0) {
    const manifestId = args[validateIdx + 1];
    if (!manifestId) {
      process.stderr.write('Error: --validate requires a manifest ID\n');
      process.exit(1);
    }
    const manifest = loadManifest(manifestId);
    const dag = fromManifest(manifest);
    const { valid, errors } = dag.validate();
    if (valid) {
      process.stdout.write(`✓ DAG is valid (${dag._nodes.size} tasks)\n`);
    } else {
      process.stdout.write(`✕ DAG has ${errors.length} issue(s):\n`);
      for (const err of errors) process.stdout.write(`  - ${err}\n`);
      process.exit(1);
    }
    return;
  }

  if (statsIdx >= 0) {
    const manifestId = args[statsIdx + 1];
    if (!manifestId) {
      process.stderr.write('Error: --stats requires a manifest ID\n');
      process.exit(1);
    }
    const manifest = loadManifest(manifestId);
    const dag = fromManifest(manifest);
    const stats = dag.getStats();
    const cp = dag.getCriticalPath();
    process.stdout.write(`\nDAG Stats for manifest: ${manifestId}\n`);
    process.stdout.write(`${'─'.repeat(40)}\n`);
    process.stdout.write(`Total tasks:      ${stats.total}\n`);
    process.stdout.write(`Ready:            ${stats.ready}\n`);
    process.stdout.write(`Running:          ${stats.running}\n`);
    process.stdout.write(`Completed:        ${stats.completed}\n`);
    process.stdout.write(`Failed:           ${stats.failed}\n`);
    process.stdout.write(`Skipped:          ${stats.skipped}\n`);
    process.stdout.write(`Blocked:          ${stats.blocked}\n`);
    process.stdout.write(`Critical path:    ${cp.path.join(' → ') || '(none)'}\n`);
    process.stdout.write(`CP duration:      ${(stats.criticalPathLength / 1000).toFixed(1)}s\n`);
    const waveView = dag.toWaveView();
    process.stdout.write(`Wave depth:       ${waveView.length}\n`);
    return;
  }

  if (fromManifestIdx >= 0) {
    const manifestId = args[fromManifestIdx + 1];
    if (!manifestId) {
      process.stderr.write('Error: --from-manifest requires a manifest ID\n');
      process.exit(1);
    }
    const manifest = loadManifest(manifestId);
    const dag = fromManifest(manifest);

    process.stdout.write(`\nRunning DAG scheduler for manifest: ${manifestId}\n`);
    process.stdout.write(`(Dry-run: tasks are simulated, no real dispatch)\n\n`);

    const { valid, errors } = dag.validate();
    if (!valid) {
      process.stdout.write(`Warning: DAG has validation issues:\n`);
      for (const err of errors) process.stdout.write(`  - ${err}\n`);
      process.stdout.write('\n');
    }

    const scheduler = new DAGScheduler(dag, {
      maxParallelism: DEFAULT_MAX_PARALLELISM,
      onCheckpoint: async (progress) => {
        process.stdout.write(
          `  [checkpoint] ${progress.completed}/${progress.total} done, ` +
          `${progress.running} running, parallelism=${progress.currentParallelism}\n`
        );
      },
    });

    const result = await scheduler.run();
    process.stdout.write(`\nResult: ${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // Default: print help
  process.stdout.write('No command given. Use --help for usage.\n');
  process.exit(1);
}

// Run CLI if invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
