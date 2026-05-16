// Cognitive Loop — the integration layer that makes HEAD a continuous process.
// Replaces single-shot deliberation with: perceive → plan → predict → dispatch → debrief → replan → ...

import { processTurn, loadState, perceive, assessUncertainty, deriveObligations, notice, deliberate, assessDepth, recordDispatchOutcome } from './head.mjs';
import { planWaves, shouldReplan, replan, estimateWaveCost } from './wave-planner.mjs';
import { parseDebrief, generateDebriefInstruction, integrateDebrief, summarizeWaveOutcome } from './debrief.mjs';
import { predictFailureModes, generatePreventions, scoreDispatchReadiness, evolvePatterns, loadSessionPatterns } from './predictive.mjs';
import { writeDeliberation } from './head-protocol.mjs';
import { check as checkInbox, generateInboxBrief, purge as purgeInbox } from './inbox.mjs';
import * as memoryTiers from './memory-tiers.mjs';
import * as narrative from './narrative.mjs';
import * as simmer from './simmer.mjs';
import { build as buildEnvelope } from './envelope.mjs';
import { acquire as acquireSession, release as releaseSession, isOwner as isSessionOwner } from './session-lock.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Pattern cache ──────────────────────────────────────────────────────────
let _patternsCache = null;
let _patternsCacheTs = 0;
function getCachedPatterns() {
  if (!_patternsCache || Date.now() - _patternsCacheTs > 5000) {
    _patternsCache = loadSessionPatterns();
    _patternsCacheTs = Date.now();
  }
  return _patternsCache;
}

const LOOP_STATE_DIR = join(process.cwd(), '.dualbrain');
const LOOP_STATE_FILE = join(LOOP_STATE_DIR, 'cognitive-loop.json');

// ── Loop state persistence ──────────────────────────────────────────────────

function loadLoopState() {
  try {
    if (existsSync(LOOP_STATE_FILE)) {
      return JSON.parse(readFileSync(LOOP_STATE_FILE, 'utf8'));
    }
  } catch {}
  return freshLoopState();
}

function freshLoopState() {
  return {
    sessionId: Date.now().toString(36),
    activePlan: null,
    completedWaves: [],
    debriefs: [],
    situationHistory: [],
    replans: 0,
    totalDispatches: 0,
    totalTokensEstimated: 0,
  };
}

