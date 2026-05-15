#!/usr/bin/env node
/**
 * quality-tiers.mjs — Risk-based tiered quality gate for the Dual-Brain Orchestrator.
 *
 * Replaces the single quality-gate.mjs review-everything approach with a
 * three-tier system that preserves head (Opus) bandwidth for genuinely
 * high-risk work.
 *
 * Tiers:
 *   auto-pass   — low risk: tests + lint only, no agent review
 *   peer-review — medium risk: tests + lint + sonnet agent review dispatch
 *   head-review — high/critical risk: tests + lint + peer + head summary
 *
 * Exports:
 *   classifyQualityTier(task)
 *   runAutoPass(task, options)
 *   runPeerReview(task, autoPassResult, options)
 *   runHeadReview(task, peerResult, options)
 *   runQualityPipeline(task, options)
 *   getQualityStats(manifest)
 *
 * CLI:
 *   node hooks/quality-tiers.mjs --classify '{"riskLevel":"medium",...}'
 *   node hooks/quality-tiers.mjs --stats <manifestId>
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { classifyRisk } from './risk-classifier.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const MANIFEST_DIR = join(ROOT_DIR, '.dualbrain', 'manifests');
const ORCHESTRATOR_CONFIG = join(ROOT_DIR, 'orchestrator.json');

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

const TIER_LABELS = {
  'auto-pass':   'auto-pass',
  'peer-review': 'peer-review',
  'head-review': 'head-review',
};

/** Auth/security/billing path patterns that force head-review regardless of risk label */
const SENSITIVE_PATH_PATTERNS = [
  /\b(auth|credential|secret|\.env|token|password|encrypt|certificate|\.pem|\.key|oauth|jwt)\b/i,
  /\b(billing|payment|invoice|subscription|charge)\b/i,
  /\b(security|permission|policy|role|access[-_]?control)\b/i,
];

/** Paths that indicate shared utilities (nudge toward peer-review) */
const SHARED_UTIL_PATTERNS = [
  /\b(util[s]?|lib\/|shared\/|common\/|helper[s]?|middleware)\b/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(raw, fallback = null) {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function isoNow() {
  return new Date().toISOString();
}

function touchesSensitivePaths(paths) {
  return (paths || []).some(p =>
    SENSITIVE_PATH_PATTERNS.some(rx => rx.test(p)),
  );
}

function touchesSharedUtils(paths) {
  return (paths || []).some(p =>
    SHARED_UTIL_PATTERNS.some(rx => rx.test(p)),
  );
}

function loadConfig() {
  try {
    return safeJsonParse(readFileSync(ORCHESTRATOR_CONFIG, 'utf8'), {});
  } catch {
    return {};
  }
}

function runCmd(cmd, args, opts = {}) {
  try {
    const result = spawnSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts.timeout || 60_000,
      cwd: opts.cwd || ROOT_DIR,
    });
    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status,
    };
  } catch (err) {
    return { ok: false, stdout: '', stderr: err?.message || String(err), status: -1 };
  }
}

function trimText(value, max = 200) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

// ─── classifyQualityTier ──────────────────────────────────────────────────────

/**
 * Determine which quality tier a completed task requires.
 *
 * @param {object} task
 * @param {string} task.riskLevel  — 'low' | 'medium' | 'high' | 'critical'
 * @param {string} task.tier       — 'search' | 'execute' | 'think'
 * @param {string[]} task.owns     — files the task exclusively owns
 * @param {string[]} task.reads    — files the task reads (shared)
 * @param {object}  task.result    — prior execution result (optional)
 * @param {number}  task.fileCount — number of files changed (optional)
 * @returns {'auto-pass'|'peer-review'|'head-review'}
 */
function classifyQualityTier(task) {
  const {
    riskLevel = 'low',
    tier = 'execute',
    owns = [],
    reads = [],
    result = {},
    fileCount,
  } = task;

  const allFiles = [...(owns || []), ...(reads || [])];
  const effectiveFileCount = fileCount ?? allFiles.length;
  const riskIdx = LEVEL_ORDER[riskLevel] ?? 0;

  // ── Immediate head-review triggers ──────────────────────────────────────────
  if (riskIdx >= LEVEL_ORDER['high']) return 'head-review';
  if (effectiveFileCount >= 4) return 'head-review';
  if (touchesSensitivePaths(allFiles)) return 'head-review';
  // think-tier tasks always warrant at least a peer look
  if (tier === 'think' && riskIdx >= LEVEL_ORDER['medium']) return 'head-review';

  // ── Peer-review triggers ─────────────────────────────────────────────────────
  if (riskIdx >= LEVEL_ORDER['medium']) return 'peer-review';
  if (effectiveFileCount >= 2 && effectiveFileCount <= 3) return 'peer-review';
  if (touchesSharedUtils(allFiles)) return 'peer-review';

  // ── Auto-pass (low risk, simple) ─────────────────────────────────────────────
  return 'auto-pass';
}

