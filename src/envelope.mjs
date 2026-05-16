// envelope.mjs — Dispatch envelopes that carry understanding to workers.
//
// Instead of workers getting bare instructions ("edit file X, add Y"),
// they get an envelope containing:
// 1. Context preamble — narrative excerpt explaining the "why"
// 2. Contract — the typed task (objective, scope, acceptance criteria)
// 3. Preventions — predicted failure modes and how to avoid them
// 4. Debrief format — how to report back
//
// This is the difference between "do this thing" and "here's where we are,
// here's why this matters, here's what to do, here's what to watch for."

import * as narrative from './narrative.mjs';

/**
 * @typedef {object} Envelope
 * @property {string} preamble - Narrative context for the worker
 * @property {string} contract - The actual task specification
 * @property {string} preventions - Predicted failure modes and mitigations
 * @property {string} debriefFormat - How to report back
 * @property {string} full - Complete prompt ready to send
 */

/**
 * Build a dispatch envelope for a worker agent.
 *
 * @param {object} agentSpec - From wave-planner
 * @param {string} agentSpec.objective - What to accomplish
 * @param {string[]} agentSpec.scope - Files/areas in scope
 * @param {string} agentSpec.tier - Worker tier (execute, search, review, etc)
 * @param {object} opts
 * @param {string} opts.preventions - From predictive.mjs
 * @param {string} opts.debriefInstruction - From debrief.mjs
 * @param {string} opts.inboxBrief - Messages for this worker
 * @param {object} opts.contract - Additional contract fields (acceptance criteria, risk, allowed ops)
 * @returns {Envelope}
 */
export function build(agentSpec, opts = {}) {
  const { preventions, debriefInstruction, inboxBrief, contract } = opts;

  // Get narrative excerpt — the "being in the song" piece
  const preamble = _buildPreamble(agentSpec);

  // Build contract section
  const contractText = _buildContract(agentSpec, contract);

  // Assemble full prompt
  const sections = [];

  if (preamble) {
    sections.push(`## Context\n${preamble}`);
  }

  sections.push(`## Task\n${contractText}`);

  if (inboxBrief) {
    sections.push(`## Notes\n${inboxBrief}`);
  }

  if (preventions) {
    sections.push(`## Watch For\n${preventions}`);
  }

  if (debriefInstruction) {
    sections.push(`## When Done\n${debriefInstruction}`);
  }

  const full = sections.join('\n\n');

  return {
    preamble,
    contract: contractText,
    preventions: preventions || '',
    debriefFormat: debriefInstruction || '',
    full,
  };
}

/**
 * Build a lightweight envelope for simple/fast dispatches.
 * Used when the task is straightforward and doesn't need full context.
 *
 * @param {string} objective
 * @param {string[]} scope
 * @returns {string} Simple prompt string
 */
export function buildLight(objective, scope = []) {
  const parts = [objective];
  if (scope.length > 0) {
    parts.push(`Scope: ${scope.join(', ')}`);
  }
  return parts.join('\n');
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _buildPreamble(agentSpec) {
  const narr = narrative.excerpt(400);
  if (!narr) return '';

  // Tailor the preamble based on tier
  const tier = (agentSpec.tier || '').toLowerCase();

  if (tier === 'search' || tier === 'recon') {
    // Search agents need less context, more focus on what to look for
    return narr.length > 200 ? narr.slice(-200) : narr;
  }

  // Implementation agents get fuller context
  return narr;
}

function _buildContract(agentSpec, extra = {}) {
  const parts = [];

  parts.push(agentSpec.objective);

  if (agentSpec.scope?.length) {
    parts.push(`\nScope: ${agentSpec.scope.join(', ')}`);
  }

  if (extra?.acceptanceCriteria) {
    parts.push(`\nDone when: ${extra.acceptanceCriteria}`);
  }

  if (extra?.risk) {
    parts.push(`\nRisk level: ${extra.risk}`);
  }

  if (extra?.allowedOps) {
    parts.push(`\nAllowed: ${extra.allowedOps.join(', ')}`);
  }

  if (agentSpec.conditionalPivot) {
    parts.push(`\nConditional: if ${agentSpec.conditionalPivot.if} → ${agentSpec.conditionalPivot.then}`);
  }

  return parts.join('');
}