function saveLoopState(state) {
  mkdirSync(LOOP_STATE_DIR, { recursive: true });
  writeFileSync(LOOP_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── The cognitive loop ──────────────────────────────────────────────────────

/**
 * Entry point: process a user message through the full cognitive loop.
 * Returns a LoopResult that tells the caller exactly what to do next.
 *
 * @param {string} userMessage
 * @param {object} context - { files, recentFiles, priorFailures, uncommittedFiles, etc }
 * @returns {LoopResult}
 */
export function enter(userMessage, context = {}) {
  // Session lock: one HEAD at a time
  const lock = acquireSession();
  if (!lock.acquired) {
    return {
      phase: 'readonly',
      action: { type: 'respond', mode: 'readonly' },
      rationale: `Another session (${lock.existingSession}) is active. This session is read-only to prevent split-brain.`,
      shouldAskUser: false,
      surfaceNoticings: [],
      plan: null,
      nextDispatch: null,
    };
  }

  const headState = loadState();
  const loopState = loadLoopState();

  // Check if we just auto-updated — surface it naturally
  _checkUpdateNotice(context);

  // Immersion: load memory tiers so HEAD is "in the song"
  const memory = memoryTiers.assemble({
    userMessage,
    files: context.files || [],
    intent: context._detectedIntent || null,
  });
  if (memory.combined) {
    context._immersionContext = memory.combined;
  }

  // Check inbox for HEAD before processing
  const inboxBrief = generateInboxBrief('head');
  if (inboxBrief) {
    context._inboxBrief = inboxBrief;
  }

  // Simmer: check for crystallized ideas to surface
  const crystallized = simmer.harvest();
  if (crystallized.length > 0) {
    context._crystallizedIdeas = crystallized.map(i => i.idea);
  }

  // Phase 1: Full cognitive pipeline
  const turn = processTurn(headState, userMessage, context);

  // Save situation for history (includes mode for turn-over-turn tracking)
  const mode = turn.situation?.mode || { primary: 'work', confidence: 0.5 };
  loopState.situationHistory.push({
    ts: Date.now(),
    depth: turn.depth,
    action: turn.action.type,
    confidence: turn.result.confidence.score,
    mode: mode.primary,
  });

  // Surface update notice as a noticing
  if (context._updateNotice) {
    turn.result.surfaceNoticings = turn.result.surfaceNoticings || [];
    turn.result.surfaceNoticings.unshift(context._updateNotice);
  }

  // Narrative evolution: update HEAD's running understanding
  _evolveNarrative(turn, userMessage, context);

  // Simmer: capture any ideas from user message that aren't direct tasks
  _captureSimmerSignals(userMessage, turn);

  // If HEAD says don't dispatch, or it's a "proceed" with no active plan, respond
  if ((!turn.shouldDispatch && !turn.shouldThink) || (turn.action.type === 'proceed' && !loopState.activePlan)) {
    saveLoopState(loopState);
    return {
      phase: 'respond',
      action: turn.action,
      rationale: turn.rationale,
      shouldAskUser: turn.shouldAskUser,
      surfaceNoticings: turn.result.surfaceNoticings,
      plan: null,
      nextDispatch: null,
      mode,
    };
  }

  // Persist deliberation artifact for deliberation-gate hook validation
  try {
    writeDeliberation(userMessage, { situation: turn.situation, result: turn.result });
  } catch (err) {
    // Non-fatal: don't break the loop if deliberation persistence fails
    process.stderr.write(`[cognitive-loop] writeDeliberation failed: ${err?.message?.slice(0, 120)}\n`);
  }

  // Phase 2: Plan waves
  const plan = planWaves(turn, {
    files: context.files || [],
    priorDebriefs: loopState.debriefs,
    diagnosticPatterns: getCachedPatterns(),
  });

  loopState.activePlan = plan;
  saveLoopState(loopState);

  // Phase 3: Prepare first wave for dispatch
  const firstWave = plan.waves[0];
  if (!firstWave) {
    return {
      phase: 'respond',
      action: turn.action,
      rationale: 'Wave planner produced empty plan — falling back to direct response',
      shouldAskUser: true,
      surfaceNoticings: turn.result.surfaceNoticings,
      plan,
      nextDispatch: null,
    };
  }

  const prepared = prepareWave(firstWave, turn, context, loopState);

  // Don't dispatch unready work — return as blocked
  if (prepared.blockers.length > 0 && !prepared.allReady) {
    saveLoopState(loopState);
    return {
      phase: 'blocked',
      action: turn.action,
      rationale: turn.rationale,
      shouldAskUser: true,
      surfaceNoticings: turn.result.surfaceNoticings,
      plan,
      nextDispatch: prepared,
      suggestion: prepared.blockers[0],
      mode,
    };
  }

  return {
    phase: 'dispatch',
    action: turn.action,
    rationale: turn.rationale,
    shouldAskUser: turn.shouldAskUser,
    surfaceNoticings: turn.result.surfaceNoticings,
    plan,
    nextDispatch: prepared,
    estimatedCost: plan.estimatedCost,
    mode,
  };
}

/**
 * Called after a wave completes. Processes debriefs and determines next action.
 *
 * @param {string[]} rawResults - raw output from each agent in the completed wave
 * @param {string} completedWaveId - which wave just finished
 * @param {object} context
 * @returns {LoopResult}
 */
export function advance(rawResults, completedWaveId, context = {}) {
  const loopState = loadLoopState();
  const plan = loopState.activePlan;

  if (!plan) {
    return { phase: 'done', action: { type: 'respond', mode: 'direct' }, rationale: 'No active plan', plan: null, nextDispatch: null };
  }

  // Parse debriefs from raw results
  const debriefs = rawResults.map(r => parseDebrief(r));

  // Track dispatch outcomes in HEAD state for self-awareness
  const headState = loadState();
  for (const d of debriefs) {
    recordDispatchOutcome(headState, { type: d.artifacts?.tier || 'execute', objective: completedWaveId, status: d.status, durationMs: 0 });
  }

  const waveSummary = summarizeWaveOutcome(debriefs);
  // Bridge field names between debrief (scopeDelta) and wave-planner (scopeChange)
  waveSummary.scopeChange = waveSummary.scopeDelta;
  waveSummary.confidence = waveSummary.aggregateConfidence;
  waveSummary.blockers = waveSummary.allBlockers;

  // Record
  loopState.debriefs.push(...debriefs);
  loopState.completedWaves.push(completedWaveId);

  // Evolve prediction accuracy
  const predictions = loopState._lastPredictions || [];
  for (const d of debriefs) {
    evolvePatterns(d, predictions);
  }

  // Post-wave verbal reflection (Reflexion pattern)
  _postWaveReflection(waveSummary, loopState);

  // Check if we need to replan
  const needsReplan = shouldReplan(plan, waveSummary);

  let activePlan = plan;
  if (needsReplan) {
    // Integrate each debrief into situation progressively
    let updatedSituation = loopState.situationHistory[loopState.situationHistory.length - 1] || {};
    for (const d of debriefs) {
      updatedSituation = integrateDebrief(updatedSituation, d);
    }

    activePlan = replan(plan, waveSummary, { situation: updatedSituation, result: { depth: plan._depth || 'full' } });
    loopState.activePlan = activePlan;
    loopState.replans++;
  }

  // Find next wave to dispatch
  const nextWave = activePlan.waves.find(w => !loopState.completedWaves.includes(w.id));

  if (!nextWave) {
    // All waves done — synthesize
    const finalSummary = summarizeWaveOutcome(loopState.debriefs);

    // Clean expired inbox messages now that all work is complete
    try { purgeInbox(); } catch { /* non-fatal */ }

    saveLoopState(loopState);
    return {
      phase: 'done',
      action: { type: 'synthesize', mode: 'complete' },
      rationale: `All ${loopState.completedWaves.length} waves complete. ${loopState.replans} replan(s).`,
      plan: activePlan,
      nextDispatch: null,
      waveSummary: finalSummary,
      replanned: needsReplan,
    };
  }

  // Check gate condition
  if (nextWave.gateCondition) {
    const gateMet = evaluateGate(nextWave.gateCondition, waveSummary, loopState);
    if (!gateMet) {
      saveLoopState(loopState);
      return {
        phase: 'gated',
        action: { type: 'pause', mode: 'gate-unmet' },
        rationale: `Gate condition not met: ${nextWave.gateCondition}`,
        plan: activePlan,
        nextDispatch: null,
        waveSummary,
        gateCondition: nextWave.gateCondition,
      };
    }
  }

  // Prepare next wave
  const lastDeliberation = { situation: context, result: { depth: activePlan._depth || 'full' } };
  const prepared = prepareWave(nextWave, lastDeliberation, { ...context, priorDebriefs: loopState.debriefs }, loopState);

  saveLoopState(loopState);

  return {
    phase: 'dispatch',
    action: { type: 'dispatch', mode: nextWave.phase },
    rationale: `Wave ${loopState.completedWaves.length + 1}/${activePlan.waves.length}: ${nextWave.phase}`,
    plan: activePlan,
    nextDispatch: prepared,
    waveSummary,
    replanned: needsReplan,
  };
}

/**
 * Prepare a wave for dispatch: run predictions, generate preventions, check readiness.
 */
function prepareWave(wave, deliberation, context, loopState) {
  const agents = wave.agents.map(agentSpec => {
    // Predict failure modes for this agent
    const predictions = predictFailureModes(agentSpec, {
      priorDebriefs: context.priorDebriefs || [],
      diagnosticPatterns: getCachedPatterns(),
      files: context.files || [],
    });

    // Generate prevention instructions
    const preventions = generatePreventions(predictions);

    // Generate debrief instruction
    const debriefInstruction = generateDebriefInstruction(agentSpec.tier, {
      objective: agentSpec.objective,
      scope: agentSpec.scope,
    });

    // Score readiness
    const readiness = scoreDispatchReadiness(agentSpec, { waves: [wave] }, predictions);

    // Check inbox for messages relevant to this worker tier
    const workerInbox = generateInboxBrief(`worker:${agentSpec.tier}`);

    return {
      ...agentSpec,
      preventions,
      debriefInstruction,
      readiness,
      predictions,
      prompt: buildAgentPrompt(agentSpec, preventions, debriefInstruction, workerInbox),
    };
  });

  // Store predictions for later evolution
  loopState._lastPredictions = agents.flatMap(a => a.predictions);

  return {
    waveId: wave.id,
    phase: wave.phase,
    parallel: wave.parallel,
    agents,
    allReady: agents.every(a => a.readiness.ready),
    blockers: agents.flatMap(a => a.readiness.blockers),
    warnings: agents.flatMap(a => a.readiness.warnings),
  };
}

/**
 * Build the full prompt for an agent using dispatch envelopes.
 * Workers get understanding (prose preamble), not just instructions.
 */
function buildAgentPrompt(agentSpec, preventions, debriefInstruction, inboxBrief) {
  const envelope = buildEnvelope(agentSpec, {
    preventions,
    debriefInstruction,
    inboxBrief,
  });
  return envelope.full;
}

/**
 * Evaluate a wave gate condition against the current state.
 */
function evaluateGate(condition, waveSummary, loopState) {
  const lower = condition.toLowerCase();

  if (lower.includes('confidence') && lower.includes('above')) {
    const threshold = parseFloat(condition.match(/[\d.]+/)?.[0] || '0.5');
    return (waveSummary.aggregateConfidence || 0) >= threshold;
  }

  if (lower.includes('no blocker')) {
    return (waveSummary.allBlockers || []).length === 0;
  }

  if (lower.includes('scope confirmed')) {
    return waveSummary.scopeDelta === 'same' || waveSummary.scopeDelta === 'smaller';
  }

  // Default: gate passes
  return true;
}

// ── Immersion helpers ──────────────────────────────────────────────────────

/**
 * Evolve HEAD's running narrative after processing a turn.
 * Captures: what happened, what was decided, what the user cared about.
 */
function _evolveNarrative(turn, userMessage, context) {
  const parts = [];

  // What the user said (compressed)
  const userSnippet = userMessage.length > 120 ? userMessage.slice(0, 120) + '...' : userMessage;
  parts.push(`User: "${userSnippet}"`);

  // What HEAD decided
  const action = turn.action;
  if (action.type === 'dispatch') {
    parts.push(`Decision: dispatch ${action.mode || 'work'} (confidence: ${turn.result.confidence.score})`);
  } else if (action.type === 'respond') {
    parts.push(`Decision: respond directly (${turn.depth} depth)`);
  } else if (action.type === 'clarify') {
    parts.push(`Decision: need clarification`);
  }

  // Noticings worth remembering
  if (turn.result.surfaceNoticings?.length) {
    parts.push(`Noticed: ${turn.result.surfaceNoticings.join('; ')}`);
  }

  // Crystallized simmer items surfaced this turn
  if (context._crystallizedIdeas?.length) {
    parts.push(`Crystallized ideas surfaced: ${context._crystallizedIdeas.join('; ')}`);
  }

  narrative.evolve(parts.join('. '));
}

/**
 * Capture signals from user message that might be simmer-worthy.
 * Looks for: analogies, "what if" ideas, vague suggestions, meta-observations.
 */
function _captureSimmerSignals(userMessage, turn) {
  const lower = userMessage.toLowerCase();

  // Skip short/command messages
  if (userMessage.length < 30) return;

  // Detect idea-like patterns
  const ideaPatterns = [
    /what if (.{10,80})/i,
    /maybe (?:we |it |this )(.{10,80})/i,
    /i feel like (.{10,80})/i,
    /(?:like|similar to) (.{10,80}?)(?: - | — |\.|\?|$)/i,
    /consider (.{10,80})/i,
  ];

  for (const pattern of ideaPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      simmer.add(match[0].slice(0, 120), { origin: 'user-message' });
      return; // One simmer per message max
    }
  }

  // If the message is exploratory (questions about approach) and depth is "full" or "deep",
  // the whole message might be worth simmering
  if (turn.depth === 'deep' && /\?/.test(userMessage) && userMessage.length > 60) {
    const isExploration = /how|should|could|what about|think/i.test(lower);
    if (isExploration) {
      simmer.add(userMessage.slice(0, 150), { origin: 'exploratory-question', initialHeat: 1.5 });
    }
  }
}

/**
 * Post-wave narrative reflection — called after advance() processes debriefs.
 * This is the verbal self-reflection piece (Reflexion pattern).
 */
function _postWaveReflection(waveSummary, loopState) {
  const parts = [];

  parts.push(`Wave ${loopState.completedWaves.length} complete.`);

  if (waveSummary.aggregateConfidence != null) {
    parts.push(`Confidence: ${waveSummary.aggregateConfidence.toFixed(2)}`);
  }

  if (waveSummary.allBlockers?.length) {
    parts.push(`Blockers emerged: ${waveSummary.allBlockers.join('; ')}`);
  }

  if (waveSummary.scopeDelta && waveSummary.scopeDelta !== 'same') {
    parts.push(`Scope shifted: ${waveSummary.scopeDelta}`);
  }

  if (loopState.replans > 0) {
    parts.push(`Replanned ${loopState.replans} time(s) — adapting to reality.`);
  }

  narrative.evolve(parts.join(' '));
}

/**
 * Check for update notice and surface it to HEAD's awareness.
 */
function _checkUpdateNotice(context) {
  try {
    const noticeFile = join(LOOP_STATE_DIR, '.update-notice');
    if (!existsSync(noticeFile)) return;
    const notice = JSON.parse(readFileSync(noticeFile, 'utf8'));
    if (Date.now() - notice.ts < 5 * 60 * 1000) {
      context._updateNotice = `Updated dual-brain ${notice.from} → ${notice.to}`;
    }
    // Clear it after reading (one-shot)
    try { writeFileSync(noticeFile, ''); } catch {}
  } catch {}
}

// ── Query functions ─────────────────────────────────────────────────────────

export function getActivePlan() {
  return loadLoopState().activePlan;
}

export function getLoopStatus() {
  const state = loadLoopState();
  return {
    hasActivePlan: !!state.activePlan,
    completedWaves: state.completedWaves.length,
    totalWaves: state.activePlan?.waves?.length || 0,
    replans: state.replans,
    totalDispatches: state.totalDispatches,
    debriefCount: state.debriefs.length,
  };
}

export function resetLoop() {
  saveLoopState(freshLoopState());
  releaseSession();
}

export function shutdown() {
  releaseSession();
}
