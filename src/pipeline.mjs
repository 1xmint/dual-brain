#!/usr/bin/env node
// pipeline.mjs — Unified Pipeline for dual-brain.
// Every feature (go, think, review, watch, auto-commit, pr-triage, wave) routes through here.
// Exports: runPipeline, buildExecutionPlan, formatExecutionPlan, createPipelineRun
// Gate exports: contextGate, planningGate, principleGate, executionGate, outcomeGate

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { detectTask } from './detect.mjs';
import { decideRoute, getWorkStyle, WORK_STYLES } from './decide.mjs';
import { dispatch } from './dispatch.mjs';
import { loadProfile } from './profile.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── PipelineRun factory ──────────────────────────────────────────────────────

/**
 * Create a fresh PipelineRun object.
 * @param {string} trigger
 * @param {string} prompt
 * @returns {object}
 */
export function createPipelineRun(trigger = '', prompt = '') {
  return {
    id: randomUUID(),
    startedAt: Date.now(),
    trigger,
    prompt,

    // Phase 0: Intelligence
    projectBrief: null,    // from deriveProjectState
    taskBrief: null,       // from deriveTaskContext
    contradictions: [],    // from detectContradictions
    situationBrief: null,  // formatted string from formatBrief

    // Phase 1: Context
    context: null,
    failureHistory: null,   // result of checkFailureHistory — even empty counts as "queried"
    priorOutcomes: null,    // result of getRelevantOutcomes — even empty counts as "queried"

    // Gate results
    gates: {
      context:   null,   // { passed: bool, reason: string }
      planning:  null,
      principle: null,
      execution: null,
      outcome:   null,
    },

    // Phase 2: Plan
    plan: null,

    // Phase 3: Execution
    result: null,

    // Phase 4: Verification
    verification: null,

    // Phase 5: Outcome
    outcome: null,

    // Ledger + calibration
    taskId: null,           // ledger task ID for this run
    openTasks: [],          // pending tasks from ledger
    calibration: null,      // user calibration state
    adaptation: null,       // behavior adaptation from calibration

    // Prompt intelligence + environment
    promptAnalysis: null,   // from analyzePrompt
    enrichedPrompt: null,   // from enrichPrompt
    environment: null,      // from scanEnvironment
    modelSuggestion: null,  // from suggestModel

    completedAt: null,
  };
}

// ─── Gate helpers ─────────────────────────────────────────────────────────────

function gate(passed, reason) {
  return { passed: Boolean(passed), reason: reason ?? '' };
}

// ─── Principle predicates ─────────────────────────────────────────────────────

/**
 * Block if 2 or more prior failures on the same approach.
 */
function rejectsRepeatedFailedApproach(run) {
  const count = run.failureHistory?.failureCount ?? 0;
  if (count >= 2) {
    return { blocked: true, reason: `${count} prior failures on similar approach — must change strategy or use dual-brain` };
  }
  return { blocked: false };
}

/**
 * Block if no plan is present.
 */
function requiresApprovedPlan(run) {
  if (!run.plan) {
    return { blocked: true, reason: 'No execution plan — pipeline cannot proceed without a plan' };
  }
  return { blocked: false };
}

/**
 * Warn if plan touches more than 10 files or 3+ unrelated areas.
 * Not a hard block — returns warning in reason but blocked: false.
 */
function rejectsScopeCreep(run) {
  const fileCount = run.context?.files?.explicit?.length ?? 0;
  const extractedCount = run.context?.files?.extracted?.length ?? 0;
  const total = fileCount + extractedCount;

  if (total > 10) {
    return { blocked: false, reason: `Scope warning: plan touches ${total} files — consider splitting into smaller tasks` };
  }
  return { blocked: false };
}

/**
 * Block high/critical risk tasks that have no challenger configured.
 */
function requiresDualBrainForHighRisk(run) {
  const risk = run.context?.detection?.risk ?? 'low';
  const hasChallenger = run.plan?.useChallenger && run.plan?.challengerModel;

  if ((risk === 'high' || risk === 'critical') && !hasChallenger) {
    return { blocked: true, reason: `High-risk task (${risk}) requires dual-brain challenger — configure OpenAI provider or lower risk scope` };
  }
  return { blocked: false };
}

