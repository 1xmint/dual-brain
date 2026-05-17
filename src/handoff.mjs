// handoff.mjs — Typed handoffs between pipeline stages
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const HANDOFF_TYPES = {
  'think-to-work':  { required: ['objective', 'files', 'criteria'], optional: ['context', 'confidence'] },
  'work-to-review': { required: ['filesChanged', 'objective'],      optional: ['diff', 'criteria', 'testsRun'] },
  'review-to-head': { required: ['pass'],                           optional: ['findings', 'recommendation', 'severity'] },
};

const hDir  = (cwd) => join(cwd || process.cwd(), '.dualbrain', 'handoffs');
const hPath = (id, f, t, cwd) => join(hDir(cwd), `${id}_${f}_${t}.json`);

function validate(from, to, data) {
  const schema = HANDOFF_TYPES[`${from}-to-${to}`];
  if (!schema) return;
  for (const f of schema.required) {
    if (!(f in data)) process.stderr.write(`[handoff] warn: missing required field '${f}' in ${from}-to-${to}\n`);
  }
}

export function createHandoff(fromStage, toStage, data, runId, cwd) {
  try {
    validate(fromStage, toStage, data);
    const dir = hDir(cwd);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const record = { fromStage, toStage, runId, createdAt: new Date().toISOString(), data };
    const dest = hPath(runId, fromStage, toStage, cwd); const tmp = dest + '.tmp';
    writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    try { renameSync(tmp, dest); } catch { writeFileSync(dest, JSON.stringify(record, null, 2), 'utf8'); }
    return record;
  } catch { return null; }
}

export function consumeHandoff(runId, fromStage, toStage, cwd) {
  try {
    const p = hPath(runId, fromStage, toStage, cwd);
    if (!existsSync(p)) return null;
    const record = JSON.parse(readFileSync(p, 'utf8'));
    try { unlinkSync(p); } catch { /* best-effort */ }
    return record;
  } catch { return null; }
}

export function buildHandoffContext(handoff, targetRole) {
  if (!handoff?.data) return '';
  const d = handoff.data;
  const lines = (...parts) => parts.filter(Boolean).join('\n');
  const list  = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '');
  const items = (v) => Array.isArray(v) ? v.map(x => `  - ${x}`).join('\n') : (v ?? '');

  if (targetRole === 'worker' && handoff.fromStage === 'thinker') return lines(
    '## Handoff from Think Stage',
    `**Objective:** ${d.objective ?? '(none)'}`,
    `**Files in scope:** ${list(d.files) || 'unspecified'}`,
    d.criteria  ? `**Acceptance criteria:**\n${items(d.criteria)}` : '',
    d.context   ? `**Context:** ${d.context}` : '',
    d.confidence != null ? `**Thinker confidence:** ${d.confidence}` : '',
  );
  if (targetRole === 'reviewer' && handoff.fromStage === 'worker') return lines(
    '## Handoff from Work Stage',
    `**Objective:** ${d.objective ?? '(none)'}`,
    `**Files changed:** ${list(d.filesChanged) || 'unknown'}`,
    d.criteria ? `**Original criteria:** ${Array.isArray(d.criteria) ? d.criteria.join('; ') : d.criteria}` : '',
    d.testsRun ? `**Tests run:** ${d.testsRun}` : '',
    d.diff     ? `**Diff summary:**\n\`\`\`\n${d.diff.slice(0, 1200)}\n\`\`\`` : '',
  );
  if (targetRole === 'head' && handoff.fromStage === 'reviewer') return lines(
    `## Review Result: ${d.pass ? 'PASS' : 'FAIL'}`,
    d.findings       ? `**Findings:**\n${items(d.findings)}` : '',
    d.recommendation ? `**Recommendation:** ${d.recommendation}` : '',
    d.severity       ? `**Severity:** ${d.severity}` : '',
  );
  return JSON.stringify(handoff.data, null, 2);
}

export function cleanupHandoffs(runId, cwd) {
  try {
    const dir = hDir(cwd);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${runId}_`)) try { unlinkSync(join(dir, name)); } catch { /* best-effort */ }
    }
  } catch { /* non-throwing */ }
}
