/**
 * doctor.mjs — Diagnostic and recovery stage in the dual-brain pipeline.
 * Doctor is a diagnostic/recovery stage in the pipeline. It proposes, never implements.
 *
 * Doctor can diagnose problems and propose recovery actions, but it NEVER directly
 * edits files, dispatches agents, or runs commands. All proposals are returned as
 * data for the pipeline to execute through its normal gated flow.
 *
 * Pipeline interface:
 *   doctorDiagnose(run)          — pre-execution diagnostic check
 *   doctorRecover(run, failure)  — post-failure recovery proposal
 *
 * Internal honesty checks (for developers working on this repo):
 *   runDoctor, formatDoctorReport, scanClaims, checkDecisions,
 *   checkFoundations, checkRoleBoundaries, checkEvidence, checkTokenWaste,
 *   runHealthCheck, formatHealthReport, compareHealth,
 *   doctorDiagnose, doctorRecover
 *
 * VERIFY system (runtime assumption verification):
 *   verify, verifyAll, getVerificationCache, getStaleAssumptions, formatVerifications
 */

import { existsSync, readFileSync, writeFileSync, renameSync, appendFileSync, mkdirSync, readdirSync } from 'fs';
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

// ─── Pipeline Stage: Diagnose ─────────────────────────────────────────────────

/**
 * Pipeline-compatible diagnostic check. Called before execution to surface
 * blocking or advisory findings based on the current pipeline run context.
 *
 * @param {object} run - PipelineRun object
 * @param {object}   run.context         - Context pack (prompt, files, detection, profile, cwd)
 * @param {object[]} run.failureHistory  - Prior failures for this prompt fingerprint
 * @param {object[]} run.priorOutcomes   - Recent outcome records
 * @param {object}   run.plan            - Execution plan (may be null before buildExecutionPlan)
 * @returns {Promise<{
 *   findings: Array<{check: string, severity: string, message: string}>,
 *   canProceed: boolean,
 *   suggestedFixes: string[],
 *   blockedApproaches: string[]
 * }>}
 */
export async function doctorDiagnose(run) {
  const { context = {}, failureHistory = [], priorOutcomes = [], plan = null } = run;
  const cwd = context.cwd ?? process.cwd();

  const findings = [];
  const suggestedFixes = [];

  // ── Role boundary check: pull from audit log ──────────────────────────────
  const roleBoundaries = await checkRoleBoundaries(cwd);
  for (const rb of roleBoundaries) {
    findings.push({ check: 'role-boundaries', severity: rb.severity, message: rb.message });
  }
  if (roleBoundaries.length > 0) {
    suggestedFixes.push('Dispatch search/work agents instead of using Read/Write/Bash directly from HEAD.');
  }

  // ── Evidence integrity check ──────────────────────────────────────────────
  const evidenceIssues = await checkEvidence(cwd);
  for (const ev of evidenceIssues) {
    findings.push({ check: 'evidence', severity: ev.severity, message: ev.message });
  }
  if (evidenceIssues.some(e => e.type === 'false-file-claim')) {
    suggestedFixes.push('Verify file claims match actual git state before recording outcomes as successful.');
  }

  // ── Token waste check ─────────────────────────────────────────────────────
  const wasteIssues = await checkTokenWaste(cwd);
  for (const tw of wasteIssues) {
    findings.push({ check: 'token-waste', severity: tw.severity, message: tw.message });
  }

  // ── Foundation integrity check ────────────────────────────────────────────
  const { issues: foundationIssues } = await checkFoundations(cwd);
  for (const fi of foundationIssues) {
    if (fi.type === 'dependent-on-invalidated') {
      findings.push({
        check: 'foundations',
        severity: 'block',
        message: `Active work depends on invalidated foundation "${fi.invalidatedFoundation}" via ${fi.file.join(', ')}`,
      });
      suggestedFixes.push(`Resolve dependency on invalidated foundation "${fi.invalidatedFoundation}" before proceeding.`);
    }
  }

  // ── Repeated failure detection ────────────────────────────────────────────
  const repeatFailures = failureHistory.filter(f => !f.resolved);
  if (repeatFailures.length >= 2) {
    findings.push({
      check: 'failure-history',
      severity: 'block',
      message: `${repeatFailures.length} unresolved prior failures for this prompt — repeated approach likely to fail again.`,
    });
    suggestedFixes.push('Escalate to dual-brain think flow before retrying. Prior approaches must not be repeated.');
  } else if (repeatFailures.length === 1) {
    findings.push({
      check: 'failure-history',
      severity: 'warn',
      message: '1 prior failure for this prompt — verify the approach differs before proceeding.',
    });
  }

  // ── Risk/plan consistency check ───────────────────────────────────────────
  if (plan && context.detection) {
    const { risk } = context.detection;
    if (risk === 'critical' && !plan.useChallenger) {
      findings.push({
        check: 'plan-consistency',
        severity: 'warn',
        message: 'Critical-risk task routed without challenger — dual-brain think is recommended.',
      });
      suggestedFixes.push('Enable challenger or run dual-brain think before executing critical-risk tasks.');
    }
  }

  // ── Derive blocked approaches from failure history ────────────────────────
  const blockedApproaches = repeatFailures
    .filter(f => f.approach)
    .map(f => f.approach);

  const canProceed = !findings.some(f => f.severity === 'block');

  return { findings, canProceed, suggestedFixes, blockedApproaches };
}

// ─── Pipeline Stage: Recover ──────────────────────────────────────────────────

/**
 * Pipeline-compatible recovery proposer. Called when pipeline execution fails.
 * Returns a recovery proposal for the pipeline to route — never executes directly.
 *
 * @param {object} run - PipelineRun object (same shape as doctorDiagnose)
 * @param {object} failure - Failure context from the failed execution
 * @param {string}  [failure.error]      - Error message
 * @param {string}  [failure.approach]   - What was attempted
 * @param {string}  [failure.tier]       - Tier that failed ('search'|'execute'|'think')
 * @param {number}  [failure.failCount]  - How many times this has failed
 * @returns {Promise<{
 *   proposal: string,
 *   avoidApproaches: string[],
 *   escalation: string|null
 * }>}
 */