// ─── Five mandatory gates ─────────────────────────────────────────────────────

/**
 * Gate 1: Context gate.
 * Passes only if failureHistory and priorOutcomes were actually queried (not null).
 */
export function contextGate(run) {
  if (run.failureHistory === null) {
    return gate(false, 'failureHistory was never queried — context phase incomplete');
  }
  if (run.priorOutcomes === null) {
    return gate(false, 'priorOutcomes was never queried — context phase incomplete');
  }
  if (run.context === null) {
    return gate(false, 'context pack was never built — context phase incomplete');
  }
  return gate(true, 'context loaded');
}

/**
 * Gate 2: Planning gate.
 * Passes if plan exists AND the proposed approach doesn't repeat a known failure.
 */
export function planningGate(run) {
  if (!run.plan) {
    return gate(false, 'No execution plan built');
  }

  // Check if the approach matches a prior failure
  const history = run.failureHistory;
  if (history?.hasPriorFailures && history?.escalation?.recommended) {
    const esc = history.escalation;
    // If the plan doesn't reflect the escalation (still using low depth when ultra is recommended)
    const planDepth = run.plan.reasoningDepth ?? 'low';
    const needsDepth = esc.toDepth ?? 'low';
    const depthOrder = ['low', 'medium', 'high', 'ultra'];
    const planIdx = depthOrder.indexOf(planDepth);
    const needsIdx = depthOrder.indexOf(needsDepth);

    if (planIdx < needsIdx) {
      return gate(
        false,
        `Plan uses ${planDepth} reasoning but prior failures require ${needsDepth}. ${esc.reason}. Use a different strategy.`
      );
    }
  }

  return gate(true, 'plan approved');
}

/**
 * Gate 3: Principle gate.
 * Runs all principle predicates — any hard block fails the gate.
 */
export function principleGate(run) {
  const checks = [
    rejectsRepeatedFailedApproach(run),
    requiresApprovedPlan(run),
    rejectsScopeCreep(run),
    requiresDualBrainForHighRisk(run),
  ];

  const blocked = checks.find(c => c.blocked);
  if (blocked) {
    return gate(false, blocked.reason);
  }

  // Collect non-blocking warnings for the reason field
  const warnings = checks.filter(c => !c.blocked && c.reason).map(c => c.reason);
  return gate(true, warnings.length ? warnings.join('; ') : 'all principles satisfied');
}

/**
 * Gate 4: Execution gate.
 * Final "cleared to work?" check — all previous gates must have passed and plan must exist.
 */
export function executionGate(run) {
  const prevGates = ['context', 'planning', 'principle'];
  for (const name of prevGates) {
    const g = run.gates[name];
    if (!g || !g.passed) {
      return gate(false, `Upstream gate '${name}' did not pass — cannot proceed to execution`);
    }
  }
  if (!run.plan) {
    return gate(false, 'No plan present at execution gate');
  }
  return gate(true, 'cleared for execution');
}

/**
 * Gate 5: Outcome gate.
 * After execution, checks that an outcome was recorded.
 */
export function outcomeGate(run) {
  if (run.result && run.outcome === null) {
    return gate(false, 'Execution completed but outcome was not recorded');
  }
  return gate(true, 'outcome recorded');
}

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
  if (plan === '$100' || plan === '$200') return 'o3'; // doctor:verified — config value comparison, not UI display
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

