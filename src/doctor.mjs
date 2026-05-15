/**
 * doctor.mjs — Internal honesty checker for dual-brain development.
 * NOT for npm users. For developers working on this repo.
 *
 * Exports: runDoctor, formatDoctorReport, scanClaims, checkDecisions,
 *          checkFoundations, checkRoleBoundaries, checkEvidence, checkTokenWaste,
 *          runHealthCheck, formatHealthReport, compareHealth
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function mjsFilesIn(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile() && e.name.endsWith('.mjs')).map(e => join(dir, e.name));
  } catch { return []; }
}

function readAuditLines(cwd) {
  const p = join(cwd, '.dualbrain', 'audit', 'head-audit.jsonl');
  if (!existsSync(p)) return [];
  try { return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; }
}

const EXPLORATORY_RE = /\b(grep|find|cat|head|tail|ls|awk|sed)\b/;

// ─── Check 1: Claim Scanner ──────────────────────────────────────────────────
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

const CONFIG_LINE_RE = /^\s*(?:\/\/|['"]?\w+['"]?\s*:|\bconst\b|\blet\b|\bvar\b)[^=]*=\s*['"]?\$?\d/;

export async function scanClaims(cwd) {
  const allFiles = [
    ...(await mjsFilesIn(join(cwd, 'src'))),
    ...(await mjsFilesIn(join(cwd, 'bin'))),
  ].filter(f => !/(test|doctor)\.mjs$/.test(f));

  const issues = [];
  for (const filePath of allFiles) {
    let text; try { text = await readFile(filePath, 'utf8'); } catch { continue; }
    const relPath = filePath.slice(cwd.length + 1);
    text.split('\n').forEach((line, i) => {
      if (line.includes('// doctor:verified') || /^\s*\/\//.test(line) || CONFIG_LINE_RE.test(line)) return;
      for (const { re, label } of CLAIM_PATTERNS) {
        if (re.test(line)) { issues.push({ file: relPath, line: i + 1, text: line.trim().slice(0, 120), label }); return; }
      }
    });
  }
  return { issues };
}

// ─── Check 2: Decision Artifacts ─────────────────────────────────────────────
const SENSITIVE_AREAS = [
  { pattern: /src\/detect\.mjs/,           area: 'task-detection' },
  { pattern: /src\/decide\.mjs/,           area: 'routing-decisions' },
  { pattern: /src\/dispatch\.mjs/,         area: 'dispatch-logic' },
  { pattern: /src\/profile\.mjs/,          area: 'provider-detection' },
  { pattern: /onboard|wizard/i,            area: 'onboarding-flow' },
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
    if (!existsSync(artifactPath)) { areas.push({ area, status: 'missing' }); continue; }
    let artifact; try { artifact = JSON.parse(readFileSync(artifactPath, 'utf8')); }
    catch { areas.push({ area, status: 'invalid' }); continue; }
    const expired = artifact.expires_at && artifact.expires_at < today;
    areas.push({ area, status: expired ? 'expired' : (artifact.status === 'active' ? 'active' : 'inactive'), decidedAt: artifact.decided_at || null, expiresAt: artifact.expires_at || null });
  }
  return { areas };
}

// ─── Check 3: Foundation Manifest ────────────────────────────────────────────
export async function checkFoundations(cwd) {
  const manifestPath = join(cwd, '.dualbrain', 'foundations.json');
  if (!existsSync(manifestPath)) return { foundations: [], issues: [], missing: true };
  let data; try { data = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { return { foundations: [], issues: [{ type: 'parse-error', message: 'foundations.json is not valid JSON' }], missing: false }; }
  const all = data.foundations || [];
  const issues = [];
  const foundations = all.map(f => {
    const entry = { id: f.id, claim: f.claim, status: f.status, dependents: f.dependents || [] };
    if (f.status === 'invalidated') entry.stillUsedBy = all.filter(o => o.status === 'active' && (o.dependents || []).includes(f.id)).map(o => o.id);
    return entry;
  });
  for (const inv of all.filter(f => f.status === 'invalidated')) {
    for (const active of all.filter(f => f.status === 'active')) {
      const overlap = (active.dependents || []).filter(d => (inv.dependents || []).includes(d));
      if (overlap.length > 0) issues.push({ type: 'dependent-on-invalidated', file: overlap, activeFoundation: active.id, invalidatedFoundation: inv.id });
    }
  }
  return { foundations, issues, missing: false };
}

// ─── Check 4: Role Boundary Verification ─────────────────────────────────────
export async function checkRoleBoundaries(cwd) {
  const lines = readAuditLines(cwd);
  const findings = [];
  for (const line of lines) {
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    const { ts, tool, event, reason } = entry;
    if (event !== 'PreToolUse') continue;
    if (tool === 'Read') {
      const m = (reason || '').match(/\b[\w./]+\.(mjs|ts|js|json)\b/);
      const file = m ? m[0] : null;
      findings.push({ severity: 'block', type: 'role-violation',
        message: file ? `HEAD read ${file} directly (should dispatch search agent)` : 'HEAD attempted direct file read (should dispatch search agent)',
        file: file || null, timestamp: ts });
    } else if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
      const isMemory = /memory|MEMORY/i.test(reason || '');
      findings.push({ severity: 'block', type: 'role-violation',
        message: isMemory ? 'HEAD wrote memory instead of fixing code' : `HEAD modified files directly via ${tool} (should dispatch work agent)`,
        file: null, timestamp: ts });
    } else if (tool === 'Bash' && entry.allowed === false && EXPLORATORY_RE.test(reason || '')) {
      findings.push({ severity: 'block', type: 'role-violation',
        message: 'HEAD explored repo directly via Bash (should dispatch search agent)',
        file: null, timestamp: ts });
    }
  }
  return findings;
}

// ─── Check 5: Evidence Verification ──────────────────────────────────────────
export async function checkEvidence(cwd) {
  const outcomesDir = join(cwd, '.dualbrain', 'outcomes');
  if (!existsSync(outcomesDir)) return [];
  let files; try { files = await readdir(outcomesDir); } catch { return []; }
  const findings = [];
  for (const fname of files.filter(f => f.endsWith('.json')).slice(-20)) {
    let outcome; try { outcome = JSON.parse(await readFile(join(outcomesDir, fname), 'utf8')); } catch { continue; }
    for (const f of (outcome.filesChanged || [])) {
      if (!existsSync(join(cwd, f))) {
        findings.push({ severity: 'block', type: 'false-file-claim', message: `Outcome claims ${f} was changed but file does not exist`, file: f, source: fname });
        continue;
      }
      try {
        const { stdout } = await execAsync(`git diff HEAD -- "${f}"`, { cwd });
        if (!stdout.trim() && outcome.success === true) findings.push({ severity: 'block', type: 'false-file-claim', message: `Outcome claims success with changes to ${f} but git diff shows no changes`, file: f, source: fname });
      } catch { /* git unavailable */ }
    }
    if (outcome.testsRun === true && !outcome.testOutput && !outcome.testSummary)
      findings.push({ severity: 'warn', type: 'missing-test-evidence', message: 'Outcome claims testsRun:true but no test output recorded', file: null, source: fname });
  }
  return findings;
}

