// handoff.ts — Typed handoffs between pipeline stages
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { HandoffStage, HandoffContract, HandoffData } from './types.js';

interface HandoffSchema {
  required: string[];
  optional: string[];
}

export const HANDOFF_TYPES: Record<string, HandoffSchema> = {
  'think-to-work':  { required: ['objective', 'files', 'criteria'], optional: ['context', 'confidence'] },
  'work-to-review': { required: ['filesChanged', 'objective'],      optional: ['diff', 'criteria', 'testsRun'] },
  'review-to-head': { required: ['pass'],                           optional: ['findings', 'recommendation', 'severity'] },
};

const hDir  = (cwd?: string): string => join(cwd || process.cwd(), '.dualbrain', 'handoffs');
const hPath = (id: string, f: string, t: string, cwd?: string): string => join(hDir(cwd), `${id}_${f}_${t}.json`);

function validate(from: string, to: string, data: Record<string, unknown>): void {
  const schema = HANDOFF_TYPES[`${from}-to-${to}`];
  if (!schema) return;
  for (const f of schema.required) {
    if (!(f in data)) process.stderr.write(`[handoff] warn: missing required field '${f}' in ${from}-to-${to}\n`);
  }
}

export function createHandoff(fromStage: HandoffStage, toStage: HandoffStage, data: Record<string, unknown>, runId: string, cwd?: string): HandoffContract | null {
  try {
    validate(fromStage as string, toStage as string, data);
    const safeRunId = String(runId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
    const dir = hDir(cwd);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const record: HandoffContract = { fromStage, toStage, runId: safeRunId, createdAt: new Date().toISOString(), data: data as unknown as HandoffData };
    const dest = hPath(safeRunId, fromStage, toStage, cwd); const tmp = dest + '.tmp';
    writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    try { renameSync(tmp, dest); } catch { writeFileSync(dest, JSON.stringify(record, null, 2), 'utf8'); }
    return record;
  } catch { return null; }
}

export function consumeHandoff(runId: string, fromStage: HandoffStage, toStage: HandoffStage, cwd?: string): HandoffContract | null {
  try {
    const safeRunId = String(runId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 50);
    const p = hPath(safeRunId, fromStage, toStage, cwd);
    if (!existsSync(p)) return null;
    const record: HandoffContract = JSON.parse(readFileSync(p, 'utf8'));
    try { unlinkSync(p); } catch { /* best-effort */ }
    return record;
  } catch { return null; }
}

export function buildHandoffContext(handoff: HandoffContract | null, targetRole: string): string {
  if (!handoff?.data) return '';
  const d = handoff.data as unknown as Record<string, unknown>;
  const lines = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join('\n');
  const list  = (v: unknown) => Array.isArray(v) ? v.join(', ') : ((v as string) ?? '');
  const items = (v: unknown) => Array.isArray(v) ? v.map(x => `  - ${x}`).join('\n') : ((v as string) ?? '');

  if (targetRole === 'worker' && handoff.fromStage === 'thinker') return lines(
    '## Handoff from Think Stage',
    `**Objective:** ${(d.objective as string) ?? '(none)'}`,
    `**Files in scope:** ${list(d.files) || 'unspecified'}`,
    d.criteria  ? `**Acceptance criteria:**\n${items(d.criteria)}` : '',
    d.context   ? `**Context:** ${d.context}` : '',
    d.confidence != null ? `**Thinker confidence:** ${d.confidence}` : '',
  );
  if (targetRole === 'reviewer' && handoff.fromStage === 'worker') return lines(
    '## Handoff from Work Stage',
    `**Objective:** ${(d.objective as string) ?? '(none)'}`,
    `**Files changed:** ${list(d.filesChanged) || 'unknown'}`,
    d.criteria ? `**Original criteria:** ${Array.isArray(d.criteria) ? (d.criteria as string[]).join('; ') : d.criteria}` : '',
    d.testsRun ? `**Tests run:** ${d.testsRun}` : '',
    d.diff     ? `**Diff summary:**\n\`\`\`\n${(d.diff as string).slice(0, 1200)}\n\`\`\`` : '',
  );
  if (targetRole === 'head' && handoff.fromStage === 'reviewer') return lines(
    `## Review Result: ${d.pass ? 'PASS' : 'FAIL'}`,
    d.findings       ? `**Findings:**\n${items(d.findings)}` : '',
    d.recommendation ? `**Recommendation:** ${d.recommendation}` : '',
    d.severity       ? `**Severity:** ${d.severity}` : '',
  );
  return JSON.stringify(handoff.data, null, 2);
}

export function cleanupHandoffs(runId: string, cwd?: string): void {
  try {
    const dir = hDir(cwd);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${runId}_`)) try { unlinkSync(join(dir, name)); } catch { /* best-effort */ }
    }
  } catch { /* non-throwing */ }
}
