import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MODEL_FORMAT: Record<string, string> = {
  claude: 'xml', sonnet: 'xml', haiku: 'xml', opus: 'xml',
  gpt: 'markdown', 'o4-mini': 'markdown',
  o3: 'prose',
};

type Role = 'thinker' | 'worker' | 'reviewer';
type FormatType = 'prose' | 'markdown' | 'xml';

interface ContextPack {
  intent?: string;
  constraints?: string[];
  priorAttempts?: unknown[];
  repoState?: { cwd?: string; [key: string]: unknown };
  fileSummaries?: Record<string, unknown>;
  acceptanceCriteria?: string[];
  files?: {
    explicit?: string[];
    gitChanged?: string[];
  };
}

interface SelectedSections {
  intent?: string;
  constraints?: string[];
  priorAttempts?: unknown[];
  repoState?: Record<string, unknown>;
  fileSummaries?: Record<string, unknown>;
  acceptanceCriteria?: string[];
  inScope?: string[];
  fileContents?: Record<string, string>;
}

function detectFormat(targetModel: string, role: Role): FormatType {
  const m = targetModel.toLowerCase();
  if (m.includes('o3') || (m.includes('opus') && role === 'thinker')) return 'prose';
  if (m.includes('gpt') || m.includes('o3') || m.includes('o4')) return 'markdown';
  return 'xml';
}

export function selectRelevant(pack: ContextPack | null | undefined, role: Role): SelectedSections {
  if (!pack) return { intent: '', constraints: [], acceptanceCriteria: [] };
  const { intent, constraints, priorAttempts, repoState, fileSummaries,
          acceptanceCriteria, files } = pack;
  if (role === 'thinker') {
    return { intent, constraints, priorAttempts, repoState: repoState as Record<string, unknown> | undefined,
             fileSummaries, acceptanceCriteria };
  }
  if (role === 'worker') {
    const inScope = [...(files?.explicit || []), ...(files?.gitChanged || [])];
    return { intent, acceptanceCriteria, constraints, inScope };
  }
  // reviewer
  return { intent, acceptanceCriteria, constraints, fileSummaries, repoState: repoState as Record<string, unknown> | undefined };
}

function readFiles(paths: string[], cwd: string | undefined): Record<string, string> {
  const base = cwd || process.cwd();
  const out: Record<string, string> = {};
  for (const p of paths) {
    const abs = resolve(base, p);
    if (existsSync(abs)) {
      try { out[p] = readFileSync(abs, 'utf8'); } catch { out[p] = '(unreadable)'; }
    }
  }
  return out;
}

export function renderForModel(sections: SelectedSections, targetModel: string, role: Role): string {
  const fmt = detectFormat(targetModel, role);

  if (fmt === 'prose') {
    const parts: string[] = [];
    if (sections.intent) parts.push(`Task: ${sections.intent}`);
    if (sections.acceptanceCriteria?.length)
      parts.push(`Success looks like: ${sections.acceptanceCriteria.join('; ')}`);
    if (sections.constraints?.length)
      parts.push(`Constraints: ${sections.constraints.join('; ')}`);
    if (sections.repoState) parts.push(`Repo: ${JSON.stringify(sections.repoState)}`);
    if (sections.fileSummaries) parts.push(`Files: ${JSON.stringify(sections.fileSummaries)}`);
    if (sections.priorAttempts?.length)
      parts.push(`Prior attempts: ${JSON.stringify(sections.priorAttempts)}`);
    return parts.join('\n\n');
  }

  if (fmt === 'markdown') {
    const lines: string[] = [];
    if (sections.intent) lines.push(`## Objective\n${sections.intent}`);
    if (sections.constraints?.length)
      lines.push(`## Constraints\n${sections.constraints.map(c => `- ${c}`).join('\n')}`);
    if (sections.acceptanceCriteria?.length)
      lines.push(`## Acceptance Criteria\n${sections.acceptanceCriteria.map(c => `- ${c}`).join('\n')}`);
    if (sections.repoState) lines.push(`## Repo State\n\`\`\`json\n${JSON.stringify(sections.repoState, null, 2)}\n\`\`\``);
    if (sections.fileSummaries) lines.push(`## Files\n\`\`\`json\n${JSON.stringify(sections.fileSummaries, null, 2)}\n\`\`\``);
    if (sections.fileContents) {
      lines.push('## File Contents');
      for (const [p, content] of Object.entries(sections.fileContents))
        lines.push(`### ${p}\n\`\`\`\n${content}\n\`\`\``);
    }
    if (sections.inScope?.length)
      lines.push(`## In-Scope Files\n${sections.inScope.map(f => `- ${f}`).join('\n')}`);
    if (sections.priorAttempts?.length)
      lines.push(`## Prior Attempts\n${JSON.stringify(sections.priorAttempts, null, 2)}`);
    return lines.join('\n\n');
  }

  // xml (Claude models)
  const tags: string[] = [];
  if (sections.intent) tags.push(`<objective>${sections.intent}</objective>`);
  if (sections.constraints?.length)
    tags.push(`<constraints>\n${sections.constraints.map(c => `  <constraint>${c}</constraint>`).join('\n')}\n</constraints>`);
  if (sections.acceptanceCriteria?.length)
    tags.push(`<criteria>\n${sections.acceptanceCriteria.map(c => `  <criterion>${c}</criterion>`).join('\n')}\n</criteria>`);
  if (sections.repoState)
    tags.push(`<repo_state>${JSON.stringify(sections.repoState)}</repo_state>`);
  if (sections.fileSummaries)
    tags.push(`<files>${JSON.stringify(sections.fileSummaries)}</files>`);
  if (sections.fileContents) {
    const fc = Object.entries(sections.fileContents)
      .map(([p, c]) => `  <file path="${p}">\n${c}\n  </file>`).join('\n');
    tags.push(`<file_contents>\n${fc}\n</file_contents>`);
  }
  if (sections.inScope?.length)
    tags.push(`<in_scope_files>\n${sections.inScope.map(f => `  <file>${f}</file>`).join('\n')}\n</in_scope_files>`);
  if (sections.priorAttempts?.length)
    tags.push(`<prior_attempts>${JSON.stringify(sections.priorAttempts)}</prior_attempts>`);
  return `<context>\n${tags.join('\n')}\n</context>`;
}

