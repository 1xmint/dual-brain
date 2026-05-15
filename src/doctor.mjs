/**
 * doctor.mjs — Internal honesty checker for dual-brain development.
 * NOT for npm users. For developers working on this repo.
 *
 * Exports: runDoctor(cwd), formatDoctorReport(results),
 *          scanClaims(cwd), checkDecisions(cwd), checkFoundations(cwd)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readdir, readFile } from 'fs/promises';

// ─── Claim Scanner ───────────────────────────────────────────────────────────

const CLAIM_PATTERNS = [
  { re: /Detected\s+(Claude|GPT|OpenAI|ChatGPT)\s+(Max|Pro|Plus|Free)/i, label: 'subscription tier detection claim' },
  { re: /\$(?:20|100|200)\b/,                                             label: 'hardcoded dollar amount in UI string' },
  { re: /\b(?:used|remaining|quota|budget)\b[^"'\n]{0,40}%/,             label: 'usage percentage display' },
  { re: /%[^"'\n]{0,40}\b(?:used|remaining|quota|budget)\b/,             label: 'usage percentage display' },
  { re: /\bsubscription\b/i,                                              label: 'subscription reference' },
  { re: /\bplan\s+tier\b/i,                                               label: 'plan tier reference' },
  { re: /\bquota\s+remaining\b/i,                                         label: 'quota remaining reference' },
  { re: /\bbudget\s+left\b/i,                                             label: 'budget left reference' },
  { re: /\bverified\b[^"'\n]{0,60}\b(?:subscription|plan|tier|quota)\b/i, label: 'verified subscription claim' },
  { re: /\b(?:subscription|plan|tier|quota)\b[^"'\n]{0,60}\bverified\b/i, label: 'verified subscription claim' },
];

// Skip config/constant-style lines that are not user-facing output
const CONFIG_LINE_RE = /^\s*(?:\/\/|['"]?\w+['"]?\s*:|\bconst\b|\blet\b|\bvar\b)[^=]*=\s*['"]?\$?\d/;

async function mjsFilesIn(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile() && e.name.endsWith('.mjs')).map(e => join(dir, e.name));
  } catch { return []; }
}

export async function scanClaims(cwd) {
  const allFiles = [
    ...(await mjsFilesIn(join(cwd, 'src'))),
    ...(await mjsFilesIn(join(cwd, 'bin'))),
  ].filter(f => !/(test|doctor)\.mjs$/.test(f)); // skip test files and self

  const issues = [];
  for (const filePath of allFiles) {
    let text;
    try { text = await readFile(filePath, 'utf8'); } catch { continue; }
    const relPath = filePath.slice(cwd.length + 1);
    text.split('\n').forEach((line, i) => {
      if (line.includes('// doctor:verified')) return;
      if (/^\s*\/\//.test(line)) return;         // pure comment
      if (CONFIG_LINE_RE.test(line)) return;      // config constant
      for (const { re, label } of CLAIM_PATTERNS) {
        if (re.test(line)) {
          issues.push({ file: relPath, line: i + 1, text: line.trim().slice(0, 120), label });
          return;
        }
      }
    });
  }
  return { issues };
}

// ─── Decision Artifact Checker ────────────────────────────────────────────────

const SENSITIVE_AREAS = [
  { pattern: /src\/detect\.mjs/,          area: 'task-detection' },
  { pattern: /src\/decide\.mjs/,          area: 'routing-decisions' },
  { pattern: /src\/dispatch\.mjs/,        area: 'dispatch-logic' },
  { pattern: /src\/profile\.mjs/,         area: 'provider-detection' },
  { pattern: /onboard|wizard/i,           area: 'onboarding-flow' },
  { pattern: /budget|subscription|quota/i, area: 'budget-system' },
];

export async function checkDecisions(cwd) {
  const decisionsDir = join(cwd, '.dualbrain', 'decisions');
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const areas = [];

  for (const { area } of SENSITIVE_AREAS) {
    if (seen.has(area)) continue;
    seen.add(area);

    const artifactPath = join(decisionsDir, `${area}.json`);
    if (!existsSync(artifactPath)) {
      areas.push({ area, status: 'missing' });
      continue;
    }

    let artifact;
    try { artifact = JSON.parse(readFileSync(artifactPath, 'utf8')); }
    catch { areas.push({ area, status: 'invalid' }); continue; }

    const expired = artifact.expires_at && artifact.expires_at < today;
    areas.push({
      area,
      status: expired ? 'expired' : (artifact.status === 'active' ? 'active' : 'inactive'),
      decidedAt: artifact.decided_at || null,
      expiresAt: artifact.expires_at || null,
    });
  }
  return { areas };
}

// ─── Foundation Manifest ──────────────────────────────────────────────────────

export async function checkFoundations(cwd) {
  const manifestPath = join(cwd, '.dualbrain', 'foundations.json');
  if (!existsSync(manifestPath)) return { foundations: [], issues: [], missing: true };

  let data;
  try { data = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { return { foundations: [], issues: [{ type: 'parse-error', message: 'foundations.json is not valid JSON' }], missing: false }; }

  const all = data.foundations || [];
  const invalidatedIds = new Set(all.filter(f => f.status === 'invalidated').map(f => f.id));
  const issues = [];

  const foundations = all.map(f => {
    const entry = { id: f.id, claim: f.claim, status: f.status, dependents: f.dependents || [] };
    if (f.status === 'invalidated') {
      entry.stillUsedBy = all.filter(o => o.status === 'active' && (o.dependents || []).includes(f.id)).map(o => o.id);
    }
    return entry;
  });

  // Flag active foundations whose dependent files overlap with an invalidated foundation's dependents
  for (const inv of all.filter(f => f.status === 'invalidated')) {
    for (const active of all.filter(f => f.status === 'active')) {
      const overlap = (active.dependents || []).filter(d => (inv.dependents || []).includes(d));
      if (overlap.length > 0) {
        issues.push({ type: 'dependent-on-invalidated', file: overlap, activeFoundation: active.id, invalidatedFoundation: inv.id });
      }
    }
  }

  return { foundations, issues, missing: false };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runDoctor(cwd = process.cwd()) {
  const [claims, decisions, foundations] = await Promise.all([
    scanClaims(cwd), checkDecisions(cwd), checkFoundations(cwd),
  ]);

  const issueCount =
    claims.issues.length +
    decisions.areas.filter(a => a.status !== 'active').length +
    foundations.issues.length;

  const blockingCount =
    decisions.areas.filter(a => a.status === 'missing').length +
    foundations.issues.filter(i => i.type === 'dependent-on-invalidated').length;

  return { claims, decisions, foundations, summary: { issueCount, blockingCount } };
}

// ─── Formatter ────────────────────────────────────────────────────────────────

export function formatDoctorReport(results) {
  const { claims, decisions, foundations, summary } = results;
  const out = ['🩺 dual-brain doctor', ''];

  out.push('Claims Check:');
  if (claims.issues.length === 0) {
    out.push('  ✓ No unverified claims found');
  } else {
    for (const i of claims.issues) out.push(`  ⚠ ${i.file}:${i.line} — "${i.text}" (${i.label})`);
  }
  out.push('');

  out.push('Decision Artifacts:');
  if (decisions.areas.length === 0) {
    out.push('  ✓ No sensitive areas tracked');
  } else {
    for (const a of decisions.areas) {
      if (a.status === 'active')   out.push(`  ✓ ${a.area} — decided ${a.decidedAt}, active`);
      else if (a.status === 'expired') out.push(`  ✗ ${a.area} — decision expired ${a.expiresAt}`);
      else if (a.status === 'missing') out.push(`  ⚠ ${a.area} — no decision artifact found`);
      else                         out.push(`  ⚠ ${a.area} — status: ${a.status}`);
    }
  }
  out.push('');

  out.push('Foundations:');
  if (foundations.missing) {
    out.push('  ⚠ .dualbrain/foundations.json not found — no foundation tracking');
  } else if (foundations.foundations.length === 0) {
    out.push('  ✓ No foundations defined');
  } else {
    for (const f of foundations.foundations) {
      if (f.status === 'invalidated') {
        const n = (f.stillUsedBy || []).length;
        if (n === 0) {
          out.push(`  ℹ ${f.id} — invalidated, no active dependents (resolved)`);
        } else {
          out.push(`  ✗ ${f.id} — INVALIDATED, ${n} dependent${n === 1 ? '' : 's'} still using`);
        }
      } else {
        const n = f.dependents.length;
        out.push(`  ✓ ${f.id} — active, ${n} dependent${n === 1 ? '' : 's'}`);
      }
    }
    for (const issue of foundations.issues) {
      if (issue.type === 'dependent-on-invalidated') {
        out.push(`  ✗ ${issue.file.join(', ')} — uses invalidated foundation "${issue.invalidatedFoundation}"`);
      }
    }
  }
  out.push('');

  const { issueCount, blockingCount } = summary;
  out.push(issueCount === 0
    ? 'Summary: all checks passed'
    : `Summary: ${issueCount} issue${issueCount === 1 ? '' : 's'} found, ${blockingCount} blocking`);

  return out.join('\n');
}
