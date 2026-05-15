#!/usr/bin/env node
// detect.mjs — Task detection for dual-brain. Self-contained, no internal imports.
// Exports: detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths, classifySpecialist

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Intent definitions ────────────────────────────────────────────────────────

const INTENTS = {
  search:       /\b(grep|find|locate|where is|where are|list|explore|read|look up|look for|check|what is|show me|display)\b/i,
  explain:      /\b(explain|walk me through|what does|how does|describe|summarize|understand|clarify)\b/i,
  compare:      /\b(compare|contrast|difference|versus|vs\.?|trade.?off|which is better|pros and cons|benchmark|performance)\b/i,
  document:     /\b(document|docs?|readme|jsdoc|typedoc|api docs|write docs|add docs|update docs)\b/i,
  format:       /\b(format|lint|prettier|style|indent|whitespace|typo|typos|comment[s]?|reformat)\b/i,
  planning:     /\b(plan|roadmap|strategy|prioritize|break down|decompose|prioritise)\b/i,
  architecture: /\b(design|architect|architecture|propose|how should we|system design|system architecture)\b/i,
  security:     /\b(auth(?:enticat\w*)?|credential|secret|token|password|encrypt|permission[s]?|vulnerability|vulnerabilities|CVE|oauth|jwt|api.?key)\b/i,
  review:       /\b(review|audit|check for issues|evaluate|assess|inspect code|code review)\b/i,
  debug:        /\b(debug|investigate|why (is|does|isn't|doesn't)|trace|diagnose|figure out|broken|not working|failing|regression)\b/i,
  test:         /\b(test[s]?|spec[s]?|add test|fix test|test coverage|unit test|e2e|integration test|jest|vitest|mocha)\b/i,
  refactor:     /\b(refactor|restructure|reorganize|reorganise|extract|split|consolidate|clean up|cleanup|dedupe|dedup)\b/i,
  edit:         /\b(fix|add|update|modify|change|rename|move|replace|write|implement|create|remove|delete|insert)\b/i,
};

const INTENT_PRIORITY = [
  'security', 'architecture', 'planning', 'compare', 'review',
  'debug', 'refactor', 'test', 'explain', 'document', 'format', 'search', 'edit',
];

// ─── Risk patterns (file path based) ──────────────────────────────────────────

const RISK_PATTERNS = [
  { level: 'critical', regex: /\b(auth|credential|secret|\.env|key[s]?|token[s]?|password|encrypt|certificate|cert[s]?|\.pem|\.key)\b/i, label: 'security-sensitive' },
  { level: 'high',     regex: /\b(billing|payment|migration|deploy|ci[-/]cd|\.github\/workflows|security|permission|policy|schema\.prisma|schema\.sql|api[-_]?contract|openapi|swagger)\b/i, label: 'high-impact infrastructure' },
  { level: 'medium',   regex: /\b(test|spec|\.test\.|\.spec\.|shared|util[s]?|lib\/|public[-_]?api|integrat|config|\.config\.)\b/i, label: 'shared/tested code' },
  { level: 'low',      regex: /\b(readme|\.md$|docs?\/|comment|format|lint|\.prettierrc|local[-_]?script|internal[-_]?only|changelog)\b/i, label: 'docs/formatting' },
];

// ─── Description-level risk keywords ──────────────────────────────────────────

const RISK_KEYWORDS = [
  { level: 'critical', regex: /\b(auth|secret|credential|token|password|encrypt|certificate|oauth|jwt|api.?key|vulnerability|CVE)\b/i },
  { level: 'high',     regex: /\b(billing|payment|migration|deploy|ci.?cd|security|permission|policy|schema|openapi|swagger|production|prod)\b/i },
  { level: 'medium',   regex: /\b(test|spec|config|shared|util|lib|integration|public.?api)\b/i },
  { level: 'low',      regex: /\b(readme|docs?|comment|format|lint|changelog|typo|whitespace)\b/i },
];

