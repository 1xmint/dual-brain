#!/usr/bin/env node
// pipeline.mjs — Unified Pipeline for dual-brain.
// Every feature (go, think, review, watch, auto-commit, pr-triage, wave) routes through here.
// Exports: runPipeline, buildExecutionPlan, formatExecutionPlan

import { execSync } from 'node:child_process';
import { detectTask } from './detect.mjs';
import { decideRoute } from './decide.mjs';
import { dispatch } from './dispatch.mjs';
import { loadProfile } from './profile.mjs';

// ─── Context Pack ─────────────────────────────────────────────────────────────

/**
 * Build a context pack from the raw inputs.
 * @param {string} prompt
 * @param {string[]} files
 * @param {string} cwd
 * @returns {object}
 */
async function buildContextPack(prompt, files = [], cwd = process.cwd()) {
  const profile = await _loadProfileSafe(cwd);

  const priorFailures = _getPriorFailures(prompt, cwd);

  const detection = detectTask({ prompt, files, priorFailures });

  return {
    prompt,
    files: { explicit: files, extracted: detection.specialist?.triggers ?? [] },
    detection,
    profile,
    priorFailures,
    cwd,
  };
}

// ─── Reasoning depth ──────────────────────────────────────────────────────────

const UNCERTAINTY_WORDS = /\b(not sure|maybe|should we|perhaps|architect|design|unsure|consider|what if|would it be|thinking about)\b/i;

/**
 * Classify reasoning depth from context pack signals.
 * @param {object} contextPack
 * @returns {'low'|'medium'|'high'|'ultra'}
 */
export function classifyReasoningDepth(contextPack) {
  const { detection, files, priorFailures = 0, prompt = '' } = contextPack;
  const { risk = 'low', tier } = detection;
  const fileCount = files.explicit.length;

  if (
    risk === 'critical' ||
    tier === 'think' ||
    priorFailures >= 2 ||
    UNCERTAINTY_WORDS.test(prompt)
  ) return 'ultra';

  if (
    risk === 'high' ||
    fileCount > 5 ||
    detection.complexity === 'complex'
  ) return 'high';

  if (
    risk === 'medium' ||
    (fileCount >= 3 && fileCount <= 5) ||
    detection.complexity === 'moderate'
  ) return 'medium';

  return 'low';
}

// ─── Challenger policy ────────────────────────────────────────────────────────

const THINK_TRIGGERS  = new Set(['think', 'review']);
const DESIGN_TRIGGERS = new Set(['think']);

/**
 * Determine challenger policy from context pack + trigger.
 * @param {object} contextPack
 * @param {string} trigger
 * @returns {'none'|'review-after'|'deliberate-before'}
 */
function classifyChallengerPolicy(contextPack, trigger) {
  const { detection, priorFailures = 0 } = contextPack;
  const { risk = 'low', designImpact = false } = detection;

  if (
    risk === 'critical' ||
    THINK_TRIGGERS.has(trigger) ||
    priorFailures >= 2 ||
    designImpact
  ) return 'deliberate-before';

  if (risk === 'high' || trigger === 'review' || priorFailures >= 1) return 'review-after';

  return 'none';
}

// ─── Challenger model resolver ────────────────────────────────────────────────

function resolveChallenger(policy, contextPack) {
  if (policy === 'none') return null;
  const openaiEnabled =
    contextPack.profile?.providers?.openai?.enabled &&
    contextPack.profile?.providers?.openai?.plan;
  if (!openaiEnabled) return null;

  const plan = contextPack.profile.providers.openai.plan;
  // Pick the best available OpenAI model for the challenger role
  if (plan === '$100' || plan === '$200') return 'o3';
  return 'gpt-4o';
}

// ─── Build execution plan ─────────────────────────────────────────────────────

/**
 * Build an execution plan from context pack + trigger + options.
 * @param {object} contextPack
 * @param {string} trigger
 * @param {object} options
 * @returns {object}
 */
