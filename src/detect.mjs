#!/usr/bin/env node
// detect.mjs — Task detection for dual-brain. Self-contained, no internal imports.
// Exports: detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths

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
function inferTier({ intent, risk, complexity, effort }) {
  const thinkIntents = ['architecture', 'security', 'planning', 'compare', 'review'];
  if (thinkIntents.includes(intent) || risk === 'critical') return 'think';

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

  // 6. Tier
  const tier = inferTier({ intent, risk, complexity, effort });

  // 7. Explanation
  const explanation = buildExplanation({ intent, risk, complexity, fileCount, priorFailures });

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
  };
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

export { detectTask, classifyIntent, classifyRisk, estimateComplexity, inferTier, extractPaths };