// ─── runAutoPass ──────────────────────────────────────────────────────────────

/**
 * Run automated checks: test runner + lint/typecheck.
 * Does NOT invoke any review agent.
 *
 * @param {object} task
 * @param {object} options
 * @param {boolean} options.skipTests     — skip test execution
 * @param {boolean} options.autoEscalate  — escalate tier on failure
 * @returns {Promise<{tier, passed, checks, escalate}>}
 */
async function runAutoPass(task, options = {}) {
  const { skipTests = false } = options;
  const checks = [];
  const config = loadConfig();
  const allFiles = [...(task.owns || []), ...(task.reads || [])];

  // ── Test check ───────────────────────────────────────────────────────────────
  if (!skipTests) {
    const testCmd = config?.quality_gate?.test_command || detectTestCommand();
    if (testCmd) {
      const [bin, ...args] = testCmd.split(/\s+/);
      const testResult = runCmd(bin, args, { timeout: 90_000 });
      checks.push({
        name: 'tests',
        passed: testResult.ok,
        command: testCmd,
        output: trimText(testResult.stdout || testResult.stderr, 300),
      });
    } else {
      checks.push({ name: 'tests', passed: true, skipped: true, reason: 'no test command found' });
    }
  } else {
    checks.push({ name: 'tests', passed: true, skipped: true, reason: 'skipTests=true' });
  }

  // ── Lint/typecheck ───────────────────────────────────────────────────────────
  const lintCmd = config?.quality_gate?.lint_command || detectLintCommand();
  if (lintCmd) {
    const [bin, ...args] = lintCmd.split(/\s+/);
    const lintResult = runCmd(bin, args, { timeout: 60_000 });
    checks.push({
      name: 'lint',
      passed: lintResult.ok,
      command: lintCmd,
      output: trimText(lintResult.stdout || lintResult.stderr, 200),
    });
  } else {
    checks.push({ name: 'lint', passed: true, skipped: true, reason: 'no lint command configured' });
  }

  // ── Ownership conflict check ──────────────────────────────────────────────────
  const ownershipOk = checkOwnershipConflicts(task, allFiles);
  checks.push({
    name: 'ownership',
    passed: ownershipOk.ok,
    details: ownershipOk.details,
  });

  const allPassed = checks.every(c => c.passed);
  const escalate = !allPassed;

  return {
    tier: 'auto-pass',
    passed: allPassed,
    checks,
    escalate,
    timestamp: isoNow(),
  };
}

// ─── runPeerReview ────────────────────────────────────────────────────────────

/**
 * Build a peer-review dispatch config for a sonnet agent.
 * Does NOT execute the dispatch — returns the config for the caller to run.
 *
 * @param {object} task
 * @param {object} autoPassResult  — result from runAutoPass
 * @param {object} options
 * @param {boolean} options.autoEscalate
 * @returns {Promise<{tier, passed, checks, peerFeedback, dispatchConfig, escalate}>}
 */
async function runPeerReview(task, autoPassResult, options = {}) {
  const { autoEscalate = true } = options;
  const checks = [...(autoPassResult?.checks || [])];

  // Build a focused review prompt for the peer (sonnet) agent
  const allFiles = [...(task.owns || []), ...(task.reads || [])];
  const autoSummary = summarizeAutoPass(autoPassResult);

  const reviewPrompt = buildPeerReviewPrompt({
    task,
    allFiles,
    autoSummary,
    riskLevel: task.riskLevel || 'medium',
  });

  // Dispatch config: caller executes this
  const dispatchConfig = {
    provider: 'claude',
    model: 'sonnet',
    tier: 'think',
    prompt: reviewPrompt,
    files: allFiles,
    timeoutMs: 120_000,
    returnStructured: true,
    structuredInstructions: [
      'Return JSON: { "concerns": string[], "verdict": "pass"|"escalate", "summary": string }',
      '"concerns" lists specific issues found (empty array if none)',
      '"verdict" is "escalate" if any concern warrants head review, otherwise "pass"',
      '"summary" is 1-2 sentences compressed for head context (under 200 chars)',
    ].join('\n'),
  };

  // Placeholder peer feedback — populated when caller executes dispatch
  const peerFeedback = null;
  const escalate = false; // caller sets this after executing dispatch

  return {
    tier: 'peer-review',
    passed: autoPassResult?.passed ?? true,
    checks,
    peerFeedback,
    dispatchConfig,
    escalate,
    timestamp: isoNow(),
  };
}

