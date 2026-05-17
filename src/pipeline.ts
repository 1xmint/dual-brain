#!/usr/bin/env node
// pipeline.ts — Unified Pipeline for dual-brain.
// Every feature (go, think, review, watch, auto-commit, pr-triage, wave) routes through here.
// Exports: runPipeline, buildExecutionPlan, formatExecutionPlan, createPipelineRun
// Gate exports: contextGate, planningGate, principleGate, executionGate, outcomeGate

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { detectTask } from './detect.js';
import { decideRoute, getWorkStyle, WORK_STYLES } from './decide.js';
// @ts-ignore
import { dispatch } from './dispatch.js';
// @ts-ignore
import { loadProfile } from './profile.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore
import { buildContextPack as buildContextPackIntel } from './context.js';
import { compilePacket } from './context-intel.js';

import type { Risk, Tier, DispatchDecision, TaskDetection } from './types.js';

// ── Interfaces ───────────────────────────────────────────────────────────────

interface GateResult {
  passed: boolean;
  reason: string;
}

interface PrincipleCheck {
  blocked: boolean;
  reason?: string;
}

interface ContextPack {
  prompt: string;
  files: { explicit: string[]; extracted: string[] };
  detection: TaskDetection & { complexity?: string; designImpact?: boolean; specialist?: { triggers?: string[] } };
  profile: Record<string, unknown>;
  priorFailures: number;
  cwd: string;
  sessionContext: unknown;
}

interface ExecutionPlan {
  primaryModel: string;
  primaryProvider: string;
  reasoningDepth: string;
  useChallenger: boolean;
  challengerModel: string | null;
  workStyle: string;
  checkpointRequired: boolean;
  tier: Tier;
  verificationRequired: boolean;
  approvalRequired: boolean;
  explanation: string;
  _decision: Record<string, unknown>;
  description?: string;
  targetFiles?: string[];
  files?: string[];
  assumptions?: Record<string, unknown>;
  risk?: string;
  complexity?: string;
}

interface VerificationResult {
  ok: boolean;
  notes: string[];
}

interface PipelineRun {
  id: string;
  startedAt: number;
  trigger: string;
  prompt: string;
  projectBrief: unknown;
  taskBrief: unknown;
  contradictions: unknown[];
  situationBrief: string | null;
  context: ContextPack | null;
  failureHistory: FailureHistory | null;
  priorOutcomes: unknown[] | null;
  gates: {
    context: GateResult | null;
    planning: GateResult | null;
    principle: GateResult | null;
    execution: GateResult | null;
    outcome: GateResult | null;
  };
  plan: ExecutionPlan | null;
  result: unknown;
  verification: VerificationResult | null;
  outcome: unknown;
  taskId: string | null;
  openTasks: unknown[];
  calibration: unknown;
  adaptation: unknown;
  promptAnalysis: unknown;
  enrichedPrompt: string | null;
  environment: unknown;
  modelSuggestion: unknown;
  thinkResult: unknown;
  decisionPreflight: unknown;
  sessionContext: unknown;
  replitEnvironment: unknown;
  replitTools: unknown;
  replitConfig: unknown;
  checkpoint: unknown;
  headJudgment: unknown;
  collaboration: unknown;
  completedAt: number | null;
  _thinkRefinedPrompt?: string;
  _thinkRefinedFiles?: string[];
  verbose?: boolean;
}

interface FailureHistory {
  hasPriorFailures: boolean;
  failureCount: number;
  lastFailure: unknown;
  escalation: { recommended: boolean; toDepth?: string; reason?: string };
}

interface PipelineOptions {
  files?: string[];
  cwd?: string;
  dryRun?: boolean;
  verbose?: boolean;
  forceDepth?: string;
  forceChallenger?: boolean;
  silent?: boolean;
  forceDispatch?: boolean;
  _skipPreDispatchThink?: boolean;
  tags?: string[];
  recentEvents?: unknown[];
  [key: string]: unknown;
}

interface WorkStyle {
  key: string;
  label: string;
  challengerPolicy: string;
  checkpointPolicy: string;
}

interface ThinkRefinement {
  refined: boolean;
  prompt?: string;
  files?: string[];
  decision?: Record<string, unknown>;
  confidence?: number;
  reason?: string;
}

// Lazy-load collaboration module
let _collab: unknown = null;
async function getCollab(): Promise<unknown> {
  if (!_collab) {
    try { _collab = await import('./collaboration.js'); } catch { _collab = false; }
  }
  return _collab || null;
}

// ─── PipelineRun factory ──────────────────────────────────────────────────────

/**
 * Create a fresh PipelineRun object.
 */
