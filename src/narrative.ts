// narrative.ts — HEAD's running narrative: prose it writes to itself between turns.
// Not structured data. A paragraph or two that captures where we are, what just
// happened, what's brewing. Loaded at the top of each turn so HEAD is immediately
// "in the song" without reconstructing from scattered JSON.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const NARRATIVE_FILE = join(STATE_DIR, 'narrative.md');
const NARRATIVE_HISTORY = join(STATE_DIR, 'narrative-history.jsonl');

const MAX_NARRATIVE_LENGTH = 2000;
const MAX_HISTORY_ENTRIES = 20;

/**
 * Load the current running narrative. Returns empty string if none exists.
 * This is meant to be injected at the top of HEAD's context each turn.
 */
export function load(): string {
  try {
    if (existsSync(NARRATIVE_FILE)) {
      return readFileSync(NARRATIVE_FILE, 'utf8').trim();
    }
  } catch {}
  return '';
}

/**
 * Write a new narrative, replacing the old one.
 * The old narrative is archived to history before overwrite.
 *
 * @param {string} prose - HEAD's current understanding in prose form.
 *   Should answer: Where are we? What just happened? What's brewing?
 *   What did the user care about? What should I not forget?
 */
export function write(prose: string): void {
  if (!prose || typeof prose !== 'string') return;

  const trimmed = prose.slice(0, MAX_NARRATIVE_LENGTH).trim();
  if (!trimmed) return;

  mkdirSync(STATE_DIR, { recursive: true });

  // Archive current before overwriting
  const current = load();
  if (current) {
    _appendHistory(current);
  }

  writeFileSync(NARRATIVE_FILE, trimmed + '\n');
}

/**
 * Evolve the narrative — append new observations without replacing everything.
 * Used after dispatches return, after user says something illuminating,
 * or after a wave completes.
 *
 * @param {string} addition - New prose to weave into the narrative.
 * @param {object} opts
 * @param {boolean} opts.replace - If true, replace entirely instead of appending.
 */
export function evolve(addition: string, { replace = false }: { replace?: boolean } = {}): void {
  if (!addition || typeof addition !== 'string') return;

  if (replace) {
    write(addition);
    return;
  }

  const current = load();
  const combined = current
    ? current + '\n\n' + addition.trim()
    : addition.trim();

  // If too long, keep the newest portion (recency bias for immersion)
  const final = combined.length > MAX_NARRATIVE_LENGTH
    ? combined.slice(-MAX_NARRATIVE_LENGTH)
    : combined;

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(NARRATIVE_FILE, final.trim() + '\n');
}

/**
 * Generate a narrative excerpt suitable for a dispatch envelope.
 * Shorter than the full narrative — just enough context for a worker
 * to understand the "why" without the full stream of consciousness.
 *
 * @param {number} maxLength - Max chars for the excerpt (default 500)
 * @returns {string}
 */
export function excerpt(maxLength = 500): string {
  const full = load();
  if (!full) return '';
  if (full.length <= maxLength) return full;

  // Take the last N chars — most recent context is most relevant for workers
  const trimmed = full.slice(-maxLength);
  // Find the first sentence boundary to avoid mid-thought cuts
  const firstPeriod = trimmed.indexOf('. ');
  if (firstPeriod > 0 && firstPeriod < maxLength * 0.4) {
    return trimmed.slice(firstPeriod + 2);
  }
  return trimmed;
}

/**
 * Get recent narrative history entries (for warm memory tier).
 * @param {number} n - Number of recent entries to retrieve
 * @returns {Array<{ts: number, text: string}>}
 */
export function recentHistory(n = 5): Array<{ts: number; text: string}> {
  try {
    if (!existsSync(NARRATIVE_HISTORY)) return [];
    const lines = readFileSync(NARRATIVE_HISTORY, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Persist the current narrative for precompact survival.
 * Called by the precompact hook before context compression.
 * Returns the narrative that was persisted (for confirmation).
 */
export function persist(): string {
  const current = load();
  if (!current) return '';
  // Narrative is already on disk — this just ensures it's fresh
  // and archives a snapshot with explicit "precompact" marker
  _appendHistory(current, { reason: 'precompact' });
  return current;
}

/**
 * Clear the narrative (used in testing or session reset).
 */
export function clear(): void {
  try {
    if (existsSync(NARRATIVE_FILE)) {
      writeFileSync(NARRATIVE_FILE, '');
    }
  } catch {}
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _appendHistory(text: string, meta: Record<string, unknown> = {}): void {
  try {
    const entry = JSON.stringify({ ts: Date.now(), text: text.slice(0, 800), ...meta });
    mkdirSync(STATE_DIR, { recursive: true });

    // Cap history file
    let existing = '';
    if (existsSync(NARRATIVE_HISTORY)) {
      existing = readFileSync(NARRATIVE_HISTORY, 'utf8');
      const lines = existing.trim().split('\n').filter(Boolean);
      if (lines.length >= MAX_HISTORY_ENTRIES) {
        existing = lines.slice(-MAX_HISTORY_ENTRIES + 1).join('\n') + '\n';
      }
    }

    writeFileSync(NARRATIVE_HISTORY, existing + entry + '\n');
  } catch {}
}
