#!/usr/bin/env node
/**
 * brief.mjs — Delegation brief generator for the Dual-Brain Orchestrator HEAD.
 *
 * Generates typed delegation prompts from role-based templates. The HEAD's
 * primary skill is writing great agent briefs. Pure string construction —
 * no imports from sibling modules.
 *
 * Exports: generateBrief, compressPriorResults, listRoles
 */

// ─── Brief templates (role-based) ────────────────────────────────────────────

const TEMPLATES = {
  researcher: {
    prefix:       'You are a code researcher. READ ONLY — do NOT edit any files.',
    outputFormat: 'Return: { findings: string, files: string[], lineRefs: string[], confidence: "high"|"medium"|"low" }',
    constraints:  'Max 50 lines of quoted code. Focus on structure and relationships, not implementation details.',
  },
  implementer: {
    prefix:       'You are a code implementer. Edit ONLY files in your ownership list.',
    outputFormat: 'Return: { filesChanged: string[], testsRun: string[], decisions: string[], risks: string[] }',
    constraints:  'Run tests after changes. Make minimal edits. Do not refactor beyond scope.',
  },
  reviewer: {
    prefix:       'You are a code reviewer. READ ONLY — do NOT edit any files.',
    outputFormat: 'Return: { issues: { severity: string, file: string, line: number, description: string }[], approved: boolean, risks: string[] }',
    constraints:  'Focus on correctness, security, and behavior preservation. Ignore style.',
  },
  verifier: {
    prefix:       'You are a test verifier. Run the test suite and report results.',
    outputFormat: 'Return: { passed: boolean, failCount: number, failures: string[], rootCause: string | null }',
    constraints:  'If tests fail, identify root cause but DO NOT fix. Report only.',
  },
};

// ─── Exported: listRoles ──────────────────────────────────────────────────────

/**
 * Return available role names and their short descriptions.
 * @returns {{ role: string, description: string }[]}
 */
export function listRoles() {
  return [
    { role: 'researcher',  description: 'Read-only exploration and mapping. Returns findings, file refs, and confidence.' },
    { role: 'implementer', description: 'Makes edits within ownership scope. Returns changed files, test results, and decisions.' },
    { role: 'reviewer',    description: 'Read-only code review. Returns issues by severity and an approval verdict.' },
    { role: 'verifier',    description: 'Runs the test suite and identifies failures. Does not fix anything.' },
  ];
}

// ─── Exported: compressPriorResults ──────────────────────────────────────────

/**
 * Take an array of prior wave results and return a compact string suitable for
 * injection into agent briefs. Strips code blocks, keeps decisions and file paths.
 *
 * @param {Array<{ stepId?: string, taskId?: string, summary?: string, output?: string, filesChanged?: string[], decisions?: string[], findings?: string }>} results
 * @returns {string}
 */
