import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore — diagnostic-companion.mjs not yet migrated
import { readDiagnosticNoticings } from '../hooks/diagnostic-companion.mjs';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const STATE_FILE = join(STATE_DIR, 'head-state.json');

// ═══════════════════════════════════════════════════════════════════════════
//  HEAD — Cognitive Judgment Pipeline
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────────────────────────

export interface TaskShape {
  type: string;
  scope: 'small' | 'medium' | 'large';
  risk: 'low' | 'medium' | 'high' | 'critical';
  reversibility: 'easy' | 'moderate' | 'hard';
  ambiguity: 'low' | 'medium' | 'high';
  riskSignals: string[];
  ambiguitySignals: string[];
}

export interface Material {
  touchedFiles: string[];
  fragileAreas: Array<{ file: string; reason: string }>;
  existingPatterns: string[];
  value: 'low' | 'medium' | 'high';
  userOwnedChanges: string[];
}

export interface Relationship {
  shouldAsk: boolean;
  likelyMismatch: boolean;
  wrongAssumption: boolean;
}

export interface ModeResult {
  primary: string;
  confidence: number;
  scores: Record<string, number>;
  signals: string[];
}

export interface SituationModel {
  raw: string;
  explicitAsk: string;
  inferredGoal: string | null;
  urgency: 'low' | 'medium' | 'high';
  isQuestion: boolean;
  isShort: boolean;
  taskShape: TaskShape;
  material: Material;
  relationship: Relationship;
  mode: ModeResult;
  ambiguity: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high' | 'critical';
  reversibility: 'easy' | 'moderate' | 'hard';
  scope: 'small' | 'medium' | 'large';
  novelty: string;
  materialValue: 'low' | 'medium' | 'high';
  userStress: string;
  contextVolatility: string;
  priorFailures: number;
}

export interface UncertaintyEntry {
  claim: string;
  confidence: number;
  basis: string;
  wouldChangeIf: string;
}

export interface ConfidenceSummary {
  level: 'sufficient' | 'partial' | 'insufficient';
  score: number;
  gaps: string[];
  blockers?: Array<{ claim: string; wouldResolve: string }>;
  entryCount?: number;
}

export interface Obligation {
  priority: 'critical' | 'high' | 'medium';
  description: string;
  type: string;
  trigger: string;
}

export interface Noticing {
  type: string;
  severity: 'low' | 'medium' | 'high';
  observation: string;
  shouldSurface: boolean;
}

export interface Action {
  type: string;
  mode: string;
  fitness?: number;
}

export interface DeliberationResult {
  depth: string;
  action: Action;
  rationale: string;
  confidence: ConfidenceSummary;
  obligations: Obligation[];
  surfaceNoticings: Noticing[];
  shouldAskUser: boolean;
  uncertainties: string[];
}

export interface TurnHistory {
  count: number;
  lastActions: string[];
  failureStreak: number;
  sameActionCount: number;
  avgConfidence?: number;
}

export interface HeadState {
  sessionId: string;
  declaredGoal: string | null;
  originalScope: number | null;
  turns: Array<{
    timestamp: number;
    depth: string;
    action: string;
    confidence: number;
    obligationCount: number;
    noticingCount: number;
  }>;
  dispatches: Array<{
    ts: number;
    type: string;
    objective: string;
    outcome: string;
    durationMs: number;
  }>;
  contextEstimate: { messages: number; estimatedTokens: number };
  lastActivity: number;
  created: number;
}

export interface ProcessTurnOutput {
  situation: SituationModel;
  depth: string;
  uncertainties: UncertaintyEntry[];
  obligations: Obligation[];
  noticings: Noticing[];
  result: DeliberationResult;
  shouldAskUser: boolean;
  shouldDispatch: boolean;
  shouldClarify: boolean;
  shouldThink: boolean;
  action: Action;
  rationale: string;
}

interface DepthSignals {
  ambiguity?: string;
  risk?: string;
  reversibility?: string;
  scope?: string;
  priorFailures?: number;
  novelty?: string;
  materialValue?: string;
  userStress?: string;
  contextVolatility?: string;
  taskShape?: { type?: string };
  type?: string;
}

interface Context {
  files?: string[];
  recentFiles?: string[];
  priorFailures?: number;
  patterns?: string[];
  uncommittedFiles?: string[];
  novelty?: string;
  volatility?: string;
  staleContext?: boolean;
  contextAge?: string;
  recentFailures?: unknown[];
  hasTests?: Record<string, boolean>;
  opportunities?: string[];
  _priorWasProposal?: boolean;
  _isFirstTurn?: boolean;
  [key: string]: unknown;
}

// ── Values: these shape judgment, not rules to check ────────────────────────

