#!/usr/bin/env node
/**
 * task-classifier.mjs — Analyze work descriptions and return model + effort + mode config.
 *
 * Uses model-registry capabilities to make informed routing decisions:
 * - Which model (per provider) handles this task best
 * - What effort/reasoning level to use
 * - Whether to enable extended thinking, fast mode, extended context, web search
 * - How to dispatch (Claude Agent vs Codex exec)
 *
 * Exports: classifyTask, selectModelEffort, INTENTS
 * CLI:     node hooks/task-classifier.mjs "description" [--files a,b] [--budget-pressure 0.8]
 */

import { classifyRisk, extractPaths } from './risk-classifier.mjs';
import {
  MODEL_CAPABILITIES, getCapabilities, getDispatchConfig,
  recommendEffort, shouldUseExtendedContext, shouldUseFastMode,
  getBestModelFor,
} from './model-registry.mjs';

// ─── Intent definitions ───────────────────────────────────────────────────────

const INTENTS = {
  search:       /\b(grep|find|locate|where is|where are|list|explore|read|look up|look for|check|what is|show me|display)\b/i,
  explain:      /\b(explain|walk me through|what does|how does|describe|summarize|understand|clarify)\b/i,
  compare:      /\b(compare|contrast|difference|versus|vs\.?|trade.?off|which is better|pros and cons|benchmark|performance)\b/i,
  document:     /\b(document|docs?|readme|jsdoc|typedoc|api docs|write docs|add docs|update docs)\b/i,
  format:       /\b(format|lint|prettier|style|indent|whitespace|typo|typos|comment[s]?|reformat)\b/i,
  planning:     /\b(plan|roadmap|strategy|prioritize|break down|decompose|prioritise)\b/i,
  architecture: /\b(design|architect|architecture|propose|how should we|system design|system architecture)\b/i,
  security:     /\b(auth|credential|secret|token|password|encrypt|permission[s]?|vulnerability|vulnerabilities|CVE|oauth|jwt|api.?key)\b/i,
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

// ─── Risk keyword detection (description-level) ──────────────────────────────

const RISK_KEYWORDS = [
  { level: 'critical', regex: /\b(auth|secret|credential|token|password|encrypt|certificate|oauth|jwt|api.?key|vulnerability|CVE)\b/i },
  { level: 'high',     regex: /\b(billing|payment|migration|deploy|ci.?cd|security|permission|policy|schema|openapi|swagger|production|prod)\b/i },
  { level: 'medium',   regex: /\b(test|spec|config|shared|util|lib|integration|public.?api)\b/i },
  { level: 'low',      regex: /\b(readme|docs?|comment|format|lint|changelog|typo|whitespace)\b/i },
];

const LEVEL_ORDER = { critical: 3, high: 2, medium: 1, low: 0 };

function detectKeywordRisk(description) {
  for (const { level, regex } of RISK_KEYWORDS) {
    if (regex.test(description)) return level;
  }
  return 'low';
}

function higherRisk(a, b) {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

// ─── classifyTask ─────────────────────────────────────────────────────────────

function classifyTask(description, options = {}) {
  const { files = [], priorFailures = 0 } = options;

  // 1. Intent detection
  let intent = 'edit';
  for (const key of INTENT_PRIORITY) {
    if (INTENTS[key].test(description)) {
      intent = key;
      break;
    }
  }

  // 2. Risk detection
  const allPaths = [...files, ...extractPaths(description)];
  const pathRisk = allPaths.length > 0 ? classifyRisk(allPaths).level : 'low';
  const keywordRisk = detectKeywordRisk(description);
  const risk = higherRisk(pathRisk, keywordRisk);

  // 3. File count
  const fileCount = files.length;

  // 4. Complexity detection
  let complexity;
  const isAmbiguous = description.length > 120 || /\b(and also|as well as|plus|additionally|also)\b/i.test(description);

  if (priorFailures >= 2 || intent === 'architecture' || risk === 'critical' || fileCount >= 6 || isAmbiguous && risk === 'critical') {
    complexity = 'complex';
  } else if (fileCount >= 3 || intent === 'refactor' || intent === 'debug' || risk === 'high' || isAmbiguous) {
    complexity = 'moderate';
  } else if (fileCount <= 2 && (risk === 'low' || risk === 'medium')) {
    if (intent === 'format' || fileCount <= 1 && risk === 'low') {
      complexity = 'trivial';
    } else {
      complexity = 'simple';
    }
  } else {
    complexity = 'moderate';
  }

  // 5. Effort selection
  const baseEffort = { trivial: 'low', simple: 'medium', moderate: 'high', complex: 'high' }[complexity];
  const effortOrder = ['low', 'medium', 'high', 'xhigh'];

  function bumpEffort(e, n = 1) {
    return effortOrder[Math.min(effortOrder.indexOf(e) + n, effortOrder.length - 1)];
  }

  let effort = baseEffort;

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

  // 6. Reason
  const reasons = [];
  if (fileCount > 0) reasons.push(`${fileCount} file(s)`);
  if (risk !== 'low') reasons.push(`${risk} risk`);
  if (priorFailures > 0) reasons.push(`${priorFailures} prior failure(s)`);
  reasons.push(`intent=${intent}, complexity=${complexity}`);
  const reason = reasons.join('; ');

  return { intent, risk, complexity, fileCount, effort, reason };
}

// ─── selectModelEffort ────────────────────────────────────────────────────────

function selectModelEffort(taskProfile, options = {}) {
  const { budgetPressure = 0, userBudgetTier = '$100', isIterating = false, estimatedTokens = 0 } = options;
  const { intent, risk, effort, complexity } = taskProfile;

  // ── Intent classification for routing ──
  const thinkIntents = ['architecture', 'security', 'review', 'planning', 'compare'];
  const searchIntents = ['search', 'format', 'explain'];
  const lightIntents = ['document', 'explain', 'format', 'search'];

  const needsOpus = thinkIntents.includes(intent)
    || risk === 'critical'
    || effort === 'xhigh';

  const needsHaiku = searchIntents.includes(intent) && effort === 'low';

  let claudeModel = needsOpus ? 'opus' : needsHaiku ? 'haiku' : 'sonnet';

  // ── Claude effort (from registry, null-safe for haiku) ──
  const caps = getCapabilities(claudeModel);
  let claudeEffort = caps?.reasoning?.effortLevels
    ? (recommendEffort(claudeModel, complexity, risk) || effort)
    : null;

  // ── Claude modes ──
  const claudeModes = {
    extendedThinking: caps?.reasoning?.extendedThinking
      && (complexity === 'moderate' || complexity === 'complex')
      && !lightIntents.includes(intent),
    fastMode: shouldUseFastMode(claudeModel, isIterating),
    extendedContext: shouldUseExtendedContext(claudeModel, estimatedTokens),
    ultrathink: claudeModel === 'opus'
      && (risk === 'critical' || (complexity === 'complex' && thinkIntents.includes(intent))),
  };

  // ── OpenAI model selection (all models reachable) ──
  let openaiModel;
  if (needsOpus) {
    openaiModel = 'gpt-5.5';
  } else if (searchIntents.includes(intent) && effort === 'low') {
    openaiModel = 'gpt-4.1-mini';
  } else if (['edit', 'test', 'document'].includes(intent) && ['simple', 'trivial'].includes(complexity)) {
    openaiModel = 'gpt-4.1';
  } else if (intent === 'explain' && complexity !== 'trivial') {
    openaiModel = 'gpt-5.2';
  } else if (['edit', 'document'].includes(intent) && complexity === 'moderate') {
    openaiModel = 'gpt-5.3-codex';
  } else if (intent === 'test' && complexity === 'moderate') {
    openaiModel = 'gpt-5.4-mini';
  } else if (['refactor', 'debug'].includes(intent)) {
    openaiModel = complexity === 'complex' ? 'gpt-5.4' : 'gpt-5.3-codex';
  } else {
    openaiModel = 'gpt-5.4';
  }

  // ── OpenAI effort (from registry) ──
  let openaiEffort = recommendEffort(openaiModel, complexity, risk) || effort;

  // ── OpenAI modes ──
  const openaiCaps = getCapabilities(openaiModel);
  const openaiModes = {
    webSearch: openaiCaps?.modes?.webSearch ?? false,
    sandbox: openaiCaps?.modes?.sandbox?.[
      thinkIntents.includes(intent) ? 'think' : searchIntents.includes(intent) ? 'search' : 'execute'
    ] ?? 'danger-full-access',
  };

  // ── Outcome learning override ──
  // If we have enough empirical data, let it influence model selection
  const empiricalClaude = getBestModelFor(intent, 'claude', { minSamples: 5 });
  if (empiricalClaude && empiricalClaude.successRate !== null && empiricalClaude.successRate > 0.8) {
    const caps = getCapabilities(empiricalClaude.model);
    if (caps && !caps.avoidFor?.includes(intent)) {
      claudeModel = empiricalClaude.model;
    }
  }

  const empiricalOpenai = getBestModelFor(intent, 'openai', { minSamples: 5 });
  if (empiricalOpenai && empiricalOpenai.successRate !== null && empiricalOpenai.successRate > 0.8) {
    const caps = getCapabilities(empiricalOpenai.model);
    if (caps && !caps.avoidFor?.includes(intent)) {
      openaiModel = empiricalOpenai.model;
    }
  }

  // ── Budget pressure adjustments ──
  const reasons = [];
  const isHighStakes = risk === 'critical' || risk === 'high';
  const openaiModelRank = [
    'gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini',
    'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5.4', 'gpt-5.5',
  ];

  if (budgetPressure > 0.9 && !isHighStakes) {
    claudeModel = claudeModel === 'opus' ? 'sonnet' : 'haiku';
    const oaiIdx = openaiModelRank.indexOf(openaiModel);
    openaiModel = openaiModelRank[Math.max(0, oaiIdx - 2)] || 'gpt-4.1-mini';
    claudeModes.fastMode = false;
    claudeModes.extendedContext = false;
    claudeModes.extendedThinking = false;
    reasons.push('near limit, aggressive downgrade for non-critical task');
  } else if (budgetPressure > 0.7 && !isHighStakes) {
    claudeModel = claudeModel === 'opus' ? 'sonnet' : claudeModel === 'sonnet' ? 'haiku' : 'haiku';
    const oaiIdx = openaiModelRank.indexOf(openaiModel);
    openaiModel = openaiModelRank[Math.max(0, oaiIdx - 1)] || 'gpt-4.1-mini';
    claudeModes.fastMode = false;
    reasons.push('downgraded due to budget pressure');
  }

  // Recalculate efforts after potential model change
  const newCaps = getCapabilities(claudeModel);
  claudeEffort = newCaps?.reasoning?.effortLevels
    ? (recommendEffort(claudeModel, complexity, risk) || effort)
    : null;
  openaiEffort = recommendEffort(openaiModel, complexity, risk) || effort;

  // ── Preferred provider (think→claude, isolated execute→openai) ──
  const preferred = thinkIntents.includes(intent) ? 'claude' : 'openai';

  // ── Dual-brain recommendation ──
  const dualBrain = risk === 'critical'
    || (thinkIntents.includes(intent) && (complexity === 'complex' || complexity === 'moderate'))
    || intent === 'security'
    || (intent === 'review' && risk !== 'low')
    || (intent === 'refactor' && risk === 'critical');

  if (reasons.length === 0) {
    reasons.push(`${claudeModel}/${openaiModel} matched to ${intent} @ ${complexity} complexity`);
  }
  if (empiricalClaude?.successRate !== null) reasons.push(`claude empirical: ${empiricalClaude.model} ${Math.round(empiricalClaude.successRate * 100)}%`);
  if (empiricalOpenai?.successRate !== null) reasons.push(`openai empirical: ${empiricalOpenai.model} ${Math.round(empiricalOpenai.successRate * 100)}%`);

  return {
    claude: {
      model: claudeModel,
      effort: claudeEffort,
      modes: claudeModes,
      dispatch: getDispatchConfig(claudeModel),
    },
    openai: {
      model: openaiModel,
      effort: openaiEffort,
      modes: openaiModes,
      dispatch: getDispatchConfig(openaiModel),
    },
    preferred,
    dualBrain,
    reason: reasons.join('; '),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const description = args.find(a => !a.startsWith('--')) || '';
  const filesArg = args.find(a => a.startsWith('--files=')) || args[args.indexOf('--files') + 1];
  const budgetArg = args.find(a => a.startsWith('--budget-pressure=')) || args[args.indexOf('--budget-pressure') + 1];
  const failuresArg = args.find(a => a.startsWith('--failures=')) || args[args.indexOf('--failures') + 1];

  const files = (filesArg && !filesArg.startsWith('--'))
    ? filesArg.replace(/^--files=/, '').split(',').map(f => f.trim())
    : [];

  const budgetPressure = budgetArg
    ? parseFloat(budgetArg.replace(/^--budget-pressure=/, ''))
    : 0;

  const priorFailures = failuresArg
    ? parseInt(failuresArg.replace(/^--failures=/, ''), 10)
    : 0;

  if (!description) {
    console.error('Usage: node hooks/task-classifier.mjs "task description" [--files a,b] [--budget-pressure 0.8] [--failures 1]');
    process.exit(1);
  }

  const profile = classifyTask(description, { files, priorFailures });
  const selection = selectModelEffort(profile, { budgetPressure });

  console.log(JSON.stringify({ profile, selection }, null, 2));
}

export { classifyTask, selectModelEffort, INTENTS };