interface TokenBudgetResult {
  text: string;
  truncated: boolean;
  originalTokens: number;
  finalTokens: number;
}

export function enforceTokenBudget(rendered: string, budget: number): TokenBudgetResult {
  const chars = budget * 4;
  const originalTokens = Math.ceil(rendered.length / 4);
  if (rendered.length <= chars) return { text: rendered, truncated: false, originalTokens, finalTokens: originalTokens };

  // Try dropping prior_attempts / prior attempts block
  let text = rendered
    .replace(/<prior_attempts>[\s\S]*?<\/prior_attempts>/g, '')
    .replace(/## Prior Attempts[\s\S]*?(?=\n## |$)/, '')
    .replace(/Prior attempts:.*?(?=\n\n|$)/s, '');

  if (text.length <= chars) return { text: text.trim(), truncated: true, originalTokens, finalTokens: Math.ceil(text.length / 4) };

  // Summarize git/repo state
  text = text
    .replace(/<repo_state>[\s\S]*?<\/repo_state>/g, '<repo_state>(truncated)</repo_state>')
    .replace(/## Repo State[\s\S]*?(?=\n## |$)/, '## Repo State\n(truncated)');

  if (text.length <= chars) return { text: text.trim(), truncated: true, originalTokens, finalTokens: Math.ceil(text.length / 4) };

  // Hard truncate
  text = text.slice(0, chars) + '\n...(truncated)';
  return { text, truncated: true, originalTokens, finalTokens: Math.ceil(text.length / 4) };
}

export function attachOutputSchema(role: Role): string {
  if (role === 'thinker')
    return 'Return JSON: { decision: string, confidence: 0-1, reasoning: string, workSpec: { objective, files, criteria } }';
  if (role === 'worker')
    return 'Return JSON: { filesChanged: string[], testsRun: boolean, issues: string[] }';
  return 'Return JSON: { pass: boolean, findings: [{ severity, file, line, issue, fix }] }';
}

interface ShapeResult {
  shaped: string;
  role: Role;
  model: string;
  tokenEstimate: number;
  sections: string[];
}

export function shapeForRole(pack: ContextPack, role: Role, targetModel = 'sonnet', tokenBudget = 8000): ShapeResult {
  const sections = selectRelevant(pack, role);

  if (role === 'worker' && sections.inScope?.length) {
    const cwd = pack.repoState?.cwd as string | undefined;
    sections.fileContents = readFiles(sections.inScope, cwd);
  }

  const rendered = renderForModel(sections, targetModel, role);
  const { text, truncated, originalTokens, finalTokens } = enforceTokenBudget(rendered, tokenBudget);
  const sectionKeys = Object.keys(sections);

  return { shaped: text, role, model: targetModel, tokenEstimate: finalTokens, sections: sectionKeys };
}

export function compilePacket(pack: ContextPack, role: Role, targetModel: string, tokenBudget: number): string {
  const { shaped } = shapeForRole(pack, role, targetModel, tokenBudget);
  const schema = attachOutputSchema(role);
  return `${shaped}\n\n${schema}`;
}
