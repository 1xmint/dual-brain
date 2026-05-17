import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW= '\x1b[33m';
const RED   = '\x1b[31m';
const RESET = '\x1b[0m';

const SEP = `${DIM}──────────────────────────────────${RESET}`;

const AUTH_PAT = /\b(auth|credential|secret|token|password|encrypt|permission|oauth|jwt|api.?key)\b/i;

import type { Risk } from './types.ts';

interface ReceiptPlan {
  risk?: string;
  tier?: string;
  challengerPolicy?: string;
  useChallenger?: boolean;
  primaryModel?: string;
  reasoningDepth?: string;
  workStyle?: string;
  primaryProvider?: string;
  approvalRequired?: boolean;
}

interface ReceiptResult {
  success?: boolean;
  filesChanged?: string[];
  error?: string | null;
  duration?: number;
  output?: string | null;
  provider?: string;
  model?: string;
}

interface ReceiptVerification {
  filesVerified?: boolean;
  testsRun?: boolean;
  testsPassed?: boolean | null;
  ok?: boolean;
  notes?: string[];
}

interface Receipt {
  changed: string;
  verified: string;
  risk: string;
  challenger: string;
  next: string;
  success: boolean;
}

interface SessionReceipt {
  timestamp: string;
  goal: string;
  filesChanged: string[];
  decisions: string[];
  testsRun: string | null;
  risksUnresolved: string[];
  blockers: string[];
  nextAction: string;
  provider: string | null;
  model: string | null;
  duration: number | null;
  status: string;
}

interface PipelineRun {
  prompt?: string;
  result?: ReceiptResult;
  verification?: ReceiptVerification;
  plan?: ReceiptPlan;
  outcome?: { approved?: boolean };
  gates?: Record<string, { passed?: boolean; reason?: string } | null>;
  completedAt?: number;
  startedAt?: number;
}

interface OutcomeInput {
  success?: boolean;
  result?: ReceiptResult;
  filesChanged?: string[];
  error?: string;
  duration?: number;
  output?: string;
  primaryModel?: string;
  reasoningDepth?: string;
  challengerPolicy?: string;
  tier?: string;
  workStyle?: string;
  risk?: string;
  verification?: ReceiptVerification;
}

function classifyRisk(plan: ReceiptPlan, result: ReceiptResult): string {
  if (plan.risk) return plan.risk;
  const files = result.filesChanged ?? [];
  if (files.some(f => AUTH_PAT.test(f))) return 'critical';
  if (plan.tier === 'think') return 'high';
  if (plan.tier === 'execute') return 'medium';
  return 'low';
}

function classifyChallenger(plan: ReceiptPlan, result: ReceiptResult): string {
  const policy = plan.challengerPolicy;
  if (!plan.useChallenger && (!policy || policy === 'none')) return 'not used';
  if (!result.success) return 'blocked';
  if (result.output && /concern|issue|warn|problem/i.test(String(result.output))) return 'concerns raised';
  return 'pass';
}

function nextStep(result: ReceiptResult, plan: ReceiptPlan, verification: ReceiptVerification): string {
  const files = result.filesChanged ?? [];
  const changed = files.length > 0;
  const authFiles = files.some(f => AUTH_PAT.test(f));

  if (!result.success) {
    const retry = result.error && /test/i.test(String(result.error));
    return retry ? 'fix failing tests' : 'retry with deeper analysis';
  }

  if (authFiles) return 'security review recommended';

  if (changed) {
    if (!verification.testsRun) return 'run tests to verify';
    if (verification.testsPassed === false) return 'fix failing tests';
    if (verification.testsPassed === true) return 'commit this patch';
    return 'review the diff';
  }

  return 'review the output';
}

export function buildReceipt(result: ReceiptResult, plan: ReceiptPlan, verification: ReceiptVerification): Receipt {
  const files = result.filesChanged ?? [];
  const changed = files.length > 0 ? files.join(', ') : 'no files changed';

  let verified: string;
  if (verification.testsPassed === true) verified = 'tests passed';
  else if (verification.filesVerified) verified = 'files confirmed changed';
  else verified = 'not verified';

  return {
    changed,
    verified,
    risk: classifyRisk(plan, result),
    challenger: classifyChallenger(plan, result),
    next: nextStep(result, plan, verification),
    success: result.success ?? false,
  };
}