export async function doctorRecover(run, failure = {}) {
  const { failureHistory = [] } = run;
  const { error = '', approach = '', tier = 'execute', failCount = 1 } = failure;

  // Collect all previously failed approaches from history + this failure
  const avoidApproaches = [
    ...failureHistory.filter(f => f.approach).map(f => f.approach),
    ...(approach ? [approach] : []),
  ].filter(Boolean);

  // Determine escalation: 2+ failures → dual-brain think
  const totalFailures = failureHistory.filter(f => !f.resolved).length + 1;
  const escalation = totalFailures >= 2 ? 'dual-brain' : null;

  // Build a concrete recovery proposal without implementing anything
  const proposalParts = [];

  if (escalation === 'dual-brain') {
    proposalParts.push(
      `Escalate to dual-brain think flow: ${totalFailures} failures indicate the approach is fundamentally flawed.`,
      'Run: node .claude/hooks/dual-brain-think.mjs --question "<revised problem statement>"',
      'Do not retry the same implementation path.',
    );
  } else {
    if (tier === 'search') {
      proposalParts.push('Retry search with narrower scope or different file patterns.');
    } else if (tier === 'execute') {
      proposalParts.push(
        'Re-route through execute tier with a revised task description.',
        error ? `Prior error was: ${error.slice(0, 120)}` : '',
      );
    } else if (tier === 'think') {
      proposalParts.push('Re-run think tier with more context or an explicit constraint list.');
    } else {
      proposalParts.push('Retry with a revised task description that avoids the failed approach.');
    }

    if (avoidApproaches.length > 0) {
      proposalParts.push(`Explicitly exclude these approaches: ${avoidApproaches.join(', ')}`);
    }
  }

  const proposal = proposalParts.filter(Boolean).join(' ');

  return { proposal, avoidApproaches, escalation };
}

// ─── VERIFY System ────────────────────────────────────────────────────────────

// TTL constants (ms)
const TTL_RUNTIME  = 5   * 60 * 1000;   // 5 minutes  — env/key checks
const TTL_TOOL     = 24  * 60 * 60 * 1000; // 24 hours   — installed tool checks
const TTL_REGISTRY = 7   * 24 * 60 * 60 * 1000; // 7 days — registry freshness

const VERIFIERS = {
  'claude-available': { ttl: TTL_TOOL, fn: () => {
    try { execSync('which claude', { stdio: 'pipe', timeout: 2000 }); return { status: 'verified', evidence: 'claude CLI found', probe: 'which claude' }; }
    catch { return { status: 'failed', evidence: 'claude CLI not found', probe: 'which claude' }; }
  }},
  'openai-key': { ttl: TTL_TOOL, fn: () => {
    try { execSync('which codex', { stdio: 'pipe', timeout: 2000 }); return { status: 'verified', evidence: 'codex CLI found (subscription auth)', probe: 'which codex' }; }
    catch { return { status: 'failed', evidence: 'codex CLI not found — run: codex login', probe: 'which codex' }; }
  }},
  'anthropic-key': { ttl: TTL_TOOL, fn: () => {
    try { execSync('which claude', { stdio: 'pipe', timeout: 2000 }); return { status: 'verified', evidence: 'claude CLI found (subscription auth)', probe: 'which claude' }; }
    catch { return { status: 'failed', evidence: 'claude CLI not found — run: claude login', probe: 'which claude' }; }
  }},
  'git-available': { ttl: TTL_TOOL, fn: () => {
    try { const v = execSync('git --version', { stdio: 'pipe', timeout: 2000 }).toString().trim(); return { status: 'verified', evidence: v, probe: 'git --version' }; }
    catch { return { status: 'failed', evidence: 'git not found', probe: 'git --version' }; }
  }},
  'npm-auth': { ttl: TTL_RUNTIME, fn: () => {
    try { const who = execSync('npm whoami', { stdio: 'pipe', timeout: 5000 }).toString().trim(); return { status: 'verified', evidence: `logged in as ${who}`, probe: 'npm whoami' }; }
    catch { return { status: 'failed', evidence: 'npm auth failed', probe: 'npm whoami' }; }
  }},
  'database-reachable': { ttl: TTL_RUNTIME, fn: () => {
    const url = process.env.DATABASE_URL;
    if (!url) return { status: 'failed', evidence: 'DATABASE_URL not set', probe: 'env check' };
    return { status: 'verified', evidence: 'DATABASE_URL configured (not connection-tested)', probe: 'env check' };
  }},
  'codex-available': { ttl: TTL_TOOL, fn: () => {
    try { execSync('which codex', { stdio: 'pipe', timeout: 2000 }); return { status: 'verified', evidence: 'codex CLI found', probe: 'which codex' }; }
    catch { return { status: 'failed', evidence: 'codex CLI not found', probe: 'which codex' }; }
  }},
  'rg-available': { ttl: TTL_TOOL, fn: () => {
    try { execSync('which rg', { stdio: 'pipe', timeout: 2000 }); return { status: 'verified', evidence: 'ripgrep found', probe: 'which rg' }; }
    catch { return { status: 'failed', evidence: 'ripgrep not found', probe: 'which rg' }; }
  }},
  'living-docs-init': { ttl: TTL_RUNTIME, fn: (cwd) => {
    const exists = existsSync(join(cwd || process.cwd(), '.dualbrain'));
    return { status: exists ? 'verified' : 'failed', evidence: exists ? '.dualbrain/ exists' : '.dualbrain/ not initialized', probe: 'fs check' };
  }},
  'model-registry-fresh': { ttl: TTL_REGISTRY, fn: () => {
    try {
      const age = Math.floor((Date.now() - new Date('2026-05-15').getTime()) / 86400000);
      return { status: age <= 30 ? 'verified' : 'failed', evidence: `Registry ${age} days old`, probe: 'registry age check' };
    } catch { return { status: 'unknown', evidence: 'Could not check', probe: 'registry age' }; }
  }},
};

/**
 * verify(claim, cwd) — test a single assumption by claim identifier.
 * Returns a verification result object with status, evidence, probe, and timestamps.
 */
