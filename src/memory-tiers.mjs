// memory-tiers.mjs — Hot/Warm/Cold memory with active paging.
//
// Hot: loaded every turn (narrative + active simmer). Always in HEAD's context.
// Warm: loaded on demand (recent debriefs, narrative history, relevant past decisions).
// Cold: past sessions, archived patterns. Only retrieved when explicitly needed.
//
// The paging mechanism: HEAD doesn't decide what to load — this module does,
// based on what the current situation seems to need.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as narrative from './narrative.mjs';
import * as simmer from './simmer.mjs';

const STATE_DIR = join(process.cwd(), '.dualbrain');

/**
 * @typedef {object} MemoryContext
 * @property {string} narrative - Current running narrative
 * @property {string} simmerBrief - What's brewing
 * @property {Array} warmItems - Paged-in warm memory items
 * @property {string} combined - Single string ready to inject into HEAD's context
 */

/**
 * Load hot memory — always returned, every turn.
 * This is the minimum context HEAD needs to be "in the song."
 *
 * @returns {{narrative: string, simmerBrief: string, combined: string}}
 */
export function loadHot() {
  const narr = narrative.load();
  const simmering = simmer.brief();

  const parts = [];
  if (narr) parts.push(narr);
  if (simmering) parts.push(`[Simmering]\n${simmering}`);

  return {
    narrative: narr,
    simmerBrief: simmering,
    combined: parts.join('\n\n'),
  };
}

/**
 * Load warm memory — contextually relevant items paged in based on signals.
 *
 * @param {object} signals - What the current turn is about
 * @param {string} signals.userMessage - The user's message
 * @param {string[]} signals.files - Files being discussed
 * @param {string} signals.intent - Detected intent (from HEAD's perception)
 * @returns {Array<{source: string, content: string}>}
 */
export function loadWarm(signals = {}) {
  const items = [];

  // Recent narrative history if we're resuming or context feels thin
  if (_looksLikeResume(signals.userMessage) || !narrative.load()) {
    const history = narrative.recentHistory(3);
    if (history.length > 0) {
      items.push({
        source: 'narrative-history',
        content: history.map(h => h.text).join('\n---\n'),
      });
    }
  }

  // Recent debriefs if we're continuing dispatch work
  if (signals.intent === 'dispatch' || signals.intent === 'proceed') {
    const debriefs = _loadRecentDebriefs(3);
    if (debriefs.length > 0) {
      items.push({
        source: 'recent-debriefs',
        content: debriefs.map(d => `[${d.status}] ${d.objective || d.summary || ''}`).join('\n'),
      });
    }
  }

  // Routing decisions if making a new routing choice
  if (signals.intent === 'route' || signals.intent === 'dispatch') {
    const decisions = _loadRecentDecisions(5);
    if (decisions.length > 0) {
      items.push({
        source: 'routing-history',
        content: decisions.map(d => `${d.provider}/${d.model}: ${d.reason || ''}`).join('\n'),
      });
    }
  }

  return items;
}

/**
 * Load cold memory — only when explicitly requested or when signals strongly indicate need.
 *
 * @param {string} query - What we're looking for
 * @returns {Array<{source: string, content: string}>}
 */
export function loadCold(query) {
  const items = [];

  // Search past handoffs (from continuity.mjs)
  const handoffs = _searchHandoffs(query);
  if (handoffs.length > 0) {
    items.push({
      source: 'past-sessions',
      content: handoffs.map(h => `[${h.timestamp}] ${h.task || ''}: ${h.resumeHint || ''}`).join('\n'),
    });
  }

  return items;
}

/**
 * Full context assembly — combines hot + warm based on current signals.
 * This is what gets injected into HEAD's turn context.
 *
 * @param {object} signals
 * @returns {MemoryContext}
 */
export function assemble(signals = {}) {
  const hot = loadHot();
  const warm = loadWarm(signals);

  const parts = [];
  if (hot.combined) parts.push(hot.combined);

  if (warm.length > 0) {
    const warmText = warm.map(w => `[${w.source}]\n${w.content}`).join('\n\n');
    parts.push(warmText);
  }

  return {
    narrative: hot.narrative,
    simmerBrief: hot.simmerBrief,
    warmItems: warm,
    combined: parts.join('\n\n---\n\n'),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _looksLikeResume(msg) {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return /continue|where were we|pick up|resume|what's next|whats next/.test(lower);
}

function _loadRecentDebriefs(n) {
  try {
    const loopFile = join(STATE_DIR, 'cognitive-loop.json');
    if (!existsSync(loopFile)) return [];
    const loop = JSON.parse(readFileSync(loopFile, 'utf8'));
    return (loop.debriefs || []).slice(-n);
  } catch {
    return [];
  }
}

function _loadRecentDecisions(n) {
  try {
    const file = join(STATE_DIR, 'decisions.jsonl');
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function _searchHandoffs(query) {
  try {
    const handoffDir = join(STATE_DIR, 'handoffs');
    if (!existsSync(handoffDir)) return [];
    const files = readdirSync(handoffDir).filter(f => f.endsWith('.json')).slice(-10);
    const results = [];
    const queryLower = query.toLowerCase();

    for (const f of files) {
      try {
        const data = JSON.parse(readFileSync(join(handoffDir, f), 'utf8'));
        const text = JSON.stringify(data).toLowerCase();
        if (text.includes(queryLower)) {
          results.push(data);
        }
      } catch {}
    }
    return results.slice(-3);
  } catch {
    return [];
  }
}
