#!/usr/bin/env node
/**
 * context-guard.mjs — Keep the head (Opus) context window clean.
 *
 * The head orchestrates work but must never bloat its context with raw agent
 * output, large code blocks, or verbose analysis. This module provides helpers
 * to compress, summarize, and route information appropriately.
 *
 * Exports:
 *   compressAgentResult(result, maxLength?)  — strip noise, return tight summary
 *   buildHandoff(fromAgent, toAgent, ctx)    — minimal inter-agent payload
 *   estimateContextCost(message)             — token estimate + routing hint
 *   formatHeadUpdate(agentType, taskId, result) — 1-line head-visible status
 *   shouldDelegate(description, ctxSize)     — inline vs delegate decision
 *   buildAgentPipeline(intent, risk, cplx)  — ordered agent type list
 *
 * CLI: node hooks/context-guard.mjs --estimate "some long text here"
 */

import { classifyTask, INTENTS } from './task-classifier.mjs';

// ─── Constants ────────────────────────────────────────────────────────────────

// Rough heuristic: average English token is ~4 chars (GPT/Claude tokenizers)
const CHARS_PER_TOKEN = 4;

// Context thresholds (in tokens)
const INLINE_LIMIT   = 500;   // small enough to paste into head context
const SUMMARIZE_LIMIT = 2000; // compress before showing to head
// anything above SUMMARIZE_LIMIT → delegate entirely