export function compressPriorResults(results) {
  if (!results || results.length === 0) return '';

  const lines = [];
  for (const r of results) {
    const id = r.stepId ?? r.taskId ?? '?';
    const parts = [];

    // Extract summary or findings
    const rawSummary = r.summary ?? r.findings ?? r.output ?? '';
    if (rawSummary) {
      // Strip code blocks
      const cleaned = String(rawSummary)
        .replace(/```[\s\S]*?```/g, '[code block]')
        .replace(/`[^`]+`/g, (m) => m.replace(/\n/g, ' '))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Keep only first 200 chars of text
      const snippet = cleaned.length > 200 ? cleaned.slice(0, 197) + '...' : cleaned;
      if (snippet) parts.push(snippet);
    }

    // Append file lists compactly
    if (Array.isArray(r.filesChanged) && r.filesChanged.length > 0) {
      parts.push(`files: ${r.filesChanged.join(', ')}`);
    }

    // Append key decisions
    if (Array.isArray(r.decisions) && r.decisions.length > 0) {
      parts.push(`decisions: ${r.decisions.slice(0, 3).join('; ')}`);
    }

    if (parts.length > 0) {
      lines.push(`[${id}] ${parts.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

// ─── Section builders ─────────────────────────────────────────────────────────

function buildOwnershipSection(owns) {
  if (!owns || owns.length === 0) return null;
  return `File ownership (ONLY edit these):\n  ${owns.join('\n  ')}`;
}

function buildPriorResultsSection(priorResults) {
  const compressed = compressPriorResults(priorResults);
  if (!compressed) return null;
  return `Prior wave results (context only — do not repeat this work):\n${compressed}`;
}

function buildAcceptanceCriteria(task) {
  const lines = [];

  if (task.role === 'researcher') {
    lines.push('- Return a structured findings object with file paths and line references');
    lines.push('- Report confidence level based on coverage of the codebase you explored');
  } else if (task.role === 'implementer') {
    lines.push('- All edits must stay within the ownership list above');
    lines.push('- Run existing tests; report any failures');
    lines.push('- Document decisions made during implementation');
  } else if (task.role === 'reviewer') {
    lines.push('- Report every issue with severity (critical / high / medium / low)');
    lines.push('- Provide a clear approved: true/false verdict');
    lines.push('- Do not edit any files');
  } else if (task.role === 'verifier') {
    lines.push('- Run the full test suite');
    lines.push('- If tests fail, identify root cause but do NOT fix');
    lines.push('- Return pass/fail with failure details');
  }

  if (task.consensus) {
    lines.push('- This task requires dual-brain consensus — be thorough and explicit in your reasoning');
  }

  return lines.length > 0 ? `Acceptance criteria:\n${lines.join('\n')}` : null;
}

// ─── Exported: generateBrief ──────────────────────────────────────────────────

/**
 * Generate a full delegation prompt for a single agent task.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   goal: string,
 *   tier: string,
 *   role: 'researcher'|'implementer'|'reviewer'|'verifier',
 *   owns: string[],
 *   consensus: boolean,
 *   risk: string,
 * }} task — from decompose output
 * @param {{
 *   prompt?: string,
 *   priorResults?: object[],
 *   repo?: { projectType?: string, branch?: string, testCmd?: string, lintCmd?: string },
 *   cwd?: string,
 * }} [context]
 * @returns {string}  Full delegation prompt string
 */
export function generateBrief(task, context = {}) {
  const { prompt = '', priorResults = [], repo = {} } = context;
  const role = task.role ?? 'implementer';
  const template = TEMPLATES[role] ?? TEMPLATES.implementer;

  const sections = [];

  // 1. Role header
  sections.push(template.prefix);
  sections.push('');

  // 2. Task identity
  sections.push(`Task: ${task.title}`);
  if (task.id) sections.push(`Task ID: ${task.id}`);
  if (task.tier) sections.push(`Tier: ${task.tier}`);
  sections.push('');

  // 3. Goal
  sections.push(`Goal:\n${task.goal}`);
  sections.push('');

  // 4. Original user request (for context)
  if (prompt && prompt !== task.goal) {
    const snippet = prompt.length > 300 ? prompt.slice(0, 297) + '...' : prompt;
    sections.push(`Original request (for context):\n${snippet}`);
    sections.push('');
  }

  // 5. File ownership
  const ownershipSection = buildOwnershipSection(task.owns);
  if (ownershipSection) {
    sections.push(ownershipSection);
    sections.push('');
  }

  // 6. Repository context (if available)
  const repoLines = [];
  if (repo.projectType) repoLines.push(`Project type: ${repo.projectType}`);
  if (repo.branch)      repoLines.push(`Branch: ${repo.branch}`);
  if (repo.testCmd)     repoLines.push(`Test command: ${repo.testCmd}`);
  if (repo.lintCmd)     repoLines.push(`Lint command: ${repo.lintCmd}`);
  if (repoLines.length > 0) {
    sections.push(`Repository context:\n  ${repoLines.join('\n  ')}`);
    sections.push('');
  }

  // 7. Prior results
  const priorSection = buildPriorResultsSection(priorResults);
  if (priorSection) {
    sections.push(priorSection);
    sections.push('');
  }

  // 8. Acceptance criteria
  const criteriaSection = buildAcceptanceCriteria(task);
  if (criteriaSection) {
    sections.push(criteriaSection);
    sections.push('');
  }

  // 9. Constraints
  sections.push(`Constraints:\n${template.constraints}`);
  sections.push('');

  // 10. Output format requirement
  sections.push(`Required output format:\n${template.outputFormat}`);

  return sections.join('\n').trimEnd();
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'roles') {
    console.log(JSON.stringify(listRoles(), null, 2));
    process.exit(0);
  }

  if (cmd === 'generate') {
    const role = args[1] ?? 'implementer';
    const goal = args[2] ?? 'No goal provided.';
    const task = {
      id:        'task-1',
      title:     goal.slice(0, 60),
      goal,
      tier:      'execute',
      role,
      owns:      [],
      consensus: false,
      risk:      'medium',
    };
    console.log(generateBrief(task, { prompt: goal }));
    process.exit(0);
  }

  console.error('Usage:');
  console.error('  node src/brief.mjs roles');
  console.error('  node src/brief.mjs generate <role> "<goal>"');
  process.exit(1);
}
