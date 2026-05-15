#!/usr/bin/env node
/**
 * index.mjs — Main entry point for the dual-brain package.
 *
 * Re-exports all public APIs from the four core modules, plus a top-level
 * orchestrate() convenience function for programmatic use.
 */

export { loadProfile, saveProfile, ensureProfile, runOnboarding, rememberPreference, forgetPreference, getActivePreferences, getAvailableProviders, isSoloBrain, getHeadModel, detectAuth, detectEnvironment, saveSubscription, listSubscriptions, autoRefreshToken } from './profile.mjs';
export { detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths } from './detect.mjs';
export { decideRoute, getModelCapabilities, getAvailableModels, shouldDualBrain, explainDecision } from './decide.mjs';
export { dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain } from './dispatch.mjs';
export { loadPlaybook, listPlaybooks, executePlaybook, createRunArtifact } from './playbook.mjs';
export { getHealth, markHot, markDegraded, markHealthy, checkCooldown, getProviderScore, recordDispatch, getSessionStats, resetHealth, remainingCooldownMinutes } from './health.mjs';
export { detectRepo, loadRepoCache, getTestCommand, getLintCommand } from './repo.mjs';
export { loadSession, saveSession, updateSession, clearSession, formatSessionCard, importReplitSessions, renameSession, pinSession, unpinSession, categorizeSession, getSessionMeta, autoLabel, enrichSessions, ensurePersistence, syncSessionMirror, buildSessionIndex, searchSessions, getSessionContext } from './session.mjs';
export { decompose, isSimpleTask, taskGraphToWaves } from './decompose.mjs';
export { generateBrief, compressPriorResults, listRoles } from './brief.mjs';
export { redact, redactFiles, isSecretFile } from './redact.mjs';
export { isInsideClaude, buildNativeDispatch, normalizeResult } from './dispatch.mjs';
export { box, bar, badge, menu, separator } from './tui.mjs';

// Top-level convenience function
export async function orchestrate({ prompt, files, cwd, dryRun }) {
  // Import dynamically to avoid circular issues
  const { ensureProfile } = await import('./profile.mjs');
  const { detectTask } = await import('./detect.mjs');
  const { decideRoute } = await import('./decide.mjs');
  const { dispatch: run, dispatchDualBrain } = await import('./dispatch.mjs');

  const profile = await ensureProfile(cwd || process.cwd(), { interactive: false });
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