const DESIGN_IMPACT_PATTERNS = [
  /\bbin\/dual-brain\.mjs\b/,
  /\bsrc\/(?:tui|profile|detect|decide|dispatch|session|health|index)\.mjs\b/,
  /\bhooks\/(?:head-guard|enforce-tier|budget-balancer|dual-brain-think|dual-brain-review|wave-orchestrator)\.mjs\b/,
  /\bVISION\.md\b/,
];

const LEVEL_ORDER = { critical: 3, high: 2, medium: 1, low: 0 };

// ─── Helpers / Exported functions ─────────────────────────────────────────────

function higherRisk(a, b) { return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b; }

/** Extract file paths from free-form text. */
function extractPaths(text) {
  if (!text) return [];
  const matches = text.match(/(?:^|\s|["'`])([./~]?(?:[\w@.-]+\/)+[\w@.*-]+(?:\.\w+)?)/g);
  if (!matches) return [];
  return matches.map(m => m.trim().replace(/^["'`]/, ''));
}

/** Classify risk from an array of file paths. Returns { level, riskyFiles }. */
function classifyRisk(paths) {
  if (!paths || paths.length === 0) {
    return { level: 'low', riskyFiles: [] };
  }

  let highestLevel = 'low';
  const riskyFiles = [];

  for (const p of paths) {
    for (const pattern of RISK_PATTERNS) {
      if (pattern.regex.test(p)) {
        if (LEVEL_ORDER[pattern.level] > LEVEL_ORDER['low']) {
          riskyFiles.push({ path: p, risk: pattern.level, reason: pattern.label });
        }
        if (LEVEL_ORDER[pattern.level] > LEVEL_ORDER[highestLevel]) {
          highestLevel = pattern.level;
          if (highestLevel === 'critical') break;
        }
        break; // use highest-priority match for this path
      }
    }
    if (highestLevel === 'critical') break;
  }

  return { level: highestLevel, riskyFiles };
}

/** Extract the dominant intent from a task description. */
function classifyIntent(prompt) {
  for (const key of INTENT_PRIORITY) {
    if (INTENTS[key].test(prompt)) return key;
  }
  return 'edit';
}

/** Determine complexity from description, file count, risk, intent, prior failures. */
function estimateComplexity({ prompt, fileCount = 0, risk = 'low', intent = 'edit', priorFailures = 0 }) {
  const isAmbiguous = prompt.length > 120 || /\b(and also|as well as|plus|additionally|also)\b/i.test(prompt);

  if (priorFailures >= 2 || intent === 'architecture' || risk === 'critical' || fileCount >= 6) {
    return 'complex';
  }
  if (fileCount >= 3 || intent === 'refactor' || intent === 'debug' || risk === 'high' || isAmbiguous) {
    return 'moderate';
  }
  if (fileCount <= 2 && (risk === 'low' || risk === 'medium')) {
    if (intent === 'format' || (fileCount <= 1 && risk === 'low')) return 'trivial';
    return 'simple';
  }
  return 'moderate';
}

/** Map intent + risk + complexity → tier (think / search / execute). */
function inferTier({ intent, risk, complexity, effort, specialistTierBias }) {
  const thinkIntents = ['architecture', 'security', 'planning', 'compare', 'review'];
  if (thinkIntents.includes(intent) || risk === 'critical') return 'think';

  // Specialist tier_bias can elevate to think before general tier logic
  if (specialistTierBias === 'think') return 'think';

  const searchIntents = ['search', 'explain', 'format'];
  if (searchIntents.includes(intent) && effort === 'low') return 'search';

  return 'execute';
}

/** Whether this task likely requires writing/editing files. */
function requiresWrite(intent) {
  const readOnly = ['search', 'explain', 'compare', 'review'];
  return !readOnly.includes(intent);
}

/** Build a one-sentence explanation of the classification. */
function buildExplanation({ intent, risk, complexity, fileCount, priorFailures }) {
  const parts = [];

  const complexityWord = { trivial: 'Trivial', simple: 'Simple', moderate: 'Moderate', complex: 'Complex' }[complexity];
  const riskWord = risk === 'low' ? 'low-risk' : `${risk}-risk`;
  parts.push(`${complexityWord} ${riskWord} ${intent}`);

  if (fileCount > 0) parts.push(`touching ${fileCount} file${fileCount === 1 ? '' : 's'}`);
  if (priorFailures > 0) parts.push(`with ${priorFailures} prior failure${priorFailures === 1 ? '' : 's'} — elevated effort`);

  return parts.join(' ') + '.';
}

// ─── Reasoning depth classification ───────────────────────────────────────────

const ULTRA_UNCERTAINTY = /\b(not sure|maybe|should we|architect|design|trade-?off|approach)\b/i;
const ULTRA_DEEP_ANALYSIS = /\b(think about|analyze|analyse|evaluate|compare options)\b/i;
const HIGH_CROSS_CUTTING = /\b(refactor|rename across|update all|migration)\b/i;
const LOW_SIMPLE = /\b(grep|find|search|list|show|what is|where is)\b/i;

/**
 * Classify the reasoning depth needed for a task.
 * Returns { depth: 'low'|'medium'|'high'|'ultra', signals: string[] }
 */
function classifyReasoningDepth(prompt, files = [], priorOutcomes = []) {
  const signals = [];

  // Gather prior failure count from priorOutcomes array
  const failures = priorOutcomes.filter(o => o && (o.failed || o.status === 'failed' || o.outcome === 'failed' || o.success === false)).length;

  // File-based risk (reuse classifyRisk)
  const { level: fileRisk } = classifyRisk(files);

  // Keyword risk from prompt (reuse RISK_KEYWORDS)
  let keywordRisk = 'low';
  for (const { level, regex } of RISK_KEYWORDS) {
    if (regex.test(prompt)) { keywordRisk = level; break; }
  }

  const risk = higherRisk(fileRisk, keywordRisk);

  // Directory spread from files
  const dirs = new Set(files.map(f => {
    const parts = f.replace(/^\//, '').split('/');
    return parts.length > 1 ? parts[0] : '.';
  }));
  const dirCount = dirs.size;

  // ── Ultra signals ──────────────────────────────────────────────────────────
  const ultraSignals = [];

  if (ULTRA_UNCERTAINTY.test(prompt)) {
    const match = prompt.match(ULTRA_UNCERTAINTY);
    ultraSignals.push(`prompt contains '${match[0]}'`);
  }
  if (ULTRA_DEEP_ANALYSIS.test(prompt)) {
    const match = prompt.match(ULTRA_DEEP_ANALYSIS);
    ultraSignals.push(`prompt requests deep analysis ('${match[0]}')`);
  }
  if (risk === 'critical') {
    ultraSignals.push('risk classified as critical');
  }
  if (failures >= 2) {
    ultraSignals.push(`${failures} prior failures on similar task`);
  }
  if (fileRisk === 'critical') {
    ultraSignals.push('files include auth/security/billing/migration patterns');
  }

  if (ultraSignals.length > 0) {
    return { depth: 'ultra', signals: ultraSignals };
  }

  // ── High signals ───────────────────────────────────────────────────────────
  const highSignals = [];

  if (risk === 'high') {
    highSignals.push('risk classified as high');
  }
  if (files.length > 5) {
    highSignals.push(`${files.length} files provided`);
  }
  if (failures === 1) {
    highSignals.push('1 prior failure on similar task');
  }
  if (HIGH_CROSS_CUTTING.test(prompt)) {
    const match = prompt.match(HIGH_CROSS_CUTTING);
    highSignals.push(`prompt mentions cross-cutting concern ('${match[0]}')`);
  }
  if (dirCount >= 3) {
    highSignals.push(`files span ${dirCount} directories`);
  }

  if (highSignals.length > 0) {
    return { depth: 'high', signals: highSignals };
  }

  // ── Medium signals ─────────────────────────────────────────────────────────
  const MEDIUM_IMPL = /\b(add|implement|build|create|fix|update)\b/i;
  const mediumSignals = [];

  if (risk === 'medium') {
    mediumSignals.push('risk classified as medium');
  }
  if (files.length >= 2 && files.length <= 5) {
    mediumSignals.push(`${files.length} files provided`);
  }
  if (MEDIUM_IMPL.test(prompt)) {
    const match = prompt.match(MEDIUM_IMPL);
    mediumSignals.push(`prompt contains implementation keyword ('${match[0]}')`);
  }

  if (mediumSignals.length > 0) {
    return { depth: 'medium', signals: mediumSignals };
  }

  // ── Low signals ────────────────────────────────────────────────────────────
  const lowSignals = [];

  if (risk === 'low') {
    lowSignals.push('risk classified as low');
  }
  if (files.length <= 1) {
    lowSignals.push(files.length === 0 ? 'no files provided' : '1 file provided');
  }
  if (LOW_SIMPLE.test(prompt)) {
    const match = prompt.match(LOW_SIMPLE);
    lowSignals.push(`prompt is a simple lookup ('${match[0]}')`);
  }
  if (failures === 0) {
    lowSignals.push('no prior failures');
  }

  return { depth: 'low', signals: lowSignals.length > 0 ? lowSignals : ['no elevated signals detected'] };
}

/** Main detection function. Input: { prompt, files?, priorFailures? } */
function detectTask(input) {
  const { prompt = '', files = [], priorFailures = 0 } = input;

  // 1. Intent
  const intent = classifyIntent(prompt);

  // 2. Paths and risk
  const extractedPaths = extractPaths(prompt);
  const allPaths = [...files, ...extractedPaths];
  const { level: pathRiskLevel, riskyFiles } = classifyRisk(allPaths);
  const designImpact = allPaths.some(p => DESIGN_IMPACT_PATTERNS.some(re => re.test(p)));

  // 3. Keyword risk from description
  let keywordRisk = 'low';
  for (const { level, regex } of RISK_KEYWORDS) {
    if (regex.test(prompt)) { keywordRisk = level; break; }
  }

  const risk = higherRisk(pathRiskLevel, keywordRisk);
  const fileCount = files.length;

  // 4. Complexity
  const complexity = estimateComplexity({ prompt, fileCount, risk, intent, priorFailures });

  // 5. Effort
  const effortOrder = ['low', 'medium', 'high', 'xhigh'];
  function bumpEffort(e, n = 1) {
    return effortOrder[Math.min(effortOrder.indexOf(e) + n, effortOrder.length - 1)];
  }

  let effort = { trivial: 'low', simple: 'medium', moderate: 'high', complex: 'high' }[complexity];
  if (risk === 'critical' && LEVEL_ORDER[effort] < LEVEL_ORDER['high']) effort = 'high';
  if (priorFailures >= 2) {
    effort = 'xhigh';
  } else if (priorFailures === 1) {
    effort = bumpEffort(effort, 1);
  }
  if (intent === 'format' || intent === 'search') {
    if (LEVEL_ORDER[effort] > LEVEL_ORDER['medium']) effort = 'medium';
  }
  if ((intent === 'architecture' || intent === 'security') && LEVEL_ORDER[effort] < LEVEL_ORDER['high']) {
    effort = 'high';
  }

  // 6. Specialist
  const specialistResult = classifySpecialist(prompt, files);
  const specialistDef = SPECIALIST_DEFS[specialistResult.specialist] || null;
  const specialistTierBias = specialistDef?.tier_bias || null;

  // 7. Tier
  const tier = inferTier({ intent, risk, complexity, effort, specialistTierBias });

  // 8. Explanation
  const explanation = buildExplanation({ intent, risk, complexity, fileCount, priorFailures });

  // 9. Reasoning depth
  const priorOutcomes = priorFailures > 0
    ? Array.from({ length: priorFailures }, () => ({ failed: true }))
    : [];
  const { depth: reasoningDepth, signals: reasoningSignals } = classifyReasoningDepth(prompt, files, priorOutcomes);

  return {
    intent,
    risk,
    complexity,
    effort,
    tier,
    fileCount,
    riskyFiles,
    designImpact,
    requiresWrite: requiresWrite(intent),
    explanation,
    specialist: specialistResult,
    reasoningDepth,
    reasoningSignals,
  };
}

// ─── Specialist registry ──────────────────────────────────────────────────────

const SPECIALIST_REGISTRY_PATH = resolve(__dirname, '../agents/specialists/registry.json');

const DEFAULT_SPECIALISTS = {
  python:     { triggers: { extensions: ['.py', '.pyx', '.pyi'], keywords: ['python', 'pip', 'pytest', 'django', 'flask', 'asyncio'] } },
  typescript: { triggers: { extensions: ['.ts', '.tsx', '.mts'], keywords: ['typescript', 'tsc', 'generics', 'react', 'next', 'node'] } },
  html:       { triggers: { extensions: ['.html', '.css', '.scss', '.svg'], keywords: ['html', 'css', 'accessibility', 'a11y', 'aria', 'responsive', 'tailwind'] } },
  linux:      { triggers: { extensions: ['.sh', '.bash', '.conf', '.service', '.dockerfile'], keywords: ['linux', 'bash', 'shell', 'systemd', 'nginx', 'docker', 'ssh', 'deploy'] } },
  security:   { triggers: { extensions: [], keywords: ['auth', 'oauth', 'jwt', 'credential', 'secret', 'encrypt', 'vulnerability', 'vulnerabilities', 'audit', 'owasp', 'xss', 'csrf'] }, tier_bias: 'think' },
};

function loadSpecialistRegistry() {
  try {
    const raw = readFileSync(SPECIALIST_REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.specialists || DEFAULT_SPECIALISTS;
  } catch {
    return DEFAULT_SPECIALISTS;
  }
}

const SPECIALIST_DEFS = loadSpecialistRegistry();

/**
 * Classify which specialist domain best matches the prompt and file list.
 * Returns { specialist, confidence, triggers }.
 */
function classifySpecialist(prompt = '', files = []) {
  const promptLower = prompt.toLowerCase();
  const scores = {};
  const matchedTriggers = {};

  for (const [name, def] of Object.entries(SPECIALIST_DEFS)) {
    const { extensions = [], keywords = [] } = def.triggers || {};
    let score = 0;
    const hits = [];

    // +2 per matching file extension
    for (const file of files) {
      for (const ext of extensions) {
        if (file.endsWith(ext)) {
          score += 2;
          hits.push(ext);
          break; // count each file once per specialist
        }
      }
    }

    // +1 per matching keyword in prompt
    for (const kw of keywords) {
      // Use word-boundary-aware match where possible
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(promptLower)) {
        score += 1;
        hits.push(kw);
      }
    }

    scores[name] = score;
    matchedTriggers[name] = hits;
  }

  // Find highest score
  let best = null;
  let bestScore = 0;
  let bestExtCount = 0;

  for (const [name, score] of Object.entries(scores)) {
    if (score < 2) continue;
    const extCount = matchedTriggers[name].filter(t => t.startsWith('.')).length;
    if (
      score > bestScore ||
      (score === bestScore && extCount > bestExtCount)
    ) {
      best = name;
      bestScore = score;
      bestExtCount = extCount;
    }
  }

  if (!best) {
    return { specialist: 'generic', confidence: 'low', triggers: [] };
  }

  const confidence = bestScore >= 4 ? 'high' : 'medium';
  return { specialist: best, confidence, triggers: matchedTriggers[best] };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const prompt = args.find(a => !a.startsWith('--')) || '';

  if (!prompt) {
    console.error('Usage: node src/detect.mjs "task description" [--files a,b]');
    process.exit(1);
  }

  const filesFlag = args.find(a => a.startsWith('--files=')) ||
    (args.includes('--files') ? args[args.indexOf('--files') + 1] : null);
  const files = filesFlag
    ? filesFlag.replace(/^--files=/, '').split(',').map(f => f.trim()).filter(Boolean)
    : [];

  const failuresFlag = args.find(a => a.startsWith('--failures=')) ||
    (args.includes('--failures') ? args[args.indexOf('--failures') + 1] : null);
  const priorFailures = failuresFlag ? parseInt(failuresFlag.replace(/^--failures=/, ''), 10) : 0;

  const result = detectTask({ prompt, files, priorFailures });
  console.log(JSON.stringify(result, null, 2));
}

export { detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths, classifySpecialist, classifyReasoningDepth };
