// memory-tiers.ts — Hot/Warm/Cold memory with active paging.
//
// Hot: loaded every turn (narrative + active simmer). Always in HEAD's context.
// Warm: loaded on demand (recent debriefs, narrative history, relevant past decisions).
// Cold: past sessions, archived patterns. Only retrieved when explicitly needed.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as narrative from './narrative.js';
import * as simmer from './simmer.js';

const STATE_DIR = join(process.cwd(), '.dualbrain');

interface MemoryItem {
  source: string;
  content: string;
}

interface MemoryContext {
  narrative: string;
  simmerBrief: string;
  warmItems: MemoryItem[];
  combined: string;
}

interface HotMemory {
  narrative: string;
  simmerBrief: string;
  combined: string;
}

interface Signals {
  userMessage?: string;
  files?: string[];
  intent?: string;
}

/**
 * Load hot memory — always returned, every turn.
 */
export function loadHot(): HotMemory {
  const narr: string = narrative.load();
  const simmering: string = simmer.brief();

  const parts: string[] = [];
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
 */
export function loadWarm(signals: Signals = {}): MemoryItem[] {
  const items: MemoryItem[] = [];

  // Recent narrative history if we're resuming or context feels thin
  if (_looksLikeResume(signals.userMessage) || !narrative.load()) {
    const history = narrative.recentHistory(3);
    if (history.length > 0) {
      items.push({
        source: 'narrative-history',
        content: history.map((h: { text: string }) => h.text).join('\n---\n'),
      });
    }
  }

  // Recent debriefs if we're continuing dispatch work
  if (signals.intent === 'dispatch' || signals.intent === 'proceed') {
    const debriefs = _loadRecentDebriefs(3);
    if (debriefs.length > 0) {
      items.push({
        source: 'recent-debriefs',
        content: debriefs.map((d: { status?: string; objective?: string; summary?: string }) => `[${d.status}] ${d.objective || d.summary || ''}`).join('\n'),
      });
    }
  }

  // Routing decisions if making a new routing choice
  if (signals.intent === 'route' || signals.intent === 'dispatch') {
    const decisions = _loadRecentDecisions(5);
    if (decisions.length > 0) {
      items.push({
        source: 'routing-history',
        content: decisions.map((d: { provider?: string; model?: string; reason?: string }) => `${d.provider}/${d.model}: ${d.reason || ''}`).join('\n'),
      });
    }
  }

  return items;
}

/**
 * Load cold memory — only when explicitly requested or when signals strongly indicate need.
 */
export function loadCold(query: string): MemoryItem[] {
  const items: MemoryItem[] = [];

  // Search past handoffs (from continuity.mjs)
  const handoffs = _searchHandoffs(query);
  if (handoffs.length > 0) {
    items.push({
      source: 'past-sessions',
      content: handoffs.map((h: { timestamp?: string; task?: string; resumeHint?: string }) => `[${h.timestamp}] ${h.task || ''}: ${h.resumeHint || ''}`).join('\n'),
    });
  }

  return items;
}

/**
 * Full context assembly — combines hot + warm based on current signals.
 */
export function assemble(signals: Signals = {}): MemoryContext {
  const hot = loadHot();
  const warm = loadWarm(signals);

  const parts: string[] = [];
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

// -- Internal helpers --

function _looksLikeResume(msg: string | undefined): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return /continue|where were we|pick up|resume|what's next|whats next/.test(lower);
}

function _loadRecentDebriefs(n: number): Array<Record<string, unknown>> {
  try {
    const loopFile = join(STATE_DIR, 'cognitive-loop.json');
    if (!existsSync(loopFile)) return [];
    const loop = JSON.parse(readFileSync(loopFile, 'utf8'));
    return ((loop.debriefs || []) as Array<Record<string, unknown>>).slice(-n);
  } catch {
    return [];
  }
}

function _loadRecentDecisions(n: number): Array<Record<string, unknown>> {
  try {
    const file = join(STATE_DIR, 'decisions.jsonl');
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}

function _searchHandoffs(query: string): Array<Record<string, unknown>> {
  try {
    const handoffDir = join(STATE_DIR, 'handoffs');
    if (!existsSync(handoffDir)) return [];
    const files = readdirSync(handoffDir).filter(f => f.endsWith('.json')).slice(-10);
    const results: Array<Record<string, unknown>> = [];
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