// Patterns to strip from raw agent output
const STRIP_PATTERNS = [
  /```[\s\S]*?```/g,                    // fenced code blocks
  /`[^`\n]{10,}`/g,                     // long inline code
  /^\s*(at\s+\S+\s+\(.*\).*$)/gm,      // stack trace lines
  /^\s*Error:\s+.+\n(\s{2,}.+\n)*/gm,  // error + indented detail
  /\n{3,}/g,                            // triple+ blank lines → double
  /^\s*\d+\s*[|│]\s*/gm,               // line-number prefixes from cat -n style output
  /^(DEBUG|TRACE|VERBOSE):.+$/gim,      // debug log lines
];

// Words that signal a blocker/failure in free-form output
const BLOCKER_PATTERNS = /\b(error|fail(?:ed|ure)?|exception|blocked?|cannot|could not|unable|missing|not found|refused|rejected|timeout|abort)\b/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip noise from raw text: code blocks, stack traces, debug lines, etc.
 */
function stripNoise(text) {
  let out = String(text || '');
  for (const pattern of STRIP_PATTERNS) {
    out = out.replace(pattern, pattern.source === '\\n{3,}' ? '\n\n' : ' ');
  }
  return out.trim();
}

/**
 * Extract first N sentences from cleaned text.
 */
function firstSentences(text, n = 2) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);
  return sentences.slice(0, n).join(' ');
}

/**
 * Detect outcome (success / fail / partial) from raw text.
 */
function detectOutcome(text) {
  const lower = text.toLowerCase();
  if (/\b(success(?:fully)?|completed?|done|all tests pass|no issues|lgtm)\b/.test(lower)) return 'success';
  if (BLOCKER_PATTERNS.test(lower)) return 'fail';
  return 'partial';
}

/**
 * Extract file paths mentioned in text (basic heuristic).
 */
function extractMentionedFiles(text) {
  const matches = text.match(/\b[\w./\-]+\.\w{2,6}\b/g) || [];
  // Filter out noise (URLs, version strings, etc.)
  return [...new Set(matches.filter(f =>
    !f.startsWith('http') && f.includes('/') || /\.(mjs|ts|js|json|md|py|go|rs|sh|yaml|yml|toml)$/.test(f)
  ))].slice(0, 10);
}

/**
 * Extract key decisions from text — lines starting with decision verbs or
 * "chose / decided / picked / will use" patterns.
 */
function extractKeyDecisions(text) {
  const decisionRe = /^.{0,40}(chose|decided|picked|will use|using|switched|moved to|adopted|recommended|selected).{0,120}/im;
  const bullets = text.match(/^[-*•]\s+.{10,100}/gm) || [];
  const inline = text.match(decisionRe) || [];
  return [...inline.map(s => s.trim()), ...bullets.map(s => s.replace(/^[-*•]\s+/, ''))].slice(0, 5);
}

/**
 * Find open questions in the text.
 */
function extractOpenQuestions(text) {
  return (text.match(/[A-Z][^?.!]*\?/g) || [])
    .map(q => q.trim())
    .filter(q => q.length > 15 && q.length < 150)
    .slice(0, 3);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Compress a raw agent result to at most `maxLength` characters.
 * Strips code blocks, stack traces, and verbose explanations.
 * Returns an object rather than a string so callers get structured data too.
 *
 * @param {string|object} result   Raw agent output (string or object with .output)
 * @param {number}        maxLength  Character cap for the summary field (default 300)
 * @returns {{ outcome, summary, filesAffected, keyDecisions, blockers, originalLength }}
 */
function compressAgentResult(result, maxLength = 300) {
  const raw = typeof result === 'string'
    ? result
    : (result?.output ?? result?.message ?? result?.text ?? JSON.stringify(result));

  const originalLength = raw.length;
  const cleaned        = stripNoise(raw);
  const outcome        = detectOutcome(raw);
  const filesAffected  = extractMentionedFiles(raw);
  const keyDecisions   = extractKeyDecisions(cleaned);

  // Blocker extraction: grab the first matching sentence
  const blockerMatch = raw.match(new RegExp(BLOCKER_PATTERNS.source + '.{0,200}', 'i'));
  const blockers     = blockerMatch ? [blockerMatch[0].slice(0, 120).trim()] : [];

  // Summary: take the first 2 sentences of cleaned text, then truncate
  let summary = firstSentences(cleaned, 2);
  if (!summary && cleaned.length > 0) summary = cleaned.slice(0, 150);
  if (summary.length > maxLength) summary = summary.slice(0, maxLength - 1) + '…';

  return { outcome, summary, filesAffected, keyDecisions, blockers, originalLength };
}

/**
 * Build a minimal handoff payload from one agent to the next.
 * Only carries what the next agent actually needs — not the full prior output.
 *
 * @param {string} fromAgent  e.g. 'researcher', 'planner', 'worker'
 * @param {string} toAgent    e.g. 'worker', 'reviewer', 'tester'
 * @param {object} context    Raw output or structured result from fromAgent
 * @returns {{ summary, keyDecisions, filesAffected, constraints, openQuestions }}
 */
function buildHandoff(fromAgent, toAgent, context) {
  const compressed = compressAgentResult(context, 400);

  // Derive constraints: things the next agent must respect
  const raw = typeof context === 'string' ? context : JSON.stringify(context);
  const constraintRe = /\b(must|should|cannot|don't|do not|never|always|required?|constraint)\b.{5,100}/gi;
  const constraints  = (raw.match(constraintRe) || [])
    .map(s => s.trim().slice(0, 100))
    .slice(0, 4);

  return {
    from:           fromAgent,
    to:             toAgent,
    summary:        compressed.summary,
    keyDecisions:   compressed.keyDecisions,
    filesAffected:  compressed.filesAffected,
    constraints,
    openQuestions:  extractOpenQuestions(raw),
    outcome:        compressed.outcome,
    blockers:       compressed.blockers,
  };
}

/**
 * Estimate how many tokens a message would add to context.
 * Uses ~4 chars/token heuristic (close enough for routing decisions).
 *
 * @param {string} message
 * @returns {{ tokens, isHeavy, recommendation: 'inline'|'summarize'|'delegate' }}
 */
function estimateContextCost(message) {
  const text   = typeof message === 'string' ? message : JSON.stringify(message ?? '');
  const tokens = Math.ceil(text.length / CHARS_PER_TOKEN);
  const isHeavy = tokens > INLINE_LIMIT;

  let recommendation;
  if (tokens <= INLINE_LIMIT) {
    recommendation = 'inline';
  } else if (tokens <= SUMMARIZE_LIMIT) {
    recommendation = 'summarize';
  } else {
    recommendation = 'delegate';
  }

  return { tokens, chars: text.length, isHeavy, recommendation };
}

/**
 * Format a single-line status update for the head's context.
 * The head sees this — nothing more — when an agent finishes.
 *
 * Examples:
 *   "worker:task-3 completed — 2 files changed, tests pass"
 *   "brainstorm:task-1 done — 5 ideas, top pick: DAG scheduler"
 *   "debugger:task-2 failed — TypeError in auth.mjs line 42"
 *
 * @param {string} agentType  e.g. 'worker', 'brainstorm', 'debugger'
 * @param {string} taskId     e.g. 'task-3'
 * @param {string|object} result  Raw agent output
 * @returns {string}
 */
function formatHeadUpdate(agentType, taskId, result) {
  const { outcome, summary, filesAffected, blockers } = compressAgentResult(result, 120);

  const prefix = `${agentType}:${taskId}`;
  const status = outcome === 'success' ? 'completed'
               : outcome === 'fail'    ? 'failed'
               : 'partial';

  // Build a tight detail string
  const parts = [];

  if (filesAffected.length > 0) {
    parts.push(`${filesAffected.length} file${filesAffected.length > 1 ? 's' : ''} changed`);
  }

  if (outcome === 'fail' && blockers.length > 0) {
    parts.push(blockers[0].slice(0, 80));
  } else if (summary) {
    // Use summary but keep it very tight
    const tight = summary.replace(/\n/g, ' ').slice(0, 80);
    parts.push(tight);
  }

  const detail = parts.join(', ');
  return `${prefix} ${status}${detail ? ' — ' + detail : ''}`;
}

/**
 * Decide whether the head should handle a task inline or delegate it.
 *
 * Small read-only lookups under 100 chars are cheap enough to inline.
 * Anything involving analysis, code reading, or multi-step reasoning
 * should be delegated to preserve the head's context budget.
 *
 * @param {string} description       Task description
 * @param {number} currentContextSize  Estimated current context size in tokens
 * @returns {{ delegate: boolean, reason: string, recommendation: 'inline'|'delegate' }}
 */
function shouldDelegate(description, currentContextSize = 0) {
  const desc = String(description || '');

  // Short read-only queries are cheap
  const isShort    = desc.length < 100;
  const readOnlyRe = /\b(what|where|list|show|find|which|how many|does|is|are|check)\b/i;
  const isReadOnly = readOnlyRe.test(desc);

  // Signals that demand delegation
  const analysisRe    = /\b(analyze|analyse|read|review|refactor|implement|write|build|fix|debug|test|compare|explain|design)\b/i;
  const multiStepRe   = /\b(and (also|then)|also|then|after (that|which)|step \d|first .* then)\b/i;
  const isAnalytic    = analysisRe.test(desc);
  const isMultiStep   = multiStepRe.test(desc);

  // Context pressure: if head context is already large, be more aggressive
  const contextHeavy  = currentContextSize > 4000; // tokens

  // Decision logic
  if (isAnalytic || isMultiStep || contextHeavy) {
    const reasons = [];
    if (isAnalytic)   reasons.push('requires analysis/code work');
    if (isMultiStep)  reasons.push('multi-step');
    if (contextHeavy) reasons.push(`context at ${currentContextSize} tokens`);
    return { delegate: true, recommendation: 'delegate', reason: reasons.join(', ') };
  }

  if (isShort && isReadOnly) {
    return { delegate: false, recommendation: 'inline', reason: 'short read-only query' };
  }

  // Default: delegate anything ambiguous to protect head context
  return { delegate: true, recommendation: 'delegate', reason: 'ambiguous — defaulting to delegate for safety' };
}

/**
 * Given a task profile, return an ordered list of agent types to run.
 * Agents are named by role, not model. The orchestrator maps roles to models.
 *
 * Pipeline examples:
 *   refactor auth module  → ['analyst', 'research', 'planner', 'worker', 'reviewer']
 *   what's the best approach for X → ['brainstorm']
 *   fix this bug          → ['debugger', 'worker', 'tester']
 *   add comprehensive tests → ['research', 'tester', 'reviewer']
 *
 * @param {string} intent     From task-classifier INTENTS keys
 * @param {string} risk       'low' | 'medium' | 'high' | 'critical'
 * @param {string} complexity 'trivial' | 'simple' | 'moderate' | 'complex'
 * @returns {string[]}  Ordered agent type names
 */
function buildAgentPipeline(intent, risk, complexity) {
  const LEVEL_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
  const riskLevel   = LEVEL_ORDER[risk]       ?? 0;
  const cplxLevel   = { trivial: 0, simple: 1, moderate: 2, complex: 3 }[complexity] ?? 1;

  const isCritical  = riskLevel >= 3;
  const isComplex   = cplxLevel >= 2;
  const isHighRisk  = riskLevel >= 2;
  const needsReview = isHighRisk || isComplex || isCritical;

  let pipeline;

  switch (intent) {
    // ── Pure thinking / ideation ──
    case 'architecture':
    case 'planning':
    case 'compare':
      pipeline = ['brainstorm', 'planner'];
      break;

    // ── Explain / document: look up then write ──
    case 'explain':
    case 'document':
      pipeline = ['research', 'worker'];
      break;

    // ── Search / format: lightweight, no review needed ──
    case 'search':
      pipeline = ['research'];
      break;

    case 'format':
      pipeline = ['worker'];
      break;

    // ── Debug: diagnose → fix → verify ──
    case 'debug':
      pipeline = ['debugger', 'worker', 'tester'];
      break;

    // ── Test: understand existing code, write tests, review coverage ──
    case 'test':
      pipeline = ['research', 'tester', 'reviewer'];
      break;

    // ── Review / audit: read → assess ──
    case 'review':
    case 'security':
      pipeline = ['research', 'reviewer'];
      break;

    // ── Refactor: plan before touching anything ──
    case 'refactor':
      pipeline = ['research', 'planner', 'worker', 'reviewer'];
      break;

    // ── Default edit: search → implement ──
    case 'edit':
    default:
      pipeline = isComplex
        ? ['research', 'planner', 'worker']
        : ['worker'];
      break;
  }

  // Prepend 'analyst' for complex or critical work (up-front risk analysis)
  if (isCritical || (isComplex && needsReview)) {
    if (pipeline[0] !== 'analyst') pipeline.unshift('analyst');
  }

  // Append 'reviewer' for high-risk / complex work (if not already present)
  if (needsReview && !pipeline.includes('reviewer')) {
    pipeline.push('reviewer');
  }

  return pipeline;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args  = process.argv.slice(2);
  const flag  = args[0];
  const value = args.slice(1).join(' ') || args[0];

  if (flag === '--estimate') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Usage: node hooks/context-guard.mjs --estimate "some text"');
      process.exit(1);
    }
    const result = estimateContextCost(text);
    console.log(JSON.stringify(result, null, 2));

  } else if (flag === '--compress') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Usage: node hooks/context-guard.mjs --compress "agent output..."');
      process.exit(1);
    }
    const result = compressAgentResult(text);
    console.log(JSON.stringify(result, null, 2));

  } else if (flag === '--pipeline') {
    // node hooks/context-guard.mjs --pipeline "refactor auth" [--risk high] [--complexity complex]
    const descParts  = [];
    let risk         = 'medium';
    let complexity   = 'moderate';

    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--risk')       { risk       = args[++i]; }
      else if (args[i] === '--complexity') { complexity = args[++i]; }
      else descParts.push(args[i]);
    }

    const description = descParts.join(' ');
    if (!description && descParts.length === 0) {
      console.error('Usage: node hooks/context-guard.mjs --pipeline "description" [--risk medium] [--complexity moderate]');
      process.exit(1);
    }

    // If a full description was given, derive intent from task-classifier
    let intent = 'edit';
    if (description) {
      const profile = classifyTask(description);
      intent        = profile.intent;
      risk          = profile.risk;
      complexity    = profile.complexity;
    }

    const pipeline = buildAgentPipeline(intent, risk, complexity);
    console.log(JSON.stringify({ intent, risk, complexity, pipeline }, null, 2));

  } else if (flag === '--delegate') {
    const desc       = args.slice(1).join(' ');
    const ctxArg     = args.find(a => a.startsWith('--context='));
    const ctxSize    = ctxArg ? parseInt(ctxArg.replace('--context=', ''), 10) : 0;
    const result     = shouldDelegate(desc, ctxSize);
    console.log(JSON.stringify(result, null, 2));

  } else {
    console.log([
      'context-guard.mjs — Head context management tools',
      '',
      'Usage:',
      '  node hooks/context-guard.mjs --estimate "text"              # token estimate + routing hint',
      '  node hooks/context-guard.mjs --compress "agent output..."   # compress to head-safe summary',
      '  node hooks/context-guard.mjs --pipeline "task description"  # build agent pipeline',
      '  node hooks/context-guard.mjs --delegate "task description"  # inline vs delegate',
      '',
      'Exports: compressAgentResult, buildHandoff, estimateContextCost,',
      '         formatHeadUpdate, shouldDelegate, buildAgentPipeline',
    ].join('\n'));
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  compressAgentResult,
  buildHandoff,
  estimateContextCost,
  formatHeadUpdate,
  shouldDelegate,
  buildAgentPipeline,
};
