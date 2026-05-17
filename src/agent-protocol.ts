/**
 * agent-protocol.ts — Typed contract system for the dual-brain agent hierarchy.
 *
 * Defines how HEAD, Managers, Supervisors, and Workers communicate:
 * what they receive, what they produce, how they escalate, and how they report.
 *
 * Hierarchy:
 *   HEAD (user's session, lightest context)
 *     → Manager (project-level, persistent across sessions)
 *       → Supervisor (wave-level, deploys and monitors workers)
 *         → Worker (task-level, executes and reports)
 */

import type { ProviderHealth as CoreProviderHealth, ModelProfile } from './types.ts';
import type {
  RoomSummary, RoomInsight, RoomDecision, RoomPlan,
  WaveTask, WorkerAssignment, WorkerResult, UserInput,
} from './room.ts';
import {
  listRooms, readInsights, readPlan, readDecision,
  readWorkerAssignment, readWorkerResult, getWorkerStatuses,
  readUserInput, getRoom,
} from './room.js';

// Re-export room types used in the protocol so consumers don't need to import room.ts directly
export type {
  RoomSummary, RoomInsight, RoomDecision, RoomPlan,
  WaveTask, WorkerAssignment, WorkerResult, UserInput,
};

// ─── Agent Levels ─────────────────────────────────────────────────────────

export type AgentLevel = 'head' | 'manager' | 'supervisor' | 'worker';

// ─── Inputs ───────────────────────────────────────────────────────────────

export interface HeadInput {
  userMessage: string;
  roomSummaries: RoomSummary[];
  providerHealth: ProviderHealth[];
  recentInsights: RoomInsight[];
}

export interface ManagerInput {
  roomId: string;
  taskDescription: string;
  userInputs: UserInput[];
  decisions: RoomDecision[];
  waveResults: WaveResult[];
  modelProfiles: ModelProfileSummary[];
  providerHealth: ProviderHealth[];
}

export interface SupervisorInput {
  roomId: string;
  waveId: string;
  tasks: WaveTask[];
  modelProfiles: ModelProfileSummary[];
  budget: BudgetConstraint;
  providerHealth: ProviderHealth[];
}

export interface WorkerInput {
  roomId: string;
  taskId: string;
  assignment: WorkerAssignment;
  contextFiles: Record<string, string>;
}

// ─── Outputs ──────────────────────────────────────────────────────────────

export interface HeadOutput {
  userResponse: string;
  roomActions: RoomAction[];
  escalationNeeded: boolean;
}

export interface ManagerOutput {
  plan?: RoomPlan;
  insights: RoomInsight[];
  supervisorDeployments: SupervisorDeployment[];
  status: 'planning' | 'executing' | 'reviewing' | 'completed' | 'blocked';
  blockedReason?: string;
}

export interface SupervisorOutput {
  workerDeployments: WorkerDeployment[];
  qualityChecks: QualityCheck[];
  waveStatus: 'running' | 'completed' | 'failed' | 'needs-replan';
  replanReason?: string;
}

export interface WorkerOutput {
  result: WorkerResult;
  selfAssessment: number;
  issues: string[];
}

// ─── Deployment Contracts ─────────────────────────────────────────────────

export interface SupervisorDeployment {
  waveId: string;
  tasks: WaveTask[];
  model: string;
  budget: BudgetConstraint;
}

export interface WorkerDeployment {
  taskId: string;
  assignment: WorkerAssignment;
  model: string;
  timeout: number;
}

export interface BudgetConstraint {
  maxWorkers: number;
  maxTotalTokens: number;
  maxRetries: number;
  costTier: 'frugal' | 'balanced' | 'quality' | 'maximum';
}

export interface QualityCheck {
  taskId: string;
  passed: boolean;
  findings: string[];
  recommendation: 'accept' | 'retry' | 'escalate' | 'reject';
}

export interface RoomAction {
  type: 'create' | 'close' | 'decide' | 'escalate';
  roomId?: string;
  taskDescription?: string;
  decision?: RoomDecision;
}

// ─── Model & Provider ─────────────────────────────────────────────────────

export interface ModelProfileSummary {
  id: string;
  name: string;
  provider: string;
  tier: number;
  available: boolean;
  strengths: string[];
}

export interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'down' | 'rate-limited';
  remainingCapacity?: number;
  cooldownUntil?: string;
}

export interface WaveResult {
  waveId: string;
  status: 'completed' | 'partial' | 'failed';
  workerResults: WorkerResult[];
  qualityScore: number;
}

// ─── Depth Classification ─────────────────────────────────────────────────

const WORKER_KEYWORDS = [
  'fix typo', 'rename', 'update version', 'bump', 'add comment',
  'format', 'lint', 'delete', 'remove unused', 'change string',
  'update import', 'toggle', 'flip', 'swap',
];

const SUPERVISOR_KEYWORDS = [
  'implement', 'add feature', 'create', 'build', 'write',
  'refactor', 'test', 'migrate', 'convert', 'extract',
  'move', 'split', 'merge files', 'update module',
];

const MANAGER_KEYWORDS = [
  'architect', 'redesign', 'overhaul', 'rewrite', 'multi-module',
  'cross-cutting', 'system', 'platform', 'framework', 'migration plan',
  'full rewrite', 'new system', 'integrate', 'multi-service',
];

/**
 * Determine how deep the hierarchy should go for this task.
 * Simple tasks return 'worker' (HEAD dispatches directly).
 * Medium returns 'supervisor'. Complex returns 'manager'.
 */
export function classifyDepth(taskDescription: string, complexity?: number): AgentLevel {
  const lower = taskDescription.toLowerCase();

  // If explicit complexity score is provided, use thresholds
  if (complexity !== undefined) {
    if (complexity <= 0.2) return 'worker';
    if (complexity <= 0.5) return 'supervisor';
    return 'manager';
  }

  // Keyword matching — check from most complex to simplest
  for (const kw of MANAGER_KEYWORDS) {
    if (lower.includes(kw)) return 'manager';
  }

  for (const kw of SUPERVISOR_KEYWORDS) {
    if (lower.includes(kw)) return 'supervisor';
  }

  for (const kw of WORKER_KEYWORDS) {
    if (lower.includes(kw)) return 'worker';
  }

  // Heuristic: longer descriptions tend to be more complex
  const wordCount = taskDescription.trim().split(/\s+/).length;
  if (wordCount <= 8) return 'worker';
  if (wordCount <= 30) return 'supervisor';
  return 'manager';
}

// ─── Build Functions ──────────────────────────────────────────────────────

/**
 * Assemble HEAD's input from room files and provider state.
 */
export function buildHeadInput(cwd?: string): HeadInput {
  const roomSummaries = listRooms(cwd);

  // Gather recent insights from all active rooms
  const recentInsights: RoomInsight[] = [];
  for (const room of roomSummaries) {
    if (room.status !== 'active') continue;
    const insights = readInsights(room.id, cwd);
    recentInsights.push(...insights);
  }

  // Sort insights by timestamp descending, keep most recent
  recentInsights.sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  const trimmedInsights = recentInsights.slice(0, 10);

  return {
    userMessage: '',  // Caller fills this in
    roomSummaries,
    providerHealth: [],  // Caller fills from health module
    recentInsights: trimmedInsights,
  };
}

/**
 * Assemble Manager's input from room files.
 */
export function buildManagerInput(roomId: string, cwd?: string): ManagerInput {
  const room = getRoom(roomId, cwd);
  const taskDescription = room?.meta?.taskDescription || '';

  // Gather user inputs
  const userInput = readUserInput(roomId, cwd);
  const userInputs: UserInput[] = userInput ? [userInput] : [];

  // Gather decisions
  const decision = readDecision(roomId, cwd);
  const decisions: RoomDecision[] = decision ? [decision] : [];

  // Gather wave results from completed workers
  const plan = readPlan(roomId, cwd);
  const waveResults: WaveResult[] = [];

  if (plan?.waves) {
    for (const wave of plan.waves) {
      if (wave.status !== 'completed' && wave.status !== 'failed') continue;

      const workerStatuses = getWorkerStatuses(roomId, cwd);
      const workerResults: WorkerResult[] = [];

      for (const [workerId, status] of Object.entries(workerStatuses)) {
        if (status === 'completed' || status === 'failed') {
          const result = readWorkerResult(roomId, workerId, cwd);
          if (result) workerResults.push(result);
        }
      }

      const successCount = workerResults.filter(r => r.status === 'success').length;
      const qualityScore = workerResults.length > 0
        ? successCount / workerResults.length
        : 0;

      waveResults.push({
        waveId: wave.id,
        status: wave.status === 'completed' ? 'completed'
          : successCount > 0 ? 'partial' : 'failed',
        workerResults,
        qualityScore,
      });
    }
  }

  return {
    roomId,
    taskDescription,
    userInputs,
    decisions,
    waveResults,
    modelProfiles: [],  // Caller fills from model-profiles module
    providerHealth: [],  // Caller fills from health module
  };
}