// ─── Check 6: Token Waste Detection ──────────────────────────────────────────
export async function checkTokenWaste(cwd) {
  const lines = readAuditLines(cwd);
  let total = 0, nonDispatch = 0;
  for (const line of lines) {
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    if (entry.event !== 'PreToolUse') continue;
    total++;
    const { tool, reason } = entry;
    if (tool === 'Agent') continue;
    if (tool === 'Read' || tool === 'Write' || tool === 'Edit') nonDispatch++;
    else if (tool === 'Bash' && EXPLORATORY_RE.test(reason || '')) nonDispatch++;
  }
  if (total === 0) return [];
  const ratio = nonDispatch / total; if (ratio <= 0.3) return [];
  return [{ severity: 'warn', type: 'token-waste',
    message: `HEAD non-dispatch calls are ${Math.round(ratio * 100)}% of total (${nonDispatch}/${total}). Dispatch agents instead of direct tool use.`,
    file: null, nonDispatchCalls: nonDispatch, totalCalls: total }];
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
export async function runDoctor(cwd = process.cwd()) {
  const [claims, decisions, foundations, roleBoundaries, evidence, tokenWaste] = await Promise.all([
    scanClaims(cwd), checkDecisions(cwd), checkFoundations(cwd),
    checkRoleBoundaries(cwd), checkEvidence(cwd), checkTokenWaste(cwd),
  ]);

  const allFindings = [...roleBoundaries, ...evidence, ...tokenWaste];
  const blockCount = allFindings.filter(f => f.severity === 'block').length;
  const warnCount  = allFindings.filter(f => f.severity === 'warn').length;
  const legacyIssues = claims.issues.length + decisions.areas.filter(a => a.status !== 'active').length + foundations.issues.length;
  const legacyBlocking = decisions.areas.filter(a => a.status === 'missing').length + foundations.issues.filter(i => i.type === 'dependent-on-invalidated').length;
  const totalBlocking = legacyBlocking + blockCount;
  const verdict = totalBlocking > 0 ? 'fail' : (legacyIssues + warnCount > 0 ? 'issues' : 'pass');
  return { claims, decisions, foundations, roleBoundaries, evidence, tokenWaste,
    summary: { issueCount: legacyIssues + warnCount, blockingCount: totalBlocking, verdict } };
}

// ─── Formatter ────────────────────────────────────────────────────────────────
function section(out, title, items, emptyMsg) {
  out.push(`${title}:`);
  if (!items || items.length === 0) { out.push(`  ✓ ${emptyMsg}`); }
  else { for (const item of items) out.push(item); }
  out.push('');
}

export function formatDoctorReport(results) {
  const { claims, decisions, foundations, roleBoundaries, evidence, tokenWaste, summary } = results;
  const out = ['dual-brain doctor', ''];
  section(out, 'Claims Check',
    claims.issues.map(i => `  ⚠ ${i.file}:${i.line} — "${i.text}" (${i.label})`),
    'No unverified claims found');

  section(out, 'Decision Artifacts',
    decisions.areas.length === 0 ? null : decisions.areas.map(a =>
      a.status === 'active'   ? `  ✓ ${a.area} — decided ${a.decidedAt}, active` :
      a.status === 'expired'  ? `  ✗ ${a.area} — decision expired ${a.expiresAt}` :
      a.status === 'missing'  ? `  ⚠ ${a.area} — no decision artifact found` :
                                `  ⚠ ${a.area} — status: ${a.status}`),
    'No sensitive areas tracked');
  out.push('Foundations:');
  if (foundations.missing) {
    out.push('  ⚠ .dualbrain/foundations.json not found — no foundation tracking');
  } else if (foundations.foundations.length === 0) {
    out.push('  ✓ No foundations defined');
  } else {
    for (const f of foundations.foundations) {
      if (f.status === 'invalidated') {
        const n = (f.stillUsedBy || []).length;
        out.push(n === 0 ? `  ℹ ${f.id} — invalidated, no active dependents (resolved)` : `  ✗ ${f.id} — INVALIDATED, ${n} dependent${n === 1 ? '' : 's'} still using`);
      } else {
        out.push(`  ✓ ${f.id} — active, ${f.dependents.length} dependent${f.dependents.length === 1 ? '' : 's'}`);
      }
    }
    for (const issue of foundations.issues) {
      if (issue.type === 'dependent-on-invalidated') out.push(`  ✗ ${issue.file.join(', ')} — uses invalidated foundation "${issue.invalidatedFoundation}"`);
    }
  }
  out.push('');
  section(out, 'Role Boundaries',
    roleBoundaries && roleBoundaries.length > 0
      ? roleBoundaries.map(f => `  ${f.severity === 'block' ? '✗' : '⚠'} ${f.message}${f.file ? ` [${f.file}]` : ''}`)
      : null,
    'No role violations found');
  section(out, 'Evidence Verification',
    evidence && evidence.length > 0
      ? evidence.map(f => `  ${f.severity === 'block' ? '✗' : '⚠'} ${f.message} (${f.source})`)
      : null,
    'No outcome evidence issues found');
  section(out, 'Token Waste',
    tokenWaste && tokenWaste.length > 0 ? tokenWaste.map(f => `  ⚠ ${f.message}`) : null,
    'HEAD dispatch ratio is healthy');
  const { verdict, issueCount, blockingCount } = summary;
  const label = verdict === 'pass' ? 'PASS' :
    verdict === 'issues' ? `ISSUES (${issueCount} warning${issueCount === 1 ? '' : 's'})` :
                           `FAIL (${blockingCount} blocking)`;
  out.push(`Doctor verdict: ${label}`);

  return out.join('\n');
}

// ─── Health Manifest Runner ───────────────────────────────────────────────────
function atomicWrite(path, data) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, path);
}