export const HEAD_VALUES: Record<string, string> = {
  selfHonesty:    'Say what you don\'t know. Never dress up guesses as facts.',
  materialCare:   'The user\'s code, context, and time are precious. Don\'t waste them.',
  curiosity:      'Notice what\'s off. Ask what you\'re not seeing.',
  strategicPace:  'Know when to act fast and when to slow down.',
  proactivity:    'Surface things the user should know, but only when it matters.',
  restraint:      'Can do ≠ should do. Permission ≠ wisdom.',
  honesty:        'Be honest about the material — its quality, risks, and gaps.',
  consideration:  'Think about the user\'s actual situation, not the abstract task.',
};

// ── Depth assessment: how much cognition does this deserve? ─────────────────

interface DepthSignalConfig {
  weight: number;
  test: (s: DepthSignals) => string | undefined;
}

const DEPTH_SIGNALS: Record<string, DepthSignalConfig> = {
  ambiguity:          { weight: 3, test: (s) => s.ambiguity },
  risk:               { weight: 4, test: (s) => s.risk },
  irreversibility:    { weight: 4, test: (s) => s.reversibility === 'hard' ? 'high' : s.reversibility === 'moderate' ? 'medium' : 'low' },
  scope:              { weight: 2, test: (s) => s.scope === 'large' ? 'high' : s.scope === 'medium' ? 'medium' : 'low' },
  priorFailures:      { weight: 3, test: (s) => (s.priorFailures || 0) >= 2 ? 'high' : (s.priorFailures || 0) >= 1 ? 'medium' : 'low' },
  novelty:            { weight: 2, test: (s) => s.novelty },
  materialValue:      { weight: 3, test: (s) => s.materialValue },
  userStress:         { weight: 2, test: (s) => s.userStress },
  contextVolatility:  { weight: 1, test: (s) => s.contextVolatility },
};

const LEVEL_SCORES: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Assess how much deliberation this situation deserves.
 * Returns 'reflexive' | 'light' | 'full' | 'deep'
 */
export function assessDepth(signals: DepthSignals): 'reflexive' | 'light' | 'full' | 'deep' {
  let score = 0;
  for (const [, cfg] of Object.entries(DEPTH_SIGNALS)) {
    const level = cfg.test(signals) || 'low';
    score += (LEVEL_SCORES[level] || 0) * cfg.weight;
  }

  // Task type floor: work requests are never reflexive
  const taskType = signals.taskShape?.type || signals.type;
  const isWorkRequest = ['edit', 'debug', 'review', 'research'].includes(taskType || '');
  if (isWorkRequest && score < 3) score = 3;

  if (score <= 2)  return 'reflexive';
  if (score <= 8)  return 'light';
  if (score <= 18) return 'full';
  return 'deep';
}

// ── SituationModel: what's happening ────────────────────────────────────────

/**
 * Build a situation model from user input and context.
 */
export function perceive(message: string, context: Context = {}): SituationModel {
  const words = message.trim().split(/\s+/);
  const isQuestion = /\?\s*$/.test(message.trim());
  const isShort = words.length <= 5;

  const taskShape = _inferTaskShape(message, context);
  const inferredGoal = _inferGoal(message, context);
  const urgency = _assessUrgency(message, context);
  const material = _assessMaterial(message, context);
  const relationship = _assessRelationship(message, context, taskShape);
  const mode = detectMode(message, context);

  return {
    raw: message,
    explicitAsk: message.trim(),
    inferredGoal,
    urgency,
    isQuestion,
    isShort,
    taskShape,
    material,
    relationship,
    mode,
    ambiguity: taskShape.ambiguity,
    risk: taskShape.risk,
    reversibility: taskShape.reversibility,
    scope: taskShape.scope,
    novelty: context.novelty || 'low',
    materialValue: material.value,
    userStress: urgency === 'high' ? 'high' : 'low',
    contextVolatility: context.volatility || 'low',
    priorFailures: context.priorFailures || 0,
  };
}

// ── Mode Sensing ────────────────────────────────────────────────────────────