/**
 * Assemble Supervisor's input for a specific wave.
 */
export function buildSupervisorInput(roomId: string, waveId: string, cwd?: string): SupervisorInput {
  const plan = readPlan(roomId, cwd);
  let tasks: WaveTask[] = [];

  if (plan?.waves) {
    const wave = plan.waves.find(w => w.id === waveId);
    if (wave) {
      tasks = wave.tasks;
    }
  }

  return {
    roomId,
    waveId,
    tasks,
    modelProfiles: [],  // Caller fills
    budget: buildBudget('balanced', tasks.length),
    providerHealth: [],  // Caller fills
  };
}

/**
 * Assemble Worker's input with file contents.
 */
export function buildWorkerInput(roomId: string, taskId: string, cwd?: string): WorkerInput {
  // Try to find the worker assignment by scanning workers
  const workerStatuses = getWorkerStatuses(roomId, cwd);
  let assignment: WorkerAssignment | null = null;

  for (const workerId of Object.keys(workerStatuses)) {
    const wa = readWorkerAssignment(roomId, workerId, cwd);
    if (wa && wa.taskId === taskId) {
      assignment = wa;
      break;
    }
  }

  // Fallback: build a minimal assignment from the plan
  if (!assignment) {
    const plan = readPlan(roomId, cwd);
    if (plan?.waves) {
      for (const wave of plan.waves) {
        const task = wave.tasks.find(t => t.id === taskId);
        if (task) {
          assignment = {
            taskId: task.id,
            description: task.description,
            model: task.assignedModel || '',
            tier: task.tier,
            files: task.files,
            acceptanceCriteria: [],
            constraints: [],
          };
          break;
        }
      }
    }
  }

  if (!assignment) {
    assignment = {
      taskId,
      description: '',
      model: '',
      tier: 1,
      files: [],
      acceptanceCriteria: [],
      constraints: [],
    };
  }

  // Read file contents for context — actual I/O delegated to caller
  // We provide the structure; caller populates contextFiles with real content
  const contextFiles: Record<string, string> = {};

  return {
    roomId,
    taskId,
    assignment,
    contextFiles,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────

/**
 * Type-check agent output before accepting.
 * Returns true if the output matches the expected shape for the given level.
 */
export function validateOutput(level: AgentLevel, output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const o = output as Record<string, unknown>;

  switch (level) {
    case 'head':
      return (
        typeof o.userResponse === 'string' &&
        Array.isArray(o.roomActions) &&
        typeof o.escalationNeeded === 'boolean'
      );

    case 'manager':
      return (
        Array.isArray(o.insights) &&
        Array.isArray(o.supervisorDeployments) &&
        typeof o.status === 'string' &&
        ['planning', 'executing', 'reviewing', 'completed', 'blocked'].includes(o.status as string)
      );

    case 'supervisor':
      return (
        Array.isArray(o.workerDeployments) &&
        Array.isArray(o.qualityChecks) &&
        typeof o.waveStatus === 'string' &&
        ['running', 'completed', 'failed', 'needs-replan'].includes(o.waveStatus as string)
      );

    case 'worker':
      return (
        o.result !== null &&
        typeof o.result === 'object' &&
        typeof o.selfAssessment === 'number' &&
        o.selfAssessment >= 0 && o.selfAssessment <= 1 &&
        Array.isArray(o.issues)
      );

    default:
      return false;
  }
}

// ─── Cost Estimation ──────────────────────────────────────────────────────

// Average tokens per tier (rough heuristic)
const TIER_TOKEN_ESTIMATES: Record<number, number> = {
  1: 5000,    // search/simple
  2: 15000,   // moderate
  3: 30000,   // complex/think
};

/**
 * Estimate token cost for a set of worker deployments.
 * Returns estimated total tokens.
 */
export function estimateCost(
  deployments: WorkerDeployment[],
  profiles: ModelProfileSummary[],
): number {
  let total = 0;

  for (const dep of deployments) {
    const profile = profiles.find(p => p.id === dep.model);
    const tier = profile?.tier || 2;
    const baseTokens = TIER_TOKEN_ESTIMATES[tier] || 15000;

    // Adjust by file count in assignment
    const fileMultiplier = Math.max(1, dep.assignment.files.length * 0.5);
    total += Math.round(baseTokens * fileMultiplier);
  }

  return total;
}

// ─── Model Selection ──────────────────────────────────────────────────────

/**
 * Pick the best available model for a task given budget constraints.
 * Matches task tier to model tier, filtered by availability and budget.
 */
export function selectModel(
  task: WaveTask,
  profiles: ModelProfileSummary[],
  budget: BudgetConstraint,
): string {
  // Filter to available models only
  const available = profiles.filter(p => p.available);
  if (available.length === 0) {
    // Fallback: return first profile regardless of availability
    return profiles.length > 0 ? profiles[0].id : '';
  }

  // Determine max tier based on budget
  const maxTier = budget.costTier === 'frugal' ? 1
    : budget.costTier === 'balanced' ? 2
    : budget.costTier === 'quality' ? 3
    : 4;  // maximum

  // Filter by budget tier constraint
  const withinBudget = available.filter(p => p.tier <= maxTier);
  const candidates = withinBudget.length > 0 ? withinBudget : available;

  // Score candidates: prefer tier closest to task tier
  const taskTier = task.tier;
  const scored = candidates.map(p => ({
    profile: p,
    distance: Math.abs(p.tier - taskTier),
  }));

  // Sort by distance (closest tier match), then by tier descending (prefer stronger)
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return b.profile.tier - a.profile.tier;
  });

  return scored[0].profile.id;
}