function runVerification(item) {
  const v = item.verification || {};
  if (!v.command) return { status: 'untested', detail: '' };
  try {
    const output = execSync(v.command, { timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const ok = v.expect ? output.includes(v.expect) : output.includes('OK');
    return { status: ok ? 'pass' : 'fail', detail: ok ? '' : output.trim().slice(0, 200) };
  } catch (err) {
    return { status: 'fail', detail: (err.stderr || err.stdout || err.message || '').toString().trim().slice(0, 200) };
  }
}

function domainStats(items) {
  const domains = {};
  for (const item of items) {
    const d = item.domain || 'other';
    if (!domains[d]) domains[d] = { score: 0, total: 0, passed: 0, wt: 0, wp: 0 };
    const w = item.weight || 1;
    domains[d].total++; domains[d].wt += w;
    if (item.status === 'pass') { domains[d].passed++; domains[d].wp += w; }
  }
  for (const d of Object.keys(domains)) {
    const { wp, wt } = domains[d];
    domains[d].score = wt > 0 ? Math.round((wp / wt) * 100) : 0;
    delete domains[d].wt; delete domains[d].wp;
  }
  return domains;
}

export async function runHealthCheck(cwd = process.cwd(), mode = 'quick') {
  const mpath = join(cwd, '.dualbrain', 'health-manifest.json');
  const manifest = existsSync(mpath) ? (() => { try { return JSON.parse(readFileSync(mpath, 'utf8')); } catch { return null; } })() : null;
  const items = manifest ? (manifest.items || []) : [];
  const checkedAt = new Date().toISOString();
  let wt = 0, wp = 0, passed = 0, failed = 0, untested = 0;
  const findings = [];

  for (const item of items) {
    const isCmd = (item.verification || {}).type === 'command';
    const w = item.weight || 1;
    wt += w;
    if (isCmd) {
      const r = runVerification(item);
      item.status = r.status; item.lastChecked = checkedAt;
      if (r.status === 'pass') { passed++; wp += w; } else failed++;
      findings.push({ id: item.id, name: item.name, domain: item.domain || 'other', severity: item.severity || 'medium', status: r.status, detail: r.detail || '' });
    } else {
      item.status = item.status || 'untested'; untested++;
      findings.push({ id: item.id, name: item.name, domain: item.domain || 'other', severity: item.severity || 'medium', status: 'untested', detail: '' });
    }
  }

  const score = wt > 0 ? Math.round((wp / wt) * 100) : 0;
  if (manifest) atomicWrite(mpath, { ...manifest, items, updatedAt: checkedAt });
  return {
    score, total: items.length, passed, failed, untested, findings,
    domains: domainStats(items),
    staticChecks: mode === 'full' ? await runDoctor(cwd) : null,
    checkedAt,
  };
}

// ─── Health Report Formatter ──────────────────────────────────────────────────
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
function bar(passed, total, w = 10) {
  const f = total > 0 ? Math.round((passed / total) * w) : 0;
  return '█'.repeat(f) + '░'.repeat(w - f);
}

export function formatHealthReport(results) {
  const { score, domains, findings, staticChecks } = results;
  const out = [`🩺 Health Report — ${score}/100`, ''];

  for (const [domain, d] of Object.entries(domains)) {
    const hasUntested = findings.some(f => f.domain === domain && f.status === 'untested');
    out.push(`  ${domain.padEnd(12)} ${bar(d.passed, d.total)}  ${d.passed}/${d.total}${hasUntested ? ' (manual)' : ''}`);
  }
  out.push('');

  const failed = findings.filter(f => f.status === 'fail' || f.status === 'error');
  for (const f of failed) {
    const detail = f.detail ? ` — ${f.detail.split('\n')[0].slice(0, 80)}` : '';
    out.push(`  ✗ FAIL: ${f.domain}.${f.id}${detail}`);
  }
  if (failed.length > 0) {
    out.push('');
    const top = [...failed].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)).slice(0, 3);
    out.push('  Top priorities:');
    top.forEach((f, i) => out.push(`  ${i + 1}. Fix ${f.domain}.${f.id} (${f.severity})`));
  }

  if (staticChecks) out.push('', '  Static checks: ' + (staticChecks.summary?.verdict || 'unknown'));
  return out.join('\n');
}

// ─── Health Baseline Comparison ───────────────────────────────────────────────
export async function compareHealth(cwd = process.cwd()) {
  const bpath = join(cwd, '.dualbrain', 'health-baseline.json');
  let baseline = null;
  if (existsSync(bpath)) { try { baseline = JSON.parse(readFileSync(bpath, 'utf8')); } catch { /* ignore */ } }

  const current = await runHealthCheck(cwd, 'quick');
  const regressions = [], improvements = [];

  if (baseline && baseline.findings) {
    const prev = Object.fromEntries(baseline.findings.map(f => [f.id, f.status]));
    for (const f of current.findings) {
      if (prev[f.id] === 'pass' && (f.status === 'fail' || f.status === 'error')) regressions.push(f.id);
      else if ((prev[f.id] === 'fail' || prev[f.id] === 'error') && f.status === 'pass') improvements.push(f.id);
    }
  }

  atomicWrite(bpath, { ...current, savedAt: new Date().toISOString() });
  return {
    current: current.score,
    baseline: baseline ? (baseline.score ?? 0) : null,
    delta: baseline != null ? current.score - (baseline.score ?? 0) : null,
    regressions,
    improvements,
  };
}
