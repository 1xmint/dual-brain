// simmer.mjs — Ideas that aren't tasks yet. They sit, gather heat, and crystallize.
//
// The "song" insight: users drop ideas casually. HEAD tends to acknowledge them
// verbally then move on. The simmer buffer catches these — every idea gets stored
// with a heat score. Heat rises when: the idea recurs, evidence supports it,
// adjacent work makes it more relevant, or time passes and it keeps nagging.
// When heat crosses a threshold, the idea crystallizes into an actionable item
// and surfaces to HEAD during deliberation.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const SIMMER_FILE = join(STATE_DIR, 'simmer.json');

const CRYSTALLIZE_THRESHOLD = 5;
const MAX_ITEMS = 30;
const HEAT_DECAY_PER_HOUR = 0.3;

/**
 * @typedef {object} SimmerItem
 * @property {string} id
 * @property {string} idea - The raw idea in prose
 * @property {string} origin - Where it came from (user quote, observation, debrief finding)
 * @property {number} heat - Current heat score
 * @property {number} createdAt
 * @property {number} lastHeated - Last time heat was added
 * @property {string[]} signals - Evidence trail (why heat was added)
 * @property {boolean} crystallized - Whether it's crossed the threshold
 * @property {string|null} crystallizedAs - What it became (task description, architecture decision, etc)
 */

/**
 * Add a new idea to the simmer buffer.
 * If a similar idea already exists (fuzzy match), heat it instead of duplicating.
 *
 * @param {string} idea - The idea in natural language
 * @param {object} opts
 * @param {string} opts.origin - Where this came from
 * @param {number} opts.initialHeat - Starting heat (default 1)
 * @returns {SimmerItem} The created or heated item
 */
export function add(idea, { origin = 'observation', initialHeat = 1 } = {}) {
  const items = _load();

  // Check for similar existing idea
  const existing = _findSimilar(items, idea);
  if (existing) {
    return heat(existing.id, initialHeat, `Recurrence: "${idea.slice(0, 60)}"`);
  }

  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    idea,
    origin,
    heat: initialHeat,
    createdAt: Date.now(),
    lastHeated: Date.now(),
    signals: [`Created from: ${origin}`],
    crystallized: false,
    crystallizedAs: null,
  };

  items.push(item);
  _save(items);
  return item;
}

/**
 * Add heat to an existing item. If it crosses the threshold, mark as crystallized.
 *
 * @param {string} id
 * @param {number} amount - Heat to add (default 1)
 * @param {string} signal - Why heat is being added
 * @returns {SimmerItem|null}
 */
export function heat(id, amount = 1, signal = '') {
  const items = _load();
  const item = items.find(i => i.id === id);
  if (!item) return null;

  item.heat += amount;
  item.lastHeated = Date.now();
  if (signal) item.signals.push(signal);

  // Cap signals array
  if (item.signals.length > 10) {
    item.signals = item.signals.slice(-10);
  }

  // Check crystallization
  if (!item.crystallized && item.heat >= CRYSTALLIZE_THRESHOLD) {
    item.crystallized = true;
  }

  _save(items);
  return item;
}

/**
 * Get all items that have crystallized but haven't been surfaced yet.
 * These should be presented to HEAD during deliberation.
 *
 * @returns {SimmerItem[]}
 */
export function harvest() {
  const items = _load();
  return items.filter(i => i.crystallized && !i.crystallizedAs);
}

/**
 * Mark a crystallized item as actioned — record what it became.
 *
 * @param {string} id
 * @param {string} became - Description of what action was taken
 */
export function resolve(id, became) {
  const items = _load();
  const item = items.find(i => i.id === id);
  if (!item) return;
  item.crystallizedAs = became;
  _save(items);
}

/**
 * Get all active (non-resolved) simmering items, sorted by heat descending.
 * Used by the narrative to include "what's brewing" context.
 *
 * @returns {SimmerItem[]}
 */
export function active() {
  const items = _load();
  _applyDecay(items);
  return items
    .filter(i => !i.crystallizedAs)
    .sort((a, b) => b.heat - a.heat);
}

/**
 * Check if an idea already exists in the buffer (for deduplication).
 * @param {string} idea
 * @returns {SimmerItem|null}
 */
export function find(idea) {
  const items = _load();
  return _findSimilar(items, idea);
}

/**
 * Generate a brief for HEAD showing what's simmering.
 * Included in the narrative context so HEAD is aware of brewing ideas.
 *
 * @returns {string} Prose summary of active simmer items, or empty string
 */
export function brief() {
  const items = active();
  if (items.length === 0) return '';

  const crystallized = items.filter(i => i.crystallized);
  const hot = items.filter(i => !i.crystallized && i.heat >= 3);
  const warm = items.filter(i => !i.crystallized && i.heat >= 1.5 && i.heat < 3);

  const parts = [];

  if (crystallized.length > 0) {
    parts.push(`Crystallized (ready to act): ${crystallized.map(i => i.idea.slice(0, 80)).join('; ')}`);
  }
  if (hot.length > 0) {
    parts.push(`Hot (building momentum): ${hot.map(i => `${i.idea.slice(0, 60)} [heat:${i.heat.toFixed(1)}]`).join('; ')}`);
  }
  if (warm.length > 0 && parts.length < 2) {
    parts.push(`Warm: ${warm.slice(0, 3).map(i => i.idea.slice(0, 50)).join('; ')}`);
  }

  return parts.join('\n');
}

/**
 * Prune resolved and cold-dead items.
 */
export function prune() {
  let items = _load();
  _applyDecay(items);
  // Remove: resolved items older than 1h, or items with heat <= 0
  const cutoff = Date.now() - 60 * 60 * 1000;
  items = items.filter(i => {
    if (i.crystallizedAs && i.lastHeated < cutoff) return false;
    if (i.heat <= 0) return false;
    return true;
  });
  _save(items);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _load() {
  try {
    if (existsSync(SIMMER_FILE)) {
      return JSON.parse(readFileSync(SIMMER_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function _save(items) {
  // Cap total items
  if (items.length > MAX_ITEMS) {
    items.sort((a, b) => b.heat - a.heat);
    items = items.slice(0, MAX_ITEMS);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SIMMER_FILE, JSON.stringify(items, null, 2));
}

function _applyDecay(items) {
  const now = Date.now();
  for (const item of items) {
    if (item.crystallized) continue; // Crystallized items don't decay
    const hoursSinceHeat = (now - item.lastHeated) / (60 * 60 * 1000);
    if (hoursSinceHeat > 1) {
      item.heat -= HEAT_DECAY_PER_HOUR * hoursSinceHeat;
      if (item.heat < 0) item.heat = 0;
    }
  }
}

function _findSimilar(items, idea) {
  const normalized = idea.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0) return null;

  for (const item of items) {
    if (item.crystallizedAs) continue; // Skip resolved
    const itemNorm = item.idea.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const matchCount = words.filter(w => itemNorm.includes(w)).length;
    if (matchCount >= Math.ceil(words.length * 0.5)) {
      return item;
    }
  }
  return null;
}