export function createPipelineRun(trigger: string = '', prompt: string = ''): PipelineRun {
  return {
    id: randomUUID(),
    startedAt: Date.now(),
    trigger,
    prompt,

    // Phase 0: Intelligence
    projectBrief: null,
    taskBrief: null,
    contradictions: [],
    situationBrief: null,

    // Phase 1: Context
    context: null,
    failureHistory: null,
    priorOutcomes: null,

    // Gate results
    gates: {
      context:   null,
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
    taskId: null,
    openTasks: [],
    calibration: null,
    adaptation: null,

    // Prompt intelligence + environment
    promptAnalysis: null,
    enrichedPrompt: null,
    environment: null,
    modelSuggestion: null,

    // Think-engine fields
    thinkResult: null,
    decisionPreflight: null,

    // Session history context
    sessionContext: null,

    // Replit context
    replitEnvironment: null,
    replitTools: null,
    replitConfig: null,

    // Execution safety
    checkpoint: null,

    // HEAD cognitive judgment
    headJudgment: null,

    // Collaboration
    collaboration: null,

    completedAt: null,
  };
}

// ─── Gate helpers ─────────────────────────────────────────────────────────────

function gate(passed: boolean, reason?: string): GateResult {
  return { passed: Boolean(passed), reason: reason ?? '' };
}

// ─── Principle predicates ─────────────────────────────────────────────────────

/**
 * Block if 2 or more prior failures on the same approach.
 */
function rejectsRepeatedFailedApproach(run: PipelineRun): PrincipleCheck {
  const count = run.failureHistory?.failureCount ?? 0;
  if (count >= 2) {
    return { blocked: true, reason: `${count} prior failures on similar approach — must change strategy or use dual-brain` };
  }
  return { blocked: false };
}

/**
 * Block if no plan is present.
 */
function requiresApprovedPlan(run: PipelineRun): PrincipleCheck {
  if (!run.plan) {
    return { blocked: true, reason: 'No execution plan — pipeline cannot proceed without a plan' };
  }
  return { blocked: false };
}

/**
 * Warn if plan touches more than 10 files or 3+ unrelated areas.
 * Not a hard block — returns warning in reason but blocked: false.
 */
function rejectsScopeCreep(run: PipelineRun): PrincipleCheck {
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
function requiresDualBrainForHighRisk(run: PipelineRun): PrincipleCheck {
  const risk: string = run.context?.detection?.risk ?? 'low';
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
export function contextGate(run: PipelineRun): GateResult {
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
export function planningGate(run: PipelineRun): GateResult {
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
export function principleGate(run: PipelineRun): GateResult {
  const checks: PrincipleCheck[] = [
    rejectsRepeatedFailedApproach(run),
    requiresApprovedPlan(run),
    rejectsScopeCreep(run),
    requiresDualBrainForHighRisk(run),
  ];

  const blocked = checks.find(c => c.blocked);
  if (blocked) {
    return gate(false, blocked.reason!);
  }

  // Collect non-blocking warnings for the reason field
  const warnings = checks.filter(c => !c.blocked && c.reason).map(c => c.reason!);
  return gate(true, warnings.length ? warnings.join('; ') : 'all principles satisfied');
}

/**
 * Gate 4: Execution gate.
 * Final "cleared to work?" check — all previous gates must have passed and plan must exist.
 */
export function executionGate(run: PipelineRun): GateResult {
  const prevGates: Array<'context' | 'planning' | 'principle'> = ['context', 'planning', 'principle'];
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
export function outcomeGate(run: PipelineRun): GateResult {
  if (run.result && run.outcome === null) {
    return gate(false, 'Execution completed but outcome was not recorded');
  }
  return gate(true, 'outcome recorded');
}

// ─── Context Pack ─────────────────────────────────────────────────────────────

/**
 * Build a context pack from the raw inputs.
 */
async function buildContextPack(prompt: string, files: string[] = [], cwd: string = process.cwd(), sessionContext: unknown = null, headJudgment: unknown = null): Promise<ContextPack> {
  const profile = await _loadProfileSafe(cwd);

  const priorFailures = _getPriorFailures(prompt, cwd);

  const detection = detectTask({
    prompt,
    files,
    priorFailures,
    sessionContext: sessionContext as Parameters<typeof detectTask>[0]['sessionContext'],
    headJudgment: headJudgment as Parameters<typeof detectTask>[0]['headJudgment'],
  });

  const det = detection as unknown as ContextPack['detection'];

  return {
    prompt,
    files: { explicit: files, extracted: det.specialist?.triggers ?? [] },
    detection: det,
    profile,
    priorFailures,
    cwd,
    sessionContext,
  };
}

// ─── Reasoning depth ──────────────────────────────────────────────────────────

const UNCERTAINTY_WORDS = /\b(not sure|maybe|should we|perhaps|architect|design|unsure|consider|what if|would it be|thinking about)\b/i;

/**
 * Classify reasoning depth from context pack signals.
 */
export function classifyReasoningDepth(contextPack: ContextPack): 'low' | 'medium' | 'high' | 'ultra' {
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

const THINK_TRIGGERS = new Set(['think', 'review']);

/**
 * Determine whether challenger activates based on work style and risk.
 */
function shouldUseChallenger(contextPack: ContextPack, trigger: string): boolean {
  const { detection, profile, priorFailures = 0 } = contextPack;
  const { risk = 'low' } = detection;

  // Always challenger for think/review triggers with prior failures or design impact
  if (priorFailures >= 2 || detection.designImpact || THINK_TRIGGERS.has(trigger)) return true;

  const style: WorkStyle = getWorkStyle(profile);

  if (style.challengerPolicy === 'never') return false;
  if (style.challengerPolicy === 'high-risk') return risk === 'high' || risk === 'critical';
  if (style.challengerPolicy === 'medium-risk') return risk !== 'low';

  return false;
}

/**
 * Determine whether a checkpoint is required based on work style and risk.
 */
function shouldCreateCheckpoint(contextPack: ContextPack): boolean {
  const { detection, profile } = contextPack;
  const { risk = 'low', tier = 'execute' } = detection;

  const style: WorkStyle = getWorkStyle(profile);

  if (style.checkpointPolicy === 'never') return false;
  if (style.checkpointPolicy === 'all-edits') return tier !== 'search';
  if (style.checkpointPolicy === 'risky-ops') return risk === 'high' || risk === 'critical';

  return false;
}

// ─── Challenger model resolver ────────────────────────────────────────────────

function resolveChallenger(useChallenger: boolean, contextPack: ContextPack): string | null {
  if (!useChallenger) return null;
  const profile = contextPack.profile as Record<string, unknown>;
  const providers = profile?.providers as Record<string, unknown> | undefined;
  const openai = providers?.openai as { enabled?: boolean; plan?: string } | undefined;
  const openaiEnabled = openai?.enabled && openai?.plan;
  if (!openaiEnabled) return null;

  const plan = openai!.plan!;
  // Pick the best available OpenAI model for the challenger role
  if (plan === '$100' || plan === '$200') return 'o3'; // doctor:verified — config value comparison, not UI display
  return 'gpt-4o';
}

// ─── Build execution plan ─────────────────────────────────────────────────────

/**
 * Build an execution plan from context pack + trigger + options.
 */
export function buildExecutionPlan(contextPack: ContextPack, trigger: string, options: { forceDepth?: string; forceChallenger?: boolean; thinkResult?: unknown } = {}): ExecutionPlan {
  const { detection, profile, priorFailures = 0 } = contextPack;

  const reasoningDepth = options.forceDepth ?? classifyReasoningDepth(contextPack);

  const useChallenger = options.forceChallenger || shouldUseChallenger(contextPack, trigger);
  const challengerModel = resolveChallenger(useChallenger, contextPack);

  const checkpointRequired = shouldCreateCheckpoint(contextPack);

  // Work style for display and routing context
  const workStyleObj: WorkStyle = getWorkStyle(profile);
  const workStyle = workStyleObj.key;

  // Map reasoning depth → effort hint for decideRoute
  const depthToEffort: Record<string, string> = { low: 'low', medium: 'medium', high: 'high', ultra: 'xhigh' };
  const detectionWithDepth = {
    ...detection,
    effort: depthToEffort[reasoningDepth] ?? detection.effort,
  };

  const decision = decideRoute({ profile: profile as Record<string, unknown>, detection: detectionWithDepth, cwd: contextPack.cwd, thinkResult: options.thinkResult as { tier?: string } | null | undefined, sessionContext: (contextPack.sessionContext ?? null) as Record<string, unknown> | null });

  // Resolve full model ID for display (mirrors dispatch.mjs CLAUDE_MODEL_IDS)
  const CLAUDE_MODEL_IDS: Record<string, string> = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5-20251001' };
  const modelAlias = (decision.model as string) ?? 'sonnet';
  const displayModel: string = decision.provider === 'claude'
    ? (CLAUDE_MODEL_IDS[modelAlias] ?? modelAlias)
    : modelAlias;

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
    primaryProvider:     (decision.provider as string) ?? 'claude',
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

interface PlanExplanationArgs {
  displayModel: string;
  reasoningDepth: string;
  useChallenger: boolean;
  workStyle: string;
  workStyleObj: WorkStyle;
  decision: Record<string, unknown>;
  detection: unknown;
  priorFailures: number;
  trigger: string;
}

function _buildPlanExplanation({ displayModel, reasoningDepth, useChallenger, workStyle, workStyleObj, decision, detection, priorFailures, trigger }: PlanExplanationArgs): string {
  const parts: string[] = [];
  const det = detection as { risk?: string; intent?: string };

  const modelShort = displayModel.split('/').pop();
  parts.push(`${modelShort} for ${det.risk}-risk ${det.intent}`);

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
 */
export function formatExecutionPlan(plan: ExecutionPlan): string {
  const depthLabel: Record<string, string> = { low: 'low reasoning', medium: 'medium reasoning', high: 'high reasoning', ultra: 'ultra reasoning' };

  // Work style label + challenger description
  const styleKey = plan.workStyle ?? 'balanced';
  const styleDef = { ...(WORK_STYLES[styleKey] ?? WORK_STYLES.balanced), key: styleKey } as WorkStyle;
  const challengerNote = plan.useChallenger
    ? `challenger on${plan.challengerModel ? ` (${plan.challengerModel})` : ''}`
    : `challenger off (policy: ${styleDef.challengerPolicy})`;

  const lines = [
    '⚡ Execution Plan',
    `  Model: ${plan.primaryModel} (${depthLabel[plan.reasoningDepth] ?? plan.reasoningDepth})`,
    `  Mode: ${styleDef.label} — ${challengerNote}`,
    `  Checkpoint: ${plan.checkpointRequired ? 'yes (risky operation detected)' : 'no'}`,
    `  Risk: ${(plan._decision as Record<string, unknown>)?.risk ?? 'unknown'} | Tier: ${plan.tier}`,
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
 */
async function createCheckpoint(cwd: string, contextPack: ContextPack): Promise<void> {
  try {
    const checkpointDir = join(cwd, '.dualbrain', 'checkpoints');
    mkdirSync(checkpointDir, { recursive: true });

    let ref: string | null = null;

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
 */
async function verify(result: unknown, plan: ExecutionPlan, cwd: string): Promise<VerificationResult> {
  const notes: string[] = [];
  const r = result as Record<string, unknown> | null;

  if (!r || r.status === 'error' || r.status === 'failed') {
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

async function recordOutcomeSafe(run: PipelineRun): Promise<void> {
  try {
    const { recordOutcome } = await import('./outcome.js');
    const cwd = run.context?.cwd ?? process.cwd();
    const recorded = await recordOutcome(run.plan as unknown as Parameters<typeof recordOutcome>[0], run.result as Parameters<typeof recordOutcome>[1], run.verification as Parameters<typeof recordOutcome>[2], cwd);
    run.outcome = recorded;
  } catch {
    // outcome module unavailable — silently skip
  }
}

// ─── Prior failures ───────────────────────────────────────────────────────────

// In-process cache of prior failures keyed by a rough prompt fingerprint.
// Populated by recordOutcomeSafe when outcome module is available; otherwise 0.
const _priorFailureCache = new Map<string, number>();

function _getPriorFailures(prompt: string, _cwd: string): number {
  const key = prompt.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
  return _priorFailureCache.get(key) ?? 0;
}

function _incrementFailureCache(prompt: string): void {
  const key = prompt.slice(0, 40).toLowerCase().replace(/\s+/g, ' ');
  _priorFailureCache.set(key, (_priorFailureCache.get(key) ?? 0) + 1);
}

// ─── Profile loader (safe) ────────────────────────────────────────────────────

async function _loadProfileSafe(cwd: string): Promise<Record<string, unknown>> {
  try {
    return await loadProfile(cwd) as unknown as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── Gate runner ─────────────────────────────────────────────────────────────

/**
 * Run a named gate, store its result in run.gates, and return whether it passed.
 * If gate throws, it is treated as a failure (fail-closed).
 */
function runGate(run: PipelineRun, gateName: keyof PipelineRun['gates'], gateFn: (run: PipelineRun) => GateResult): boolean {
  let result: GateResult;
  try {
    result = gateFn(run);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result = gate(false, `Gate '${gateName}' threw: ${message}`);
  }
  // Treat missing result or missing passed field as fail-closed
  if (!result || typeof result.passed !== 'boolean') {
    result = gate(false, `Gate '${gateName}' returned invalid result`);
  }
  run.gates[gateName] = result;
  return result.passed;
}

// ─── Pre-dispatch think (Position 1: context intelligence) ───────────────────

/**
 * Optionally spawn a cheap think agent to produce a refined work spec before
 * the real dispatch. Non-blocking on any failure.
 */
async function preDispatchThink(
  prompt: string,
  files: string[],
  decision: Record<string, unknown>,
  cwd: string,
  profile: Record<string, unknown>,
  opts: { log?: (msg: string) => void; _skipPreDispatchThink?: boolean; verbose?: boolean } = {}
): Promise<ThinkRefinement> {
  const log = opts.log ?? (() => {});

  // Guard: never recurse
  if (opts._skipPreDispatchThink) {
    log('[dual-brain] pre-dispatch think: skipped (recursive call)');
    return { refined: false };
  }

  // Guard: only execute/think tiers
  const tier = (decision?.tier as string) ?? 'execute';
  if (tier === 'search') {
    log('[dual-brain] pre-dispatch think: skipped (search tier)');
    return { refined: false };
  }

  // Guard: governance tier >= 2 (map tier names to numeric levels)
  const TIER_LEVEL: Record<string, number> = { search: 1, execute: 2, think: 3 };
  const tierLevel = TIER_LEVEL[tier] ?? 2;
  if (tierLevel < 2) {
    log('[dual-brain] pre-dispatch think: skipped (tier < 2)');
    return { refined: false };
  }

  // Guard: decision confidence must be < 0.9
  const confidence = (decision?.confidence as number) ?? 0.5;
  if (confidence >= 0.9) {
    log('[dual-brain] pre-dispatch think: skipped (confidence >= 0.9)');
    return { refined: false };
  }

  // Guard: not cost-saver work style
  try {
    const style: WorkStyle = getWorkStyle(profile);
    if (style.key === 'cost-saver') {
      log('[dual-brain] pre-dispatch think: skipped (cost-saver profile)');
      return { refined: false };
    }
  } catch {
    // profile unavailable — proceed
  }

  // Auto-disable if ROI is bad (< 30% hit rate after 10+ observations)
  {
    const metricsPath = join(cwd, '.dualbrain', 'think-metrics.json');
    let metrics: { hits: number; misses: number; totalTokens: number } = { hits: 0, misses: 0, totalTokens: 0 };
    try { metrics = JSON.parse(readFileSync(metricsPath, 'utf8')); } catch {}
    if (metrics.hits + metrics.misses >= 10 && metrics.hits / (metrics.hits + metrics.misses) < 0.3) {
      const verbose = opts.verbose ?? false;
      if (verbose) process.stderr.write('[dual-brain] pre-dispatch think disabled: hit rate below 30%\n');
      return { refined: false, reason: 'think ROI too low, auto-disabled' };
    }
  }

  try {
    log('[dual-brain] pre-dispatch think: refining work spec...');

    // Build the thinker context pack
    const pack = await buildContextPackIntel(prompt, files, cwd);

    // Compile to a thinker-shaped prompt (sonnet, 3000 token budget)
    const thinkerPrompt: string = compilePacket(pack as unknown as Parameters<typeof compilePacket>[0], 'thinker', 'sonnet', 3000);

    // Dispatch to a think agent — use sonnet, tier=think, skip all extras
    const thinkDecision = {
      provider: 'claude',
      model: 'sonnet',
      tier: 'think',
      confidence: 1,   // internal call — fully confident
    };

    const thinkResult = await dispatch({
      decision: thinkDecision,
      prompt: thinkerPrompt,
      files: [],
      cwd,
      dryRun: false,
      verbose: false,
      profile,
      _skipPreDispatchThink: true,
      _skipRelatedContext: true,
    });

    // Parse the think result — expect JSON with { decision, confidence, workSpec }
    let parsed: { confidence: number; workSpec?: { objective?: string; files?: string[]; criteria?: string[] } } | null = null;
    try {
      const thinkObj = thinkResult as unknown as Record<string, unknown>;
      const raw = typeof thinkResult === 'string'
        ? thinkResult
        : (thinkObj?.output ?? thinkObj?.result ?? thinkObj?.text ?? JSON.stringify(thinkResult));

      // Extract JSON from possible prose wrapping
      const jsonMatch = (raw as string).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON parse failed — proceed unchanged
    }

    if (!parsed || typeof parsed.confidence !== 'number' || parsed.confidence <= 0.7) {
      const reason = !parsed ? 'unparseable response' : `confidence ${parsed.confidence} <= 0.7`;
      log(`[dual-brain] pre-dispatch think: skipped (${reason})`);
      _recordThinkMetrics(false, cwd);
      return { refined: false };
    }

    const ws = parsed.workSpec;
    if (!ws || !ws.objective) {
      log('[dual-brain] pre-dispatch think: skipped (no workSpec.objective)');
      _recordThinkMetrics(false, cwd);
      return { refined: false };
    }

    // Apply refinements
    const newObjective = ws.objective;
    const newFiles = [...new Set([...files, ...(ws.files ?? [])])];
    const newDecision = ws.criteria?.length
      ? { ...decision, acceptanceCriteria: [...((decision.acceptanceCriteria as string[]) ?? []), ...ws.criteria] }
      : decision;

    log(`[dual-brain] think refined: "${newObjective.slice(0, 60)}..." (confidence: ${parsed.confidence})`);

    _recordThinkMetrics(true, cwd);
    return {
      refined:    true,
      prompt:     newObjective,
      files:      newFiles,
      decision:   newDecision,
      confidence: parsed.confidence,
    };
  } catch (err: unknown) {
    // Non-blocking on any failure
    const message = err instanceof Error ? err.message : String(err);
    log(`[dual-brain] pre-dispatch think: skipped (error: ${message})`);
    _recordThinkMetrics(false, cwd);
    return { refined: false };
  }
}

/**
 * Record a think hit or miss into think-metrics.json (non-blocking).
 */
function _recordThinkMetrics(hit: boolean, cwd: string): void {
  try {
    const metricsPath = join(cwd, '.dualbrain', 'think-metrics.json');
    let metrics: { hits: number; misses: number; totalTokens: number; lastUpdated?: string } = { hits: 0, misses: 0, totalTokens: 0 };
    try { metrics = JSON.parse(readFileSync(metricsPath, 'utf8')); } catch {}
    if (hit) {
      metrics.hits++;
    } else {
      metrics.misses++;
    }
    metrics.totalTokens += 3000; // budget per think call
    metrics.lastUpdated = new Date().toISOString();
    mkdirSync(join(cwd, '.dualbrain'), { recursive: true });
    writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n');
  } catch { /* non-blocking */ }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run the unified pipeline.
 */
export async function runPipeline(trigger: string, prompt: string, options: PipelineOptions = {}): Promise<Record<string, unknown>> {
  const {
    files    = [],
    cwd      = process.cwd(),
    dryRun   = false,
    verbose  = false,
    forceDepth,
    forceChallenger = false,
    silent   = false,
  } = options;

  const log = silent ? () => {} : (msg: string) => process.stderr.write(msg + '\n');

  // Create the PipelineRun state object
  const run = createPipelineRun(trigger, prompt);

  try {
    // ── Phase 0: HEAD Cognitive Judgment ─────────────────────────────────────
    try {
      const head = await import('./head.js');
      const headState = head.loadState();
      const headContext: Record<string, unknown> = {
        files: files,
        priorFailures: 0,
        uncommittedFiles: [] as string[],
        recentFiles: [] as string[],
        patterns: [] as unknown[],
      };

      // Enrich head context from git state (best-effort)
      try {
        const gitStatus = execSync('git status --porcelain -u', { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
        headContext.uncommittedFiles = gitStatus.split('\n').map((l: string) => l.slice(3).trim()).filter(Boolean);
      } catch {}

      run.headJudgment = head.processTurn(headState, prompt, headContext);

      // HEAD says to ask the user — block pipeline with the uncertainty + noticings
      const hj = run.headJudgment as Record<string, unknown>;
      const hjResult = hj?.result as Record<string, unknown> | undefined;
      if ((hj as { shouldAskUser?: boolean })?.shouldAskUser && !options.forceDispatch) {
        const reasons: string[] = [];
        const confidence = hjResult?.confidence as { level?: string; score?: number; gaps?: string[] } | undefined;
        if (confidence?.level !== 'sufficient') {
          reasons.push(`Confidence: ${confidence?.level} (${confidence?.score})`);
          for (const gap of confidence?.gaps || []) {
            reasons.push(`  Uncertain: ${gap}`);
          }
        }
        for (const n of (hjResult?.surfaceNoticings as Array<{ type: string; observation: string }>) || []) {
          reasons.push(`  ${n.type}: ${n.observation}`);
        }
        const action = hjResult?.action as { type?: string } | undefined;
        if (action?.type === 'clarify') {
          reasons.push(`HEAD recommends clarifying before acting`);
        }

        run.completedAt = Date.now();
        return {
          success: false,
          gateFailure: 'head-judgment',
          reason: reasons.join('\n'),
          headJudgment: run.headJudgment,
          run,
        };
      }

      if (verbose) {
        log(`[pipeline] HEAD depth: ${(hj as { depth?: string }).depth}, action: ${((hjResult?.action as { type?: string; mode?: string }) || {}).type}/${((hjResult?.action as { type?: string; mode?: string }) || {}).mode}`);
        if (((hjResult?.surfaceNoticings as unknown[]) || []).length > 0) {
          for (const n of (hjResult?.surfaceNoticings as Array<{ observation: string }>) || []) {
            log(`[pipeline] HEAD noticed: ${n.observation}`);
          }
        }
      }
    } catch {
      // head.mjs unavailable — continue degraded (no cognitive layer)
    }

    // ── Phase 0: Situational awareness ───────────────────────────────────────
    const headDepth = (run.headJudgment as { depth?: string })?.depth || 'full';
    const loadFull = headDepth === 'full' || headDepth === 'deep';
    const loadLight = loadFull || headDepth === 'light';

    // Session history — always load (lightweight, index-only)
    try {
      const session = await import('./session.js');
      if (session.getRoutingContext) {
        run.sessionContext = session.getRoutingContext(cwd, prompt);
      }
    } catch {} // non-blocking

    // Intelligence module — skip for reflexive
    if (loadLight) {
      try {
        const { deriveProjectState, deriveTaskContext, detectContradictions, formatBrief } = await import('./intelligence.js');
        run.projectBrief = await deriveProjectState(options.cwd || process.cwd());
        run.taskBrief = deriveTaskContext(prompt, (options.recentEvents || []) as Parameters<typeof deriveTaskContext>[1]);
        run.situationBrief = formatBrief(run.projectBrief as Parameters<typeof formatBrief>[0], run.taskBrief as Parameters<typeof formatBrief>[1], run.sessionContext as Parameters<typeof formatBrief>[2]);
      } catch {
        // intelligence module not available — continue without it (degraded)
      }
    }

    // Doctor, ledger, calibration, awareness, replit, think-engine, prompt-intel
    if (loadLight) {
      // Doctor: discover capabilities (cached per process)
      try {
        const { discover, verifyAll } = await import('./doctor.js');
        const doctorCwd = options.cwd || process.cwd();
        discover(doctorCwd);
        verifyAll(doctorCwd);
      } catch {}

      // Ledger: check open tasks + create task
      try {
        const { getOpenTasks, createTask, reconcile } = await import('./ledger.js');
        const ledgerCwd = options.cwd || process.cwd();
        run.openTasks = getOpenTasks(ledgerCwd);
        reconcile(ledgerCwd);
        const task = createTask({
          intent: prompt,
          owner: 'head',
          priority: (run.projectBrief as { recentFailures?: unknown[] })?.recentFailures?.length ? 'high' : 'medium',
          files: options.files || []
        }, ledgerCwd);
        run.taskId = task.id;
      } catch {}

      if (run.openTasks.length > 0) {
        const preview = run.openTasks.slice(0, 3).map((t: unknown) => (t as { intent: string }).intent).join(', ');
        const pendingLine = `PENDING TASKS: ${run.openTasks.length} open (${preview})`;
        run.situationBrief = run.situationBrief
          ? `${run.situationBrief}\n${pendingLine}`
          : pendingLine;
      }
    }

    // Heavy intelligence modules — only for full/deep
    if (loadFull) {
      // Calibration
      try {
        const { analyzeInput, getAdaptation, detectCorrection, updateCalibration } = await import('./calibration.js');
        const { getProjectState, updateProject } = await import('./living-docs.js');
        const calCwd = options.cwd || process.cwd();
        const projectState = getProjectState(calCwd);
        const currentCal = (projectState as Record<string, unknown>)?.project as Record<string, unknown> | undefined;
        const userCal = (currentCal?.userCalibration as Record<string, unknown>) || { specificity: 3, corrections: 3, autonomy: 3, interactions: 0 };
        const isCorrection = detectCorrection(prompt);
        run.calibration = updateCalibration(userCal as Parameters<typeof updateCalibration>[0], prompt, isCorrection);
        run.adaptation = getAdaptation(run.calibration as Parameters<typeof getAdaptation>[0]);
        updateProject({ userCalibration: run.calibration }, calCwd);
      } catch {}

      // Environment awareness
      try {
        const { scanEnvironment, getCapabilitySummary } = await import('./awareness.js');
        run.environment = scanEnvironment(cwd);
        if (run.situationBrief && run.environment) {
          const caps: string[] = getCapabilitySummary(run.environment as Parameters<typeof getCapabilitySummary>[0]);
          if (caps.length > 0) {
            run.situationBrief += '\nCAPABILITIES: ' + caps.join(', ');
          }
        }
      } catch {}

      // Replit context
      try {
        const replit = await import('./replit.js');
        const replitEnv = replit.detectReplitEnvironment(cwd);
        if (replitEnv.isReplit) {
          run.replitEnvironment = replitEnv;
          run.replitTools = replit.inspectReplitTools(cwd);
          run.replitConfig = replit.getReplitToolsConfig(cwd);
        }
      } catch {}

      // Knowledge preflight
      try {
        const { lookupDecision, triageQuestion } = await import('./think-engine.js');
        const teCwd = options.cwd || process.cwd();
        run.decisionPreflight = lookupDecision(prompt, options.tags || [], teCwd);
        const preflight = run.decisionPreflight as { recommendation?: string; candidates?: Array<{ relevance: number }> };
        if (preflight.recommendation === 'reuse' && preflight.candidates?.[0]) {
          if (run.situationBrief) {
            run.situationBrief += '\nCACHED DECISION: Found prior decision with ' +
              Math.round(preflight.candidates[0].relevance * 100) + '% relevance';
          }
        }
        const triage = triageQuestion(prompt, run.projectBrief, run.decisionPreflight as Parameters<typeof triageQuestion>[2]);
        run.thinkResult = { tier: triage.recommendedTier, estimatedTokens: triage.estimatedTokens, triage };
        if (run.situationBrief) {
          run.situationBrief += '\nTHINK TIER: ' + triage.recommendedTier + ' (' + triage.estimatedTokens + ' tokens est.)';
        }
      } catch {}

      // Prompt intelligence
      try {
        const { analyzePrompt, enrichPrompt, shouldBlock, getBlockReason } = await import('./prompt-intel.js');
        run.promptAnalysis = analyzePrompt(prompt, run.projectBrief, run.calibration as Record<string, unknown> | undefined);

        if (shouldBlock(run.promptAnalysis as Record<string, unknown>)) {
          const reason: string = getBlockReason(run.promptAnalysis as Record<string, unknown>) ?? '';
          if (run.taskId) {
            try {
              const { failTask } = await import('./ledger.js');
              failTask(run.taskId, 'Blocked by risk detection: ' + reason, cwd);
            } catch {}
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

        const analysis = run.promptAnalysis as { intervention?: string };
        if (analysis.intervention === 'silent_enrich' || analysis.intervention === 'confirm_rewrite') {
          run.enrichedPrompt = enrichPrompt(prompt, run.projectBrief as Record<string, unknown> | null | undefined, run.promptAnalysis as Record<string, unknown>);
        }
      } catch {}
    }

    // ── Phase 1: Context ──────────────────────────────────────────────────────

    const effectivePrompt = run.enrichedPrompt || prompt;

    // Build context pack (pass sessionContext so detect can use cross-session signals)
    run.context = await buildContextPack(effectivePrompt, files, cwd, run.sessionContext, run.headJudgment);

    // Query failure history (must happen before context gate)
    try {
      const { checkFailureHistory } = await import('./failure-memory.js');
      run.failureHistory = await checkFailureHistory(effectivePrompt, files, cwd) as unknown as FailureHistory;
    } catch {
      // failure-memory.mjs unavailable — set to empty result so gate still passes
      run.failureHistory = { hasPriorFailures: false, failureCount: 0, lastFailure: null, escalation: { recommended: false } };
    }

    // Query relevant outcomes (must happen before context gate)
    try {
      const { getRelevantOutcomes } = await import('./outcome.js');
      run.priorOutcomes = await getRelevantOutcomes(effectivePrompt, files, cwd);
    } catch {
      // outcome module unavailable — set to empty array so gate still passes
      run.priorOutcomes = [];
    }

    // Gate 1: Context gate
    if (!runGate(run, 'context', contextGate)) {
      run.completedAt = Date.now();
      try {
        const { recordEvent } = await import('./doctor.js');
        recordEvent({ type: 'gate_failure', checkId: 'context-gate', severity: 'fail', outcome: 'blocked', evidence: run.gates.context!.reason, sessionId: run.id }, cwd);
      } catch { /* non-blocking */ }
      return { success: false, gateFailure: 'context', reason: run.gates.context!.reason, run };
    }

    // ── Phase 2: Plan ─────────────────────────────────────────────────────────

    // HEAD's depth assessment can influence the plan's reasoning depth
    const headDepthMap: Record<string, string> = { reflexive: 'low', light: 'medium', full: 'high', deep: 'ultra' };
    const headSuggestedDepth = (run.headJudgment as { depth?: string })?.depth
      ? headDepthMap[(run.headJudgment as { depth: string }).depth]
      : undefined;
    const effectiveForceDepth = forceDepth || headSuggestedDepth;

    run.plan = buildExecutionPlan(run.context, trigger, { forceDepth: effectiveForceDepth, forceChallenger, thinkResult: run.thinkResult });

    // Model intelligence
    try {
      const { suggestModel, getRegistryAge } = await import('./models.js');
      const availableProviders: string[] = [];
      const env = run.environment as Record<string, unknown> | null;
      const claudeCode = (env?.claudeCode as Record<string, unknown>) || {};
      const tools = (env?.tools as Record<string, unknown>) || {};
      if (claudeCode.isInsideClaude || (tools.claude as Record<string, unknown>)?.available) availableProviders.push('anthropic');
      if ((tools.codex as Record<string, unknown>)?.available) availableProviders.push('openai');

      const intent = String(((run.promptAnalysis as Record<string, unknown>)?.intent as Record<string, unknown>)?.type || 'execute');
      const risk = String(run.plan?.risk || 'medium');
      const complexity = String(run.plan?.complexity || 'medium');

      run.modelSuggestion = suggestModel(intent, risk, complexity, availableProviders);

      // Warn if model registry is stale
      const age: number = getRegistryAge();
      if (age > 30 && run.situationBrief) {
        run.situationBrief += '\nWARNING: Model registry is ' + age + ' days old';
      }
    } catch {
      // models not available
    }

    if (verbose || dryRun) {
      log(formatExecutionPlan(run.plan));
    }

    // Contradiction detection
    if (run.projectBrief && run.plan) {
      try {
        const { detectContradictions } = await import('./intelligence.js');
        const planForCheck = {
          description: run.plan.description || prompt,
          targetFiles: run.plan.targetFiles || run.plan.files || [],
          assumptions: run.plan.assumptions || {}
        };
        run.contradictions = detectContradictions(run.projectBrief as Parameters<typeof detectContradictions>[0], run.taskBrief as Parameters<typeof detectContradictions>[1], planForCheck as Parameters<typeof detectContradictions>[2]);

        // Any blocking contradiction fails the pipeline
        const blockers = run.contradictions.filter((c: unknown) => (c as { severity: string }).severity === 'block');
        if (blockers.length > 0) {
          run.completedAt = Date.now();
          try {
            const { recordEvent } = await import('./doctor.js');
            recordEvent({ type: 'contradiction_caught', severity: 'fail', outcome: 'blocked', evidence: blockers.map((b: unknown) => (b as { message: string }).message).join('; ').slice(0, 200), sessionId: run.id }, cwd);
          } catch { /* non-blocking */ }
          return {
            success: false,
            gateFailure: 'contradiction',
            reason: blockers.map((b: unknown) => (b as { message: string }).message).join('; '),
            contradictions: blockers,
            run
          };
        }
      } catch {
        // contradiction detection failed — continue (degraded)
      }
    }

    // Gate 2: Planning gate
    if (!runGate(run, 'planning', planningGate)) {
      run.completedAt = Date.now();
      try {
        const { recordEvent } = await import('./doctor.js');
        recordEvent({ type: 'gate_failure', checkId: 'planning-gate', severity: 'fail', outcome: 'blocked', evidence: run.gates.planning!.reason, sessionId: run.id }, cwd);
      } catch { /* non-blocking */ }
      return { success: false, gateFailure: 'planning', reason: run.gates.planning!.reason, run };
    }

    // Gate 3: Principle gate
    if (!runGate(run, 'principle', principleGate)) {
      run.completedAt = Date.now();
      try {
        const { recordEvent } = await import('./doctor.js');
        recordEvent({ type: 'gate_failure', checkId: 'principle-gate', severity: 'fail', outcome: 'blocked', evidence: run.gates.principle!.reason, sessionId: run.id }, cwd);
      } catch { /* non-blocking */ }
      return { success: false, gateFailure: 'principle', reason: run.gates.principle!.reason, run };
    }

    if (dryRun) {
      run.completedAt = Date.now();
      return {
        plan: run.plan,
        result: null,
        verification: null,
        run,
        projectBrief:     run.projectBrief,
        contradictions:   run.contradictions,
        promptAnalysis:   run.promptAnalysis,
        environment:      run.environment,
        modelSuggestion:  run.modelSuggestion,
        thinkResult:      run.thinkResult,
        decisionPreflight: run.decisionPreflight,
      };
    }

    // Gate 4: Execution gate (cleared to work?)
    if (!runGate(run, 'execution', executionGate)) {
      run.completedAt = Date.now();
      try {
        const { recordEvent } = await import('./doctor.js');
        recordEvent({ type: 'gate_failure', checkId: 'execution-gate', severity: 'fail', outcome: 'blocked', evidence: run.gates.execution!.reason, sessionId: run.id }, cwd);
      } catch { /* non-blocking */ }
      return { success: false, gateFailure: 'execution', reason: run.gates.execution!.reason, run };
    }

    // ── Phase 3: Execute ──────────────────────────────────────────────────────

    // Checkpoint (best-effort, before execute).
    if (run.plan.checkpointRequired) {
      await createCheckpoint(cwd, run.context);
    }

    const detectedRisk: string = run.context?.detection?.risk ?? 'low';
    if (detectedRisk === 'high' || detectedRisk === 'critical') {
      try {
        const { createCheckpoint: cpCreate } = await import('./checkpoint.js');
        const cpLabel = `before: ${prompt.slice(0, 80)}`;
        const cpResult = cpCreate(cpLabel, { cwd });
        run.checkpoint = cpResult;
        if (verbose) log(`[pipeline] checkpoint created: ${cpResult.id} (${cpResult.success ? 'ok' : 'failed'})`);
      } catch {
        // checkpoint.mjs unavailable — non-blocking
        run.checkpoint = null;
      }
    }

    let decision: Record<string, unknown> = { ...run.plan._decision };

    // ── Pre-dispatch think (Position 1: context intelligence) ────────────────
    {
      const thinkRefinement = await preDispatchThink(
        effectivePrompt,
        files,
        decision,
        cwd,
        (run.context?.profile ?? {}) as Record<string, unknown>,
        { log, _skipPreDispatchThink: options._skipPreDispatchThink }
      );
      if (thinkRefinement.refined) {
        run._thinkRefinedPrompt  = thinkRefinement.prompt;
        run._thinkRefinedFiles   = thinkRefinement.files;
        decision                 = thinkRefinement.decision!;

        // Record the think→work handoff for cross-agent context continuity
        try {
          const { createHandoff } = await import('./handoff.js');
          createHandoff('thinker', 'worker', {
            objective: thinkRefinement.prompt,
            files: thinkRefinement.files,
            criteria: (thinkRefinement.decision as Record<string, unknown>)?.criteria || [],
            confidence: thinkRefinement.confidence,
          }, run.id || Date.now().toString(36), cwd);
        } catch { /* non-blocking */ }

        // Cascade: if think agent is highly confident and task is simple, downgrade worker model
        if (thinkRefinement.decision) {
          const thinkConf = thinkRefinement.confidence || 0;
          const currentModel = (decision.model as string) || 'sonnet';
          if (thinkConf >= 0.9 && currentModel !== 'haiku') {
            const prevModel = decision.model;
            decision.model = 'haiku';
            if (verbose || run?.verbose) process.stderr.write(`[dual-brain] cascade: think confidence ${thinkConf} → downgraded ${prevModel || 'sonnet'} to haiku\n`);
          } else if (thinkConf >= 0.75 && currentModel === 'opus') {
            decision.model = 'sonnet';
            if (verbose || run?.verbose) process.stderr.write(`[dual-brain] cascade: think confidence ${thinkConf} → downgraded opus to sonnet\n`);
          }
        }
      }
    }

    // Strategy selection — may override dispatch pattern
    try {
      const { selectStrategy } = await import('./strategy.js');
      const strategyResult = selectStrategy(run.context.detection, decision, run.context.profile);
      if (strategyResult.strategy !== 'direct') {
        decision._strategy = strategyResult.strategy;
        decision._strategyReason = strategyResult.reason;
        if (verbose) process.stderr.write(`[dual-brain] strategy: ${strategyResult.strategy} (${strategyResult.reason})\n`);
      }
    } catch { /* non-blocking */ }

    // Resolve the (possibly refined) prompt and file list for dispatch
    const dispatchPrompt = run._thinkRefinedPrompt ?? effectivePrompt;
    const dispatchFiles  = run._thinkRefinedFiles  ?? files;

    // ── HEAD judgment injection into agent prompts ─────────────────────────────
    let headJudgmentBlock = '';
    if (run.headJudgment) {
      const hj = run.headJudgment as Record<string, unknown>;
      const hjResult = hj.result as Record<string, unknown> | undefined;
      const hjLines: string[] = ['[HEAD JUDGMENT]'];

      // Critical obligations the agent must respect
      const criticalObs = ((hjResult?.obligations as Array<{ priority: string; description: string }>) || []).filter(o => o.priority === 'critical' || o.priority === 'high');
      if (criticalObs.length > 0) {
        hjLines.push('Obligations:');
        for (const o of criticalObs) hjLines.push(`- ${o.description}`);
      }

      // Uncertainties the agent should verify
      const gaps = ((hj.uncertainties as Array<{ confidence: number; claim: string; wouldChangeIf: string }>) || []).filter(u => u.confidence < 0.6);
      if (gaps.length > 0) {
        hjLines.push('Verify these (HEAD is uncertain):');
        for (const g of gaps) hjLines.push(`- ${g.claim} (confidence: ${Math.round(g.confidence * 100)}%) — ${g.wouldChangeIf}`);
      }

      // Noticings the agent should be aware of
      const surfaced = (hjResult?.surfaceNoticings as Array<{ observation: string }>) || [];
      if (surfaced.length > 0) {
        hjLines.push('HEAD noticed:');
        for (const n of surfaced) hjLines.push(`- ${n.observation}`);
      }

      hjLines.push('[/HEAD JUDGMENT]');

      if (hjLines.length > 2) {
        headJudgmentBlock = hjLines.join('\n');
      }
    }

    // Collaborative dispatch
    const collab = await getCollab() as Record<string, (...args: unknown[]) => unknown> | null;
    const useCollaboration = collab && (
      run.plan.useChallenger ||
      detectedRisk === 'high' || detectedRisk === 'critical'
    );

    if (useCollaboration && collab) {
      const session = collab.createSession(run.id, effectivePrompt, {
        crossReview: run.plan.useChallenger,
      }) as unknown;

      // Register primary agent
      const primaryId = `primary-${run.id.slice(0, 8)}`;
      collab.registerAgent(session, primaryId, 'implementer', decision.provider, decision.model);
      collab.startAgent(session, primaryId);

      // Inject collaboration context + HEAD judgment into prompt
      const collabContext = collab.buildAgentContext(session, primaryId) as string;
      const promptParts = [collabContext, headJudgmentBlock, dispatchPrompt].filter(Boolean);
      const collabPrompt = promptParts.join('\n\n');

      run.result = await dispatch({
        decision,
        prompt: collabPrompt,
        files: dispatchFiles,
        cwd,
        dryRun: false,
        verbose,
        profile: run.context.profile as Record<string, unknown>,
        situationBrief: run.situationBrief ?? undefined,
        modelSuggestion: run.modelSuggestion as { model: string; reason: string } | undefined,
      });

      // Record agent completion
      const resultObj = run.result as Record<string, unknown>;
      collab.completeAgent(session, primaryId, run.result, resultObj?.summary);

      // Extract findings from result
      if ((resultObj?.filesChanged as string[])?.length) {
        for (const f of resultObj.filesChanged as string[]) collab.trackFile(session, f, primaryId);
      }

      // Cross-review: symmetric — works Claude→OpenAI and OpenAI→Claude
      const availableProviders: string[] = [];
      const profile = run.context?.profile as Record<string, unknown>;
      const providers = profile?.providers as Record<string, unknown> | undefined;
      if ((providers?.claude as Record<string, unknown>)?.enabled !== false) availableProviders.push('claude');
      const openaiP = providers?.openai as Record<string, unknown> | undefined;
      if (openaiP?.enabled && openaiP?.plan) availableProviders.push('openai');

      if (run.plan.useChallenger && run.plan.challengerModel && resultObj?.status === 'completed') {
        const reviewSpec = collab.buildCrossReviewPrompt(session, primaryId, availableProviders) as { provider: string; model?: string; prompt: string } | null;
        if (reviewSpec) {
          const reviewId = `reviewer-${run.id.slice(0, 8)}`;
          collab.registerAgent(session, reviewId, 'cross-reviewer', reviewSpec.provider, reviewSpec.model || run.plan.challengerModel);
          collab.startAgent(session, reviewId);

          try {
            const reviewResult = await dispatch({
              decision: { provider: reviewSpec.provider, model: reviewSpec.model || run.plan.challengerModel, tier: 'search' },
              prompt: reviewSpec.prompt,
              files,
              cwd,
              dryRun: false,
              verbose,
              profile: run.context.profile as Record<string, unknown>,
              situationBrief: run.situationBrief ?? undefined,
            });
            collab.completeAgent(session, reviewId, reviewResult, (reviewResult as unknown as Record<string, unknown>)?.summary);
          } catch {
            collab.completeAgent(session, reviewId, { error: 'review dispatch failed' });
          }
        }
      }

      // Synthesize and attach to run
      run.collaboration = collab.synthesize(session);

      // Persist collaboration session
      try { collab.saveSession(session, cwd); } catch {}
      try { collab.persistEvents(session, cwd); } catch {}
    } else {
      const directPrompt = headJudgmentBlock
        ? `${headJudgmentBlock}\n\n${dispatchPrompt}`
        : dispatchPrompt;

      run.result = await dispatch({
        decision,
        prompt: directPrompt,
        files: dispatchFiles,
        cwd,
        dryRun: false,
        verbose,
        profile: run.context.profile as Record<string, unknown>,
        situationBrief: run.situationBrief ?? undefined,
        modelSuggestion: run.modelSuggestion as { model: string; reason: string } | undefined,
      });
    }

    // Update ledger task with result
    if (run.taskId) {
      const { updateTask, failTask } = await import('./ledger.js');
      const ledgerCwd = options.cwd || process.cwd();
      const resultObj = run.result as Record<string, unknown> | null;

      if (resultObj && !resultObj.error) {
        updateTask(run.taskId, {
          status: 'done',
          result: typeof run.result === 'string' ? run.result : JSON.stringify(run.result).slice(0, 500),
          proof: run.verification ? 'Pipeline verification passed' : 'Execution completed',
          files: (resultObj.filesChanged as string[]) || run.plan?.targetFiles || []
        }, ledgerCwd);
      } else {
        try {
          failTask(run.taskId, (resultObj?.error as string) || 'Pipeline execution failed', ledgerCwd);
        } catch {
          // failTask failure is non-blocking
        }
      }
    }

    // Record action in living docs
    try {
      const { appendAction } = await import('./living-docs.js');
      const docsCwd = options.cwd || process.cwd();
      const resultObj = run.result as Record<string, unknown> | null;

      appendAction({
        type: trigger || 'task',
        intent: prompt,
        status: (resultObj && !resultObj.error) ? 'done' : 'failed',
        owner: 'head',
        files: (resultObj?.filesChanged as string[]) || run.plan?.targetFiles || [],
        proof: run.verification ? JSON.stringify(run.verification).slice(0, 200) : null,
        result: typeof run.result === 'string' ? run.result.slice(0, 300) : null
      }, docsCwd);
    } catch {
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

    // Track cost after verification (fail-silent — advisory only)
    try {
      const { trackCost } = await import('./cost-tracker.js');
      const resultObj = run.result as Record<string, unknown> | null;
      const usage = resultObj?.usage as Record<string, unknown> | undefined;
      const tokensUsed = resultObj?.tokensUsed as Record<string, unknown> | undefined;
      const tokensEstimated =
        ((usage?.inputTokens as number) ?? (tokensUsed?.input as number) ?? 0) +
        ((usage?.outputTokens as number) ?? (tokensUsed?.output as number) ?? 0);
      trackCost({
        action: trigger || 'execute',
        model:  (resultObj?.model as string) ?? (run.plan?._decision as Record<string, unknown>)?.model ?? 'default',
        tier:   run.plan?.tier ?? 'standard',
        tokensEstimated,
        wasCacheHit: false,
        tokensSaved: 0,
      }, cwd);
    } catch {
      // cost-tracker not available — non-blocking
    }

    // Living docs: update state after significant execution (fail-silent — advisory only)
    try {
      const { updateState } = await import('./living-docs.js');
      const docsCwd = options.cwd || process.cwd();
      const resultObj = run.result as Record<string, unknown> | null;
      const successFlag = resultObj && !resultObj.error && run.verification.ok;
      const stateEntry =
        `# Current State\n\nLast run: ${new Date().toISOString()}\n` +
        `Task: ${prompt.slice(0, 120)}\n` +
        `Status: ${successFlag ? 'completed' : 'failed'}\n` +
        `Tier: ${run.plan?.tier ?? 'unknown'}\n` +
        `Model: ${run.plan?.primaryModel ?? 'unknown'}\n`;
      updateState(stateEntry, docsCwd);
    } catch {
      // living-docs not available — non-blocking
    }

    // Doctor: record execution outcome event (fail-silent)
    try {
      const { recordEvent } = await import('./doctor.js');
      const resultObj = run.result as Record<string, unknown> | null;
      const successFlag = resultObj && !resultObj.error && run.verification?.ok;
      recordEvent({
        type: successFlag ? 'execution_success' : 'gate_failure',
        checkId: 'execution',
        severity: successFlag ? 'pass' : 'fail',
        outcome: successFlag ? 'pass' : 'fail',
        evidence: successFlag
          ? `Completed ${trigger}: ${prompt.slice(0, 100)}`
          : ((resultObj?.error as string) || 'Execution failed'),
        sessionId: run.id,
      }, cwd);
    } catch { /* non-blocking */ }

    // Doctor: record learning from this execution outcome (fail-silent)
    try {
      const { recordLearning } = await import('./doctor.js');
      const doctorCwd = options.cwd || process.cwd();
      const resultObj = run.result as Record<string, unknown> | null;
      const successFlag = resultObj && !resultObj.error && run.verification.ok;
      recordLearning({
        taskType:      run.context?.detection?.intent ?? 'unknown',
        prompt,
        model:         (resultObj?.model as string) ?? ((run.plan?._decision as Record<string, unknown>)?.model as string) ?? '',
        provider:      (resultObj?.provider as string) ?? run.plan?.primaryProvider ?? '',
        tier:          run.plan?.tier ?? '',
        reasoningDepth: run.plan?.reasoningDepth ?? 'low',
        wasEnriched:   !!run.enrichedPrompt,
        wasDualBrain:  !!(run.plan?.useChallenger && run.plan?.challengerModel),
        success:       !!successFlag,
        duration:      run.completedAt ? (Date.now() - run.startedAt) : 0,
        filesChanged:  ((resultObj?.filesChanged as string[]) ?? []).length,
      }, doctorCwd);
    } catch {
      // doctor not available — non-blocking
    }

    // ── Phase 5: Outcome ──────────────────────────────────────────────────────

    await recordOutcomeSafe(run);

    // Gate 5: Outcome gate
    if (!runGate(run, 'outcome', outcomeGate)) {
      run.completedAt = Date.now();
      return { success: false, gateFailure: 'outcome', reason: run.gates.outcome!.reason, run };
    }

    // Provider-aware compaction survival
    try {
      const { buildSurvivalBlock } = await import('./provider-context.js');
      const resultObj = run.result as Record<string, unknown> | null;
      const effectiveProvider = (resultObj?.provider as string) || run.plan?.primaryProvider || 'claude';
      const survivalKit: string = buildSurvivalBlock(effectiveProvider, {
        activeTask: prompt.slice(0, 120),
        provider: effectiveProvider,
        model: (resultObj?.model as string) || run.plan?.primaryModel,
        tier: run.plan?.tier,
        risk: run.context?.detection?.risk,
        filesInProgress: (resultObj?.filesChanged as string[]) || [],
        decisions: (((run.collaboration as Record<string, unknown>)?.decisions as Array<{ decision: unknown }>)?.map(d => String(d.decision)) || []) as string[],
        warnings: run.contradictions?.map((c: unknown) => (c as { message: string }).message) || [],
        routingRules: [
          `provider=${effectiveProvider}`,
          `model=${(resultObj?.model as string) || run.plan?.primaryModel}`,
          `tier=${run.plan?.tier}`,
        ],
      });
      if (run.situationBrief) {
        run.situationBrief = `${survivalKit}\n\n${run.situationBrief}`;
      }
    } catch { /* non-blocking */ }

    // Post-session receipt
    try {
      const { generateReceipt } = await import('./receipt.js');
      generateReceipt(run as unknown as Parameters<typeof generateReceipt>[0], cwd);
    } catch { /* non-blocking */ }

    // Persist decision for future recall
    const resultObj = run.result as Record<string, unknown> | null;
    if (resultObj && !resultObj?.error) {
      try {
        const { persistDecision } = await import('./think-engine.js');
        const teCwd = options.cwd || process.cwd();
        persistDecision(
          prompt,
          typeof run.result === 'string' ? run.result : JSON.stringify(run.result).slice(0, 1000),
          String((run.thinkResult as Record<string, unknown>)?.tier || 'standard'),
          { tags: options.tags || [], projectBrief: run.projectBrief },
          teCwd
        );
      } catch {
        // persist failed — non-blocking
      }
    }

    // Provider-aware continuity handoff
    try {
      const { generateHandoff, saveHandoff, pruneHandoffs } = await import('./continuity.js');
      const { generateProviderHandoff } = await import('./provider-context.js');
      const handoffCwd = options.cwd || process.cwd();
      const handoffProvider = (resultObj?.provider as string) || run.plan?.primaryProvider || 'claude';

      const sessionState: Parameters<typeof generateProviderHandoff>[0] = {
        taskDescription: prompt.slice(0, 200),
        filesChanged: (resultObj?.filesChanged as string[]) || run.plan?.targetFiles || [],
        testsRun: run.verification?.notes || [],
        decisions: run.plan ? [{
          provider: run.plan.primaryProvider,
          model: run.plan.primaryModel,
        }] : [],
        unresolved: run.contradictions?.filter((c: unknown) => (c as { severity: string }).severity !== 'block').map((c: unknown) => (c as { message: string }).message) || [],
        routingHistory: {
          lastProvider: handoffProvider,
          lastModel: (resultObj?.model as string) || run.plan?.primaryModel || undefined,
          failedProviders: resultObj?.error ? [run.plan?.primaryProvider].filter((p): p is string => !!p) : [],
        },
        resumeHint: resultObj && !resultObj?.error
          ? undefined
          : `retry: ${prompt.slice(0, 100)}`,
      };

      // Save both standard + provider-aware handoff
      const handoff = generateProviderHandoff(sessionState, handoffProvider);
      saveHandoff(handoff as unknown as Parameters<typeof saveHandoff>[0], handoffCwd);
      pruneHandoffs(handoffCwd, 10);
    } catch {
      // continuity is best-effort — never block pipeline completion
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[pipeline] error in pipeline step: ${message}`);
    run.result = { status: 'error', error: message };
    run.verification = { ok: false, notes: [message] };
    if (run.context) _incrementFailureCache(prompt);
    run.completedAt = Date.now();
    return { success: false, gateFailure: 'error', reason: message, run };
  }

  run.completedAt = Date.now();

  // Return both new-style and legacy-compatible shapes
  return {
    success: true,
    run,
    headJudgment: run.headJudgment,
    projectBrief: run.projectBrief,
    contradictions: run.contradictions,
    promptAnalysis: run.promptAnalysis,
    environment: run.environment,
    modelSuggestion: run.modelSuggestion,
    thinkResult: run.thinkResult,
    decisionPreflight: run.decisionPreflight,
    checkpoint: run.checkpoint,
    collaboration: run.collaboration,
    plan: run.plan,
    result: run.result,
    verification: run.verification,
  };
}