export function buildExecutionPlan(contextPack, trigger, options = {}) {
  const { detection, profile, priorFailures = 0 } = contextPack;

  const reasoningDepth = options.forceDepth ?? classifyReasoningDepth(contextPack);

  const challengerPolicy = options.forceChallenger
    ? 'deliberate-before'
    : classifyChallengerPolicy(contextPack, trigger);

  const challengerModel = resolveChallenger(challengerPolicy, contextPack);

  // Map reasoning depth → effort hint for decideRoute
  const depthToEffort = { low: 'low', medium: 'medium', high: 'high', ultra: 'xhigh' };
  const detectionWithDepth = {
    ...detection,
    effort: depthToEffort[reasoningDepth] ?? detection.effort,
  };

  const decision = decideRoute({ profile, detection: detectionWithDepth, cwd: contextPack.cwd });

  // Resolve full model ID for display (mirrors dispatch.mjs CLAUDE_MODEL_IDS)
  const CLAUDE_MODEL_IDS = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' };
  const displayModel = decision.provider === 'claude'
    ? (CLAUDE_MODEL_IDS[decision.model] ?? decision.model)
    : decision.model;

  const verificationRequired = detection.tier !== 'search';

  const approvalRequired = detection.risk === 'critical';

  const explanation = _buildPlanExplanation({
    displayModel,
    reasoningDepth,
    challengerPolicy,
    decision,
    detection,
    priorFailures,
    trigger,
  });

  return {
    primaryModel:        displayModel,
    primaryProvider:     decision.provider,
    reasoningDepth,
    challengerPolicy,
    challengerModel,
    tier:                detection.tier,
    verificationRequired,
    approvalRequired,
    explanation,
    _decision:           decision,
  };
}

function _buildPlanExplanation({ displayModel, reasoningDepth, challengerPolicy, decision, detection, priorFailures, trigger }) {
  const parts = [];

  const modelShort = displayModel.split('/').pop();
  parts.push(`${modelShort} for ${detection.risk}-risk ${detection.intent}`);

  if (challengerPolicy !== 'none') {
    parts.push(`challenger: ${challengerPolicy}`);
  } else {
    parts.push('no challenger needed');
  }

  if (priorFailures > 0) {
    parts.push(`${priorFailures} prior failure${priorFailures > 1 ? 's' : ''}`);
  }

  return parts.join(', ');
}

// ─── Format execution plan ────────────────────────────────────────────────────

/**
 * Return a human-readable display string for an execution plan.
 * @param {object} plan
 * @returns {string}
 */