export function verify(claim, cwd) {
  const checkedAt = new Date().toISOString();
  const verifier = VERIFIERS[claim];
  if (!verifier) {
    const expiresAt = new Date(Date.now() + TTL_RUNTIME).toISOString();
    return { claim, status: 'unknown', evidence: `No verifier registered for "${claim}"`, checkedAt, expiresAt, probe: 'none' };
  }
  try {
    const result = verifier.fn(cwd);
    const expiresAt = new Date(Date.now() + verifier.ttl).toISOString();
    return { claim, status: result.status, evidence: result.evidence, checkedAt, expiresAt, probe: result.probe };
  } catch (err) {
    const expiresAt = new Date(Date.now() + TTL_RUNTIME).toISOString();
    return { claim, status: 'unknown', evidence: `Verifier threw: ${err.message || String(err)}`, checkedAt, expiresAt, probe: 'error' };
  }
}

/**
 * verifyAll(cwd) — run all registered verifiers and append results to .dualbrain/verifications.jsonl.
 * Returns array of verification result objects.
 */
export function verifyAll(cwd = process.cwd()) {
  const results = Object.keys(VERIFIERS).map(claim => verify(claim, cwd));

  // Persist to .dualbrain/verifications.jsonl (append-only)
  try {
    const dir = join(cwd, '.dualbrain');
    if (existsSync(dir)) {
      const logPath = join(dir, 'verifications.jsonl');
      const lines = results.map(r => JSON.stringify(r)).join('\n') + '\n';
      appendFileSync(logPath, lines, 'utf8');
    }
  } catch { /* storage failure is non-fatal */ }

  return results;
}

/**
 * getVerificationCache(cwd) — read .dualbrain/verifications.jsonl, return most recent
 * non-expired result per claim. Expired entries are skipped.
 */
export function getVerificationCache(cwd = process.cwd()) {
  const logPath = join(cwd, '.dualbrain', 'verifications.jsonl');
  if (!existsSync(logPath)) return [];

  let lines;
  try { lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean); }
  catch { return []; }

  const now = new Date().toISOString();
  const latest = {};

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry.claim || !entry.expiresAt) continue;
    if (entry.expiresAt < now) continue; // expired — skip
    // Keep the most recent non-expired entry per claim
    if (!latest[entry.claim] || entry.checkedAt > latest[entry.claim].checkedAt) {
      latest[entry.claim] = entry;
    }
  }

  return Object.values(latest);
}

/**
 * getStaleAssumptions(cwd) — return claims that are expired or failed.
 * Checks cache first; any claim not in cache (or failed in cache) is considered stale.
 */
export function getStaleAssumptions(cwd = process.cwd()) {
  const cached = getVerificationCache(cwd);
  const cachedMap = Object.fromEntries(cached.map(r => [r.claim, r]));
  const stale = [];

  for (const claim of Object.keys(VERIFIERS)) {
    const entry = cachedMap[claim];
    if (!entry) {
      // No valid cached result — treat as stale
      stale.push({ claim, reason: 'no-cache', status: 'unknown', evidence: 'Never verified or all results expired' });
    } else if (entry.status === 'failed') {
      stale.push({ claim, reason: 'failed', status: 'failed', evidence: entry.evidence, checkedAt: entry.checkedAt });
    }
    // 'verified' and 'unknown' with valid cache are not stale
  }

  return stale;
}

/**
 * formatVerifications(results) — display string for a list of verification results.
 */
export function formatVerifications(results) {
  const lines = ['SYSTEM VERIFICATION'];
  for (const r of results) {
    const icon = r.status === 'verified' ? '✓' : r.status === 'failed' ? '✗' : '⚠';
    lines.push(`  ${icon} ${r.claim}: ${r.evidence}`);
  }
  return lines.join('\n');
}

// ─── LEARN System ─────────────────────────────────────────────────────────────

const THINK_TIER_MODELS = new Set(['claude-opus-4-6', 'o3', 'gpt-5.5']);
const FAST_TIER_MODELS  = new Set(['claude-haiku-4-5-20251001', 'gpt-4o-mini']);
const CODE_TASK_TYPES   = new Set(['fix', 'feature', 'refactor', 'implement', 'test', 'build', 'edit']);
const REASONING_MODELS  = new Set(['o3']);

function learningsPath(cwd) {
  return join(cwd, '.dualbrain', 'learnings.jsonl');
}

function readLearnings(cwd) {
  const p = learningsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  } catch { return []; }
}

function deriveModelFit(taskResult) {
  const { success, model, tier, taskType, duration, filesChanged } = taskResult;
  const isThinkModel = THINK_TIER_MODELS.has(model);
  const isFastModel  = FAST_TIER_MODELS.has(model);
  const isReasoningModel = REASONING_MODELS.has(model);
  const isCodeTask   = CODE_TASK_TYPES.has(taskType);

  if (isReasoningModel && isCodeTask) return 'wrong_type';
  if (!isCodeTask && !isReasoningModel && isThinkModel && tier === 'search') return 'wrong_type';

  if (!success) {
    if (isFastModel && tier !== 'search') return 'underpowered';
    return 'good';
  }

  if (isThinkModel && (tier === 'search' || (filesChanged <= 1 && duration < 30000))) return 'overkill';
  if (isFastModel && filesChanged > 3) return 'underpowered';

  return 'good';
}

function deriveRoutingAccuracy(taskResult) {
  const { success, modelFit, tier, duration, model } = taskResult;
  const isFastModel = FAST_TIER_MODELS.has(model);
  const isThinkModel = THINK_TIER_MODELS.has(model);

  if (success && (modelFit === 'good' || modelFit === 'wrong_type')) return 'correct';
  if (!success && isFastModel && tier !== 'search') return 'should_have_escalated';
  if (success && isThinkModel && duration > 120000 && modelFit === 'overkill') return 'should_have_simplified';
  if (success && modelFit === 'overkill') return 'should_have_simplified';
  if (!success) return 'should_have_escalated';
  return 'correct';
}

