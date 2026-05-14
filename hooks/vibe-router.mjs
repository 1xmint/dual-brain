#!/usr/bin/env node
/**
 * vibe-router.mjs — Intent compiler for vibe coding.
 * Decomposes casual natural language into structured work orders.
 *
 * Export: routeVibe(utterance) → { tasks, profile_hint, quality_gates }
 * CLI: node vibe-router.mjs "fix login bug and update the nav"
 */

import { classifyRisk, extractPaths } from './risk-classifier.mjs';

// ─── Tier Detection Patterns ───────────────────────────────────────────────
// Aligned with enforce-tier.mjs SEARCH_WORDS, THINK_WORDS, and execute patterns.

const SEARCH_WORDS = /\b(explore|search|find|grep|locate|where\s+is|list\s+files|read[-\s]?only|lookup|scan|check|look|where|what)\b/i;
const THINK_WORDS = /\b(review|plan|design|architect|decide|analyze|audit|security|code[-\s]?review|threat[-\s]?model|complex[-\s]?debug|evaluate|compare|assess)\b/i;
const EXECUTE_WORDS = /\b(fix|build|add|update|edit|implement|refactor|delete|commit|test|run|create|modify|write|change|remove|rename|move|install|deploy|migrate|convert|replace|rewrite)\b/i;

// ─── Risk Keyword Patterns ─────────────────────────────────────────────────

const RISK_KEYWORDS = [
  { level: 'critical', regex: /\b(auth|credential|secret|\.env|key[s]?|token[s]?|password|encrypt|certificate)\b/i, label: 'security-sensitive' },
  { level: 'high', regex: /\b(login|payment|billing|deploy|migration|ci[-/]?cd|permission|policy|schema|api[-_]?contract)\b/i, label: 'high-impact' },
  { level: 'medium', regex: /\b(test|spec|config|integration|shared|util|lib)\b/i, label: 'shared/tested code' },
  { level: 'low', regex: /\b(readme|docs?|comment|format|lint|style|typo|changelog|nav|ui|css|color|font|margin|padding)\b/i, label: 'docs/UI' },
];

const LEVEL_ORDER = { critical: 3, high: 2, medium: 1, low: 0 };

// ─── Task Splitting ────────────────────────────────────────────────────────

const TASK_SEPARATORS = /\b(?:and\s+(?:also\s+)?|also\s+|plus\s+|then\s+|after\s+that\s+|,\s*(?:and\s+)?)/i;

/**
 * Split a casual utterance into individual task segments.
 * Handles "and", "also", "plus", "then", "after that", and comma separators.
 */
function splitTasks(utterance) {
  if (!utterance) return [];

  const segments = utterance
    .split(TASK_SEPARATORS)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  // If no split happened, the whole utterance is a single task
  return segments.length === 0 ? [utterance.trim()] : segments;
}

// ─── Per-Task Classification ───────────────────────────────────────────────

function classifyTier(text) {
  if (THINK_WORDS.test(text)) return 'think';
  if (EXECUTE_WORDS.test(text)) return 'execute';
  if (SEARCH_WORDS.test(text)) return 'search';
  return 'execute'; // default
}

function classifyKeywordRisk(text) {
  let highest = { level: 'low', reason: 'general task' };

  for (const pattern of RISK_KEYWORDS) {
    const match = text.match(pattern.regex);
    if (match && LEVEL_ORDER[pattern.level] > LEVEL_ORDER[highest.level]) {
      highest = { level: pattern.level, reason: `${pattern.label} (${match[0]})` };
      if (pattern.level === 'critical') return highest;
    }
  }

  return highest;
}

function classifyTask(segment) {
  const tier = classifyTier(segment);

  // Check keyword-based risk
  const keywordRisk = classifyKeywordRisk(segment);

  // Check file-path-based risk (uses risk-classifier.mjs)
  const paths = extractPaths(segment);
  const pathRisk = classifyRisk(paths);

  // Take the higher of keyword risk and path risk
  const risk = LEVEL_ORDER[pathRisk.level] > LEVEL_ORDER[keywordRisk.level]
    ? pathRisk
    : keywordRisk;

  // Generate a clean title: capitalize first letter, trim trailing punctuation
  const title = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/[.!?]+$/, '');

  return {
    title,
    tier,
    risk: risk.level,
    reason: risk.reason,
  };
}

// ─── Profile Hint Detection ────────────────────────────────────────────────

const QUALITY_HINT_WORDS = /\b(be\s+careful|take\s+your\s+time|thorough|deep\s+dive|carefully|exhaustive|comprehensive)\b/i;
const COST_HINT_WORDS = /\b(quick|fast|just|quickly|rapid|simple|straightforward)\b/i;

function detectProfileHint(utterance) {
  if (QUALITY_HINT_WORDS.test(utterance)) return 'quality-first';
  if (COST_HINT_WORDS.test(utterance)) return 'cost-saver';
  return null;
}