// ─── runHeadReview ────────────────────────────────────────────────────────────

/**
 * Build a structured review request for the head agent (Opus).
 * Does NOT perform the review — returns the request summary for the head to act on.
 *
 * @param {object} task
 * @param {object} peerResult  — result from runPeerReview (with peerFeedback populated)
 * @param {object} options
 * @returns {Promise<{tier, passed, checks, peerFeedback, headVerdict, headReviewRequest}>}
 */
async function runHeadReview(task, peerResult, options = {}) {
  const checks = [...(peerResult?.checks || [])];
  const allFiles = [...(task.owns || []), ...(task.reads || [])];

  // Compress all prior results for head context
  const compressedChecks = compressPriorChecks(checks);
  const peerSummary = peerResult?.peerFeedback
    ? trimText(String(peerResult.peerFeedback), 400)
    : 'peer review not yet executed';

  const headReviewRequest = {
    task: trimText(task.description || task.intent || 'unknown task', 120),
    riskLevel: task.riskLevel || 'high',
    filesChanged: allFiles,
    fileCount: allFiles.length,
    automatedChecks: compressedChecks,
    peerSummary,
    focusAreas: buildHeadFocusAreas(task, peerResult),
    instructions: [
      'Review architecture alignment: does this fit the established patterns?',
      'Security implications: any vectors opened even indirectly?',
      'Cross-cutting concerns: does this affect other subsystems?',
      'Return verdict: pass | issues_found | needs_rework, with specific findings.',
    ],
  };

  return {
    tier: 'head-review',
    passed: false, // head sets this after review
    checks,
    peerFeedback: peerResult?.peerFeedback || null,
    headVerdict: null, // populated after head reviews headReviewRequest
    headReviewRequest,
    timestamp: isoNow(),
  };
}

// ─── runQualityPipeline ───────────────────────────────────────────────────────

/**
 * Full quality pipeline: classify → auto-pass → [peer-review] → [head-review].
 * Escalates automatically on failures when autoEscalate=true.
 *
 * @param {object} task
 * @param {object} options
 * @param {boolean} options.skipTests      — skip test execution
 * @param {boolean} options.strictMode     — bump all tiers one level up
 * @param {boolean} options.autoEscalate   — auto-escalate on failures (default true)
 * @returns {Promise<{tier, passed, checks, peerFeedback?, headVerdict?, headReviewRequest?, escalated}>}
 */
async function runQualityPipeline(task, options = {}) {
  const { skipTests = false, strictMode = false, autoEscalate = true } = options;

  // 1. Classify tier
  let tier = classifyQualityTier(task);

  // strictMode bumps everyone up one level
  if (strictMode) {
    tier = bumpTier(tier);
  }

  // 2. Always run auto-pass first (lowest common denominator)
  const autoResult = await runAutoPass(task, { skipTests, autoEscalate });

  // 3. Escalate from auto-pass if tests/lint failed
  if (tier === 'auto-pass' && autoResult.escalate && autoEscalate) {
    tier = 'peer-review';
  }

  if (tier === 'auto-pass') {
    return { ...autoResult, escalated: false };
  }

  // 4. Peer review
  const peerResult = await runPeerReview(task, autoResult, { autoEscalate });

  if (tier === 'peer-review') {
    // Caller must execute peerResult.dispatchConfig and populate peerFeedback.
    // We return the dispatch config so the caller can run it and re-call if escalation needed.
    return { ...peerResult, escalated: tier !== classifyQualityTier(task) };
  }

  // 5. Head review (high/critical)
  const headResult = await runHeadReview(task, peerResult, options);
  return { ...headResult, escalated: tier !== classifyQualityTier(task) };
}

// ─── getQualityStats ──────────────────────────────────────────────────────────

/**
 * Aggregate quality tier results across a manifest.
 *
 * @param {object} manifest  — wave-orchestrator manifest object, or a manifestId string
 * @returns {object} stats
 */