export function recordLearning(taskResult, cwd = process.cwd()) {
  try {
    const {
      taskType = 'unknown',
      prompt = '',
      model = '',
      provider = '',
      tier = '',
      reasoningDepth = 'low',
      wasEnriched = false,
      wasDualBrain = false,
      success = false,
      duration = 0,
      filesChanged = 0,
    } = taskResult;

    const modelFit = deriveModelFit({ success, model, tier, taskType, duration, filesChanged });

    const record = {
      id: `learn_${Date.now()}`,
      timestamp: new Date().toISOString(),
      taskType,
      prompt: String(prompt).slice(0, 200),
      model,
      provider,
      tier,
      reasoningDepth,
      wasEnriched,
      wasDualBrain,
      success,
      duration,
      filesChanged,
      modelFit,
      routingAccuracy: deriveRoutingAccuracy({ success, modelFit, tier, duration, model }),
    };

    const p = learningsPath(cwd);
    const dir = join(cwd, '.dualbrain');
    if (existsSync(dir)) {
      appendFileSync(p, JSON.stringify(record) + '\n', 'utf8');
    }
    return record;
  } catch { return null; }
}

export function getModelSuccessRates(cwd = process.cwd(), days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const learnings = readLearnings(cwd).filter(l => l.timestamp >= cutoff);

  const stats = {};
  for (const l of learnings) {
    if (!l.model) continue;
    if (!stats[l.model]) stats[l.model] = { total: 0, success: 0, totalDuration: 0, tierCounts: {} };
    stats[l.model].total += 1;
    if (l.success) stats[l.model].success += 1;
    stats[l.model].totalDuration += (l.duration || 0);
    const tierKey = `${l.tier || 'unknown'}:${l.taskType || 'unknown'}`;
    stats[l.model].tierCounts[tierKey] = (stats[l.model].tierCounts[tierKey] || 0) + 1;
  }

  const result = {};
  for (const [model, s] of Object.entries(stats)) {
    const topTiers = Object.entries(s.tierCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => key.split(':')[0] + ':' + key.split(':')[1]);
    result[model] = {
      total: s.total,
      success: s.success,
      rate: s.total > 0 ? Math.round((s.success / s.total) * 100) / 100 : 0,
      avgDuration: s.total > 0 ? Math.round(s.totalDuration / s.total) : 0,
      bestFor: [...new Set(topTiers.map(t => t.split(':')[0]))],
    };
  }
  return result;
}

export function getRoutingInsights(cwd = process.cwd()) {
  const learnings = readLearnings(cwd);
  if (learnings.length === 0) return [];

  const insights = [];
  const MIN_POINTS = 5;

  const byModelTask = {};
  for (const l of learnings) {
    const key = `${l.model}:${l.taskType}`;
    if (!byModelTask[key]) byModelTask[key] = { success: 0, total: 0, overkill: 0, underpowered: 0 };
    byModelTask[key].total += 1;
    if (l.success) byModelTask[key].success += 1;
    if (l.modelFit === 'overkill') byModelTask[key].overkill += 1;
    if (l.modelFit === 'underpowered') byModelTask[key].underpowered += 1;
  }

  for (const [key, s] of Object.entries(byModelTask)) {
    if (s.total < MIN_POINTS) continue;
    const [model, taskType] = key.split(':');
    const rate = s.success / s.total;
    const overkillRate = s.overkill / s.total;
    const underpoweredRate = s.underpowered / s.total;

    if (rate >= 0.9 && overkillRate < 0.1) {
      insights.push({
        insight: `${model} succeeds ${Math.round(rate * 100)}% on ${taskType} tasks — reliable for this work`,
        confidence: Math.min(0.95, 0.6 + s.total * 0.01),
        evidence: `${s.success}/${s.total} tasks`,
      });
    }

    if (overkillRate > 0.3 && rate >= 0.85) {
      insights.push({
        insight: `${model} is overkill for ${taskType} — a cheaper model likely sufficient`,
        confidence: Math.min(0.9, 0.5 + s.total * 0.01),
        evidence: `${s.overkill}/${s.total} tasks flagged overkill`,
      });
    }

    if (underpoweredRate > 0.3 || rate < 0.7) {
      insights.push({
        insight: `${model} struggles on ${taskType} (${Math.round(rate * 100)}% success) — consider escalating`,
        confidence: Math.min(0.9, 0.5 + s.total * 0.01),
        evidence: `${s.success}/${s.total} tasks`,
      });
    }
  }

  const enriched    = learnings.filter(l => l.wasEnriched);
  const notEnriched = learnings.filter(l => !l.wasEnriched);
  if (enriched.length >= MIN_POINTS && notEnriched.length >= MIN_POINTS) {
    const rateEnriched    = enriched.filter(l => l.success).length / enriched.length;
    const rateNotEnriched = notEnriched.filter(l => l.success).length / notEnriched.length;
    const delta = Math.round((rateEnriched - rateNotEnriched) * 100);
    if (Math.abs(delta) >= 10) {
      insights.push({
        insight: delta > 0
          ? `Prompt enrichment improved success rate by ${delta}%`
          : `Prompt enrichment had no benefit — success rate ${Math.abs(delta)}% lower`,
        confidence: Math.min(0.9, 0.5 + Math.min(enriched.length, notEnriched.length) * 0.01),
        evidence: `${enriched.length} enriched vs ${notEnriched.length} raw`,
      });
    }
  }

  const dualBrain    = learnings.filter(l => l.wasDualBrain);
  const singleBrain  = learnings.filter(l => !l.wasDualBrain);
  if (dualBrain.length >= MIN_POINTS && singleBrain.length >= MIN_POINTS) {
    const rateDual   = dualBrain.filter(l => l.success).length / dualBrain.length;
    const rateSingle = singleBrain.filter(l => l.success).length / singleBrain.length;
    const delta = Math.round((rateDual - rateSingle) * 100);
    if (delta >= 10) {
      insights.push({
        insight: `Dual-brain review improves success rate by ${delta}% over single-brain`,
        confidence: Math.min(0.85, 0.5 + Math.min(dualBrain.length, singleBrain.length) * 0.015),
        evidence: `${dualBrain.length} dual vs ${singleBrain.length} single`,
      });
    }
  }

  return insights;
}

