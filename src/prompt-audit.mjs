import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const AUDIT_DIR = join(process.cwd(), '.dualbrain', 'prompt-audit');

/**
 * Score a prompt for quality before sending to a provider.
 * Returns score 0-100 and specific feedback.
 */
export function scorePrompt(prompt, opts = {}) {
  const { type = 'think', maxTokenBudget = 2000 } = opts;

  const issues = [];
  const strengths = [];
  let score = 100;

  // Length efficiency
  const words = prompt.split(/\s+/).length;
  const chars = prompt.length;

  if (words < 20) {
    issues.push({ rule: 'too-short', msg: 'Prompt under 20 words — likely missing context', penalty: 15 });
    score -= 15;
  }
  if (words > 500) {
    issues.push({ rule: 'too-long', msg: `Prompt is ${words} words — consider trimming`, penalty: 10 });
    score -= 10;
  }

  // Structure checks
  if (type === 'think') {
    if (!prompt.includes('?')) {
      issues.push({ rule: 'no-question', msg: 'Think prompt has no question mark — unclear what decision is needed', penalty: 10 });
      score -= 10;
    }
    if (!/\b(should|how|what|which|why|when|where|recommend|decide|choose|compare|tradeoff)\b/i.test(prompt)) {
      issues.push({ rule: 'no-decision-language', msg: 'No decision-making language found', penalty: 5 });
      score -= 5;
    }
    if (/\b(at least \d+ ideas|generate.*list|brainstorm)\b/i.test(prompt)) {
      strengths.push('Requests specific output quantity');
    }
  }

  // Context quality
  if (/\b(this project|the codebase|our system)\b/i.test(prompt) && !/\b(module|file|function|export|import)\b/i.test(prompt)) {
    issues.push({ rule: 'vague-context', msg: 'References "the project" without naming specific modules/files', penalty: 10 });
    score -= 10;
  }

  if (/\b(src\/\w+|\.mjs|\.js|\.ts)\b/.test(prompt)) {
    strengths.push('Names specific files/modules');
  }

  // Constraint quality
  if (/\b(at least|minimum|maximum|no more than|ranked|ordered|prioritized)\b/i.test(prompt)) {
    strengths.push('Includes output constraints');
  }

  // Anti-patterns
  if (/\b(please|could you|would you mind)\b/i.test(prompt)) {
    issues.push({ rule: 'politeness-waste', msg: 'Politeness tokens wasted on AI — be direct', penalty: 2 });
    score -= 2;
  }

  if (/\b(I think|I believe|maybe|perhaps|possibly)\b/i.test(prompt) && type === 'think') {
    issues.push({ rule: 'hedging', msg: 'Hedging language in think prompt — state positions directly', penalty: 5 });
    score -= 5;
  }

  // Token efficiency estimate
  const estimatedTokens = Math.ceil(chars / 4);
  const efficiency = Math.min(100, Math.round((words / estimatedTokens) * 100));

  // Duplication check
  const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const unique = new Set(sentences.map(s => s.trim().toLowerCase()));
  if (sentences.length > 3 && unique.size < sentences.length * 0.7) {
    issues.push({ rule: 'repetitive', msg: `${sentences.length - unique.size} near-duplicate sentences`, penalty: 10 });
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    issues,
    strengths,
    stats: {
      words,
      chars,
      estimatedTokens,
      efficiency,
      sentences: sentences.length,
    },
  };
}

/**
 * Log a prompt exchange for auditing.
 */
export function logPromptExchange(exchange) {
  const {
    type = 'think',
    round = 1,
    prompt,
    response,
    provider = 'gpt',
    model,
    durationMs,
    promptScore,
  } = exchange;

  mkdirSync(AUDIT_DIR, { recursive: true });

  const entry = {
    timestamp: new Date().toISOString(),
    type,
    round,
    provider,
    model,
    durationMs,
    promptScore: promptScore?.score,
    promptGrade: promptScore?.grade,
    promptWords: promptScore?.stats?.words,
    promptTokens: promptScore?.stats?.estimatedTokens,
    responseWords: response ? response.split(/\s+/).length : 0,
    responseTokens: response ? Math.ceil(response.length / 4) : 0,
    issues: promptScore?.issues?.map(i => i.rule) || [],
  };

  const logFile = join(AUDIT_DIR, 'exchanges.jsonl');
  appendFileSync(logFile, JSON.stringify(entry) + '\n');

  return entry;
}

/**
 * Get prompt quality statistics over time.
 */
export function getPromptStats(opts = {}) {
  const { days = 7 } = opts;
  const logFile = join(AUDIT_DIR, 'exchanges.jsonl');

  if (!existsSync(logFile)) return { available: false };

  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const lines = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);

  const entries = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.timestamp >= cutoff) entries.push(entry);
    } catch {}
  }

  if (entries.length === 0) return { available: true, count: 0 };

  const avgScore = entries.reduce((s, e) => s + (e.promptScore || 0), 0) / entries.length;
  const avgPromptTokens = entries.reduce((s, e) => s + (e.promptTokens || 0), 0) / entries.length;
  const avgResponseTokens = entries.reduce((s, e) => s + (e.responseTokens || 0), 0) / entries.length;
  const avgDuration = entries.reduce((s, e) => s + (e.durationMs || 0), 0) / entries.length;

  const grades = {};
  for (const e of entries) {
    grades[e.promptGrade] = (grades[e.promptGrade] || 0) + 1;
  }

  const commonIssues = {};
  for (const e of entries) {
    for (const issue of (e.issues || [])) {
      commonIssues[issue] = (commonIssues[issue] || 0) + 1;
    }
  }

  const topIssues = Object.entries(commonIssues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rule, count]) => ({ rule, count, pct: Math.round(count / entries.length * 100) }));

  return {
    available: true,
    count: entries.length,
    avgScore: Math.round(avgScore),
    avgPromptTokens: Math.round(avgPromptTokens),
    avgResponseTokens: Math.round(avgResponseTokens),
    avgDurationMs: Math.round(avgDuration),
    totalPromptTokens: entries.reduce((s, e) => s + (e.promptTokens || 0), 0),
    totalResponseTokens: entries.reduce((s, e) => s + (e.responseTokens || 0), 0),
    grades,
    topIssues,
  };
}

/**
 * Suggest improvements for a prompt.
 */
export function suggestImprovements(prompt, type = 'think') {
  const score = scorePrompt(prompt, { type });
  const suggestions = [];

  for (const issue of score.issues) {
    switch (issue.rule) {
      case 'too-short':
        suggestions.push('Add context: what modules are involved, what decision is needed, what constraints exist');
        break;
      case 'too-long':
        suggestions.push('Trim: remove background the AI already knows from CLAUDE.md. Focus on what\'s unique to this question');
        break;
      case 'no-question':
        suggestions.push('End with a clear question or decision point');
        break;
      case 'vague-context':
        suggestions.push('Name specific files, functions, or modules instead of "the project"');
        break;
      case 'politeness-waste':
        suggestions.push('Remove "please", "could you" — direct prompts produce better output');
        break;
      case 'hedging':
        suggestions.push('State positions directly — "X is better because Y" not "I think maybe X"');
        break;
      case 'repetitive':
        suggestions.push('Remove duplicate sentences — each sentence should add new information');
        break;
    }
  }

  return { score, suggestions };
}
