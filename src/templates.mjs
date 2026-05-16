import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Task contract — every dispatch must have one.
 * @typedef {{
 *   id: string,
 *   objective: string,
 *   scope: string[],
 *   nonGoals?: string[],
 *   risk: 'low'|'medium'|'high'|'critical',
 *   acceptanceCriteria: string[],
 *   allowedOperations?: string[],
 *   context?: string,
 *   files?: string[],
 *   timeoutMs?: number,
 * }} TaskContract
 */

/**
 * Validate a task contract has all required fields.
 * Returns { valid, missing }
 */
export function validateContract(contract) {
  const required = ['objective', 'scope', 'risk', 'acceptanceCriteria'];
  const missing = required.filter(f => !contract?.[f] || (Array.isArray(contract[f]) && contract[f].length === 0));
  return {
    valid: missing.length === 0,
    missing,
    contract: missing.length === 0 ? { ...contract, id: contract.id || Date.now().toString(36) } : null,
  };
}

// ── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = {
  search: {
    id: 'search',
    version: '1.0',
    tier: 'search',
    description: 'Read-only lookups, grep, explore. Returns files found, line refs, confidence.',
    requiredFields: ['objective', 'scope'],
    render(contract, context = {}) {
      const lines = [];
      lines.push(`Find: ${contract.objective}`);
      lines.push('');
      if (contract.scope.length) lines.push(`Scope: ${contract.scope.join(', ')}`);
      if (contract.files?.length) lines.push(`Start with: ${contract.files.join(', ')}`);
      if (contract.context) lines.push(`Context: ${contract.context}`);
      lines.push('');
      lines.push('Return: file paths, line numbers, relevant code snippets, and confidence level.');
      if (contract.nonGoals?.length) lines.push(`Do NOT: ${contract.nonGoals.join('; ')}`);
      return lines.join('\n');
    },
  },

  execute: {
    id: 'execute',
    version: '1.0',
    tier: 'execute',
    description: 'Edits, tests, git ops. Returns files changed, tests run, edge cases.',
    requiredFields: ['objective', 'scope', 'acceptanceCriteria'],
    render(contract, context = {}) {
      const lines = [];
      lines.push(contract.objective);
      lines.push('');
      if (contract.scope.length) lines.push(`Files in scope: ${contract.scope.join(', ')}`);
      if (contract.files?.length) lines.push(`Read first: ${contract.files.join(', ')}`);
      if (contract.context) lines.push(`Context: ${contract.context}`);
      lines.push('');
      lines.push('Acceptance criteria:');
      for (const c of contract.acceptanceCriteria) {
        lines.push(`- ${c}`);
      }
      if (contract.nonGoals?.length) {
        lines.push('');
        lines.push('Non-goals (do NOT do these):');
        for (const ng of contract.nonGoals) lines.push(`- ${ng}`);
      }
      if (contract.allowedOperations?.length) {
        lines.push('');
        lines.push(`Allowed operations: ${contract.allowedOperations.join(', ')}`);
      }
      lines.push('');
      lines.push('Return: files changed, tests run, edge cases found.');
      return lines.join('\n');
    },
  },

  think: {
    id: 'think',
    version: '1.0',
    tier: 'think',
    description: 'Architecture decisions, design review, planning.',
    requiredFields: ['objective'],
    render(contract, context = {}) {
      const lines = [];
      lines.push(contract.objective);
      lines.push('');
      if (contract.scope?.length) lines.push(`Relevant modules: ${contract.scope.join(', ')}`);
      if (contract.context) lines.push(`Background: ${contract.context}`);
      if (contract.files?.length) lines.push(`Key files: ${contract.files.join(', ')}`);
      lines.push('');
      lines.push('Provide: recommendation, rationale, alternatives considered, risks, and confidence level.');
      if (contract.acceptanceCriteria?.length) {
        lines.push('');
        lines.push('Decision criteria:');
        for (const c of contract.acceptanceCriteria) lines.push(`- ${c}`);
      }
      return lines.join('\n');
    },
  },

  review: {
    id: 'review',
    version: '1.0',
    tier: 'review',
    description: 'Code review with severity, line refs, test gaps, security concerns.',
    requiredFields: ['objective', 'scope'],
    render(contract, context = {}) {
      const lines = [];
      lines.push(`Review: ${contract.objective}`);
      lines.push('');
      if (contract.scope.length) lines.push(`Files to review: ${contract.scope.join(', ')}`);
      if (contract.context) lines.push(`Context: ${contract.context}`);
      lines.push('');
      lines.push('Check for:');
      lines.push('- Correctness and edge cases');
      lines.push('- Security vulnerabilities (OWASP top 10)');
      lines.push('- Test coverage gaps');
      lines.push('- Architectural drift');
      lines.push('- Performance concerns');
      if (contract.acceptanceCriteria?.length) {
        lines.push('');
        lines.push('Specific concerns:');
        for (const c of contract.acceptanceCriteria) lines.push(`- ${c}`);
      }
      lines.push('');
      lines.push('Return: findings with severity (critical/high/medium/low), file:line refs, and suggested fixes.');
      return lines.join('\n');
    },
  },
};

// ── Template API ─────────────────────────────────────────────────────────────

/**
 * Get a template by tier name.
 */
export function getTemplate(tier) {
  return TEMPLATES[tier] || null;
}

/**
 * List all available templates.
 */
export function listTemplates() {
  return Object.values(TEMPLATES).map(t => ({
    id: t.id,
    version: t.version,
    tier: t.tier,
    description: t.description,
    requiredFields: t.requiredFields,
  }));
}

/**
 * Render a prompt from a template and task contract.
 * Validates contract first. Returns { prompt, template, contract, valid, errors }
 */
export function renderPrompt(tier, contract, context = {}) {
  const template = TEMPLATES[tier];
  if (!template) {
    return { prompt: null, valid: false, errors: [`Unknown template tier: ${tier}`] };
  }

  // Validate required fields
  const missing = template.requiredFields.filter(f => !contract?.[f] || (Array.isArray(contract[f]) && contract[f].length === 0));
  if (missing.length > 0) {
    return {
      prompt: null,
      valid: false,
      errors: missing.map(f => `Missing required field: ${f}`),
      template: { id: template.id, version: template.version },
    };
  }

  const prompt = template.render(contract, context);

  return {
    prompt,
    valid: true,
    errors: [],
    template: { id: template.id, version: template.version },
    contract: { ...contract, id: contract.id || Date.now().toString(36) },
    stats: {
      words: prompt.split(/\s+/).length,
      chars: prompt.length,
      estimatedTokens: Math.ceil(prompt.length / 4),
    },
  };
}

/**
 * Quick render: build a contract from minimal inputs and render.
 * For when HEAD knows the tier and objective but hasn't built a full contract.
 */
export function quickRender(tier, objective, opts = {}) {
  const { scope = [], files = [], risk = 'medium', criteria = [], nonGoals = [], context = '' } = opts;

  const contract = {
    objective,
    scope,
    files,
    risk,
    acceptanceCriteria: criteria.length ? criteria : [`${objective} is complete and working`],
    nonGoals,
    context,
    allowedOperations: tier === 'search' ? ['read'] : tier === 'execute' ? ['read', 'write', 'test'] : ['read', 'analyze'],
  };

  return renderPrompt(tier, contract);
}