// ─── Escalation ───────────────────────────────────────────────────────────

/**
 * Determine if results are bad enough to escalate to a higher level.
 * Checks failure rate and quality against threshold.
 */
export function shouldEscalate(
  results: WorkerResult[],
  qualityThreshold: number = 0.6,
): boolean {
  if (results.length === 0) return false;

  const successCount = results.filter(r => r.status === 'success').length;
  const successRate = successCount / results.length;

  // Escalate if more than half failed
  if (successRate < qualityThreshold) return true;

  // Escalate if all results are partial (none fully succeeded)
  if (successCount === 0 && results.some(r => r.status === 'partial')) return true;

  return false;
}

// ─── Budget Builder ───────────────────────────────────────────────────────

const BUDGET_PRESETS: Record<string, Omit<BudgetConstraint, 'maxWorkers'>> = {
  frugal: {
    maxTotalTokens: 50_000,
    maxRetries: 1,
    costTier: 'frugal',
  },
  balanced: {
    maxTotalTokens: 200_000,
    maxRetries: 2,
    costTier: 'balanced',
  },
  quality: {
    maxTotalTokens: 500_000,
    maxRetries: 3,
    costTier: 'quality',
  },
  maximum: {
    maxTotalTokens: 1_000_000,
    maxRetries: 5,
    costTier: 'maximum',
  },
};

/**
 * Create budget constraints from the user's dial setting and task count.
 */
export function buildBudget(costTier: string, taskCount: number): BudgetConstraint {
  const preset = BUDGET_PRESETS[costTier] || BUDGET_PRESETS.balanced;
  const maxWorkers = costTier === 'frugal' ? Math.min(taskCount, 2)
    : costTier === 'balanced' ? Math.min(taskCount, 4)
    : costTier === 'quality' ? Math.min(taskCount, 6)
    : Math.min(taskCount, 10);

  return {
    maxWorkers: Math.max(1, maxWorkers),
    maxTotalTokens: preset.maxTotalTokens,
    maxRetries: preset.maxRetries,
    costTier: preset.costTier,
  };
}