export function suggestRoutingAdjustment(taskType, currentModel, cwd = process.cwd()) {
  const learnings = readLearnings(cwd).filter(
    l => l.taskType === taskType && l.model === currentModel
  );

  if (learnings.length < 5) {
    return { suggestion: 'keep', reason: 'insufficient data', confidence: 0, evidenceCount: learnings.length, suggestedModel: null };
  }

  const total = learnings.length;
  const successCount = learnings.filter(l => l.success).length;
  const successRate = successCount / total;
  const overkillCount = learnings.filter(l => l.modelFit === 'overkill').length;
  const overkillRate = overkillCount / total;

  if (successRate > 0.9 && overkillRate > 0.3) {
    const isFastModel = FAST_TIER_MODELS.has(currentModel);
    const isThinkModel = THINK_TIER_MODELS.has(currentModel);
    let suggestedModel = null;
    if (isThinkModel) {
      suggestedModel = currentModel.startsWith('claude') ? 'claude-sonnet-4-6' : 'gpt-4o';
    } else if (!isFastModel) {
      suggestedModel = currentModel.startsWith('claude') ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
    }
    return {
      suggestion: 'simplify',
      reason: `${Math.round(successRate * 100)}% success rate with ${Math.round(overkillRate * 100)}% overkill signal`,
      confidence: Math.min(0.9, 0.5 + total * 0.01),
      evidenceCount: total,
      suggestedModel,
    };
  }

  if (successRate < 0.7) {
    const isThinkModel = THINK_TIER_MODELS.has(currentModel);
    let suggestedModel = null;
    if (!isThinkModel) {
      suggestedModel = currentModel.startsWith('claude') ? 'claude-opus-4-6' : 'o3';
    }
    return {
      suggestion: 'escalate',
      reason: `${Math.round(successRate * 100)}% success rate on ${taskType} — below acceptable threshold`,
      confidence: Math.min(0.9, 0.5 + total * 0.01),
      evidenceCount: total,
      suggestedModel,
    };
  }

  return {
    suggestion: 'keep',
    reason: `${Math.round(successRate * 100)}% success rate — routing is appropriate`,
    confidence: Math.min(0.9, 0.5 + total * 0.01),
    evidenceCount: total,
    suggestedModel: null,
  };
}

export function formatLearnings(insights, cwd = process.cwd()) {
  const learnings = readLearnings(cwd);
  const rates = getModelSuccessRates(cwd);
  const total = learnings.length;

  const lines = [`ROUTING INTELLIGENCE (${total} task${total === 1 ? '' : 's'} analyzed)`];

  for (const [model, s] of Object.entries(rates)) {
    if (s.total < 3) continue;
    const pct = Math.round(s.rate * 100);
    const tasks = s.bestFor.join('/') || 'various';
    const icon = pct >= 85 ? '📈' : pct >= 70 ? '📊' : '⚠️ ';
    lines.push(`  ${icon} ${model}: ${pct}% success on ${tasks} tasks (${s.total} tasks)`);
  }

  for (const ins of (insights || [])) {
    const pct = Math.round(ins.confidence * 100);
    const isWarning = ins.insight.toLowerCase().includes('struggle') || ins.insight.toLowerCase().includes('below') || ins.insight.toLowerCase().includes('no benefit');
    const icon = isWarning ? '⚠️ ' : '💡';
    lines.push(`  ${icon} ${ins.insight}`);
  }

  return lines.join('\n');
}

export function getLearningStats(cwd = process.cwd()) {
  const learnings = readLearnings(cwd);
  if (learnings.length === 0) {
    return { totalLearnings: 0, oldestEntry: null, newestEntry: null, modelsTracked: 0, avgSuccessRate: 0 };
  }
  const timestamps = learnings.map(l => l.timestamp).sort();
  const models = new Set(learnings.map(l => l.model).filter(Boolean));
  const successCount = learnings.filter(l => l.success).length;
  return {
    totalLearnings: learnings.length,
    oldestEntry: timestamps[0],
    newestEntry: timestamps[timestamps.length - 1],
    modelsTracked: models.size,
    avgSuccessRate: Math.round((successCount / learnings.length) * 100) / 100,
  };
}

// ─── DISCOVER System ─────────────────────────────────────────────────────────

const KNOWN_TOOLS = ['git','node','npm','codex','claude','rg','gh','replit','docker','python','python3','pip','cargo','go','java','ruby','deno','bun','pnpm','yarn'];
const STANDARD_AWARENESS = new Set(['git','node','npm','codex','claude','rg','gh','replit']);

const SERVICE_PATTERNS = {
  'REDIS_URL':           'Redis',
  'MONGODB_URI':         'MongoDB',
  'MONGO_URL':           'MongoDB',
  'ELASTICSEARCH_URL':   'Elasticsearch',
  'RABBITMQ_URL':        'RabbitMQ',
  'S3_BUCKET':           'S3 Storage',
  'AWS_ACCESS_KEY_ID':   'AWS',
  'GCP_PROJECT':         'Google Cloud',
  'STRIPE_SECRET_KEY':   'Stripe',
  'SENDGRID_API_KEY':    'SendGrid',
  'TWILIO_ACCOUNT_SID':  'Twilio',
  'SENTRY_DSN':          'Sentry',
  'DATADOG_API_KEY':     'Datadog',
  'SUPABASE_URL':        'Supabase',
  'FIREBASE_PROJECT_ID': 'Firebase',
  'NEON_DATABASE_URL':   'Neon DB',
};

const KNOWN_FRAMEWORKS = ['express','next','react','vue','fastify','prisma','drizzle','nestjs','koa','hapi','svelte','nuxt','remix','astro','trpc'];

