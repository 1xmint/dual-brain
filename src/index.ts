#!/usr/bin/env node
/**
 * index.ts — Main entry point for the dual-brain package.
 *
 * Re-exports all public APIs from the four core modules, plus a top-level
 * orchestrate() convenience function for programmatic use.
 */

import type { TaskDetection, DispatchDecision } from './types.js';

export { loadProfile, saveProfile, ensureProfile, runOnboarding, rememberPreference, forgetPreference, getActivePreferences, getAvailableProviders, isSoloBrain, getHeadModel, detectAuth, detectEnvironment, saveSubscription, listSubscriptions, autoRefreshToken } from './profile.js';
export { detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths } from './detect.js';
export { decideRoute, getModelCapabilities, getAvailableModels, shouldDualBrain, explainDecision } from './decide.js';
export { dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain } from './dispatch.js';
export { loadPlaybook, listPlaybooks, executePlaybook, createRunArtifact } from './playbook.js';
export { getHealth, markHot, markDegraded, markHealthy, checkCooldown, getProviderScore, recordDispatch, getSessionStats, resetHealth, remainingCooldownMinutes } from './health.js';
export { detectRepo, loadRepoCache, getTestCommand, getLintCommand } from './repo.js';
export { loadSession, saveSession, updateSession, clearSession, formatSessionCard, importReplitSessions, renameSession, pinSession, unpinSession, categorizeSession, getSessionMeta, autoLabel, enrichSessions, ensurePersistence, syncSessionMirror, buildSessionIndex, searchSessions, getSessionContext, extractSessionMeta, getRoutingContext } from './session.js';
export { decompose, isSimpleTask, taskGraphToWaves } from './decompose.js';
export { generateBrief, compressPriorResults, listRoles } from './brief.js';
export { redact, redactFiles, isSecretFile } from './redact.js';
export { isInsideClaude, buildNativeDispatch, normalizeResult } from './dispatch.js';
export { box, bar, badge, menu, separator } from './tui.js';

// Top-level convenience function

interface OrchestrateInput {
  prompt: string;
  files?: string[];
  cwd?: string;
  dryRun?: boolean;
}

interface OrchestrateResult {
  profile: unknown;
  detection: unknown;
  decision: unknown;
  result: unknown | null;
}

export async function orchestrate({ prompt, files, cwd, dryRun }: OrchestrateInput): Promise<OrchestrateResult> {
  // Import dynamically to avoid circular issues
  const { ensureProfile } = await import('./profile.js');
  const { detectTask } = await import('./detect.js');
  const { decideRoute } = await import('./decide.js');
  const { dispatch: run, dispatchDualBrain } = await import('./dispatch.js');

  const profile = await ensureProfile(cwd || process.cwd(), { interactive: false }) as unknown as Record<string, unknown>;
  const detection = detectTask({ prompt, files });
  const decision = decideRoute({ profile, detection, cwd: cwd || process.cwd() });

  if (dryRun) {
    return { profile, detection, decision, result: null };
  }

  const result = decision.dualBrain
    ? await dispatchDualBrain({ decision, prompt, files, cwd: cwd || process.cwd() })
    : await run({ decision, prompt, files, cwd: cwd || process.cwd() });

  return { profile, detection, decision, result };
}
