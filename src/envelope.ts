// envelope.ts — Dispatch envelopes that carry understanding to workers.

import * as narrative from './narrative.js';

interface Envelope {
  preamble: string;
  contract: string;
  preventions: string;
  debriefFormat: string;
  full: string;
}

interface AgentSpec {
  objective: string;
  scope?: string[];
  tier?: string;
  conditionalPivot?: {
    if: string;
    then: string;
  };
}

interface ContractExtra {
  acceptanceCriteria?: string;
  risk?: string;
  allowedOps?: string[];
}

interface BuildOpts {
  preventions?: string;
  debriefInstruction?: string;
  inboxBrief?: string;
  contract?: ContractExtra;
}

/**
 * Build a dispatch envelope for a worker agent.
 */
export function build(agentSpec: AgentSpec, opts: BuildOpts = {}): Envelope {
  const { preventions, debriefInstruction, inboxBrief, contract } = opts;

  // Get narrative excerpt — the "being in the song" piece
  const preamble = _buildPreamble(agentSpec);

  // Build contract section
  const contractText = _buildContract(agentSpec, contract);

  // Assemble full prompt
  const sections: string[] = [];

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
 */
export function buildLight(objective: string, scope: string[] = []): string {
  const parts = [objective];
  if (scope.length > 0) {
    parts.push(`Scope: ${scope.join(', ')}`);
  }
  return parts.join('\n');
}

// -- Internal --

function _buildPreamble(agentSpec: AgentSpec): string {
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

function _buildContract(agentSpec: AgentSpec, extra: ContractExtra = {}): string {
  const parts: string[] = [];

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