function safeExecSyncDiscover(cmd) {
  try {
    return execSync(cmd, { timeout: 2000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  } catch { return null; }
}

function discoverCLITools() {
  const found = [];
  for (const tool of KNOWN_TOOLS) {
    const toolPath = safeExecSyncDiscover(`which ${tool}`);
    if (toolPath && !STANDARD_AWARENESS.has(tool)) {
      found.push({ type: 'tool', name: tool, detail: `${tool} CLI available at ${toolPath}`, source: 'PATH scan' });
    }
  }
  return found;
}

/**
 * discoverMCPTools(cwd) — scan for MCP servers across known config locations.
 * Returns array of { name, command, args } for each configured MCP server.
 */
export function discoverMCPTools(cwd = process.cwd()) {
  const locations = [
    join(process.env.HOME || '/root', '.claude', 'claude_desktop_config.json'),
    join(cwd, '.claude', 'settings.json'),
    join(cwd, '.claude', 'settings.local.json'),
  ];
  const servers = [];
  const seen = new Set();
  for (const loc of locations) {
    if (!existsSync(loc)) continue;
    let cfg;
    try { cfg = JSON.parse(readFileSync(loc, 'utf8')); } catch { continue; }
    const mcpServers = cfg.mcpServers || (cfg.mcp && cfg.mcp.servers) || {};
    for (const [name, conf] of Object.entries(mcpServers)) {
      if (seen.has(name)) continue;
      seen.add(name);
      servers.push({ name, command: conf.command || null, args: conf.args || [] });
    }
  }
  return servers;
}

function discoverMCPCapabilities(cwd) {
  const servers = discoverMCPTools(cwd);
  return servers.map(s => ({
    type: 'mcp',
    name: s.name,
    detail: `MCP server: ${[s.command, ...(s.args || [])].filter(Boolean).join(' ')}`.trim(),
    source: 'MCP config scan',
  }));
}

function discoverEnvServices() {
  const found = [];
  const seen = new Set();
  for (const [envKey, service] of Object.entries(SERVICE_PATTERNS)) {
    if (process.env[envKey] !== undefined && !seen.has(service)) {
      seen.add(service);
      // Report presence only — NEVER expose values
      found.push({ type: 'env', name: service, detail: `${service} configured via ${envKey}`, source: 'env scan' });
    }
  }
  return found;
}

function discoverProjectTools(cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return [];
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { return []; }

  const found = [];
  for (const [name] of Object.entries(pkg.scripts || {})) {
    found.push({ type: 'cli', name: `npm run ${name}`, detail: `Project script: ${name}`, source: 'package.json scripts' });
  }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const fw of KNOWN_FRAMEWORKS) {
    if (allDeps[fw]) {
      found.push({ type: 'config', name: fw, detail: `${fw} framework detected (${allDeps[fw]})`, source: 'package.json deps' });
    }
  }
  return found;
}

function discoverReplitFeatures(cwd) {
  const replitPath = join(cwd, '.replit');
  if (!existsSync(replitPath)) return [];
  let content;
  try { content = readFileSync(replitPath, 'utf8'); } catch { return []; }

  const found = [];
  if (/\[deployment\]/i.test(content))
    found.push({ type: 'service', name: 'replit-deployment', detail: 'Replit deployment config present', source: '.replit' });
  if (/\[auth\]/i.test(content))
    found.push({ type: 'service', name: 'replit-auth', detail: 'Replit auth config present', source: '.replit' });

  const moduleMatch = content.match(/^modules\s*=\s*\[([^\]]+)\]/m);
  if (moduleMatch) {
    const modules = moduleMatch[1].split(',').map(m => m.trim().replace(/['"]/g, '')).filter(Boolean);
    for (const mod of modules) {
      found.push({ type: 'config', name: `replit-module:${mod}`, detail: `Replit module: ${mod}`, source: '.replit' });
    }
  }

  const nixChannelPath = join(cwd, '.replit', 'nix', 'channel');
  if (existsSync(nixChannelPath)) {
    let channel;
    try { channel = readFileSync(nixChannelPath, 'utf8').trim(); } catch { channel = 'unknown'; }
    found.push({ type: 'config', name: 'nix', detail: `Nix channel: ${channel}`, source: '.replit/nix/channel' });
  }

  return found;
}

function loadLastDiscovery(cwd) {
  const logPath = join(cwd, '.dualbrain', 'discoveries.jsonl');
  if (!existsSync(logPath)) return null;
  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch { return null; }
}

function appendDiscoveryLog(cwd, entry) {
  const dir = join(cwd, '.dualbrain');
  try {
    if (!existsSync(dir)) execSync(`mkdir -p "${dir}"`, { timeout: 2000 });
    appendFileSync(join(dir, 'discoveries.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* graceful degradation */ }
}

/**
 * discover(cwd) — scan for capabilities not in the standard awareness set.
 * Returns { discoveredAt, newCapabilities, knownCapabilities, totalFound }.
 */
export function discover(cwd = process.cwd()) {
  const discoveredAt = new Date().toISOString();
  const allFound = [];

  // Each probe is independent — failures don't stop others
  try { allFound.push(...discoverCLITools()); } catch { /* ignore */ }
  try { allFound.push(...discoverMCPCapabilities(cwd)); } catch { /* ignore */ }
  try { allFound.push(...discoverEnvServices()); } catch { /* ignore */ }
  try { allFound.push(...discoverProjectTools(cwd)); } catch { /* ignore */ }
  try { allFound.push(...discoverReplitFeatures(cwd)); } catch { /* ignore */ }

  const last = loadLastDiscovery(cwd);
  const lastNames = new Set(last ? (last.newCapabilities || []).map(c => `${c.type}:${c.name}`) : []);
  const prevKnown = last ? (last.knownCapabilities || 0) : 0;

  const newCapabilities = allFound.filter(c => !lastNames.has(`${c.type}:${c.name}`));

  const result = {
    discoveredAt,
    newCapabilities,
    knownCapabilities: prevKnown + (allFound.length - newCapabilities.length),
    totalFound: allFound.length,
  };

  appendDiscoveryLog(cwd, result);
  return result;
}

/**
 * getDiscoveryLog(cwd, limit) — read recent discovery entries from .dualbrain/discoveries.jsonl.
 */
export function getDiscoveryLog(cwd = process.cwd(), limit = 20) {
  const logPath = join(cwd, '.dualbrain', 'discoveries.jsonl');
  if (!existsSync(logPath)) return [];
  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/**
 * getNewSinceLastScan(cwd) — run discover(), return only capabilities not seen in previous scan.
 */
export function getNewSinceLastScan(cwd = process.cwd()) {
  const last = loadLastDiscovery(cwd);
  const lastNames = new Set(last ? (last.newCapabilities || []).map(c => `${c.type}:${c.name}`) : []);

  const current = discover(cwd);
  const trulyNew = current.newCapabilities.filter(c => !lastNames.has(`${c.type}:${c.name}`));
  return { ...current, newCapabilities: trulyNew };
}

/**
 * formatDiscovery(result) — format discovery result as a human-readable string.
 */
export function formatDiscovery(result) {
  const { newCapabilities = [], totalFound = 0 } = result;
  const newCount = newCapabilities.length;
  const lines = [`CAPABILITY DISCOVERY (${totalFound} found, ${newCount} new)`];

  for (const cap of newCapabilities) {
    lines.push(`  🆕 ${cap.type}: ${cap.name} — ${cap.detail}`);
  }

  const alreadyKnown = totalFound - newCount;
  if (alreadyKnown > 0) {
    lines.push(`  ── ${alreadyKnown} known capability${alreadyKnown === 1 ? '' : 'ies'} (already tracked)`);
  }

  if (newCount === 0 && totalFound === 0) {
    lines.push('  (no capabilities detected)');
  }

  return lines.join('\n');
}

// ─── EVENT LEDGER ─────────────────────────────────────────────────────────────
// Append-only event log at .dualbrain/doctor/events.jsonl
// Event types: check_result, gate_failure, contradiction_caught, agent_drift,
//              manual_fix, incident, check_proposed, check_promoted, check_demoted, check_sentineled

function doctorDir(cwd) {
  return join(cwd || process.cwd(), '.dualbrain', 'doctor');
}

function eventsPath(cwd) {
  return join(doctorDir(cwd), 'events.jsonl');
}

function checksDir(cwd) {
  return join(doctorDir(cwd), 'checks');
}

function ensureDoctorDir(cwd) {
  try { mkdirSync(checksDir(cwd), { recursive: true }); } catch { /* ignore */ }
}

/**
 * recordEvent(event, cwd) — append an event to the doctor event ledger.
 * Event schema: { ts, type, source, checkId, severity, outcome, evidence, sessionId, release }
 */
export function recordEvent(event, cwd = process.cwd()) {
  try {
    ensureDoctorDir(cwd);
    const entry = {
      ts: new Date().toISOString(),
      type: event.type || 'unknown',
      source: event.source || 'pipeline',
      checkId: event.checkId || null,
      severity: event.severity || null,
      outcome: event.outcome || null,
      evidence: event.evidence || null,
      sessionId: event.sessionId || null,
      release: event.release || null,
      ...event,  // allow extra fields
    };
    appendFileSync(eventsPath(cwd), JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  } catch { return null; }
}

/**
 * getRecentEvents(cwd, days) — read events from the last N days.
 */
export function getRecentEvents(cwd = process.cwd(), days = 7) {
  const p = eventsPath(cwd);
  if (!existsSync(p)) return [];
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
      .flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter(e => e.ts >= cutoff);
  } catch { return []; }
}

/**
 * getEventsForCheck(checkId, cwd) — filter ledger events by checkId.
 */
export function getEventsForCheck(checkId, cwd = process.cwd()) {
  const p = eventsPath(cwd);
  if (!existsSync(p)) return [];
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
      .flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } })
      .filter(e => e.checkId === checkId);
  } catch { return []; }
}

// ─── CHECK REGISTRY ───────────────────────────────────────────────────────────
// Each check spec is stored as a JSON file in .dualbrain/doctor/checks/<id>.json

const STATIC_CHECK_SEEDS = [
  { id: 'package-name',     kind: 'package-json-field',  severity: 'fail' },
  { id: 'version-scheme',   kind: 'package-json-field',  severity: 'fail' },
  { id: 'bin-target',       kind: 'export-target',       severity: 'fail' },
  { id: 'exports',          kind: 'export-target',       severity: 'fail' },
  { id: 'required-files',   kind: 'file-exists',         severity: 'fail' },
  { id: 'branding-check',   kind: 'forbidden-string',    severity: 'fail' },
  { id: 'readme-commands',  kind: 'readme-contract',     severity: 'warn' },
  { id: 'dead-exports',     kind: 'export-target',       severity: 'warn' },
  { id: 'files-array',      kind: 'file-exists',         severity: 'warn' },
  { id: 'cli-smoke-test',   kind: 'command-exit',        severity: 'fail' },
  { id: 'npm-pack-dry-run', kind: 'command-exit',        severity: 'fail' },
];

function checkSpecPath(checkId, cwd) {
  return join(checksDir(cwd), `${checkId}.json`);
}

function defaultSpec(seed) {
  return {
    id: seed.id,
    kind: seed.kind,
    severity: seed.severity,
    source: seed.source || 'static',
    status: seed.status || 'active',
    sentinel: seed.sentinel || false,
    createdAt: seed.createdAt || new Date().toISOString().slice(0, 10),
    createdFrom: seed.createdFrom || null,
    signal: {
      hits: 0,
      falsePositives: 0,
      truePositives: 0,
      lastSeen: null,
      lastFailed: null,
    },
  };
}

/**
 * getCheckRegistry(cwd) — load all check specs from the registry directory.
 * Seeds static checks if they don't exist yet.
 */
export function getCheckRegistry(cwd = process.cwd()) {
  try {
    ensureDoctorDir(cwd);
    // Seed static checks on first call
    for (const seed of STATIC_CHECK_SEEDS) {
      const p = checkSpecPath(seed.id, cwd);
      if (!existsSync(p)) {
        try {
          writeFileSync(p, JSON.stringify(defaultSpec(seed), null, 2) + '\n', 'utf8');
        } catch { /* ignore */ }
      }
    }
    // Load all check specs
    let entries;
    try { entries = readdirSync(checksDir(cwd)).filter(f => f.endsWith('.json')); }
    catch { return []; }
    return entries.flatMap(fname => {
      try { return [JSON.parse(readFileSync(join(checksDir(cwd), fname), 'utf8'))]; }
      catch { return []; }
    });
  } catch { return []; }
}

/**
 * registerCheck(spec, cwd) — add or update a check spec in the registry.
 */
export function registerCheck(spec, cwd = process.cwd()) {
  if (!spec || !spec.id) throw new Error('registerCheck: spec.id is required');
  try {
    ensureDoctorDir(cwd);
    const p = checkSpecPath(spec.id, cwd);
    const existing = existsSync(p)
      ? (() => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } })()
      : null;
    const merged = existing ? { ...existing, ...spec } : { ...defaultSpec(spec), ...spec };
    writeFileSync(p, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    return merged;
  } catch (e) { throw new Error(`registerCheck failed: ${e.message}`); }
}

/**
 * updateCheckStats(checkId, outcome, cwd) — increment signal stats for a check.
 * outcome: 'pass' | 'fail' | 'warn' | 'false_positive'
 */
export function updateCheckStats(checkId, outcome, cwd = process.cwd()) {
  try {
    ensureDoctorDir(cwd);
    const p = checkSpecPath(checkId, cwd);
    if (!existsSync(p)) return; // not registered — skip silently
    let spec; try { spec = JSON.parse(readFileSync(p, 'utf8')); } catch { return; }
    const signal = spec.signal || { hits: 0, falsePositives: 0, truePositives: 0, lastSeen: null, lastFailed: null };
    const now = new Date().toISOString();
    if (outcome === 'fail' || outcome === 'warn') {
      signal.hits = (signal.hits || 0) + 1;
      signal.truePositives = (signal.truePositives || 0) + 1;
      signal.lastSeen = now;
      signal.lastFailed = now;
    } else if (outcome === 'false_positive') {
      signal.hits = (signal.hits || 0) + 1;
      signal.falsePositives = (signal.falsePositives || 0) + 1;
      signal.lastSeen = now;
    } else if (outcome === 'pass') {
      signal.lastSeen = now;
    }
    spec.signal = signal;
    writeFileSync(p, JSON.stringify(spec, null, 2) + '\n', 'utf8');
  } catch { /* graceful degradation */ }
}

/**
 * getCheckHealth(cwd) — summary of all checks with signal stats.
 */
export function getCheckHealth(cwd = process.cwd()) {
  const registry = getCheckRegistry(cwd);
  return registry.map(spec => {
    const sig = spec.signal || {};
    const hits = sig.hits || 0;
    const fp = sig.falsePositives || 0;
    const fpRate = hits >= 5 ? fp / hits : null;
    return {
      id: spec.id,
      kind: spec.kind,
      status: spec.status,
      sentinel: spec.sentinel,
      hits,
      falsePositives: fp,
      truePositives: sig.truePositives || 0,
      fpRate,
      lastSeen: sig.lastSeen,
      lastFailed: sig.lastFailed,
    };
  });
}

// ─── RECONCILE ────────────────────────────────────────────────────────────────
// Core invariant checks that should become sentinel candidates
const SENTINEL_INVARIANTS = new Set(['version-scheme', 'package-name', 'bin-target']);

const VALID_PRIMITIVES = new Set([
  'file-exists', 'forbidden-string', 'command-exit', 'command-output',
  'package-json-field', 'readme-contract', 'export-target',
]);

/**
 * reconcile(cwd) — analyze events and check signal to surface improvement proposals.
 * Returns { proposals, demotions, sentinels } — never auto-applies changes.
 */
export function reconcile(cwd = process.cwd()) {
  const proposals = [];
  const demotions = [];
  const sentinels = [];

  try {
    const recentEvents = getRecentEvents(cwd, 7);
    const registry = getCheckRegistry(cwd);
    const checkMap = Object.fromEntries(registry.map(c => [c.id, c]));

    // ── 1. Find incidents/gate_failures with no matching check_result failure ──
    const incidents = recentEvents.filter(e =>
      e.type === 'incident' || e.type === 'gate_failure'
    );

    for (const incident of incidents) {
      const sessionId = incident.sessionId;
      // Look for any check_result with outcome=fail in the same session
      const caughtByCheck = recentEvents.some(e =>
        e.type === 'check_result' &&
        e.outcome === 'fail' &&
        sessionId && e.sessionId === sessionId
      );

      if (!caughtByCheck && incident.evidence) {
        // Propose a candidate check for this uncaught failure
        const primitive = _inferPrimitive(incident.evidence);
        if (primitive) {
          proposals.push({
            type: 'check_proposed',
            candidateId: `auto-${Date.now()}-${proposals.length}`,
            kind: primitive,
            severity: 'warn',
            source: 'reconcile',
            status: 'quarantine',
            createdFrom: incident.type,
            evidence: incident.evidence,
            rationale: `Uncaught ${incident.type}: ${String(incident.evidence).slice(0, 120)}`,
          });
        }
      }
    }

    // ── 2. Checks with high false positive rate → recommend demotion ──────────
    const health = getCheckHealth(cwd);
    for (const h of health) {
      if (h.status !== 'active') continue;
      if (h.hits >= 5 && h.fpRate !== null && h.fpRate > 0.3) {
        demotions.push({
          checkId: h.id,
          reason: `${Math.round(h.fpRate * 100)}% false positive rate over ${h.hits} runs`,
          fpRate: h.fpRate,
          hits: h.hits,
        });
      }
    }

    // ── 3. Checks that never fail in 20+ runs AND guard core invariants ────────
    for (const h of health) {
      if (h.status !== 'active') continue;
      if (h.sentinel) continue; // already sentinel
      const spec = checkMap[h.id];
      if (!spec) continue;
      const guardsInvariant = SENTINEL_INVARIANTS.has(h.id);
      // Check hasn't fired but is tracking
      const neverFailed = h.truePositives === 0 && h.hits >= 20;
      if (guardsInvariant && neverFailed) {
        sentinels.push({
          checkId: h.id,
          reason: `${h.hits} runs without failure — stable invariant guard`,
          hits: h.hits,
        });
      }
    }
  } catch { /* graceful degradation — return empty results */ }

  return { proposals, demotions, sentinels };
}

function _inferPrimitive(evidence) {
  const s = String(evidence).toLowerCase();
  if (s.includes('file') || s.includes('missing') || s.includes('not found')) return 'file-exists';
  if (s.includes('string') || s.includes('branding') || s.includes('forbidden')) return 'forbidden-string';
  if (s.includes('exit') || s.includes('failed') || s.includes('command')) return 'command-exit';
  if (s.includes('package') || s.includes('version') || s.includes('name')) return 'package-json-field';
  if (s.includes('readme') || s.includes('doc') || s.includes('contract')) return 'readme-contract';
  if (s.includes('export')) return 'export-target';
  if (s.includes('output')) return 'command-output';
  return null; // can't infer — don't propose
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
