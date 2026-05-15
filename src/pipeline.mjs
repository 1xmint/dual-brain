#!/usr/bin/env node
// pipeline.mjs — Unified Pipeline for dual-brain.
// Every feature (go, think, review, watch, auto-commit, pr-triage, wave) routes through here.
// Exports: runPipeline, buildExecutionPlan, formatExecutionPlan

import { execSync } from 'node:child_process';
import { detectTask } from './detect.mjs';
import { decideRoute, getWorkStyle, WORK_STYLES } from './decide.mjs';
import { dispatch } from './dispatch.mjs';
import { loadProfile } from './profile.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * Determine whether challenger activates based on work style and risk.
 * @param {object} contextPack
 * @param {string} trigger
 * @returns {boolean}
 */
function shouldUseChallenger(contextPack, trigger) {
  const { detection, profile, priorFailures = 0 } = contextPack;
  const { risk = 'low' } = detection;

  // Always challenger for think/review triggers with prior failures or design impact
  if (priorFailures >= 2 || detection.designImpact || THINK_TRIGGERS.has(trigger)) return true;

  const style = getWorkStyle(profile);

  if (style.challengerPolicy === 'never') return false;
  if (style.challengerPolicy === 'high-risk') return risk === 'high' || risk === 'critical';
  if (style.challengerPolicy === 'medium-risk') return risk !== 'low';

  return false;
}

/**
 * Determine whether a checkpoint is required based on work style and risk.
 * @param {object} contextPack
 * @returns {boolean}
 */
function shouldCreateCheckpoint(contextPack) {
  const { detection, profile } = contextPack;
  const { risk = 'low', tier = 'execute' } = detection;

  const style = getWorkStyle(profile);

  if (style.checkpointPolicy === 'never') return false;
  if (style.checkpointPolicy === 'all-edits') return tier !== 'search';
  if (style.checkpointPolicy === 'risky-ops') return risk === 'high' || risk === 'critical';

  return false;
}

// ─── Challenger model resolver ────────────────────────────────────────────────

function resolveChallenger(useChallenger, contextPack) {
  if (!useChallenger) return null;
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

  const useChallenger = options.forceChallenger || shouldUseChallenger(contextPack, trigger);
  const challengerModel = resolveChallenger(useChallenger, contextPack);

  const checkpointRequired = shouldCreateCheckpoint(contextPack);

  // Work style for display and routing context
  const workStyleObj = getWorkStyle(profile);
  const workStyle    = workStyleObj.key;

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
    useChallenger,
    workStyle,
    workStyleObj,
    decision,
    detection,
    priorFailures,
    trigger,
  });

  return {
    primaryModel:        displayModel,
    primaryProvider:     decision.provider,
    reasoningDepth,
    useChallenger,
    challengerModel,
    workStyle,
    checkpointRequired,
    tier:                detection.tier,
    verificationRequired,
    approvalRequired,
    explanation,
    _decision:           decision,
  };
}

function _buildPlanExplanation({ displayModel, reasoningDepth, useChallenger, workStyle, workStyleObj, decision, detection, priorFailures, trigger }) {
  const parts = [];

  const modelShort = displayModel.split('/').pop();
  parts.push(`${modelShort} for ${detection.risk}-risk ${detection.intent}`);

  const styleLabel = workStyleObj?.label ?? workStyle ?? 'balanced';
  parts.push(`style: ${styleLabel}`);

  if (useChallenger) {
    parts.push('challenger active');
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

  // Work style label + challenger description
  const styleKey = plan.workStyle ?? 'balanced';
  const styleDef = WORK_STYLES[styleKey] ?? WORK_STYLES.balanced;
  const challengerNote = plan.useChallenger
    ? `challenger on${plan.challengerModel ? ` (${plan.challengerModel})` : ''}`
    : `challenger off (policy: ${styleDef.challengerPolicy})`;

  const lines = [
    '⚡ Execution Plan',
    `  Model: ${plan.primaryModel} (${depthLabel[plan.reasoningDepth] ?? plan.reasoningDepth})`,
    `  Mode: ${styleDef.label} — ${challengerNote}`,
    `  Checkpoint: ${plan.checkpointRequired ? 'yes (risky operation detected)' : 'no'}`,
    `  Risk: ${plan._decision?.risk ?? 'unknown'} | Tier: ${plan.tier}`,
    `  Verify: ${plan.verificationRequired ? 'yes' : 'no'} | Approval: ${plan.approvalRequired ? 'yes' : 'no'}`,
    `  Why: ${plan.explanation}`,
  ];
  return lines.join('\n');
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

/**
 * Create a lightweight safety checkpoint before a risky operation.
 * Tries git stash create first (non-destructive ref), falls back to recording HEAD.
 * Always best-effort — never throws.
 * @param {string} cwd
 * @param {object} contextPack
 */
async function createCheckpoint(cwd, contextPack) {
  try {
    const checkpointDir = join(cwd, '.dualbrain', 'checkpoints');
    mkdirSync(checkpointDir, { recursive: true });

    let ref = null;

    // Try git stash create (creates a stash object without modifying working tree)
    try {
      const stashRef = execSync('git stash create', { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        .toString().trim();
      if (stashRef) ref = stashRef;
    } catch {
      // git stash create failed or no changes — fall through
    }

    // Fallback: record current HEAD
    if (!ref) {
      try {
        ref = execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
          .toString().trim();
      } catch {
        ref = 'unknown';
      }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const entry = {
      timestamp: new Date().toISOString(),
      ref,
      prompt: contextPack.prompt?.slice(0, 120),
      risk: contextPack.detection?.risk,
      tier: contextPack.detection?.tier,
    };
    writeFileSync(join(checkpointDir, `${ts}.json`), JSON.stringify(entry, null, 2));
  } catch {
    // Checkpoint is best-effort — never block execution
  }
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

    // ── Step 3: Checkpoint (best-effort, before execute) ────────────────────
    if (plan.checkpointRequired) {
      await createCheckpoint(cwd, contextPack);
    }

    // ── Step 4: Execute ──────────────────────────────────────────────────────
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

    // ── Step 5: Verify ───────────────────────────────────────────────────────
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

  // ── Step 6: Outcome Record ───────────────────────────────────────────────
  if (plan) {
    await recordOutcomeSafe(plan, result, verification);
  }

  return { plan: plan ?? null, result, verification };
}