// ─── Quality Gates ─────────────────────────────────────────────────────────

function determineQualityGates(tasks) {
  const gates = new Set();

  let highestRisk = 'low';
  for (const task of tasks) {
    if (LEVEL_ORDER[task.risk] > LEVEL_ORDER[highestRisk]) {
      highestRisk = task.risk;
    }
  }

  switch (highestRisk) {
    case 'critical':
      gates.add('dual_brain_required');
      gates.add('tests');
      gates.add('user_permission');
      break;
    case 'high':
      gates.add('dual_brain_review');
      gates.add('tests');
      break;
    case 'medium':
      gates.add('tests');
      break;
    case 'low':
      gates.add('self_check');
      break;
  }

  return [...gates];
}

// ─── Complexity + Wave Recommendation ──────────────────────────────────────

function determineComplexity(tasks) {
  const highestRisk = tasks.reduce(
    (max, t) => LEVEL_ORDER[t.risk] > LEVEL_ORDER[max] ? t.risk : max,
    'low'
  );

  if (tasks.length >= 4 || highestRisk === 'high' || highestRisk === 'critical') {
    return 'complex';
  }
  if (tasks.length >= 2 || highestRisk === 'medium') {
    return 'structured';
  }
  return 'simple';
}

function determineWave(tasks, complexity) {
  if (tasks.length === 1) return 'single';

  // If any task depends on another (sequential markers like "then", "after that"
  // were used), we already split them but keep sequential recommendation.
  // For now, check if tasks share the same tier — parallel is fine for independent work.
  const tiers = new Set(tasks.map(t => t.tier));
  const hasHighRisk = tasks.some(t => t.risk === 'high' || t.risk === 'critical');

  if (hasHighRisk) return 'sequential'; // high-risk tasks need careful ordering
  if (tiers.size === 1 && complexity !== 'complex') return 'parallel';
  return 'parallel';
}

// ─── Summary Generation ────────────────────────────────────────────────────

function generateSummary(tasks, complexity, wave, qualityGates, profileHint) {
  const parts = [];

  if (tasks.length === 1) {
    const t = tasks[0];
    parts.push(`Single ${t.tier} task: ${t.title} (${t.risk} risk).`);
  } else {
    const taskDescs = tasks.map(t => `${t.title.toLowerCase()} (${t.risk} risk, ${t.tier})`);
    parts.push(`Split into ${tasks.length} tasks: ${taskDescs.join(' + ')}.`);
  }

  if (wave === 'parallel' && tasks.length > 1) {
    parts.push('Recommend parallel agents.');
  } else if (wave === 'sequential') {
    parts.push('Recommend sequential execution.');
  }

  if (qualityGates.includes('dual_brain_required')) {
    parts.push('Dual-brain review required for critical changes.');
  } else if (qualityGates.includes('dual_brain_review')) {
    parts.push('Dual-brain review recommended for high-risk changes.');
  }

  if (profileHint) {
    parts.push(`Profile hint: ${profileHint}.`);
  }

  return parts.join(' ');
}

// ─── Main Entry Point ──────────────────────────────────────────────────────

/**
 * routeVibe(utterance) — Decompose a casual natural language utterance
 * into structured work orders with tier, risk, and quality gate assignments.
 *
 * @param {string} utterance - The user's casual description
 * @returns {{ complexity, tasks, profile_hint, quality_gates, wave_recommendation, summary }}
 */
function routeVibe(utterance) {
  if (!utterance || typeof utterance !== 'string' || !utterance.trim()) {
    return {
      complexity: 'simple',
      tasks: [],
      profile_hint: null,
      quality_gates: ['self_check'],
      wave_recommendation: 'single',
      summary: 'No input provided.',
    };
  }

  const segments = splitTasks(utterance);
  const tasks = segments.map(classifyTask);
  const profileHint = detectProfileHint(utterance);
  const qualityGates = determineQualityGates(tasks);
  const complexity = determineComplexity(tasks);
  const wave = determineWave(tasks, complexity);
  const summary = generateSummary(tasks, complexity, wave, qualityGates, profileHint);

  return {
    complexity,
    tasks,
    profile_hint: profileHint,
    quality_gates: qualityGates,
    wave_recommendation: wave,
    summary,
  };
}

export { routeVibe, splitTasks, classifyTask, detectProfileHint };

// ─── CLI ───────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('vibe-router.mjs') ||
  process.argv[1].endsWith('vibe-router')
);

if (isMain) {
  const utterance = process.argv.slice(2).join(' ');
  if (!utterance) {
    console.error('Usage: node vibe-router.mjs "fix the login bug and also update the nav"');
    process.exit(1);
  }
  const result = routeVibe(utterance);
  console.log(JSON.stringify(result, null, 2));
}