function getQualityStats(manifest) {
  // Accept either a manifest object or a raw manifestId string
  if (typeof manifest === 'string') {
    const path = join(MANIFEST_DIR, `${manifest}.json`);
    if (!existsSync(path)) {
      return { error: `Manifest not found: ${manifest}` };
    }
    manifest = safeJsonParse(readFileSync(path, 'utf8'), null);
    if (!manifest) return { error: 'Manifest is unreadable' };
  }

  const tasks = (manifest.waves || []).flatMap(w => w.tasks || []);
  const stats = {
    total: tasks.length,
    autoPass: 0,
    peerReview: 0,
    headReview: 0,
    escalated: 0,
    failed: 0,
    passed: 0,
    byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    tierBreakdown: {},
  };

  for (const task of tasks) {
    const qr = task.qualityResult;
    if (!qr) continue;

    const t = qr.tier || 'auto-pass';
    stats.tierBreakdown[t] = (stats.tierBreakdown[t] || 0) + 1;

    if (t === 'auto-pass')   stats.autoPass++;
    if (t === 'peer-review') stats.peerReview++;
    if (t === 'head-review') stats.headReview++;
    if (qr.escalated)        stats.escalated++;
    if (qr.passed === false) stats.failed++;
    if (qr.passed === true)  stats.passed++;

    const risk = task.riskLevel || 'low';
    if (stats.byRisk[risk] !== undefined) stats.byRisk[risk]++;
  }

  stats.headSavingsRate = stats.total > 0
    ? ((stats.autoPass + stats.peerReview) / stats.total).toFixed(2)
    : '1.00';

  return stats;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function bumpTier(tier) {
  if (tier === 'auto-pass')   return 'peer-review';
  if (tier === 'peer-review') return 'head-review';
  return 'head-review';
}

function detectTestCommand() {
  if (existsSync(join(ROOT_DIR, 'package.json'))) {
    const pkg = safeJsonParse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'), {});
    if (pkg?.scripts?.test) return 'npm test';
    if (pkg?.scripts?.['test:ci']) return 'npm run test:ci';
  }
  if (existsSync(join(ROOT_DIR, 'Makefile'))) return 'make test';
  return null;
}

function detectLintCommand() {
  if (existsSync(join(ROOT_DIR, 'package.json'))) {
    const pkg = safeJsonParse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'), {});
    if (pkg?.scripts?.lint) return 'npm run lint';
    if (pkg?.scripts?.typecheck) return 'npm run typecheck';
  }
  if (existsSync(join(ROOT_DIR, '.eslintrc.js')) || existsSync(join(ROOT_DIR, '.eslintrc.json'))) {
    return 'npx eslint .';
  }
  return null;
}

function checkOwnershipConflicts(task, allFiles) {
  // Simple heuristic: flag if reads[] overlaps with owns[] from another task
  // In a real manifest context the wave-orchestrator tracks this; here we just
  // check if the same file appears in both owns and reads (self-conflict).
  const owns = new Set(task.owns || []);
  const reads = task.reads || [];
  const conflicts = reads.filter(f => owns.has(f));

  return {
    ok: conflicts.length === 0,
    details: conflicts.length > 0
      ? `Files in both owns and reads: ${conflicts.join(', ')}`
      : 'no conflicts',
  };
}

function summarizeAutoPass(autoPassResult) {
  if (!autoPassResult) return 'no auto-pass results available';
  const { checks = [], passed } = autoPassResult;
  const lines = checks.map(c => {
    if (c.skipped) return `${c.name}: skipped`;
    return `${c.name}: ${c.passed ? 'pass' : 'FAIL'}${c.output ? ` — ${trimText(c.output, 80)}` : ''}`;
  });
  return `auto-pass: ${passed ? 'passed' : 'failed'}\n${lines.join('\n')}`;
}

function buildPeerReviewPrompt({ task, allFiles, autoSummary, riskLevel }) {
  const description = task.description || task.intent || 'unknown task';
  const owns = (task.owns || []).join(', ') || 'none';
  const reads = (task.reads || []).join(', ') || 'none';

  return [
    `You are a peer code reviewer. Review the following completed task for correctness, edge cases, and unintended side effects.`,
    ``,
    `## Task`,
    `Description: ${trimText(description, 200)}`,
    `Risk level: ${riskLevel}`,
    `Files owned (edited): ${owns}`,
    `Files read (referenced): ${reads}`,
    ``,
    `## Automated Check Results`,
    autoSummary,
    ``,
    `## What to Check`,
    `1. Correctness — does the implementation match the stated intent?`,
    `2. Edge cases — what inputs or states could break this?`,
    `3. Unintended side effects — does this affect other subsystems?`,
    `4. Does the risk classification (${riskLevel}) seem accurate?`,
    ``,
    `Return JSON only:`,
    `{ "concerns": string[], "verdict": "pass"|"escalate", "summary": string }`,
    `"verdict" must be "escalate" if any concern warrants head (Opus) review.`,
    `"summary" must be under 200 chars for compression into head context.`,
  ].join('\n');
}

function compressPriorChecks(checks) {
  return (checks || []).map(c => {
    if (c.skipped) return `${c.name}: skipped`;
    const status = c.passed ? 'pass' : 'FAIL';
    const detail = c.output ? ` (${trimText(c.output, 60)})` : '';
    return `${c.name}: ${status}${detail}`;
  }).join('; ');
}

function buildHeadFocusAreas(task, peerResult) {
  const areas = [];
  const riskLevel = task.riskLevel || 'high';
  const allFiles = [...(task.owns || []), ...(task.reads || [])];

  if (touchesSensitivePaths(allFiles)) {
    areas.push('security — touches auth/credential/billing paths');
  }
  if (LEVEL_ORDER[riskLevel] >= LEVEL_ORDER['critical']) {
    areas.push('critical risk — requires explicit approval before merge');
  }
  if (peerResult?.peerFeedback) {
    const feedback = String(peerResult.peerFeedback);
    if (/escalate|concern|issue|problem|risk/i.test(feedback)) {
      areas.push(`peer flagged concerns: ${trimText(feedback, 120)}`);
    }
  }
  if ((task.owns || []).length >= 4) {
    areas.push(`large changeset: ${task.owns.length} files owned`);
  }

  return areas.length > 0 ? areas : ['standard high-risk review — architecture + security'];
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);

  function exit(obj) {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
    process.exit(0);
  }

  function exitErr(msg) {
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }

  const classifyIdx = args.indexOf('--classify');
  const statsIdx    = args.indexOf('--stats');
  const pipelineIdx = args.indexOf('--pipeline');
  const helpIdx     = args.indexOf('--help');

  if (helpIdx !== -1 || args.length === 0) {
    process.stdout.write([
      'Usage:',
      '  node hooks/quality-tiers.mjs --classify \'{"riskLevel":"medium","tier":"execute","owns":["src/utils.mjs"]}\'',
      '  node hooks/quality-tiers.mjs --stats <manifestId>',
      '  node hooks/quality-tiers.mjs --pipeline \'{"riskLevel":"low","owns":["src/foo.mjs"]}\' [--skip-tests] [--strict]',
      '',
      'Options:',
      '  --classify <json>   Classify a task and return the quality tier',
      '  --stats <id>        Aggregate quality stats from a manifest',
      '  --pipeline <json>   Run the full quality pipeline for a task',
      '  --skip-tests        Skip test execution in pipeline',
      '  --strict            Bump all tiers one level up',
    ].join('\n') + '\n');
    process.exit(0);
  }

  if (classifyIdx !== -1) {
    const raw = args[classifyIdx + 1];
    if (!raw) exitErr('--classify requires a JSON argument');
    const task = safeJsonParse(raw, null);
    if (!task) exitErr('--classify argument is not valid JSON');
    const tier = classifyQualityTier(task);
    exit({ tier, task });
  }

  if (statsIdx !== -1) {
    const manifestId = args[statsIdx + 1];
    if (!manifestId || manifestId.startsWith('--')) exitErr('--stats requires a manifestId argument');
    const stats = getQualityStats(manifestId);
    exit(stats);
  }

  if (pipelineIdx !== -1) {
    const raw = args[pipelineIdx + 1];
    if (!raw) exitErr('--pipeline requires a JSON argument');
    const task = safeJsonParse(raw, null);
    if (!task) exitErr('--pipeline argument is not valid JSON');
    const skipTests  = args.includes('--skip-tests');
    const strictMode = args.includes('--strict');
    runQualityPipeline(task, { skipTests, strictMode, autoEscalate: true })
      .then(exit)
      .catch(err => exitErr(err?.message || String(err)));
  } else if (classifyIdx === -1 && statsIdx === -1) {
    exitErr('Unknown command. Use --help for usage.');
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  classifyQualityTier,
  runAutoPass,
  runPeerReview,
  runHeadReview,
  runQualityPipeline,
  getQualityStats,
};