export function formatExecutionPlan(plan) {
  const depthLabel = { low: 'low reasoning', medium: 'medium reasoning', high: 'high reasoning', ultra: 'ultra reasoning' };
  const lines = [
    '⚡ Execution Plan',
    `  Model: ${plan.primaryModel} (${depthLabel[plan.reasoningDepth] ?? plan.reasoningDepth})`,
    `  Challenger: ${plan.challengerPolicy}${plan.challengerModel ? ` (${plan.challengerModel})` : ''}`,
    `  Risk: ${plan._decision?.tier ? plan._decision.tier : plan.tier} | Tier: ${plan.tier}`,
    `  Verify: ${plan.verificationRequired ? 'yes' : 'no'} | Approval: ${plan.approvalRequired ? 'yes' : 'no'}`,
    `  Why: ${plan.explanation}`,
  ];
  return lines.join('\n');
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify the dispatch result meets basic expectations.
 * @param {object} result   Result from dispatch()
 * @param {object} plan     Execution plan
 * @param {string} cwd
 * @returns {{ ok: boolean, notes: string[] }}
 */
async function verify(result, plan, cwd) {
  const notes = [];

  if (!result || result.status === 'error' || result.status === 'failed') {
    return { ok: false, notes: ['Dispatch returned failure status'] };
  }

  if (plan.tier !== 'search') {
    try {
      const gitOut = execSync('git status --porcelain', { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      if (gitOut.trim()) {
        notes.push(`Files changed (git status shows ${gitOut.trim().split('\n').length} modified)`);
      } else {
        notes.push('No file changes detected by git — verify task actually ran');
      }
    } catch {
      // git not available or not a repo — skip
    }
  }

  return { ok: true, notes };
}

// ─── Outcome recording ────────────────────────────────────────────────────────

async function recordOutcomeSafe(plan, result, verification) {
  try {
    const { recordOutcome } = await import('./outcome.mjs');
    await recordOutcome({ plan, result, verification });
  } catch {
    // outcome.mjs doesn't exist yet — silently skip
  }
}

// ─── Prior failures ───────────────────────────────────────────────────────────

// In-process cache of prior failures keyed by a rough prompt fingerprint.
// Populated by recordOutcomeSafe when outcome.mjs is available; otherwise 0.
const _priorFailureCache = new Map();

function _getPriorFailures(prompt, _cwd) {
  const key = prompt.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
  return _priorFailureCache.get(key) ?? 0;
}

function _incrementFailureCache(prompt) {
  const key = prompt.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
  _priorFailureCache.set(key, (_priorFailureCache.get(key) ?? 0) + 1);
}

// ─── Profile loader (safe) ────────────────────────────────────────────────────

async function _loadProfileSafe(cwd) {
  try {
    return await loadProfile(cwd);
  } catch {
    return {};
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the unified pipeline.
 *
 * @param {string} trigger   What invoked the pipeline: 'go'|'think'|'review'|'watch'|'auto-commit'|'pr-triage'|'wave'
 * @param {string} prompt    The user's task description
 * @param {object} options
 * @param {string[]} [options.files]           Explicit file paths
 * @param {string}   [options.cwd]             Working directory
 * @param {boolean}  [options.dryRun]          Show plan without executing
 * @param {boolean}  [options.verbose]         Show routing details
 * @param {string}   [options.forceDepth]      Override reasoning depth
 * @param {boolean}  [options.forceChallenger] Force dual-brain challenger
 * @param {boolean}  [options.silent]          Suppress all output
 * @returns {Promise<{ plan: object, result: object|null, verification: object|null }>}
 */
export async function runPipeline(trigger, prompt, options = {}) {
  const {
    files    = [],
    cwd      = process.cwd(),
    dryRun   = false,
    verbose  = false,
    forceDepth,
    forceChallenger = false,
    silent   = false,
  } = options;

  const log = silent ? () => {} : (msg) => process.stderr.write(msg + '\n');

  let contextPack, plan, result = null, verification = null;

  try {
    // ── Step 1: Context Pack ─────────────────────────────────────────────────
    contextPack = await buildContextPack(prompt, files, cwd);

    // ── Step 2: Execution Plan ───────────────────────────────────────────────
    plan = buildExecutionPlan(contextPack, trigger, { forceDepth, forceChallenger });

    if (verbose || dryRun) {
      log(formatExecutionPlan(plan));
    }

    if (dryRun) {
      return { plan, result: null, verification: null };
    }

    // ── Step 3: Execute ──────────────────────────────────────────────────────
    const decision = {
      ...plan._decision,
      // Pass reasoning depth as a hint; dispatch uses effort from decision
    };

    result = await dispatch({
      decision,
      prompt,
      files,
      cwd,
      dryRun: false,
      verbose,
      profile: contextPack.profile,
    });

    // ── Step 4: Verify ───────────────────────────────────────────────────────
    verification = await verify(result, plan, cwd);

    if (verbose) {
      log(`[pipeline] verification: ${verification.ok ? 'ok' : 'failed'}`);
      for (const note of verification.notes) log(`[pipeline]   ${note}`);
    }

    if (!verification.ok) {
      _incrementFailureCache(prompt);
    }

  } catch (err) {
    log(`[pipeline] error in pipeline step: ${err.message}`);
    result = { status: 'error', error: err.message };
    verification = { ok: false, notes: [err.message] };
    if (contextPack) _incrementFailureCache(prompt);
  }

  // ── Step 5: Outcome Record ───────────────────────────────────────────────
  if (plan) {
    await recordOutcomeSafe(plan, result, verification);
  }

  return { plan: plan ?? null, result, verification };
}