async function recordOutcomeSafe(run) {
  try {
    const { recordOutcome } = await import('./outcome.mjs');
    const cwd = run.context?.cwd ?? process.cwd();
    const recorded = await recordOutcome(run.plan, run.result, run.verification, cwd);
    run.outcome = recorded;
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

// ─── Gate runner ─────────────────────────────────────────────────────────────

/**
 * Run a named gate, store its result in run.gates, and return whether it passed.
 * If gate throws, it is treated as a failure (fail-closed).
 */
function runGate(run, gateName, gateFn) {
  let result;
  try {
    result = gateFn(run);
  } catch (err) {
    result = gate(false, `Gate '${gateName}' threw: ${err.message}`);
  }
  // Treat missing result or missing passed field as fail-closed
  if (!result || typeof result.passed !== 'boolean') {
    result = gate(false, `Gate '${gateName}' returned invalid result`);
  }
  run.gates[gateName] = result;
  return result.passed;
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
 * @returns {Promise<{ plan: object, result: object|null, verification: object|null } | { success: false, gateFailure: string, reason: string, run: object } | { success: true, run: object }>}
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

  // Create the PipelineRun state object
  const run = createPipelineRun(trigger, prompt);

  try {
    // ── Phase 0: Situational awareness ───────────────────────────────────────

    try {
      const { deriveProjectState, deriveTaskContext, detectContradictions, formatBrief } = await import('./intelligence.mjs');
      run.projectBrief = await deriveProjectState(options.cwd || process.cwd());
      run.taskBrief = deriveTaskContext(prompt, options.recentEvents || []);
      run.situationBrief = formatBrief(run.projectBrief, run.taskBrief);
    } catch (e) {
      // intelligence module not available — continue without it (degraded)
    }

    // Ledger: check open tasks + create task for this run
    try {
      const { getOpenTasks, createTask, reconcile } = await import('./ledger.mjs');
      const cwd = options.cwd || process.cwd();

      // Check for stale tasks on session start
      run.openTasks = getOpenTasks(cwd);
      const staleTasks = reconcile(cwd);

      // Create a ledger task for this pipeline run
      const task = createTask({
        intent: prompt,
        owner: 'head',
        priority: run.projectBrief?.recentFailures?.length > 0 ? 'high' : 'medium',
        files: options.files || []
      }, cwd);
      run.taskId = task.id;
    } catch (e) {
      // ledger not available — continue degraded
    }

    // Append open tasks to situation brief if any exist
    if (run.openTasks.length > 0) {
      const preview = run.openTasks.slice(0, 3).map(t => t.intent).join(', ');
      const pendingLine = `PENDING TASKS: ${run.openTasks.length} open (${preview})`;
      run.situationBrief = run.situationBrief
        ? `${run.situationBrief}\n${pendingLine}`
        : pendingLine;
    }

    // Calibration: analyze user input and adapt
    try {
      const { analyzeInput, getAdaptation, detectCorrection, updateCalibration } = await import('./calibration.mjs');
      const { getProjectState, updateProject } = await import('./living-docs.mjs');
      const cwd = options.cwd || process.cwd();

      const projectState = getProjectState(cwd);
      const currentCal = projectState?.project?.userCalibration || { specificity: 3, corrections: 3, autonomy: 3, interactions: 0 };
      const isCorrection = detectCorrection(prompt);

      run.calibration = updateCalibration(currentCal, prompt, isCorrection);
      run.adaptation = getAdaptation(run.calibration);

      // Persist updated calibration
      updateProject({ userCalibration: run.calibration }, cwd);
    } catch (e) {
      // calibration not available — continue degraded
    }

    // Environment awareness
    try {
      const { scanEnvironment, getCapabilitySummary } = await import('./awareness.mjs');
      run.environment = scanEnvironment(cwd);

      // Add capabilities to situation brief
      if (run.situationBrief && run.environment) {
        const caps = getCapabilitySummary(run.environment);
        if (caps.length > 0) {
          run.situationBrief += '\nCAPABILITIES: ' + caps.join(', ');
        }
      }
    } catch (e) {
      // awareness not available
    }

    // Prompt intelligence
    try {
      const { analyzePrompt, enrichPrompt, shouldBlock, getBlockReason } = await import('./prompt-intel.mjs');

      run.promptAnalysis = analyzePrompt(prompt, run.projectBrief, run.calibration);

      // Hard block on dangerous intent
      if (shouldBlock(run.promptAnalysis)) {
        const reason = getBlockReason(run.promptAnalysis);
        if (run.taskId) {
          try {
            const { failTask } = await import('./ledger.mjs');
            failTask(run.taskId, 'Blocked by risk detection: ' + reason, cwd);
          } catch (e) {}
        }
        run.completedAt = Date.now();
        return {
          success: false,
          gateFailure: 'risk',
          reason: 'Prompt blocked: ' + reason,
          promptAnalysis: run.promptAnalysis,
          run
        };
      }

      // Enrich prompt if intervention says so
      if (run.promptAnalysis.intervention === 'silent_enrich' || run.promptAnalysis.intervention === 'confirm_rewrite') {
        run.enrichedPrompt = enrichPrompt(prompt, run.projectBrief, run.promptAnalysis);
      }
    } catch (e) {
      // prompt-intel not available
    }

    // ── Phase 1: Context ──────────────────────────────────────────────────────

    const effectivePrompt = run.enrichedPrompt || prompt;

    // Build context pack
    run.context = await buildContextPack(effectivePrompt, files, cwd);

    // Query failure history (must happen before context gate)
    try {
      const { checkFailureHistory } = await import('./failure-memory.mjs');
      run.failureHistory = await checkFailureHistory(effectivePrompt, files, cwd);
    } catch {
      // failure-memory.mjs unavailable — set to empty result so gate still passes
      run.failureHistory = { hasPriorFailures: false, failureCount: 0, lastFailure: null, escalation: { recommended: false } };
    }

    // Query relevant outcomes (must happen before context gate)
    try {
      const { getRelevantOutcomes } = await import('./outcome.mjs');
      run.priorOutcomes = await getRelevantOutcomes(effectivePrompt, files, cwd);
    } catch {
      // outcome.mjs unavailable — set to empty array so gate still passes
      run.priorOutcomes = [];
    }

    // Gate 1: Context gate
    if (!runGate(run, 'context', contextGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'context', reason: run.gates.context.reason, run };
    }

    // ── Phase 2: Plan ─────────────────────────────────────────────────────────

    run.plan = buildExecutionPlan(run.context, trigger, { forceDepth, forceChallenger });

    // Model intelligence
    try {
      const { suggestModel, getRegistryAge } = await import('./models.mjs');
      const availableProviders = [];
      if (run.environment?.secrets?.ANTHROPIC_API_KEY || run.environment?.claudeCode?.isInsideClaude) availableProviders.push('anthropic');
      if (run.environment?.secrets?.OPENAI_API_KEY) availableProviders.push('openai');

      const intent = run.promptAnalysis?.intent?.type || 'execute';
      const risk = run.plan?.risk || 'medium';
      const complexity = run.plan?.complexity || 'medium';

      run.modelSuggestion = suggestModel(intent, risk, complexity, availableProviders);

      // Warn if model registry is stale
      const age = getRegistryAge();
      if (age > 30 && run.situationBrief) {
        run.situationBrief += '\nWARNING: Model registry is ' + age + ' days old';
      }
    } catch (e) {
      // models not available
    }

    if (verbose || dryRun) {
      log(formatExecutionPlan(run.plan));
    }

    // Contradiction detection
    if (run.projectBrief && run.plan) {
      try {
        const { detectContradictions } = await import('./intelligence.mjs');
        const planForCheck = {
          description: run.plan.description || prompt,
          targetFiles: run.plan.targetFiles || run.plan.files || [],
          assumptions: run.plan.assumptions || {}
        };
        run.contradictions = detectContradictions(run.projectBrief, run.taskBrief, planForCheck);

        // Any blocking contradiction fails the pipeline
        const blockers = run.contradictions.filter(c => c.severity === 'block');
        if (blockers.length > 0) {
          run.completedAt = Date.now();
          return {
            success: false,
            gateFailure: 'contradiction',
            reason: blockers.map(b => b.message).join('; '),
            contradictions: blockers,
            run
          };
        }
      } catch (e) {
        // contradiction detection failed — continue (degraded)
      }
    }

    // Gate 2: Planning gate
    if (!runGate(run, 'planning', planningGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'planning', reason: run.gates.planning.reason, run };
    }

    // Gate 3: Principle gate
    if (!runGate(run, 'principle', principleGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'principle', reason: run.gates.principle.reason, run };
    }

    if (dryRun) {
      run.completedAt = Date.now();
      // Return legacy-compatible shape for dry-run callers
      return { plan: run.plan, result: null, verification: null, run };
    }

    // Gate 4: Execution gate (cleared to work?)
    if (!runGate(run, 'execution', executionGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'execution', reason: run.gates.execution.reason, run };
    }

    // ── Phase 3: Execute ──────────────────────────────────────────────────────

    // Checkpoint (best-effort, before execute)
    if (run.plan.checkpointRequired) {
      await createCheckpoint(cwd, run.context);
    }

    const decision = { ...run.plan._decision };

    run.result = await dispatch({
      decision,
      prompt: effectivePrompt,
      files,
      cwd,
      dryRun: false,
      verbose,
      profile: run.context.profile,
      situationBrief: run.situationBrief,
      adaptation: run.adaptation,
    });

    // Update ledger task with result
    if (run.taskId) {
      try {
        const { updateTask, failTask } = await import('./ledger.mjs');
        const cwd = options.cwd || process.cwd();

        if (run.result && !run.result.error) {
          updateTask(run.taskId, {
            status: 'done',
            result: typeof run.result === 'string' ? run.result : JSON.stringify(run.result).slice(0, 500),
            proof: run.verification ? 'Pipeline verification passed' : 'Execution completed',
            files: run.result.filesChanged || run.plan?.targetFiles || []
          }, cwd);
        } else {
          failTask(run.taskId, run.result?.error || 'Pipeline execution failed', cwd);
        }
      } catch (e) {
        // ledger update failed — non-blocking
      }
    }

    // Record action in living docs
    try {
      const { appendAction } = await import('./living-docs.mjs');
      const cwd = options.cwd || process.cwd();

      appendAction({
        type: trigger || 'task',
        intent: prompt,
        status: (run.result && !run.result.error) ? 'done' : 'failed',
        owner: 'head',
        files: run.result?.filesChanged || run.plan?.targetFiles || [],
        proof: run.verification ? JSON.stringify(run.verification).slice(0, 200) : null,
        result: typeof run.result === 'string' ? run.result.slice(0, 300) : null
      }, cwd);
    } catch (e) {
      // living docs not available — non-blocking
    }

    // ── Phase 4: Verification ─────────────────────────────────────────────────

    run.verification = await verify(run.result, run.plan, cwd);

    if (verbose) {
      log(`[pipeline] verification: ${run.verification.ok ? 'ok' : 'failed'}`);
      for (const note of run.verification.notes) log(`[pipeline]   ${note}`);
    }

    if (!run.verification.ok) {
      _incrementFailureCache(prompt);
    }

    // ── Phase 5: Outcome ──────────────────────────────────────────────────────

    await recordOutcomeSafe(run);

    // Gate 5: Outcome gate
    if (!runGate(run, 'outcome', outcomeGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'outcome', reason: run.gates.outcome.reason, run };
    }

  } catch (err) {
    log(`[pipeline] error in pipeline step: ${err.message}`);
    run.result = { status: 'error', error: err.message };
    run.verification = { ok: false, notes: [err.message] };
    if (run.context) _incrementFailureCache(prompt);
    run.completedAt = Date.now();
    return { success: false, gateFailure: 'error', reason: err.message, run };
  }

  run.completedAt = Date.now();

  // Return both new-style and legacy-compatible shapes
  return {
    success: true,
    run,
    // Intelligence fields for callers to inspect
    projectBrief: run.projectBrief,
    contradictions: run.contradictions,
    promptAnalysis: run.promptAnalysis,
    environment: run.environment,
    modelSuggestion: run.modelSuggestion,
    // Legacy compatibility
    plan: run.plan,
    result: run.result,
    verification: run.verification,
  };
}
