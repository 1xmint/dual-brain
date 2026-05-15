const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW= '\x1b[33m';
const RED   = '\x1b[31m';
const RESET = '\x1b[0m';

const SEP = `${DIM}──────────────────────────────────${RESET}`;

const AUTH_PAT = /\b(auth|credential|secret|token|password|encrypt|permission|oauth|jwt|api.?key)\b/i;

function classifyRisk(plan, result) {
  if (plan.risk) return plan.risk;
  const files = result.filesChanged ?? [];
  if (files.some(f => AUTH_PAT.test(f))) return 'critical';
  if (plan.tier === 'think') return 'high';
  if (plan.tier === 'execute') return 'medium';
  return 'low';
}

function classifyChallenger(plan, result) {
  const policy = plan.challengerPolicy;
  if (!plan.useChallenger && (!policy || policy === 'none')) return 'not used';
  if (!result.success) return 'blocked';
  if (result.output && /concern|issue|warn|problem/i.test(String(result.output))) return 'concerns raised';
  return 'pass';
}

function nextStep(result, plan, verification) {
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

export function buildReceipt(result, plan, verification) {
  const files = result.filesChanged ?? [];
  const changed = files.length > 0 ? files.join(', ') : 'no files changed';

  let verified;
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

function colorRisk(risk) {
  if (risk === 'low') return `${GREEN}${risk}${RESET}`;
  if (risk === 'medium') return `${YELLOW}${risk}${RESET}`;
  return `${RED}${risk}${RESET}`;
}

function colorChallenger(ch) {
  if (ch === 'pass') return `${GREEN}${ch}${RESET}`;
  if (ch === 'concerns raised') return `${YELLOW}${ch}${RESET}`;
  if (ch === 'blocked') return `${RED}${ch}${RESET}`;
  return `${DIM}${ch}${RESET}`;
}

export function formatReceipt(receipt) {
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

export function formatFailureReceipt(receipt, failureContext) {
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

export function buildReceiptFromOutcome(outcome = {}) {
  const result = {
    success: outcome.success ?? outcome.result?.success ?? false,
    filesChanged: outcome.filesChanged ?? outcome.result?.filesChanged ?? [],
    error: outcome.error ?? outcome.result?.error ?? null,
    duration: outcome.duration ?? outcome.result?.duration ?? 0,
    output: outcome.output ?? null,
  };
  const plan = {
    primaryModel: outcome.primaryModel ?? '',
    reasoningDepth: outcome.reasoningDepth ?? '',
    challengerPolicy: outcome.challengerPolicy ?? 'none',
    useChallenger: !!(outcome.challengerPolicy && outcome.challengerPolicy !== 'none'),
    tier: outcome.tier ?? '',
    workStyle: outcome.workStyle ?? '',
    risk: outcome.risk ?? '',
  };
  const verification = {
    filesVerified: outcome.verification?.filesVerified ?? false,
    testsRun: outcome.verification?.testsRun ?? false,
    testsPassed: outcome.verification?.testsPassed ?? null,
  };
  return buildReceipt(result, plan, verification);
}