function colorRisk(risk: string): string {
  if (risk === 'low') return `${GREEN}${risk}${RESET}`;
  if (risk === 'medium') return `${YELLOW}${risk}${RESET}`;
  return `${RED}${risk}${RESET}`;
}

function colorChallenger(ch: string): string {
  if (ch === 'pass') return `${GREEN}${ch}${RESET}`;
  if (ch === 'concerns raised') return `${YELLOW}${ch}${RESET}`;
  if (ch === 'blocked') return `${RED}${ch}${RESET}`;
  return `${DIM}${ch}${RESET}`;
}

export function formatReceipt(receipt: Receipt): string {
  return [
    SEP,
    `  Changed:    ${receipt.changed}`,
    `  Verified:   ${receipt.verified}`,
    `  Risk:       ${colorRisk(receipt.risk)}`,
    `  Challenger: ${colorChallenger(receipt.challenger)}`,
    `  Next:       ${receipt.next}`,
    SEP,
  ].join('\n');
}

export function formatFailureReceipt(receipt: Receipt, failureContext?: string): string {
  const errorLine = failureContext ? `  Error:      ${failureContext}` : null;
  const lines = [
    SEP,
    `  Changed:    ${receipt.changed}`,
    `  Verified:   ${receipt.verified}`,
    `  Risk:       ${colorRisk(receipt.risk)}`,
    `  Challenger: ${colorChallenger(receipt.challenger)}`,
  ];
  if (errorLine) lines.push(errorLine);
  lines.push(`  Next:       ${receipt.next}`, SEP);
  return lines.join('\n');
}

// --- Persistent session receipt ---

const RECEIPTS_DIR = '.dualbrain/receipts';

function receiptsDir(cwd: string): string {
  return join(cwd, RECEIPTS_DIR);
}

