#!/usr/bin/env node
/**
 * failure-memory.mjs — Track task failures and enable automatic escalation.
 *
 * Exports: recordFailure, checkFailureHistory, formatEscalation,
 *          clearFailures, getFailureStats
 */

import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STOP_WORDS = new Set(['the','a','an','is','in','on','at','to','for','of','and','or','with','this','that','it','be','was','are','were','has','have','had','do','does','did','not','from','by','as','if','but','we','i','you']);
const WINDOW_48H = 48 * 60 * 60 * 1000;

const DEPTH_ORDER = ['low', 'medium', 'high', 'ultra'];
const MODEL_ORDER = ['haiku', 'sonnet', 'opus'];

function failuresPath(cwd) {
  const dir = join(cwd, '.dualbrain');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'failures.jsonl');
}

function categorizeError(error = '') {
  const e = error.toLowerCase();
  if (/test|assert|expect/.test(e))             return 'test-failure';
  if (/timeout|timed out/.test(e))              return 'timeout';
  if (/syntax|parse|unexpected token/.test(e))  return 'syntax-error';
  if (/permission|eacces/.test(e))              return 'permission-error';
  if (/not found|enoent/.test(e))               return 'not-found';
  return 'unknown';
}

function tokenize(text = '') {
  return text.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function similarity(promptA, promptB, filesA = [], filesB = []) {
  const wordsA = new Set(tokenize(promptA));
  const wordsB = new Set(tokenize(promptB));
  if (!wordsA.size && !wordsB.size) return 0;
  const shared = [...wordsA].filter(w => wordsB.has(w)).length;
  const wordScore = shared / Math.max(wordsA.size, wordsB.size);
  const sharedFiles = filesA.some(f => filesB.includes(f));
  return sharedFiles ? Math.max(wordScore, 0.5) : wordScore;
}

function readFailures(cwd) {
  const path = failuresPath(cwd);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function writeAll(cwd, records) {
  writeFileSync(failuresPath(cwd), records.map(r => JSON.stringify(r)).join('\n') + '\n');
}

function bumpDepth(depth) {
  const idx = DEPTH_ORDER.indexOf(depth);
  return idx === -1 || idx >= DEPTH_ORDER.length - 1 ? 'ultra' : DEPTH_ORDER[idx + 1];
}

function bumpModel(model = '') {
  const m = model.toLowerCase();
  const match = MODEL_ORDER.find(k => m.includes(k)) ?? 'sonnet';
  const idx = MODEL_ORDER.indexOf(match);
  return idx >= MODEL_ORDER.length - 1 ? `claude-opus-4-5` : `claude-${MODEL_ORDER[idx + 1]}-4-5`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function recordFailure(prompt, plan = {}, error = '', cwd = process.cwd()) {
  const record = {
    id: randomUUID(),
    timestamp: Date.now(),
    prompt,
    promptWords: tokenize(prompt),
    model: plan.model ?? null,
    reasoningDepth: plan.reasoningDepth ?? null,
    tier: plan.tier ?? null,
    error: String(error),
    errorCategory: categorizeError(error),
    files: plan.files ?? [],
    escalatedFrom: plan.escalatedFrom ?? null,
    resolved: false,
  };
  appendFileSync(failuresPath(cwd), JSON.stringify(record) + '\n');
  return record;
}

export async function checkFailureHistory(prompt, files = [], cwd = process.cwd()) {
  const cutoff = Date.now() - WINDOW_48H;
  const all = readFailures(cwd);
  const recent = all.filter(r => !r.resolved && r.timestamp >= cutoff);
  const matches = recent
    .map(r => ({ r, score: similarity(prompt, r.prompt, files, r.files ?? []) }))
    .filter(({ score }) => score >= 0.4)
    .sort((a, b) => b.r.timestamp - a.r.timestamp);

  const count = matches.length;
  const last = matches[0]?.r ?? null;

  const escalation = { recommended: false, fromModel: null, toModel: null, fromDepth: null, toDepth: null, useChallenger: false, reason: '' };

  if (count >= 1) {
    escalation.recommended = true;
    escalation.fromModel = last.model;
    escalation.fromDepth = last.reasoningDepth;

    if (count === 1) {
      escalation.toDepth = bumpDepth(last.reasoningDepth ?? 'medium');
      escalation.toModel = last.model;
      escalation.useChallenger = false;
      escalation.reason = `1 prior failure on similar task, bumping depth to ${escalation.toDepth}`;
    } else if (count === 2) {
      escalation.toDepth = 'ultra';
      escalation.toModel = last.model?.includes('opus') ? last.model : bumpModel(last.model);
      escalation.useChallenger = false;
      escalation.reason = `2 prior failures on similar task, escalating to Opus + ultrathink`;
    } else {
      escalation.toDepth = 'ultra';
      escalation.toModel = last.model?.includes('opus') ? last.model : bumpModel(last.model);
      escalation.useChallenger = true;
      escalation.reason = `${count} prior failures on similar task, forcing dual-brain`;
    }
  }

  return { hasPriorFailures: count > 0, failureCount: count, lastFailure: last, escalation };
}

export function formatEscalation(escalation) {
  if (!escalation?.recommended) return '';
  const prev = [escalation.fromModel, escalation.fromDepth].filter(Boolean).join(', ') || 'unknown';
  const next = [escalation.toModel, escalation.toDepth, escalation.useChallenger ? 'GPT challenger' : null].filter(Boolean).join(' + ');
  return `⚡ Strategy changed\n  Previous: failed (${prev})\n  Escalated: ${next}\n  Reason: ${escalation.reason}`;
}

export async function clearFailures(prompt, cwd = process.cwd()) {
  const all = readFailures(cwd);
  const promptWords = tokenize(prompt);
  const fakePrompt = promptWords.join(' ');
  let changed = false;
  const updated = all.map(r => {
    if (!r.resolved && similarity(fakePrompt, r.prompt) >= 0.4) {
      changed = true;
      return { ...r, resolved: true };
    }
    return r;
  });
  if (changed) writeAll(cwd, updated);
}

export async function getFailureStats(cwd = process.cwd()) {
  const all = readFailures(cwd);
  const byCategory = {};
  let resolved = 0;
  let escalationSum = 0;
  let escalationCount = 0;

  for (const r of all) {
    if (r.resolved) resolved++;
    byCategory[r.errorCategory] = (byCategory[r.errorCategory] ?? 0) + 1;
    if (r.escalatedFrom) { escalationSum++; escalationCount++; }
  }

  return {
    total: all.length,
    resolved,
    unresolved: all.length - resolved,
    byCategory,
    avgEscalationsToResolve: escalationCount ? +(escalationSum / escalationCount).toFixed(2) : 0,
  };
}
