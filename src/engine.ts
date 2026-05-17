/**
 * engine.ts — Single entry point wiring the 6 engine modules into a dispatch flow.
 *
 * Thin glue layer: classifies, routes, creates rooms, records outcomes.
 * All functions are non-throwing (catch and return error states).
 */

import type { TaskOutcome, Tier } from './types.ts';

import { classifyDepth, type AgentLevel } from './agent-protocol.js';
import { selectProvider, recordSuccess, recordFailure, getHealthSummary, type FailoverResult } from './provider-manager.js';
import { adviseModel, recordReward, getRoutingStats, markSessionStart, loadCrossSessionPriors } from './routing-advisor.js';
import { createRoom, writePlan, closeRoom, listRooms, type Room, type RoomPlan, type RoomSummary } from './room.js';
import { scoreOutcome } from './signal.js';
import { getProfile } from './model-profiles.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EngineOpts {
  cwd?: string;
  preferredProvider?: string;
  costTier?: 'frugal' | 'balanced' | 'quality' | 'maximum';
  tier?: Tier;
  intent?: string;
  complexity?: number;
}

export interface EngineResultOk {
  ok: true;
  roomId: string;
  roomPath: string;
  depth: AgentLevel;
  provider: string;
  model: string;
  advisorModel: string;
  advisorReason: string;
  advisorConfidence: number;
  providerReason: string;
  wasFailover: boolean;
}

export interface EngineResultErr {
  ok: false;
  error: string;
}

export type EngineResult = EngineResultOk | EngineResultErr;

export interface EngineStatus {
  healthSummary: string;
  routingStats: ReturnType<typeof getRoutingStats>;
  activeRooms: RoomSummary[];
}

// ─── Tier inference ───────────────────────────────────────────────────────────

function depthToTier(depth: AgentLevel): Tier {
  switch (depth) {
    case 'worker': return 'execute';
    case 'supervisor': return 'execute';
    case 'manager': return 'think';
    case 'head': return 'think';
  }
}

function depthToNumericTier(depth: AgentLevel): number {
  switch (depth) {
    case 'worker': return 1;
    case 'supervisor': return 2;
    case 'manager': return 3;
    case 'head': return 3;
  }
}

// ─── executeTask ──────────────────────────────────────────────────────────────

/**
 * Classify, route, and create a room for a task prompt.
 * Returns the dispatch decision without actually invoking the model.
 */
export function executeTask(prompt: string, opts?: EngineOpts): EngineResult {
  try {
    const cwd = opts?.cwd;

    // 1. Classify depth
    const depth = classifyDepth(prompt, opts?.complexity);

    // 2. Determine tier for routing
    const tier: Tier = opts?.tier ?? depthToTier(depth);
    const intent = opts?.intent ?? 'implement';

    // 3. Get model recommendation from routing advisor
    const advice = adviseModel({ tier, intent }, cwd);

    // 4. Check provider health and select provider
    const numericTier = depthToNumericTier(depth);
    const providerResult: FailoverResult = selectProvider(numericTier, opts?.preferredProvider, cwd);

    // 5. Create a room for the task
    const room: Room = createRoom(prompt, cwd);

    // 6. Write an initial plan shell to the room
    const plan: RoomPlan = {
      waves: [{
        id: 'wave-1',
        tasks: [{
          id: 'task-1',
          description: prompt,
          assignedModel: advice.model,
          tier: numericTier,
          files: [],
        }],
        dependsOn: [],
        status: 'pending',
      }],
      estimatedCost: 0,
      estimatedDuration: tier === 'think' ? '60s' : '30s',
    };
    writePlan(room.id, plan, cwd);

    return {
      ok: true,
      roomId: room.id,
      roomPath: room.path,
      depth,
      provider: providerResult.provider,
      model: providerResult.model,
      advisorModel: advice.model,
      advisorReason: advice.reason,
      advisorConfidence: advice.confidence,
      providerReason: providerResult.reason,
      wasFailover: providerResult.wasFailover,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── recordOutcome ────────────────────────────────────────────────────────────

/**
 * Score and record a task outcome, updating routing state and closing the room.
 */
export function recordOutcome(roomId: string, outcome: TaskOutcome, opts?: { cwd?: string; model?: string; cellKey?: string }): {
  ok: boolean;
  reward?: number;
  confidence?: number;
  error?: string;
} {
  try {
    const cwd = opts?.cwd;

    // 1. Score the outcome
    const scored = scoreOutcome(outcome);

    // 2. Record reward to routing advisor
    const tier = outcome.tier ?? 'execute';
    const cellKey = opts?.cellKey ?? `${tier}:implement`;
    const model = opts?.model ?? 'sonnet';
    recordReward(cellKey, model, scored.reward, cwd);

    // 3. Record success/failure to provider manager
    // Infer provider from model name
    const profile = getProfile(model);
    const provider = profile?.provider ?? 'anthropic';

    if (outcome.success) {
      recordSuccess(provider, model, cwd);
    } else {
      recordFailure(provider, model, outcome.error ?? 'unknown error', cwd);
    }

    // 4. Close the room
    closeRoom(roomId, cwd);

    return { ok: true, reward: scored.reward, confidence: scored.confidence };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── getStatus ────────────────────────────────────────────────────────────────

/**
 * Return a snapshot of engine health: provider status, routing stats, active rooms.
 */
export function getStatus(cwd?: string): EngineStatus {
  try {
    const healthSummary = getHealthSummary(cwd);
    const routingStats = getRoutingStats(cwd);
    const allRooms = listRooms(cwd);
    const activeRooms = allRooms.filter(r => r.status === 'active');

    return { healthSummary, routingStats, activeRooms };
  } catch {
    return {
      healthSummary: 'unavailable',
      routingStats: { cells: {}, totalObservations: 0, topPerformers: [], worstPerformers: [] },
      activeRooms: [],
    };
  }
}

// ─── initialize ───────────────────────────────────────────────────────────────

/**
 * Initialize the engine at session start: mark session, load priors.
 */
export async function initialize(cwd?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await markSessionStart(cwd);
    loadCrossSessionPriors(cwd);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
