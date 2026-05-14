#!/usr/bin/env node
/**
 * failure-detector.mjs — Detects repeated failure loops for adaptive routing.
 *
 * Exports:
 *   checkFailureLoop(promptHash) → { isLoop, count, suggestion }
 *   recordFailure(promptHash, tier, reason) → void
 */

import { readFileSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEDGER_FILE = join(__dirname, 'decision-ledger.jsonl');

function checkFailureLoop(promptHash) {
  if (!promptHash) return { isLoop: false, count: 0, suggestion: null };

  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  let failures = 0;
  let lastTier = null;

  try {
    const lines = readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.prompt_hash !== promptHash) continue;
        if (Date.parse(entry.timestamp) < twoHoursAgo) continue;
        if (entry.success === false) {
          failures++;
          lastTier = entry.tier;
        }
      } catch {}
    }
  } catch {}

  if (failures < 2) return { isLoop: false, count: failures, suggestion: null };

  const suggestion = lastTier === 'execute'
    ? 'promote_tier'
    : 'escalate_to_dual_brain';

  return { isLoop: true, count: failures, suggestion };
}

function recordFailure(promptHash, tier, reason) {
  const entry = JSON.stringify({
    type: 'failure',
    timestamp: new Date().toISOString(),
    prompt_hash: promptHash,
    tier,
    reason: reason || 'unknown',
    success: false,
  });
  try {
    appendFileSync(LEDGER_FILE, entry + '\n');
  } catch {}
}

export { checkFailureLoop, recordFailure };