function gitChangedFiles(cwd: string): string[] {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
      .toString().trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function readDecisionsRecent(cwd: string, limit: number = 5): Array<{ question?: string; decision?: string }> {
  try {
    const raw = readFileSync(join(cwd, '.dualbrain', 'decisions.jsonl'), 'utf8');
    const lines = raw.split('\n').filter(l => l.trim());
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function ageLabel(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function generateReceipt(run: PipelineRun = {}, cwd: string = process.cwd()): SessionReceipt {
  const now = new Date();
  const ts = now.toISOString();

  // Derive files changed — prefer run.result, fall back to git diff
  const filesChanged = (run.result?.filesChanged && run.result.filesChanged.length > 0)
    ? run.result.filesChanged
    : gitChangedFiles(cwd);

  // Recent decisions from living docs
  const decisionEntries = readDecisionsRecent(cwd, 5);
  const decisions = decisionEntries.map(d => d.question || d.decision || '').filter(Boolean).slice(0, 3);

  // Test results
  const testsRun = run.verification?.ok !== undefined
    ? (run.verification.ok ? 'passed' : 'failed')
    : null;

  // Unresolved risks from plan
  const risksUnresolved: string[] = [];
  if (run.plan?.approvalRequired && !run.outcome?.approved) {
    risksUnresolved.push('approval required but not obtained');
  }
  if (run.verification && !run.verification.ok) {
    risksUnresolved.push('verification failed');
  }
  const verNotes = run.verification?.notes ?? [];
  for (const note of verNotes) {
    if (/warn|risk|unverif|no file changes/i.test(note)) risksUnresolved.push(note.slice(0, 80));
  }

  // Blockers — gates that failed
  const blockers: string[] = [];
  for (const [name, g] of Object.entries(run.gates ?? {})) {
    if (g && !g.passed) blockers.push(`${name}: ${g.reason?.slice(0, 80)}`);
  }
  if (run.result?.error) blockers.push(run.result.error.slice(0, 80));

  // Derive status
  const success = run.result && !run.result.error && (run.verification?.ok !== false);
  const status = !run.result ? 'incomplete'
    : blockers.length > 0 ? 'failed'
    : success ? 'success'
    : 'partial';

  // Next action (reuse existing logic)
  let nextAction = 'review the output';
  if (status === 'success' && filesChanged.length > 0) {
    nextAction = run.verification?.testsRun ? 'commit changes' : 'run tests, then commit';
  } else if (status === 'failed') {
    nextAction = 'investigate failure, retry with adjusted approach';
  } else if (status === 'partial') {
    nextAction = 'check partial output, verify manually';
  }

  const duration = (run.completedAt && run.startedAt)
    ? Math.round((run.completedAt - run.startedAt) / 1000)
    : null;

  const receipt: SessionReceipt = {
    timestamp: ts,
    goal: (run.prompt ?? '').slice(0, 200),
    filesChanged,
    decisions,
    testsRun,
    risksUnresolved,
    blockers,
    nextAction,
    provider: run.plan?.primaryProvider ?? run.result?.provider ?? null,
    model: run.plan?.primaryModel ?? run.result?.model ?? null,
    duration,
    status,
  };

  // Store receipt
  try {
    const dir = receiptsDir(cwd);
    mkdirSync(dir, { recursive: true });

    const filename = ts.replace(/[:.]/g, '-').slice(0, 19) + '.json';
    writeFileSync(join(dir, filename), JSON.stringify(receipt, null, 2));

    // One-line summary for fast scanning
    const summary = {
      ts,
      goal: receipt.goal.slice(0, 80),
      status,
      files: filesChanged.length,
      next: nextAction.slice(0, 60),
    };
    appendFileSync(join(dir, 'index.jsonl'), JSON.stringify(summary) + '\n');
  } catch {
    // Storage failure is non-blocking
  }

  return receipt;
}

export function buildResumeBrief(cwd: string = process.cwd()): string | null {
  try {
    const dir = receiptsDir(cwd);
    if (!existsSync(dir)) return null;

    // Find the most recent receipt JSON file
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const raw = readFileSync(join(dir, files[0]), 'utf8');
    const r: SessionReceipt = JSON.parse(raw);

    const age = ageLabel(Date.now() - Date.parse(r.timestamp));
    const filesSummary = r.filesChanged?.length > 0
      ? r.filesChanged.slice(0, 3).map(f => f.split('/').pop()).join(', ')
        + (r.filesChanged.length > 3 ? ` +${r.filesChanged.length - 3}` : '')
      : 'no files changed';
    const riskLine = r.risksUnresolved?.length > 0
      ? `Risk: ${r.risksUnresolved[0].slice(0, 60)}`
      : null;

    const lines = [
      'RESUME CONTEXT:',
      `Last session: ${age}`,
      `Goal: ${(r.goal || 'unknown').slice(0, 80)}`,
      `Done: ${filesSummary}`,
      `Status: ${r.status}${r.testsRun ? ', tests ' + r.testsRun : ''}`,
    ];
    if (riskLine) lines.push(riskLine);
    lines.push(`Next: ${(r.nextAction || '').slice(0, 80)}`);

    const brief = lines.join('\n');
    return brief.length > 500 ? brief.slice(0, 497) + '...' : brief;
  } catch {
    return null;
  }
}

export function getLatestReceipt(cwd: string = process.cwd()): SessionReceipt | null {
  try {
    const dir = receiptsDir(cwd);
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const raw = readFileSync(join(dir, files[0]), 'utf8');
    return JSON.parse(raw) as SessionReceipt;
  } catch {
    return null;
  }
}

export function buildReceiptFromOutcome(outcome: OutcomeInput = {}): Receipt {
  const result: ReceiptResult = {
    success: outcome.success ?? outcome.result?.success ?? false,
    filesChanged: outcome.filesChanged ?? outcome.result?.filesChanged ?? [],
    error: outcome.error ?? outcome.result?.error ?? null,
    duration: outcome.duration ?? outcome.result?.duration ?? 0,
    output: outcome.output ?? null,
  };
  const plan: ReceiptPlan = {
    primaryModel: outcome.primaryModel ?? '',
    reasoningDepth: outcome.reasoningDepth ?? '',
    challengerPolicy: outcome.challengerPolicy ?? 'none',
    useChallenger: !!(outcome.challengerPolicy && outcome.challengerPolicy !== 'none'),
    tier: outcome.tier ?? '',
    workStyle: outcome.workStyle ?? '',
    risk: outcome.risk ?? '',
  };
  const verification: ReceiptVerification = {
    filesVerified: outcome.verification?.filesVerified ?? false,
    testsRun: outcome.verification?.testsRun ?? false,
    testsPassed: outcome.verification?.testsPassed ?? null,
  };
  return buildReceipt(result, plan, verification);
}
