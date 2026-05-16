import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readDiagnosticNoticings } from '../hooks/diagnostic-companion.mjs';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const STATE_FILE = join(STATE_DIR, 'head-state.json');

// ═══════════════════════════════════════════════════════════════════════════
//  HEAD — Cognitive Judgment Pipeline
//
//  Five artifacts flow through every turn:
//    perceive → assess uncertainty → derive obligations → notice → deliberate
//
//  SituationModel:      what's happening (replaces classifyIntent)
//  UncertaintyLedger:   what HEAD knows vs suspects vs lacks (replaces checkConfidence)
//  CareObligations:     what HEAD is responsible for (replaces phase transitions)
//  Noticings:           what HEAD observes passively (replaces detectDrift)
//  DeliberationResult:  what HEAD decides to do and why (replaces processTurn)
// ═══════════════════════════════════════════════════════════════════════════

// ── Values: these shape judgment, not rules to check ────────────────────────

export const HEAD_VALUES = {
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

const DEPTH_SIGNALS = {
  ambiguity:          { weight: 3, test: (s) => s.ambiguity },
  risk:               { weight: 4, test: (s) => s.risk },
  irreversibility:    { weight: 4, test: (s) => s.reversibility === 'hard' ? 'high' : s.reversibility === 'moderate' ? 'medium' : 'low' },
  scope:              { weight: 2, test: (s) => s.scope === 'large' ? 'high' : s.scope === 'medium' ? 'medium' : 'low' },
  priorFailures:      { weight: 3, test: (s) => (s.priorFailures || 0) >= 2 ? 'high' : s.priorFailures >= 1 ? 'medium' : 'low' },
  novelty:            { weight: 2, test: (s) => s.novelty },
  materialValue:      { weight: 3, test: (s) => s.materialValue },
  userStress:         { weight: 2, test: (s) => s.userStress },
  contextVolatility:  { weight: 1, test: (s) => s.contextVolatility },
};

const LEVEL_SCORES = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Assess how much deliberation this situation deserves.
 * Returns 'reflexive' | 'light' | 'full' | 'deep'
 *
 * Reflexive: instant response, no deliberation (simple questions, greetings)
 * Light: quick judgment, check obligations (standard tasks)
 * Full: structured deliberation with uncertainty + obligations (complex/risky)
 * Deep: full pipeline + pause for user input (ambiguous, novel, high-stakes)
 */
export function assessDepth(signals) {
  let score = 0;
  for (const [, cfg] of Object.entries(DEPTH_SIGNALS)) {
    const level = cfg.test(signals) || 'low';
    score += (LEVEL_SCORES[level] || 0) * cfg.weight;
  }

  // Task type floor: work requests are never reflexive
  const taskType = signals.taskShape?.type || signals.type;
  const isWorkRequest = ['edit', 'debug', 'review', 'research'].includes(taskType);
  if (isWorkRequest && score < 3) score = 3;

  if (score <= 2)  return 'reflexive';
  if (score <= 8)  return 'light';
  if (score <= 18) return 'full';
  return 'deep';
}

// ── SituationModel: what's happening ────────────────────────────────────────

/**
 * Build a situation model from user input and context.
 * This replaces classifyIntent — instead of a label, HEAD gets a full picture.
 */
export function perceive(message, context = {}) {
  const words = message.trim().split(/\s+/);
  const isQuestion = /\?\s*$/.test(message.trim());
  const isShort = words.length <= 5;

  // Infer task shape from content, not regex labels
  const taskShape = _inferTaskShape(message, context);

  // Detect what the user is actually asking for vs what they said
  const inferredGoal = _inferGoal(message, context);

  // Detect urgency from language and context
  const urgency = _assessUrgency(message, context);

  // Material awareness — what code/files are relevant
  const material = _assessMaterial(message, context);

  // Relationship signals — should HEAD ask, act, or advise?
  const relationship = _assessRelationship(message, context, taskShape);

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

    // Depth signals for adaptive processing
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

function _inferTaskShape(message, context) {
  const lower = message.toLowerCase();

  // Scope: how big is this?
  const files = context.files || [];
  const dirCount = files.filter(f => f.endsWith('/') || !f.includes('.')).length;
  const fileCount = files.length + (dirCount * 4); // directories imply multiple files
  const scope = fileCount > 5 ? 'large' : fileCount > 2 ? 'medium' : lower.length > 500 ? 'medium' : 'small';

  // Risk: what could go wrong?
  const riskSignals = [];
  if (/\b(auth|secret|token|credential|password|key|session|permission)\b/i.test(message)) riskSignals.push('security-adjacent');
  if (/\b(delete|remove|drop|destroy|reset|force|wipe)\b/i.test(message)) riskSignals.push('destructive-language');
  if (/\b(deploy|publish|push|release|ship|migrate)\b/i.test(message)) riskSignals.push('external-effect');
  if (/\b(database|db|schema|migration|table)\b/i.test(message)) riskSignals.push('data-mutation');
  if (context.priorFailures >= 2) riskSignals.push('repeated-failure');

  const risk = riskSignals.length >= 3 ? 'critical'
    : riskSignals.length >= 2 ? 'high'
    : riskSignals.length >= 1 ? 'medium'
    : 'low';

  // Reversibility: can this be undone?
  const hasDestructive = riskSignals.includes('destructive-language') || riskSignals.includes('external-effect');
  const reversibility = hasDestructive ? 'hard' : riskSignals.includes('data-mutation') ? 'moderate' : 'easy';

  // Ambiguity: how clear is the request?
  const ambiguitySignals = [];
  if (/\b(maybe|might|could|should we|not sure|thinking about|what if|somehow)\b/i.test(message)) ambiguitySignals.push('hedging-language');
  if (/\b(or|versus|vs|either|option|alternative)\b/i.test(message)) ambiguitySignals.push('considering-alternatives');
  if (message.split('?').length > 2) ambiguitySignals.push('multiple-questions');
  if (!context.files?.length && /\b(it|this|that|these|those)\b/i.test(message) && !context.recentFiles?.length && !/\?\s*$/.test(message.trim())) ambiguitySignals.push('vague-reference');
  if (/\b(everything|all|entire|whole|every)\b/i.test(message)) ambiguitySignals.push('unbounded-scope');
  if (/\b(better|improve|enhance|optimize|clean up)\b/i.test(message) && !context.files?.length) ambiguitySignals.push('vague-goal');

  const ambiguity = ambiguitySignals.length >= 2 ? 'high' : ambiguitySignals.length >= 1 ? 'medium' : 'low';

  // Type: what kind of work is this?
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

function _inferGoal(message, context) {
  // When the explicit ask might not match the real need
  const lower = message.toLowerCase();

  // "Fix the tests" when the real problem might be the code, not the tests
  if (/fix.*(test|spec)/i.test(message) && context.recentFailures?.length) {
    return 'May need to fix source code, not just tests';
  }

  // "Make it work" — needs clarification
  if (/\b(make it work|just work|get it working)\b/i.test(message)) {
    return 'Vague success criteria — needs clarification on what "working" means';
  }

  // "Do everything" — scope needs bounding
  if (/\b(do everything|all of it|everything)\b/i.test(message)) {
    return 'Unbounded scope — needs prioritization';
  }

  return null;
}

function _assessUrgency(message, context) {
  if (/\b(asap|urgent|now|immediately|hurry|quick|fast)\b/i.test(message)) return 'high';
  if (/\b(when you get a chance|no rush|whenever|eventually)\b/i.test(message)) return 'low';
  if (context.priorFailures >= 2) return 'high';
  return 'medium';
}

function _assessMaterial(message, context) {
  const touchedFiles = context.files || [];
  const fragileAreas = [];
  const existingPatterns = context.patterns || [];

  // Detect fragile areas from file paths
  for (const f of touchedFiles) {
    if (/auth|session|token|secret|credential/i.test(f)) fragileAreas.push({ file: f, reason: 'security-sensitive' });
    if (/migration|schema|database/i.test(f)) fragileAreas.push({ file: f, reason: 'data-layer' });
    if (/config|env|settings/i.test(f)) fragileAreas.push({ file: f, reason: 'configuration' });
  }

  const value = fragileAreas.length >= 2 ? 'high'
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

function _assessRelationship(message, context, taskShape) {
  // Should HEAD ask before acting?
  const shouldAsk = taskShape.ambiguity === 'high'
    || taskShape.risk === 'critical'
    || taskShape.reversibility === 'hard'
    || (taskShape.scope === 'large' && taskShape.ambiguity !== 'low');

  // Is there likely a mismatch between what was asked and what's needed?
  const likelyMismatch = !!(
    (taskShape.type === 'debug' && context.priorFailures >= 2)
    || (taskShape.ambiguity === 'high' && taskShape.risk !== 'low')
  );

  // Might the user be assuming something wrong?
  const wrongAssumption = !!(
    context.staleContext
    || (context.priorFailures >= 2 && taskShape.type === 'debug')
  );

  return { shouldAsk, likelyMismatch, wrongAssumption };
}

// ── UncertaintyLedger: what HEAD knows vs doesn't ──────────────────────────

/**
 * Build an uncertainty ledger from the situation model.
 * Each entry: a claim, how confident HEAD is, what the evidence is,
 * and what would change HEAD's mind.
 */
export function assessUncertainty(situation, context = {}) {
  let score = 0.8; // default: reasonably confident
  let blocker = null;
  let shouldVerify = false;

  // Confidence drops
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

  // Return same interface summarizeConfidence produces (so callers don't break)
  return [{
    claim: blocker || 'Task assessment',
    confidence: score,
    basis: `score=${score.toFixed(2)}`,
    wouldChangeIf: blocker ? 'Different approach tried' : 'n/a',
  }];
}

/**
 * Overall confidence from the uncertainty ledger.
 * Not a boolean — a nuanced picture.
 */
export function summarizeConfidence(ledger) {
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

const OBLIGATION_TYPES = {
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
export function deriveObligations(situation) {
  const active = [];

  // Always active
  active.push({ ...OBLIGATION_TYPES.protectSecrets, type: 'protectSecrets', trigger: 'always' });
  active.push({ ...OBLIGATION_TYPES.honestLimits, type: 'honestLimits', trigger: 'always' });
  active.push({ ...OBLIGATION_TYPES.contextCare, type: 'contextCare', trigger: 'always' });

  // Conditional obligations
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

export function queryRecentTurns(state, n = 3) {
  if (!state.turns?.length) return { count: 0, lastActions: [], failureStreak: 0, sameActionCount: 0 };

  const recent = state.turns.slice(-n);
  const lastActions = recent.map(t => t.action);

  // Detect same action repeated
  const lastAction = lastActions[lastActions.length - 1];
  const sameActionCount = lastActions.filter(a => a === lastAction).length;

  // Detect failure streak (low confidence runs)
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
 * Runs on every turn — detects things the user hasn't asked about.
 * Noticings are internal. Deliberation decides whether to surface them.
 */
export function notice(situation, state, context = {}) {
  const noticings = [];

  // Self-awareness: detect stuck patterns from turn history
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

  // Drift: are we doing something different from what was discussed?
  if (state.declaredGoal && situation.inferredGoal && state.declaredGoal !== situation.inferredGoal) {
    noticings.push({
      type: 'drift',
      severity: 'medium',
      observation: `Started with "${state.declaredGoal}" but current request implies "${situation.inferredGoal}"`,
      shouldSurface: true,
    });
  }

  // Repeated failure: same approach failing
  if (situation.priorFailures >= 2) {
    noticings.push({
      type: 'pattern',
      severity: 'high',
      observation: `${situation.priorFailures} prior failures — the approach may be wrong, not just the execution`,
      shouldSurface: true,
    });
  }

  // Fragile area being touched without tests
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

  // Context getting large
  if (state.contextEstimate?.estimatedTokens > 120_000) {
    const pct = Math.round((state.contextEstimate.estimatedTokens / 200_000) * 100);
    noticings.push({
      type: 'resource',
      severity: state.contextEstimate.estimatedTokens > 160_000 ? 'high' : 'medium',
      observation: `Context is at ~${pct}% capacity — consider wrapping up or handing off`,
      shouldSurface: true,
    });
  }

  // Scope creep: task growing beyond original ask
  if (state.originalScope && situation.material.touchedFiles.length > state.originalScope * 2) {
    noticings.push({
      type: 'scope',
      severity: 'medium',
      observation: `Task has grown from ${state.originalScope} to ${situation.material.touchedFiles.length} files`,
      shouldSurface: true,
    });
  }

  // Stale assumptions: acting on old information
  if (context.contextAge === 'stale') {
    noticings.push({
      type: 'staleness',
      severity: 'medium',
      observation: 'Working from potentially outdated context — files may have changed',
      shouldSurface: situation.taskShape.risk !== 'low',
    });
  }

  // Opportunity: something useful HEAD noticed
  if (context.opportunities?.length) {
    for (const opp of context.opportunities.slice(0, 3)) {
      noticings.push({
        type: 'opportunity',
        severity: 'low',
        observation: opp,
        shouldSurface: false, // opportunities are internal unless deliberation promotes them
      });
    }
  }


  // Self-awareness: detect repeated dispatch failures
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

  // Diagnostic companion: feed tool-call pattern observations into deliberation
  try {
    const diagnosticNoticings = readDiagnosticNoticings();
    for (const dn of diagnosticNoticings) {
      noticings.push({
        type: 'diagnostic',
        severity: dn.severity || 'medium',
        observation: dn.observation,
        shouldSurface: dn.severity === 'high',
      });
    }
  } catch {}

  return noticings;
}

// ── Deliberation: what HEAD decides to do ──────────────────────────────────

/**
 * Full deliberation pipeline.
 * Produces a structured decision with rationale — not just an action label.
 */
export function deliberate(situation, uncertaintyLedger, obligations, noticings, state) {
  const depth = assessDepth(situation);
  const confidence = summarizeConfidence(uncertaintyLedger);

  // ── Reflexive: instant response, minimal processing
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

  // ── Which noticings to surface?
  const surfaceNoticings = noticings.filter(n => {
    if (!n.shouldSurface) return false;
    // Care obligation: timingAwareness — only surface if it's relevant right now
    if (n.type === 'opportunity') return situation.taskShape.type === 'plan';
    if (n.severity === 'high') return true;
    if (n.severity === 'medium' && depth !== 'light') return true;
    return false;
  });

  // ── Should HEAD ask the user before acting?
  const shouldAskUser = _shouldAsk(situation, confidence, obligations, depth);

  // ── Generate candidate actions
  const candidates = _generateCandidates(situation, confidence, obligations);

  // ── Select best action through obligation-weighted judgment
  const chosen = _selectAction(candidates, obligations, confidence, situation);

  // ── Build rationale
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

function _reflexiveAction(situation) {
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

function _shouldAsk(situation, confidence, obligations, depth) {
  // Obligation-driven: ask before irreversible
  if (obligations.some(o => o.type === 'askBeforeIrreversi')) return true;

  // Confidence-driven: ask when insufficient
  if (confidence.blockers?.length > 0) return true;

  // Relationship-driven: user signals suggest asking
  if (situation.relationship.shouldAsk) return true;

  // Depth-driven: deep deliberation means this is complex enough to check
  if (depth === 'deep' && confidence.level !== 'sufficient') return true;

  // Intent mismatch: what user asked might not be what they need
  if (situation.relationship.likelyMismatch) return true;

  return false;
}

function _generateCandidates(situation, confidence, obligations) {
  const candidates = [];

  // Direct response (answer/explain)
  if (situation.taskShape.type === 'answer' || situation.taskShape.type === 'research') {
    candidates.push({
      type: 'respond',
      mode: 'direct',
      fitness: situation.isQuestion ? 0.9 : 0.6,
    });
  }

  // Dispatch to worker agent
  if (['edit', 'debug', 'review'].includes(situation.taskShape.type)) {
    candidates.push({
      type: 'dispatch',
      mode: situation.taskShape.type,
      fitness: confidence.level === 'sufficient' ? 0.85 : 0.4,
    });
  }

  // Plan first, then dispatch
  if (situation.taskShape.scope !== 'small' || situation.taskShape.ambiguity !== 'low') {
    candidates.push({
      type: 'plan',
      mode: 'structured',
      fitness: situation.taskShape.ambiguity === 'high' ? 0.9 : 0.6,
    });
  }

  // Clarify with user
  if (confidence.level === 'insufficient' || situation.relationship.wrongAssumption) {
    candidates.push({
      type: 'clarify',
      mode: 'question',
      fitness: confidence.level === 'insufficient' ? 0.95 : 0.7,
    });
  }

  // Think/discuss (architecture, design)
  if (situation.taskShape.type === 'plan') {
    candidates.push({
      type: 'think',
      mode: 'architecture',
      fitness: 0.85,
    });
  }

  // Proceed (user gave approval)
  if (situation.isShort && /^(yes|y|ok|go|do it|sure|approved)\s*$/i.test(situation.raw.trim())) {
    candidates.push({
      type: 'proceed',
      mode: 'approved',
      fitness: 0.95,
    });
  }

  return candidates;
}

function _selectAction(candidates, obligations, confidence, situation) {
  if (candidates.length === 0) return { type: 'clarify', mode: 'no-candidates' };

  // Apply obligation penalties
  for (const c of candidates) {
    // Dispatch penalty when confidence is low
    if (c.type === 'dispatch' && confidence.level !== 'sufficient') {
      c.fitness *= 0.5;
    }

    // Dispatch penalty when irreversible and no approval
    if (c.type === 'dispatch' && obligations.some(o => o.type === 'askBeforeIrreversi')) {
      c.fitness *= 0.3;
    }

    // Plan bonus when scope is large
    if (c.type === 'plan' && situation.taskShape.scope === 'large') {
      c.fitness *= 1.3;
    }

    // Clarify bonus when goal is mismatched
    if (c.type === 'clarify' && situation.relationship.likelyMismatch) {
      c.fitness *= 1.5;
    }
  }

  // Sort by fitness, pick best
  candidates.sort((a, b) => b.fitness - a.fitness);
  return candidates[0];
}

function _buildRationale(action, situation, confidence, obligations, noticings) {
  const parts = [];

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
 * This replaces the old processTurn — same interface, fundamentally different internals.
 */
export function processTurn(state, userMessage, context = {}) {
  // 1. Perceive the situation
  const situation = perceive(userMessage, context);

  // 2. Assess depth — how much thinking does this deserve?
  const depth = assessDepth(situation);

  // 3. Build uncertainty ledger
  const uncertainties = assessUncertainty(situation, context);

  // 4. Derive care obligations
  const obligations = deriveObligations(situation);

  // 5. Passive noticing
  const noticings = notice(situation, state, context);

  // 6. Deliberate
  const result = deliberate(situation, uncertainties, obligations, noticings, state);

  // Update state
  state.lastActivity = Date.now();
  if (!state.declaredGoal && situation.taskShape.type !== 'answer') {
    state.declaredGoal = situation.explicitAsk.slice(0, 200);
    state.originalScope = situation.material.touchedFiles.length || 1;
  }

  // Track the turn
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

    // Convenience fields for callers
    shouldAskUser: result.shouldAskUser,
    shouldDispatch: result.action.type === 'dispatch' || result.action.type === 'proceed',
    shouldClarify: result.action.type === 'clarify',
    shouldThink: result.action.type === 'think' || result.action.type === 'plan',
    action: result.action,
    rationale: result.rationale,
  };
}

// ── State persistence ───────────────────────────────────────────────────────

export function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      if (Date.now() - (data.lastActivity || 0) > 30 * 60 * 1000) {
        return freshState();
      }
      return data;
    }
  } catch {}
  return freshState();
}

export function freshState() {
  return {
    sessionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    declaredGoal: null,
    originalScope: null,
    turns: [],
    dispatches: [],  // { ts, type, objective, outcome, durationMs }
    contextEstimate: { messages: 0, estimatedTokens: 0 },
    lastActivity: Date.now(),
    created: Date.now(),
  };
}

export function saveState(state) {
  state.lastActivity = Date.now();
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function recordDispatchOutcome(state, outcome) {
  if (!state.dispatches) state.dispatches = [];
  state.dispatches.push({
    ts: Date.now(),
    type: outcome.type || 'unknown',
    objective: (outcome.objective || '').slice(0, 100),
    outcome: outcome.status || 'unknown', // 'success' | 'failure' | 'partial'
    durationMs: outcome.durationMs || 0,
  });
  // Keep last 10 dispatches only
  if (state.dispatches.length > 10) state.dispatches = state.dispatches.slice(-10);
  saveState(state);
}

// ── Exports ─────────────────────────────────────────────────────────────────
// Core pipeline: perceive, assessUncertainty, deriveObligations, notice, deliberate
// Convenience: processTurn, assessDepth, summarizeConfidence, queryRecentTurns
// State: loadState, freshState, saveState
// Values: HEAD_VALUES
