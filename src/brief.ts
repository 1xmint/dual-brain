/**
 * brief.ts — Delegation brief generator for the Dual-Brain Orchestrator HEAD.
 *
 * Generates typed delegation prompts from role-based templates. The HEAD's
 * primary skill is writing great agent briefs. Pure string construction —
 * no imports from sibling modules.
 *
 * Exports: generateBrief, compressPriorResults, listRoles
 */

// --- Brief templates (role-based) ---

type Role = 'researcher' | 'implementer' | 'reviewer' | 'verifier';

interface Template {
  prefix: string;
  outputFormat: string;
  constraints: string;
}

interface TaskInput {
  id?: string;
  title: string;
  goal: string;
  tier?: string;
  role?: Role;
  owns?: string[];
  consensus?: boolean;
  risk?: string;
}

interface BriefContext {
  prompt?: string;
  priorResults?: PriorResult[];
  repo?: {
    projectType?: string;
    branch?: string;
    testCmd?: string;
    lintCmd?: string;
  };
  cwd?: string;
}

interface PriorResult {
  stepId?: string;
  taskId?: string;
  summary?: string;
  output?: string;
  filesChanged?: string[];
  decisions?: string[];
  findings?: string;
}

interface RoleDescription {
  role: string;
  description: string;
}

const TEMPLATES: Record<Role, Template> = {
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

// --- Exported: listRoles ---

export function listRoles(): RoleDescription[] {
  return [
    { role: 'researcher',  description: 'Read-only exploration and mapping. Returns findings, file refs, and confidence.' },
    { role: 'implementer', description: 'Makes edits within ownership scope. Returns changed files, test results, and decisions.' },
    { role: 'reviewer',    description: 'Read-only code review. Returns issues by severity and an approval verdict.' },
    { role: 'verifier',    description: 'Runs the test suite and identifies failures. Does not fix anything.' },
  ];
}

// --- Exported: compressPriorResults ---

export function compressPriorResults(results: PriorResult[] | undefined): string {
  if (!results || results.length === 0) return '';

  const lines: string[] = [];
  for (const r of results) {
    const id = r.stepId ?? r.taskId ?? '?';
    const parts: string[] = [];

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

// --- Section builders ---

function buildOwnershipSection(owns: string[] | undefined): string | null {
  if (!owns || owns.length === 0) return null;
  return `File ownership (ONLY edit these):\n  ${owns.join('\n  ')}`;
}

function buildPriorResultsSection(priorResults: PriorResult[] | undefined): string | null {
  const compressed = compressPriorResults(priorResults);
  if (!compressed) return null;
  return `Prior wave results (context only — do not repeat this work):\n${compressed}`;
}

function buildAcceptanceCriteria(task: TaskInput): string | null {
  const lines: string[] = [];

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

// --- Exported: generateBrief ---

export function generateBrief(task: TaskInput, context: BriefContext = {}): string {
  const { prompt = '', priorResults = [], repo = {} } = context;
  const role: Role = task.role ?? 'implementer';
  const template = TEMPLATES[role] ?? TEMPLATES.implementer;

  const sections: string[] = [];

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
  const repoLines: string[] = [];
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