const MODE_EXECUTE_WORDS = /^(go|do it|ship it|fix it|run it|push|merge|deploy|yes|ok do it|lets go|make it|just do it|ship|publish)$/i;
const MODE_IDEATE_WORDS = /\b(what if|imagine|wouldn't it be|picture this|feels like|i feel like|sort of like|wild idea|crazy thought|could we maybe|vibe)\b/i;
const MODE_EXPLORE_WORDS = /\b(how does|what is|where is|why does|explain|walk me through|show me|tell me about|i don't understand|new to)\b/i;
const MODE_DISCUSS_WORDS = /\b(what do you think|should we|tradeoffs?|pros and cons|is it better|alternatively|option|or should|concerns?|worry|weigh)\b/i;
const MODE_WORK_SIGNALS = /(`[^`]+`|\.mjs|\.ts|\.js|\.py|src\/|hooks\/|bin\/|\bfunction\b|\bclass\b|\bimport\b)/;

/**
 * Detect user's conversational mode from message signals.
 */
export function detectMode(message: string, context: Context = {}): ModeResult {
  const scores: Record<string, number> = { execute: 0, ideate: 0, work: 0, explore: 0, discuss: 0 };
  const signals: string[] = [];
  const words = message.trim().split(/\s+/);
  const len = words.length;

  // ── Length signal
  if (len <= 4) { scores.execute += 3; signals.push('very-short'); }
  else if (len <= 10) { scores.execute += 1; scores.work += 1; }
  else if (len >= 80) { scores.ideate += 2; signals.push('long-message'); }
  else if (len >= 40) { scores.ideate += 1; scores.discuss += 1; }

  // ── Lexical signals
  if (MODE_EXECUTE_WORDS.test(message.trim())) { scores.execute += 4; signals.push('execute-word'); }
  if (MODE_IDEATE_WORDS.test(message)) { scores.ideate += 3; signals.push('ideate-word'); }
  if (MODE_EXPLORE_WORDS.test(message)) { scores.explore += 3; signals.push('explore-word'); }
  if (MODE_DISCUSS_WORDS.test(message)) { scores.discuss += 4; signals.push('discuss-word'); }

  // ── Specificity signal
  const specificityMatches = message.match(MODE_WORK_SIGNALS);
  if (specificityMatches) {
    scores.work += 2;
    signals.push('has-specifics');
    if (/\b(add|change|update|refactor|fix|remove|rename|move)\b/i.test(message)) {
      scores.work += 2;
      signals.push('specific-action');
    }
  }

  // ── Punctuation signal
  const questionMarks = (message.match(/\?/g) || []).length;
  if (questionMarks >= 2) { scores.discuss += 2; scores.explore += 1; signals.push('multi-question'); }
  else if (questionMarks === 1 && len > 5) { scores.explore += 1; scores.discuss += 1; }

  if (/\.{3}|—|–/.test(message)) { scores.ideate += 1; signals.push('ellipsis-dash'); }
  if (/\b(maybe|might|could|perhaps|wonder)\b/i.test(message)) { scores.ideate += 1; scores.discuss += 1; signals.push('hedging'); }

  // ── Contextual signals
  if (context._priorWasProposal && len <= 15) { scores.execute += 2; signals.push('post-proposal-short'); }
  if (context._isFirstTurn) { scores.explore += 1; scores.discuss += 1; }

  // ── Anti-signals
  if (/^go on\b|^keep going/i.test(message.trim())) {
    scores.execute -= 3;
    scores.discuss += 2;
  }
  if (/^(actually|wait|hold on|hang on)/i.test(message.trim()) && questionMarks > 0) {
    scores.execute -= 2;
    scores.discuss += 3;
    signals.push('pumping-brakes');
  }
  if (/what if.*(break|fail|crash|error)/i.test(message)) {
    scores.ideate -= 2;
    scores.work += 2;
  }
  if (/could we.*(refactor|change|update)/i.test(message) && specificityMatches) {
    scores.ideate -= 2;
    scores.work += 2;
  }

  // ── Resolve
  for (const k of Object.keys(scores)) { if (scores[k] < 0) scores[k] = 0; }

  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [primary, primaryScore] = sorted[0];
  const confidence = primaryScore / total;

  if (confidence < 0.35 && scores.execute > 0 && scores.discuss <= 1 && scores.ideate <= 1) {
    return { primary: 'execute', confidence: 0.4, scores, signals: [...signals, 'low-confidence-action-bias'] };
  }

  return { primary, confidence, scores, signals };
}

function _inferTaskShape(message: string, context: Context): TaskShape {
  const lower = message.toLowerCase();

  const files = context.files || [];
  const dirCount = files.filter(f => f.endsWith('/') || !f.includes('.')).length;
  const fileCount = files.length + (dirCount * 4);
  const scope: TaskShape['scope'] = fileCount > 5 ? 'large' : fileCount > 2 ? 'medium' : lower.length > 500 ? 'medium' : 'small';

  const riskSignals: string[] = [];
  if (/\b(auth|secret|token|credential|password|key|session|permission)\b/i.test(message)) riskSignals.push('security-adjacent');
  if (/\b(delete|remove|drop|destroy|reset|force|wipe)\b/i.test(message)) riskSignals.push('destructive-language');
  if (/\b(deploy|publish|push|release|ship|migrate)\b/i.test(message)) riskSignals.push('external-effect');
  if (/\b(database|db|schema|migration|table)\b/i.test(message)) riskSignals.push('data-mutation');
  if ((context.priorFailures || 0) >= 2) riskSignals.push('repeated-failure');

  const risk: TaskShape['risk'] = riskSignals.length >= 3 ? 'critical'
    : riskSignals.length >= 2 ? 'high'
    : riskSignals.length >= 1 ? 'medium'
    : 'low';

  const hasDestructive = riskSignals.includes('destructive-language') || riskSignals.includes('external-effect');
  const reversibility: TaskShape['reversibility'] = hasDestructive ? 'hard' : riskSignals.includes('data-mutation') ? 'moderate' : 'easy';

  const ambiguitySignals: string[] = [];
  if (/\b(maybe|might|could|should we|not sure|thinking about|what if|somehow)\b/i.test(message)) ambiguitySignals.push('hedging-language');
  if (/\b(or|versus|vs|either|option|alternative)\b/i.test(message)) ambiguitySignals.push('considering-alternatives');
  if (message.split('?').length > 2) ambiguitySignals.push('multiple-questions');
  if (!context.files?.length && /\b(it|this|that|these|those)\b/i.test(message) && !context.recentFiles?.length && !/\?\s*$/.test(message.trim())) ambiguitySignals.push('vague-reference');
  if (/\b(everything|all|entire|whole|every)\b/i.test(message)) ambiguitySignals.push('unbounded-scope');
  if (/\b(better|improve|enhance|optimize|clean up)\b/i.test(message) && !context.files?.length) ambiguitySignals.push('vague-goal');

  const ambiguity: TaskShape['ambiguity'] = ambiguitySignals.length >= 2 ? 'high' : ambiguitySignals.length >= 1 ? 'medium' : 'low';

  let type = 'unknown';
  if (/\b(what|where|which|how many|show|list|find|search|explain|tell me)\b/i.test(message) || /\?\s*$/.test(message.trim())) type = 'answer';
  if (/\b(fix|bug|error|broken|crash|fail|issue|wrong)\b/i.test(message)) type = 'debug';
  if (/\b(build|create|add|implement|write|make|new)\b/i.test(message)) type = 'edit';
  if (/\b(review|check|audit|look at|inspect)\b/i.test(message)) type = 'review';
  if (/\b(research|investigate|explore|understand|dig into)\b/i.test(message)) type = 'research';
  if (/\b(plan|design|architect|strategy|approach|think about|brainstorm)\b/i.test(message)) type = 'plan';
  if (/\b(refactor|clean|reorganize|restructure|simplify)\b/i.test(message)) type = 'edit';

  return { type, scope, risk, reversibility, ambiguity, riskSignals, ambiguitySignals };
}

function _inferGoal(message: string, context: Context): string | null {
  if (/fix.*(test|spec)/i.test(message) && context.recentFailures?.length) {
    return 'May need to fix source code, not just tests';
  }
  if (/\b(make it work|just work|get it working)\b/i.test(message)) {
    return 'Vague success criteria — needs clarification on what "working" means';
  }
  if (/\b(do everything|all of it|everything)\b/i.test(message)) {
    return 'Unbounded scope — needs prioritization';
  }
  return null;
}

function _assessUrgency(message: string, context: Context): 'low' | 'medium' | 'high' {
  if (/\b(asap|urgent|now|immediately|hurry|quick|fast)\b/i.test(message)) return 'high';
  if (/\b(when you get a chance|no rush|whenever|eventually)\b/i.test(message)) return 'low';
  if ((context.priorFailures || 0) >= 2) return 'high';
  return 'medium';
}

function _assessMaterial(message: string, context: Context): Material {
  const touchedFiles = context.files || [];
  const fragileAreas: Array<{ file: string; reason: string }> = [];
  const existingPatterns = context.patterns || [];

  for (const f of touchedFiles) {
    if (/auth|session|token|secret|credential/i.test(f)) fragileAreas.push({ file: f, reason: 'security-sensitive' });
    if (/migration|schema|database/i.test(f)) fragileAreas.push({ file: f, reason: 'data-layer' });
    if (/config|env|settings/i.test(f)) fragileAreas.push({ file: f, reason: 'configuration' });
  }

  const value: Material['value'] = fragileAreas.length >= 2 ? 'high'
    : fragileAreas.length >= 1 ? 'medium'
    : touchedFiles.length > 5 ? 'medium'
    : 'low';

  return {
    touchedFiles,
    fragileAreas,
    existingPatterns,
    value,
    userOwnedChanges: context.uncommittedFiles || [],
  };
}

function _assessRelationship(message: string, context: Context, taskShape: TaskShape): Relationship {
  const shouldAsk = taskShape.ambiguity === 'high'
    || taskShape.risk === 'critical'
    || taskShape.reversibility === 'hard'
    || (taskShape.scope === 'large' && taskShape.ambiguity !== 'low');

  const likelyMismatch = !!(
    (taskShape.type === 'debug' && (context.priorFailures || 0) >= 2)
    || (taskShape.ambiguity === 'high' && taskShape.risk !== 'low')
  );

  const wrongAssumption = !!(
    context.staleContext
    || ((context.priorFailures || 0) >= 2 && taskShape.type === 'debug')
  );

  return { shouldAsk, likelyMismatch, wrongAssumption };
}

// ── UncertaintyLedger: what HEAD knows vs doesn't ──────────────────────────

/**
 * Build an uncertainty ledger from the situation model.
 */
export function assessUncertainty(situation: SituationModel, context: Context = {}): UncertaintyEntry[] {
  let score = 0.8;
  let blocker: string | null = null;
  let shouldVerify = false;

  if (situation.taskShape.ambiguity === 'high') score -= 0.3;
  else if (situation.taskShape.ambiguity === 'medium') score -= 0.1;

  if (situation.priorFailures >= 2) { score -= 0.3; blocker = 'Repeated failures suggest wrong approach'; }
  else if (situation.priorFailures >= 1) score -= 0.15;

  if (situation.material.fragileAreas.length > 0) { score -= 0.15; shouldVerify = true; }
  if (situation.taskShape.scope === 'large') { score -= 0.1; shouldVerify = true; }
  if (!situation.material.touchedFiles.length && situation.taskShape.type === 'edit') { score -= 0.2; blocker = blocker || 'No files identified for edit task'; }
  if (context.contextAge === 'stale') score -= 0.2;
  if (situation.inferredGoal) score -= 0.15;

  score = Math.max(0.1, Math.min(1.0, score));

  return [{
    claim: blocker || 'Task assessment',
    confidence: score,
    basis: `score=${score.toFixed(2)}`,
    wouldChangeIf: blocker ? 'Different approach tried' : 'n/a',
  }];
}

/**
 * Overall confidence from the uncertainty ledger.
 */
export function summarizeConfidence(ledger: UncertaintyEntry[]): ConfidenceSummary {
  if (ledger.length === 0) return { level: 'sufficient', score: 0.8, gaps: [] };

  const avg = ledger.reduce((sum, e) => sum + e.confidence, 0) / ledger.length;
  const gaps = ledger.filter(e => e.confidence < 0.5);
  const blockers = ledger.filter(e => e.confidence < 0.3);

  return {
    level: blockers.length > 0 ? 'insufficient' : gaps.length > 0 ? 'partial' : 'sufficient',
    score: Math.round(avg * 100) / 100,
    gaps: gaps.map(g => g.claim),
    blockers: blockers.map(b => ({ claim: b.claim, wouldResolve: b.wouldChangeIf })),
    entryCount: ledger.length,
  };
}

// ── CareObligations: what HEAD is responsible for ──────────────────────────

const OBLIGATION_TYPES: Record<string, { priority: 'critical' | 'high' | 'medium'; description: string }> = {
  preserveWork:     { priority: 'critical', description: 'Don\'t destroy the user\'s uncommitted work' },
  respectPatterns:  { priority: 'high',     description: 'Follow the codebase\'s existing patterns and conventions' },
  minimizeBlast:    { priority: 'high',     description: 'Keep changes as small and focused as possible' },
  verifyBeforeClaim:{ priority: 'high',     description: 'Don\'t claim success without evidence' },
  askBeforeIrreversi:{ priority: 'critical', description: 'Get permission before irreversible actions' },
  distinguishIntent:{ priority: 'medium',   description: 'Separate what the user asked from what might also be useful' },
  protectSecrets:   { priority: 'critical', description: 'Never expose, log, or transmit secrets' },
  honestLimits:     { priority: 'high',     description: 'Admit when you don\'t know or aren\'t sure' },
  contextCare:      { priority: 'medium',   description: 'Be economical with context — don\'t waste tokens on ceremony' },
  timingAwareness:  { priority: 'medium',   description: 'Sense whether now is the right time to surface something' },
};

/**
 * Derive which care obligations are active given the current situation.
 */
export function deriveObligations(situation: SituationModel): Obligation[] {
  const active: Obligation[] = [];

  // Always active
  active.push({ ...OBLIGATION_TYPES.protectSecrets, type: 'protectSecrets', trigger: 'always' });
  active.push({ ...OBLIGATION_TYPES.honestLimits, type: 'honestLimits', trigger: 'always' });
  active.push({ ...OBLIGATION_TYPES.contextCare, type: 'contextCare', trigger: 'always' });

  if (situation.material.userOwnedChanges?.length > 0) {
    active.push({ ...OBLIGATION_TYPES.preserveWork, type: 'preserveWork', trigger: `${situation.material.userOwnedChanges.length} uncommitted files` });
  }

  if (situation.material.existingPatterns?.length > 0) {
    active.push({ ...OBLIGATION_TYPES.respectPatterns, type: 'respectPatterns', trigger: `${situation.material.existingPatterns.length} existing patterns detected` });
  }

  if (situation.taskShape.scope !== 'small' || situation.taskShape.risk !== 'low') {
    active.push({ ...OBLIGATION_TYPES.minimizeBlast, type: 'minimizeBlast', trigger: `scope=${situation.taskShape.scope}, risk=${situation.taskShape.risk}` });
  }

  if (situation.taskShape.type === 'edit' || situation.taskShape.type === 'debug') {
    active.push({ ...OBLIGATION_TYPES.verifyBeforeClaim, type: 'verifyBeforeClaim', trigger: `task type: ${situation.taskShape.type}` });
  }

  if (situation.taskShape.reversibility === 'hard' || situation.taskShape.risk === 'critical') {
    active.push({ ...OBLIGATION_TYPES.askBeforeIrreversi, type: 'askBeforeIrreversi', trigger: `reversibility=${situation.taskShape.reversibility}, risk=${situation.taskShape.risk}` });
  }

  if (situation.inferredGoal) {
    active.push({ ...OBLIGATION_TYPES.distinguishIntent, type: 'distinguishIntent', trigger: `inferred goal differs: "${situation.inferredGoal}"` });
  }

  return active;
}

// ── Turn history query ────────────────────────────────────────────────────────

export function queryRecentTurns(state: HeadState, n = 3): TurnHistory {
  if (!state.turns?.length) return { count: 0, lastActions: [], failureStreak: 0, sameActionCount: 0 };

  const recent = state.turns.slice(-n);
  const lastActions = recent.map(t => t.action);

  const lastAction = lastActions[lastActions.length - 1];
  const sameActionCount = lastActions.filter(a => a === lastAction).length;

  const failureStreak = [...recent].reverse().findIndex(t => t.confidence > 0.6);

  return {
    count: state.turns.length,
    lastActions,
    failureStreak: failureStreak === -1 ? recent.length : failureStreak,
    sameActionCount,
    avgConfidence: recent.reduce((s, t) => s + (t.confidence || 0), 0) / recent.length,
  };
}

// ── Noticings: what HEAD observes passively ─────────────────────────────────

/**
 * Passive observation layer.
 */
export function notice(situation: SituationModel, state: HeadState, context: Context = {}): Noticing[] {
  const noticings: Noticing[] = [];

  const turnHistory = queryRecentTurns(state);
  if (turnHistory.sameActionCount >= 3) {
    noticings.push({
      type: 'self-awareness',
      severity: 'high',
      observation: `Same action "${turnHistory.lastActions[turnHistory.lastActions.length-1]}" repeated ${turnHistory.sameActionCount} times — may be stuck`,
      shouldSurface: true,
    });
  }
  if (turnHistory.failureStreak >= 2) {
    noticings.push({
      type: 'self-awareness',
      severity: 'medium',
      observation: `${turnHistory.failureStreak} turns with low confidence — consider changing approach`,
      shouldSurface: true,
    });
  }

  if ((state as unknown as { declaredGoal?: string }).declaredGoal && situation.inferredGoal && (state as unknown as { declaredGoal: string }).declaredGoal !== situation.inferredGoal) {
    noticings.push({
      type: 'drift',
      severity: 'medium',
      observation: `Started with "${(state as unknown as { declaredGoal: string }).declaredGoal}" but current request implies "${situation.inferredGoal}"`,
      shouldSurface: true,
    });
  }

  if (situation.priorFailures >= 2) {
    noticings.push({
      type: 'pattern',
      severity: 'high',
      observation: `${situation.priorFailures} prior failures — the approach may be wrong, not just the execution`,
      shouldSurface: true,
    });
  }

  for (const area of situation.material.fragileAreas) {
    if (!context.hasTests?.[area.file]) {
      noticings.push({
        type: 'risk',
        severity: 'medium',
        observation: `${area.file} is ${area.reason} but has no test coverage`,
        shouldSurface: situation.taskShape.type === 'edit',
      });
    }
  }

  if (state.contextEstimate?.estimatedTokens > 120_000) {
    const pct = Math.round((state.contextEstimate.estimatedTokens / 200_000) * 100);
    noticings.push({
      type: 'resource',
      severity: state.contextEstimate.estimatedTokens > 160_000 ? 'high' : 'medium',
      observation: `Context is at ~${pct}% capacity — consider wrapping up or handing off`,
      shouldSurface: true,
    });
  }

  if ((state as unknown as { originalScope?: number }).originalScope && situation.material.touchedFiles.length > (state as unknown as { originalScope: number }).originalScope * 2) {
    noticings.push({
      type: 'scope',
      severity: 'medium',
      observation: `Task has grown from ${(state as unknown as { originalScope: number }).originalScope} to ${situation.material.touchedFiles.length} files`,
      shouldSurface: true,
    });
  }

  if (context.contextAge === 'stale') {
    noticings.push({
      type: 'staleness',
      severity: 'medium',
      observation: 'Working from potentially outdated context — files may have changed',
      shouldSurface: situation.taskShape.risk !== 'low',
    });
  }

  if (context.opportunities?.length) {
    for (const opp of context.opportunities.slice(0, 3)) {
      noticings.push({
        type: 'opportunity',
        severity: 'low',
        observation: opp,
        shouldSurface: false,
      });
    }
  }

  if (state.dispatches?.length >= 2) {
    const recent = state.dispatches.slice(-3);
    const failures = recent.filter(d => d.outcome === 'failure');
    if (failures.length >= 2) {
      noticings.push({
        type: 'self-awareness',
        severity: 'high',
        observation: `${failures.length} of last ${recent.length} dispatches failed — approach may need to change`,
        shouldSurface: true,
      });
    }
  }

  // Diagnostic companion
  try {
    const diagnosticNoticings = readDiagnosticNoticings() as Array<{ severity?: string; observation: string }>;
    for (const dn of diagnosticNoticings) {
      noticings.push({
        type: 'diagnostic',
        severity: (dn.severity as Noticing['severity']) || 'medium',
        observation: dn.observation,
        shouldSurface: dn.severity === 'high',
      });
    }
  } catch { /* non-fatal */ }

  return noticings;
}

// ── Deliberation: what HEAD decides to do ──────────────────────────────────

/**
 * Full deliberation pipeline.
 */
export function deliberate(situation: SituationModel, uncertaintyLedger: UncertaintyEntry[], obligations: Obligation[], noticings: Noticing[], state: HeadState): DeliberationResult {
  const depth = assessDepth(situation);
  const confidence = summarizeConfidence(uncertaintyLedger);

  if (depth === 'reflexive' && confidence.level === 'sufficient') {
    return {
      depth,
      action: _reflexiveAction(situation),
      rationale: 'Simple request with sufficient confidence',
      confidence,
      obligations: obligations.filter(o => o.priority === 'critical'),
      surfaceNoticings: [],
      shouldAskUser: false,
      uncertainties: [],
    };
  }

  const surfaceNoticings = noticings.filter(n => {
    if (!n.shouldSurface) return false;
    if (n.type === 'opportunity') return situation.taskShape.type === 'plan';
    if (n.severity === 'high') return true;
    if (n.severity === 'medium' && depth !== 'light') return true;
    return false;
  });

  const shouldAskUser = _shouldAsk(situation, confidence, obligations, depth);
  const candidates = _generateCandidates(situation, confidence, obligations);
  const chosen = _selectAction(candidates, obligations, confidence, situation);
  const rationale = _buildRationale(chosen, situation, confidence, obligations, surfaceNoticings);

  return {
    depth,
    action: chosen,
    rationale,
    confidence,
    obligations: obligations.filter(o => o.priority === 'critical' || o.priority === 'high'),
    surfaceNoticings,
    shouldAskUser,
    uncertainties: confidence.gaps,
  };
}

function _reflexiveAction(situation: SituationModel): Action {
  if (situation.isQuestion && situation.taskShape.type === 'answer') {
    return { type: 'respond', mode: 'direct' };
  }
  if (situation.isShort && /^(yes|y|ok|go|do it|sure|approved)\s*$/i.test(situation.raw.trim())) {
    return { type: 'proceed', mode: 'approved' };
  }
  if (situation.isShort && /^(no|stop|wait|hold)\s*$/i.test(situation.raw.trim())) {
    return { type: 'pause', mode: 'correction' };
  }
  return { type: 'respond', mode: 'direct' };
}

function _shouldAsk(situation: SituationModel, confidence: ConfidenceSummary, obligations: Obligation[], depth: string): boolean {
  if (obligations.some(o => o.type === 'askBeforeIrreversi')) return true;
  if (confidence.blockers && confidence.blockers.length > 0) return true;
  if (situation.relationship.shouldAsk) return true;
  if (depth === 'deep' && confidence.level !== 'sufficient') return true;
  if (situation.relationship.likelyMismatch) return true;
  return false;
}

function _generateCandidates(situation: SituationModel, confidence: ConfidenceSummary, obligations: Obligation[]): Action[] {
  const candidates: Action[] = [];

  if (situation.taskShape.type === 'answer' || situation.taskShape.type === 'research') {
    candidates.push({ type: 'respond', mode: 'direct', fitness: situation.isQuestion ? 0.9 : 0.6 });
  }

  if (['edit', 'debug', 'review'].includes(situation.taskShape.type)) {
    candidates.push({ type: 'dispatch', mode: situation.taskShape.type, fitness: confidence.level === 'sufficient' ? 0.85 : 0.4 });
  }

  if (situation.taskShape.scope !== 'small' || situation.taskShape.ambiguity !== 'low') {
    candidates.push({ type: 'plan', mode: 'structured', fitness: situation.taskShape.ambiguity === 'high' ? 0.9 : 0.6 });
  }

  if (confidence.level === 'insufficient' || situation.relationship.wrongAssumption) {
    candidates.push({ type: 'clarify', mode: 'question', fitness: confidence.level === 'insufficient' ? 0.95 : 0.7 });
  }

  if (situation.taskShape.type === 'plan') {
    candidates.push({ type: 'think', mode: 'architecture', fitness: 0.85 });
  }

  if (situation.isShort && /^(yes|y|ok|go|do it|sure|approved)\s*$/i.test(situation.raw.trim())) {
    candidates.push({ type: 'proceed', mode: 'approved', fitness: 0.95 });
  }

  return candidates;
}

function _selectAction(candidates: Action[], obligations: Obligation[], confidence: ConfidenceSummary, situation: SituationModel): Action {
  if (candidates.length === 0) return { type: 'clarify', mode: 'no-candidates' };

  for (const c of candidates) {
    if (c.type === 'dispatch' && confidence.level !== 'sufficient') {
      c.fitness = (c.fitness || 0) * 0.5;
    }
    if (c.type === 'dispatch' && obligations.some(o => o.type === 'askBeforeIrreversi')) {
      c.fitness = (c.fitness || 0) * 0.3;
    }
    if (c.type === 'plan' && situation.taskShape.scope === 'large') {
      c.fitness = (c.fitness || 0) * 1.3;
    }
    if (c.type === 'clarify' && situation.relationship.likelyMismatch) {
      c.fitness = (c.fitness || 0) * 1.5;
    }
  }

  candidates.sort((a, b) => (b.fitness || 0) - (a.fitness || 0));
  return candidates[0];
}

function _buildRationale(action: Action, situation: SituationModel, confidence: ConfidenceSummary, obligations: Obligation[], noticings: Noticing[]): string {
  const parts: string[] = [];

  parts.push(`Action: ${action.type} (${action.mode})`);

  if (confidence.level !== 'sufficient') {
    parts.push(`Confidence: ${confidence.level} (${confidence.score}) — ${confidence.gaps.length} gap(s)`);
  }

  const criticalObligations = obligations.filter(o => o.priority === 'critical');
  if (criticalObligations.length > 0) {
    parts.push(`Critical obligations: ${criticalObligations.map(o => o.type).join(', ')}`);
  }

  if (noticings.length > 0) {
    parts.push(`Surfacing ${noticings.length} noticing(s)`);
  }

  if (situation.inferredGoal) {
    parts.push(`Note: inferred goal may differ — "${situation.inferredGoal}"`);
  }

  return parts.join('. ');
}

// ── Full turn processor ─────────────────────────────────────────────────────

/**
 * Process a complete turn through the cognitive pipeline.
 */
export function processTurn(state: HeadState, userMessage: string, context: Context = {}): ProcessTurnOutput {
  const situation = perceive(userMessage, context);
  const depth = assessDepth(situation);
  const uncertainties = assessUncertainty(situation, context);
  const obligations = deriveObligations(situation);
  const noticings = notice(situation, state, context);
  const result = deliberate(situation, uncertainties, obligations, noticings, state);

  // Update state
  state.lastActivity = Date.now();
  if (!state.declaredGoal && situation.taskShape.type !== 'answer') {
    state.declaredGoal = situation.explicitAsk.slice(0, 200);
    state.originalScope = situation.material.touchedFiles.length || 1;
  }

  if (!state.turns) state.turns = [];
  state.turns.push({
    timestamp: Date.now(),
    depth: result.depth,
    action: result.action.type,
    confidence: result.confidence.score,
    obligationCount: result.obligations.length,
    noticingCount: result.surfaceNoticings.length,
  });

  saveState(state);

  return {
    situation,
    depth,
    uncertainties,
    obligations,
    noticings,
    result,
    shouldAskUser: result.shouldAskUser,
    shouldDispatch: result.action.type === 'dispatch' || result.action.type === 'proceed',
    shouldClarify: result.action.type === 'clarify',
    shouldThink: result.action.type === 'think' || result.action.type === 'plan',
    action: result.action,
    rationale: result.rationale,
  };
}

// ── State persistence ───────────────────────────────────────────────────────

export function loadState(): HeadState {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as HeadState;
      if (Date.now() - (data.lastActivity || 0) > 30 * 60 * 1000) {
        return freshState();
      }
      return data;
    }
  } catch { /* non-fatal */ }
  return freshState();
}

export function freshState(): HeadState {
  return {
    sessionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    declaredGoal: null,
    originalScope: null,
    turns: [],
    dispatches: [],
    contextEstimate: { messages: 0, estimatedTokens: 0 },
    lastActivity: Date.now(),
    created: Date.now(),
  };
}

export function saveState(state: HeadState): void {
  state.lastActivity = Date.now();
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function recordDispatchOutcome(state: HeadState, outcome: { type?: string; objective?: string; status?: string; durationMs?: number }): void {
  if (!state.dispatches) state.dispatches = [];
  state.dispatches.push({
    ts: Date.now(),
    type: outcome.type || 'unknown',
    objective: (outcome.objective || '').slice(0, 100),
    outcome: outcome.status || 'unknown',
    durationMs: outcome.durationMs || 0,
  });
  if (state.dispatches.length > 10) state.dispatches = state.dispatches.slice(-10);
  saveState(state);
}
