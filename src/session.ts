#!/usr/bin/env node
/**
 * session.ts — Persist task state between terminal sessions.
 *
 * Exports:
 *   loadSession(cwd)                      → session state or null (if stale/missing)
 *   saveSession(state, cwd)               → write session atomically
 *   updateSession(patch, cwd)             → merge partial update into existing session
 *   clearSession(cwd)                     → delete session file
 *   formatSessionCard(session, repo, health) → compact status card string (≤5 lines)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { Provider } from './types.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type SessionPhase = 'idle' | 'active' | 'paused' | 'complete' | 'failed';

export interface SessionState {
  startedAt: string;
  updatedAt: string;
  objective: string | null;
  branch: string | null;
  filesChanged: string[];
  commandsRun: string[];
  lastResult: SessionResult | null;
  provider: string | null;
  nextAction: string | null;
}

export interface SessionResult {
  status?: 'success' | 'failure' | 'partial';
  summary?: string;
}

export interface SessionPatch {
  startedAt?: string;
  updatedAt?: string;
  objective?: string | null;
  branch?: string | null;
  filesChanged?: string[];
  commandsRun?: string[];
  lastResult?: SessionResult | null;
  provider?: string | null;
  nextAction?: string | null;
}

export interface RepoInfo {
  name?: string;
  type?: string;
  packageManager?: string;
  branch?: string;
  dirty?: boolean;
  commands?: { test?: string };
}

export interface HealthInfo {
  states?: Record<string, { status?: string }>;
  session?: unknown;
}

export interface ProfileInfo {
  providers?: Record<string, { enabled?: boolean }>;
}

export interface ReplitSession {
  id: string;
  name: string;
  smartName?: string | null;
  project: string;
  promptCount: number;
  lastActive: string;
  isActive: boolean;
  source: string;
  age: string;
  tool?: string;
}

export interface SessionMeta {
  [sessionId: string]: {
    name?: string;
    pinned?: boolean;
    category?: string | null;
    createdAt?: string;
  };
}

export interface ArchivedSession {
  id: string;
  archived: boolean;
  archivedAt: string;
  [key: string]: unknown;
}

export interface EnrichedSession extends ReplitSession {
  pinned: boolean;
  category: string | null;
}

export interface SessionIndexEntry {
  id: string;
  topics: string[];
  files: string[];
  prompts: { first: string; last: string };
  date: string | null;
  messageCount: number;
  tool: string;
  smartName?: string;
  archived?: boolean;
  _fileSize: number;
}

export interface SessionSearchResult {
  sessionId: string;
  date: string | null;
  relevance: number;
  _score: number;
  files: string[];
  summary: string;
  matchingLines: string[];
  messageCount: number;
}

export interface RelatedSession {
  sessionId: string;
  smartName: string;
  score: number;
  matchedFiles: string[];
  matchedTopics: string[];
  date: string | null;
  messageCount: number;
}

export interface SessionContext {
  lastPrompt: string | null;
  filesTouched: string[];
  totalLines: number;
}

export interface ExtractedSessionMeta {
  id: string;
  date: string | null;
  messageCount: number;
  files: string[];
  taskSummary: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  duration: number | null;
}

export interface RoutingContext {
  relatedSessions: Array<{
    sessionId: string;
    date: string | null;
    taskSummary: string | null;
    score: number;
    messageCount: number;
    files: string[];
  }>;
  riskSignals: string[];
  priorAttempts: Array<{
    sessionId: string;
    date: string | null;
    summary: string | null;
    likelyIncomplete: boolean;
  }>;
  relevantFiles: string[];
}

interface AutoLabelRule {
  keywords: string[];
  label: string;
}

interface FilePatternRule {
  pattern: RegExp;
  label: string;
  action?: string;
}

interface TopicActionRule {
  words: string[];
  action: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_FILE   = '.dualbrain/session.json';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── File I/O ──────────────────────────────────────���──────────────────────────

function sessionPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), SESSION_FILE);
}

function ensureDir(cwd?: string): void {
  mkdirSync(join(cwd ?? process.cwd(), '.dualbrain'), { recursive: true });
}

// ─── Schema defaults ──────────────────────────────────────────────────────────

function defaultSession(): SessionState {
  const now = new Date().toISOString();
  return {
    startedAt:    now,
    updatedAt:    now,
    objective:    null,
    branch:       null,
    filesChanged: [],
    commandsRun:  [],
    lastResult:   null,
    provider:     null,
    nextAction:   null,
  };
}

// ─── Exports ──────────���───────────────────────────────────────────────────────

/**
 * Load the session file. Returns null if missing or older than 24 hours.
 */
export function loadSession(cwd: string = process.cwd()): SessionState | null {
  const p = sessionPath(cwd);
  if (!existsSync(p)) return null;
  try {
    const data: SessionState = JSON.parse(readFileSync(p, 'utf8'));
    const age = Date.now() - Date.parse(data.updatedAt || data.startedAt || '');
    if (age > SESSION_TTL_MS) return null;
    return data;
  } catch { return null; }
}

/**
 * Write session state atomically (tmp + rename).
 */
export function saveSession(state: SessionPatch, cwd: string = process.cwd()): SessionState {
  ensureDir(cwd);
  const p   = sessionPath(cwd);
  const tmp = p + '.tmp.' + process.pid;
  const data: SessionState = {
    ...defaultSession(),
    ...state,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, p);
  return data;
}

/**
 * Merge a partial update into the existing session (or create a new one).
 */
export function updateSession(patch: SessionPatch, cwd: string = process.cwd()): SessionState {
  const existing = loadSession(cwd) || defaultSession();
  const updated: SessionState  = { ...existing, ...patch } as SessionState;

  // Arrays: append, don't replace
  if (patch.filesChanged) {
    const combined = [...(existing.filesChanged || []), ...(patch.filesChanged || [])];
    updated.filesChanged = [...new Set(combined)]; // deduplicate
  }
  if (patch.commandsRun) {
    updated.commandsRun = [...(existing.commandsRun || []), ...(patch.commandsRun || [])];
  }

  return saveSession(updated, cwd);
}

/**
 * Delete the session file.
 */
export function clearSession(cwd: string = process.cwd()): void {
  const p = sessionPath(cwd);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* non-fatal */ }
  }
}

// ─── Session card formatting ──────────��───────────────────────────────────────

/**
 * Format a compact status card (≤5 lines) for display when running `dual-brain`.
 */
export function formatSessionCard(session: SessionState | null, repo: RepoInfo, health: HealthInfo | null, profile?: ProfileInfo): string {
  const lines: string[] = [];

  // Line 1: Repo identity
  const repoParts: string[] = [];
  if (repo.name)           repoParts.push(repo.name);
  if (repo.type !== 'unknown') {
    const typeLabel = (repo.type || '').charAt(0).toUpperCase() + (repo.type || '').slice(1);
    repoParts.push(typeLabel);
  }
  if (repo.packageManager) repoParts.push(repo.packageManager);

  // Detect test runner label (Vitest, Jest, pytest, etc.)
  const testCmd = repo.commands?.test || '';
  let testLabel: string | null = null;
  if (testCmd.includes('vitest'))    testLabel = 'Vitest';
  else if (testCmd.includes('jest')) testLabel = 'Jest';
  else if (testCmd.includes('mocha')) testLabel = 'Mocha';
  else if (testCmd.includes('pytest')) testLabel = 'Pytest';
  else if (testCmd.includes('rspec')) testLabel = 'RSpec';
  else if (testCmd.includes('go test')) testLabel = 'go test';
  else if (testCmd.includes('cargo test')) testLabel = 'cargo test';
  if (testLabel) repoParts.push(testLabel);

  lines.push(`dual-brain ready`);
  lines.push(`Repo: ${repoParts.join(' / ') || 'unknown'}`);

  // Line 3: Branch + dirty status
  if (repo.branch) {
    const dirtyNote = repo.dirty ? ` (uncommitted changes)` : '';
    lines.push(`Branch: ${repo.branch}${dirtyNote}`);
  }

  // Line 4: Health summary — only show enabled providers
  const { states = {} } = health || {};
  const claudeProviderEnabled = profile?.providers?.claude?.enabled !== false;
  const openaiProviderEnabled = profile?.providers?.openai?.enabled !== false;

  function providerStatus(name: string): string {
    const entries = Object.entries(states).filter(([k]) => k.startsWith(`${name}:`));
    if (entries.length === 0) return 'healthy';
    const statuses = entries.map(([, v]) => v.status);
    if (statuses.includes('hot'))      return 'hot';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('probing'))  return 'probing';
    return 'healthy';
  }

  const healthParts: string[] = [];
  if (claudeProviderEnabled) {
    const claudeStatus = providerStatus('claude');
    healthParts.push(claudeStatus === 'healthy' ? 'Claude healthy' : `Claude ${claudeStatus}`);
  } else {
    healthParts.push('Claude disabled');
  }
  if (openaiProviderEnabled) {
    const openaiStatus = providerStatus('openai');
    healthParts.push(openaiStatus === 'healthy' ? 'OpenAI healthy' : `OpenAI ${openaiStatus}`);
  } else {
    healthParts.push('OpenAI disabled');
  }
  lines.push(`Health: ${healthParts.join(', ')}`);

  // Line 5: Last task summary (only if session exists)
  if (session) {
    const parts: string[] = [];
    if (session.objective) parts.push(session.objective);
    if (session.filesChanged?.length) {
      const fc = session.filesChanged.length;
      parts.push(`edited ${fc} file${fc !== 1 ? 's' : ''}`);
    }
    if (session.lastResult?.status === 'failure' && session.lastResult?.summary) {
      parts.push(session.lastResult.summary);
    } else if (session.lastResult?.summary) {
      // include brief result note if compact
      const summary = session.lastResult.summary;
      if (summary.length <= 40) parts.push(summary);
    }
    if (parts.length > 0) {
      lines.push(`Last: ${parts.join(', ')}`);
    }
  }

  // Tip line: always show a call-to-action so non-TTY output is actionable
  lines.push(`Tip: run "dual-brain --help" or "dual-brain go \\"task\\""`);

  return lines.join('\n');
}

// ─── Replit-tools session import ──────���───────────────────────────────────────

const ARCHIVE_BASE = '/home/runner/workspace/.replit-tools/.session-archive/claude';
const ARCHIVE_PROJECTS = `${ARCHIVE_BASE}/projects/-home-runner-workspace`;

/**
 * Returns true if the text looks like a real user prompt (not a status line,
 * slash command, paste marker, or agent-generated noise).
 */
function isRealPrompt(text: string): boolean {
  if (!text || !text.trim()) return false;
  const t = text.trim();
  if (/^[✅❌📦🔗⚠️🚀🎉🔧📝]/.test(t)) return false;
  if (/Claude (history|binary|versions) symlink/.test(t)) return false;
  if (t.startsWith('# AGENTS.md')) return false;
  if (t === 'login' || t === 'logout') return false;
  if (t.startsWith('/')) return false;
  if (t.startsWith('[Pasted')) return false;
  if (t.startsWith('<')) return false;
  if (t.startsWith('[Request interrupted')) return false;
  return true;
}

/**
 * Extract the text content from a user message entry.
 * Handles string content and content-block arrays.
 */
function extractMessageText(entry: unknown): string {
  if (!entry) return '';
  const message = (entry as Record<string, unknown>).message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c: Record<string, unknown>) => (c.text as string) || '').join(' ');
  return '';
}

/**
 * Compute recency multiplier: today=2x, this week=1.5x, older=1x
 */
function recencyMultiplier(dateOrTs: string | number): number {
  const ts = typeof dateOrTs === 'number' ? dateOrTs : Date.parse(dateOrTs as string);
  if (!ts) return 1;
  const age = Date.now() - ts;
  const day = 86400000;
  if (age < day) return 2;
  if (age < 7 * day) return 1.5;
  return 1;
}

/**
 * Human-readable time-ago string from a Unix timestamp (ms).
 */
function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Import sessions from replit-tools history.jsonl.
 * Returns an array of session summary objects, sorted most-recent first.
 * Returns [] gracefully if replit-tools is not present.
 */
export function importReplitSessions(cwd: string = process.cwd()): ReplitSession[] {
  const sessions: ReplitSession[] = [];

  // Check multiple possible locations for replit-tools
  const candidates = [
    join(cwd, '.replit-tools', '.claude-persistent'),
    join('/home/runner/workspace', '.replit-tools', '.claude-persistent'),
  ];
  // Deduplicate
  const seen = new Set<string>();
  const replitBases = candidates.filter(p => {
    const norm = p.replace(/\/+$/, '');
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  let replitBase: string | null = null;
  for (const candidate of replitBases) {
    if (existsSync(join(candidate, 'history.jsonl'))) {
      replitBase = candidate;
      break;
    }
  }
  if (!replitBase) return sessions;

  // Read history.jsonl
  const historyPath = join(replitBase, 'history.jsonl');

  let lines: string[];
  try {
    lines = readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
  } catch { return sessions; }

  interface SessionAccum {
    sessionId: string;
    project: string;
    entries: unknown[];
    firstPrompt: string | null;
    lastTimestamp: number;
    tool?: string;
  }

  const bySession = new Map<string, SessionAccum>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (!entry.sessionId) continue;

      const sessionId = entry.sessionId as string;

      if (!bySession.has(sessionId)) {
        bySession.set(sessionId, {
          sessionId,
          project: entry.project as string,
          entries: [],
          firstPrompt: null,
          lastTimestamp: 0,
        });
      }

      const sess = bySession.get(sessionId)!;
      sess.entries.push(entry);
      if ((entry.timestamp as number) > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp as number;

      // Find first meaningful user prompt
      if (!sess.firstPrompt && isRealPrompt(entry.display as string)) {
        sess.firstPrompt = entry.display as string;
      }
    } catch { continue; }
  }

  // Also read from the session archive as a fallback (contains cleaned-up sessions)
  const archivePath = join(cwd, '.replit-tools', '.session-archive', 'claude', 'history.jsonl');
  let archiveLines: string[] = [];
  try {
    if (existsSync(archivePath)) {
      archiveLines = readFileSync(archivePath, 'utf8').split('\n').filter(Boolean);
    }
  } catch { /* non-fatal */ }

  for (const line of archiveLines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (!entry.sessionId) continue;
      const sessionId = entry.sessionId as string;
      if (bySession.has(sessionId)) continue; // already indexed from main history

      bySession.set(sessionId, {
        sessionId,
        project: entry.project as string,
        entries: [],
        firstPrompt: null,
        lastTimestamp: 0,
      });

      const sess = bySession.get(sessionId)!;
      sess.entries.push(entry);
      if ((entry.timestamp as number) > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp as number;
      if (!sess.firstPrompt && isRealPrompt(entry.display as string)) {
        sess.firstPrompt = entry.display as string;
      }
    } catch { continue; }
  }

  // For archive sessions with multiple entries, finish accumulating them
  // (second pass for sessions newly added from archive)
  for (const line of archiveLines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (!entry.sessionId) continue;
      const sessionId = entry.sessionId as string;
      const sess = bySession.get(sessionId);
      if (!sess) continue;
      // Already pushed in first pass for new sessions; skip double-push
      if (sess.entries.includes(entry)) continue;
      sess.entries.push(entry);
      if ((entry.timestamp as number) > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp as number;
      if (!sess.firstPrompt && isRealPrompt(entry.display as string)) {
        sess.firstPrompt = entry.display as string;
      }
    } catch { continue; }
  }

  // Scan ~/.codex/sessions/ for codex session JSONLs (YYYY/MM/DD tree)
  const codexSessionsDir = join(process.env.HOME || '/root', '.codex', 'sessions');
  if (existsSync(codexSessionsDir)) {
    try {
      const walk = (dir: string): string[] => {
        let results: string[] = [];
        try {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) results = results.concat(walk(full));
            else if (entry.isFile() && entry.name.endsWith('.jsonl')) results.push(full);
          }
        } catch {}
        return results;
      };

      for (const f of walk(codexSessionsDir)) {
        try {
          const content = readFileSync(f, 'utf8');
          const fileLines = content.split('\n').filter(Boolean);
          if (!fileLines.length) continue;

          const meta = JSON.parse(fileLines[0]) as Record<string, unknown>;
          if (meta.type !== 'session_meta' || !meta.payload) continue;
          const payload = meta.payload as Record<string, unknown>;
          if (payload.cwd !== cwd && payload.cwd !== '/home/runner/workspace') continue;

          const id = payload.id as string;
          if (bySession.has(id)) continue;

          let firstPrompt: string | null = null;
          let lastTimestamp = Date.parse((payload.timestamp as string) || (meta.timestamp as string)) / 1000;

          for (const ln of fileLines) {
            try {
              const j = JSON.parse(ln) as Record<string, unknown>;
              if (j.timestamp) {
                const ts = Date.parse(j.timestamp as string) / 1000;
                if (ts > lastTimestamp) lastTimestamp = ts;
              }
              if (!firstPrompt && j.type === 'event_msg') {
                const jPayload = j.payload as Record<string, unknown> | undefined;
                if (jPayload?.type === 'user_message') {
                  const text = ((jPayload.message as string) || '').trim();
                  if (text) firstPrompt = text;
                }
              }
            } catch { continue; }
          }

          bySession.set(id, {
            sessionId: id,
            project: '-home-runner-workspace',
            entries: [],
            firstPrompt: firstPrompt || id.slice(0, 8) + '...',
            lastTimestamp,
            tool: 'codex',
          });
        } catch { continue; }
      }
    } catch { /* non-fatal */ }
  }

  // Read active terminal sessions
  // Use the same root as replitBase (go up one level from .claude-persistent)
  const replitRoot = join(replitBase, '..');
  const sessionsDir = join(replitRoot, '..', '.claude-sessions');
  const activeSessionIds = new Set<string>();
  if (existsSync(sessionsDir)) {
    try {
      for (const f of readdirSync(sessionsDir)) {
        try {
          const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8')) as Record<string, unknown>;
          if (data.sessionId) activeSessionIds.add(data.sessionId as string);
        } catch { continue; }
      }
    } catch { /* non-fatal */ }
  }

  // Determine recency window from config (default 48 hours)
  const configPath = join(cwd, '.replit-tools', 'config.json');
  let windowHours = 48;
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      windowHours = (cfg.recentWindowHours as number) || 48;
    }
  } catch { /* non-fatal */ }
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  // Load existing session index for smartName lookup (best-effort, non-fatal)
  let sessionIndex: Record<string, { smartName?: string }> = {};
  try {
    const indexPath = join(cwd, '.dualbrain', 'session-index.json');
    if (existsSync(indexPath)) {
      sessionIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
    }
  } catch { /* non-fatal */ }

  // Build session list
  for (const [id, sess] of bySession) {
    // Skip sessions outside the recency window (timestamps are in ms)
    if (sess.lastTimestamp < cutoff) continue;

    // Use smartName from index if available, otherwise fall back to first prompt
    let name = sessionIndex[id]?.smartName || null;

    if (!name) {
      // Classic fallback: first meaningful prompt
      name = sess.firstPrompt;
      if (!name) {
        const firstReal = (sess.entries as Array<Record<string, unknown>>).find(e => e.display && e.display !== 'login');
        name = (firstReal?.display as string) || `Session ${id.slice(0, 8)}`;
      }
      // Truncate long names that came from raw prompts
      if (name.length > 60) name = name.slice(0, 57) + '...';
    }

    sessions.push({
      id: sess.sessionId,
      name,
      smartName: sessionIndex[id]?.smartName || null,
      project: sess.project,
      promptCount: sess.entries.length,
      lastActive: new Date(sess.lastTimestamp).toISOString(),
      isActive: activeSessionIds.has(id),
      source: 'replit-tools',
      age: timeAgo(sess.lastTimestamp),
      tool: sess.tool || 'claude',
    });
  }

  // Sort by most recent first
  sessions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());

  return sessions;
}

// ─── Session metadata overlay ─────────────────────────────────────────────────

const SESSION_META_FILE = '.dualbrain/sessions.json';

function sessionMetaPath(cwd?: string): string {
  return join(cwd ?? process.cwd(), SESSION_META_FILE);
}

export function getSessionMeta(cwd: string = process.cwd()): SessionMeta {
  const p = sessionMetaPath(cwd);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

export function saveSessionMeta(meta: SessionMeta, cwd: string = process.cwd()): void {
  ensureDir(cwd);
  const p   = sessionMetaPath(cwd);
  const tmp = p + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(meta, null, 2) + '\n');
  renameSync(tmp, p);
}

// ─── Archive support ──────────────────────────────────────────────────────────

const ARCHIVE_FILE = '.dualbrain/archive/sessions.json';

function archivePath(cwd?: string): string {
  return join(cwd ?? process.cwd(), ARCHIVE_FILE);
}

/**
 * Archive a session — moves it from active sessions.json to archive/sessions.json.
 * The session data stays in the index (searchable), just flagged as archived.
 * Non-destructive and reversible.
 */
export function archiveSession(sessionId: string, cwd: string = process.cwd()): void {
  // Load active sessions meta
  const meta = getSessionMeta(cwd);
  const existing = meta[sessionId] ?? {};

  // Load or init archive
  const ap = archivePath(cwd);
  mkdirSync(dirname(ap), { recursive: true });
  let archive: ArchivedSession[] = [];
  try {
    if (existsSync(ap)) archive = JSON.parse(readFileSync(ap, 'utf8'));
  } catch { archive = []; }

  // Avoid duplicates
  if (!archive.some(s => s.id === sessionId)) {
    archive.push({
      ...existing,
      id: sessionId,
      archived: true,
      archivedAt: new Date().toISOString(),
    });
    const tmp = ap + '.tmp.' + process.pid;
    writeFileSync(tmp, JSON.stringify(archive, null, 2) + '\n');
    renameSync(tmp, ap);
  }

  // Remove from active sessions.json
  delete meta[sessionId];
  saveSessionMeta(meta, cwd);

  // Mark archived in the session index (best-effort)
  try {
    const indexPath = join(cwd ?? process.cwd(), '.dualbrain', 'session-index.json');
    if (existsSync(indexPath)) {
      const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, SessionIndexEntry>;
      if (index[sessionId]) {
        index[sessionId].archived = true;
        writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
      }
    }
  } catch { /* non-fatal */ }
}

/**
 * Return all archived sessions.
 */
export function getArchivedSessions(cwd: string = process.cwd()): ArchivedSession[] {
  const ap = archivePath(cwd);
  if (!existsSync(ap)) return [];
  try { return JSON.parse(readFileSync(ap, 'utf8')); } catch { return []; }
}

export function renameSession(sessionId: string, name: string, cwd: string = process.cwd()): void {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], name, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

export function pinSession(sessionId: string, cwd: string = process.cwd()): void {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], pinned: true, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

export function unpinSession(sessionId: string, cwd: string = process.cwd()): void {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], pinned: false };
  saveSessionMeta(meta, cwd);
}

export function categorizeSession(sessionId: string, category: string, cwd: string = process.cwd()): void {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], category, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

const AUTO_LABEL_RULES: AutoLabelRule[] = [
  { keywords: ['auth', 'login', 'credential', 'security', 'token'], label: 'security' },
  { keywords: ['ui', 'css', 'style', 'component', 'react', 'frontend'], label: 'ui' },
  { keywords: ['refactor', 'cleanup', 'rename', 'reorganize'], label: 'refactor' },
  { keywords: ['bug', 'fix', 'error', 'crash', 'broken'], label: 'bugfix' },
  { keywords: ['test', 'spec', 'coverage'], label: 'testing' },
  { keywords: ['deploy', 'ci', 'build', 'release'], label: 'devops' },
  { keywords: ['plan', 'design', 'architect', 'brainstorm'], label: 'planning' },
];

export function autoLabel(session: { name?: string }): string | null {
  const text = (session.name || '').toLowerCase();
  for (const { keywords, label } of AUTO_LABEL_RULES) {
    if (keywords.some(kw => new RegExp(`\\b${kw}\\b`).test(text))) return label;
  }
  return null;
}

export function enrichSessions(sessions: ReplitSession[], cwd: string = process.cwd()): EnrichedSession[] {
  const meta = getSessionMeta(cwd);
  const enriched: EnrichedSession[] = sessions.map(sess => {
    const overlay = meta[sess.id] ?? {};
    const category = overlay.category ?? autoLabel({ ...sess, name: overlay.name ?? sess.name });
    return {
      ...sess,
      name:     overlay.name ?? sess.name,
      pinned:   overlay.pinned ?? false,
      category: category ?? null,
    };
  });
  enriched.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
  });
  return enriched;
}

// ─── Persistence settings ─────────────────────────────────────────────────────

/**
 * Ensure Claude and Codex are configured to retain session history indefinitely.
 * Mirrors what replit-tools does to prevent session cleanup/deletion.
 */
export function ensurePersistence(cwd: string = process.cwd()): string[] {
  const home = process.env.HOME || '/root';
  const results: string[] = [];

  // 1. Claude: set cleanupPeriodDays
  const claudeSettingsPaths = [
    join(home, '.claude', 'settings.json'),
    join(cwd, '.replit-tools', '.claude-persistent', 'settings.json'),
  ];

  for (const settingsPath of claudeSettingsPaths) {
    if (!existsSync(settingsPath)) continue;
    try {
      let settings: Record<string, unknown> = {};
      try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
      if (settings.cleanupPeriodDays !== 365250) {
        settings.cleanupPeriodDays = 365250;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        results.push('Claude cleanupPeriodDays set to 365250');
      }
      break; // only update one
    } catch { continue; }
  }

  // 2. Codex: set history.persistence and max_bytes
  const codexConfigPaths = [
    join(home, '.codex', 'config.toml'),
    join(cwd, '.replit-tools', '.codex-persistent', 'config.toml'),
  ];

  for (const configPath of codexConfigPaths) {
    if (!existsSync(configPath)) continue;
    try {
      let content = readFileSync(configPath, 'utf8');
      let changed = false;

      if (!/\[history\]/.test(content)) {
        content = content.trimEnd() + '\n\n[history]\npersistence = "save-all"\nmax_bytes = 104857600\n';
        changed = true;
      } else {
        if (!/persistence\s*=/.test(content)) {
          content = content.replace(/\[history\](\s*)/, '[history]$1persistence = "save-all"\n');
          changed = true;
        }
        if (!/max_bytes\s*=/.test(content)) {
          content = content.replace(/(persistence\s*=\s*"[^"]*"\s*\n)/, '$1max_bytes = 104857600\n');
          changed = true;
        }
      }

      if (changed) {
        writeFileSync(configPath, content);
        results.push('Codex history persistence enabled');
      }
      break;
    } catch { continue; }
  }

  return results;
}

// ─── Session archive mirror sync ─���───────────────────────────────────────────

/**
 * Append-only mirror sync for Claude/Codex sessions (matches what replit-tools does).
 * Files in the mirror only grow — if the source deletes a session, the mirror still has it.
 */
export function syncSessionMirror(cwd: string = process.cwd()): { copied: number; grew: number; disabled?: boolean } {
  const home = process.env.HOME || '/root';
  const mirrorBase = join(cwd, '.replit-tools', '.session-archive');

  // Check if replit-tools exists
  if (!existsSync(join(cwd, '.replit-tools'))) return { copied: 0, grew: 0 };

  // Check config — mirror can be disabled
  const configPath = join(cwd, '.replit-tools', 'config.json');
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      const mirror = cfg.mirror as Record<string, unknown> | undefined;
      if (mirror && mirror.enabled === false) return { copied: 0, grew: 0, disabled: true };
    }
  } catch {}

  let totalCopied = 0, totalGrew = 0;

  function syncTree(srcDir: string, destDir: string): void {
    if (!existsSync(srcDir)) return;

    function walk(dir: string): void {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        const srcPath = join(dir, entry.name);
        const relPath = srcPath.slice(srcDir.length);
        const destPath = join(destDir, relPath);

        if (entry.isDirectory()) {
          try { mkdirSync(destPath, { recursive: true }); } catch {}
          walk(srcPath);
        } else if (entry.isFile()) {
          let destSize = 0;
          try { destSize = statSync(destPath).size; } catch {}

          let srcSize = 0;
          try { srcSize = statSync(srcPath).size; } catch { continue; }

          // Append-only: only copy if source is larger than mirror
          if (srcSize > destSize) {
            try {
              mkdirSync(dirname(destPath), { recursive: true });
              copyFileSync(srcPath, destPath);
              if (destSize === 0) totalCopied++;
              else totalGrew++;
            } catch {}
          }
        }
      }
    }

    walk(srcDir);
  }

  try { mkdirSync(mirrorBase, { recursive: true }); } catch {}

  // Sync Claude sessions
  const claudeDir = join(home, '.claude');
  syncTree(join(claudeDir, 'projects'), join(mirrorBase, 'claude', 'projects'));
  // Sync history.jsonl as a single file
  const histSrc = join(claudeDir, 'history.jsonl');
  const histDest = join(mirrorBase, 'claude', 'history.jsonl');
  if (existsSync(histSrc)) {
    try {
      const srcSize = statSync(histSrc).size;
      let destSize = 0;
      try { destSize = statSync(histDest).size; } catch {}
      if (srcSize > destSize) {
        mkdirSync(dirname(histDest), { recursive: true });
        copyFileSync(histSrc, histDest);
        if (destSize === 0) totalCopied++; else totalGrew++;
      }
    } catch {}
  }

  // Sync Codex sessions
  const codexDir = join(home, '.codex');
  syncTree(join(codexDir, 'sessions'), join(mirrorBase, 'codex', 'sessions'));

  return { copied: totalCopied, grew: totalGrew };
}

// ─── Smart session naming ────────────────────────────────────���────────────────

/**
 * File pattern → human label mapping (checked in order, first match wins).
 */
const FILE_PATTERN_RULES: FilePatternRule[] = [
  { pattern: /auth/i,      label: 'Auth',      action: 'Refactor' },
  { pattern: /test|spec/i, label: 'Tests',     action: 'Fix' },
  { pattern: /dispatch/i,  label: 'Dispatch',  action: 'Update' },
  { pattern: /session/i,   label: 'Session',   action: 'Update' },
  { pattern: /profile/i,   label: 'Profile',   action: 'Update' },
  { pattern: /detect/i,    label: 'Detection', action: 'Update' },
  { pattern: /decide/i,    label: 'Routing',   action: 'Update' },
  { pattern: /budget/i,    label: 'Budget',    action: 'Update' },
  { pattern: /hook/i,      label: 'Hooks',     action: 'Update' },
  { pattern: /install/i,   label: 'Install',   action: 'Update' },
  { pattern: /config/i,    label: 'Config',    action: 'Update' },
  { pattern: /migrate/i,   label: 'Migration', action: 'Add' },
];

/**
 * Topic words that suggest a dominant action verb.
 */
const TOPIC_ACTION_MAP: TopicActionRule[] = [
  { words: ['fix', 'bug', 'error', 'crash', 'broken', 'fail'],  action: 'Fix' },
  { words: ['refactor', 'cleanup', 'clean', 'reorganize'],       action: 'Refactor' },
  { words: ['add', 'implement', 'create', 'build', 'write'],     action: 'Add' },
  { words: ['update', 'upgrade', 'bump', 'patch'],               action: 'Update' },
  { words: ['test', 'spec', 'coverage'],                         action: 'Fix' },
  { words: ['deploy', 'release', 'publish'],                     action: 'Deploy' },
  { words: ['audit', 'review', 'check'],                         action: 'Review' },
];

/**
 * Convert a string to Title Case.
 */
function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Strip file extensions from a name candidate.
 */
function stripExtensions(name: string): string {
  return name.replace(/\.(mjs|js|ts|tsx|jsx|json|md|css|html|py|sh|sql|toml|yaml|yml)\b/gi, '');
}

/**
 * Truncate a string to maxLen characters, preserving whole words where possible.
 */
function truncate(str: string, maxLen: number = 40): string {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen).replace(/\s+\S*$/, '');
  return cut || str.slice(0, maxLen);
}

/**
 * Generate a smart human-readable session name from session index data.
 *
 * Priority:
 *   1. Dominant file pattern (e.g. auth*.mjs -> "Refactor Auth Module")
 *   2. Top topics (e.g. ['auth','token','refresh'] -> "Auth Token Refresh")
 *   3. Fallback: first prompt truncated to 40 chars
 *
 * Rules: <=40 chars, Title Case, no file extensions, action-prefixed when detectable.
 */
export function generateSmartName(sessionData: { topics?: string[]; files?: string[]; prompts?: { first?: string } }): string {
  const topics = sessionData.topics || [];
  const files  = sessionData.files  || [];
  const firstPrompt = sessionData.prompts?.first || '';

  // ── Step 1: Detect dominant action from topics ─────────────────────────────
  let detectedAction: string | null = null;
  for (const { words, action } of TOPIC_ACTION_MAP) {
    if (topics.some(t => words.includes(t))) {
      detectedAction = action;
      break;
    }
  }

  // ── Step 2: Try file pattern match ─────────────────────────────────────────
  if (files.length > 0) {
    // Flatten all filenames for pattern matching
    const fileNames = files.map(f => f.split('/').pop()).join(' ');

    for (const { pattern, label, action } of FILE_PATTERN_RULES) {
      if (pattern.test(fileNames)) {
        const actionWord = detectedAction || action || 'Update';
        const candidate = `${actionWord} ${label}`;
        return truncate(toTitleCase(candidate));
      }
    }

    // No named pattern — derive a label from the most common directory or base name
    const basenames = files.map(f => {
      const base = f.split('/').pop() || f;
      // Strip extension and convert camelCase/kebab to words
      return stripExtensions(base)
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
    }).filter(Boolean);

    if (basenames.length > 0) {
      // Use the most common prefix or first significant basename
      const label = basenames[0];
      const actionWord = detectedAction || 'Update';
      const candidate = `${actionWord} ${label}`;
      return truncate(toTitleCase(stripExtensions(candidate)));
    }
  }

  // ── Step 3: Try top topics ─────────────────────────────────────────────────
  if (topics.length >= 2) {
    // Take top 3 topics and compose a name
    const topTopics = topics.slice(0, 3);
    const actionWord = detectedAction || null;

    let candidate: string;
    if (actionWord) {
      // Use action + remaining topics
      candidate = [actionWord, ...topTopics.filter(t => t !== actionWord!.toLowerCase())].slice(0, 3).join(' ');
    } else {
      candidate = topTopics.join(' ');
    }

    return truncate(toTitleCase(candidate));
  }

  if (topics.length === 1) {
    const actionWord = detectedAction || 'Work on';
    return truncate(toTitleCase(`${actionWord} ${topics[0]}`));
  }

  // ── Step 4: Fallback — first prompt truncated ──────────────────────────────
  if (firstPrompt) {
    return truncate(firstPrompt);
  }

  return 'Session';
}

// ─── Session index ────────────────────────────────────────────────────────────

/**
 * Build/update `.dualbrain/session-index.json` from Claude and Codex JSONL session files.
 * Extracts topics, file references, prompt snippets, and metadata per session.
 */
export function buildSessionIndex(cwd: string = process.cwd()): Record<string, SessionIndexEntry> {
  const home = process.env.HOME || '/root';
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');

  // Load existing index
  let index: Record<string, SessionIndexEntry> = {};
  try {
    if (existsSync(indexPath)) {
      index = JSON.parse(readFileSync(indexPath, 'utf8'));
    }
  } catch {}

  // Find all session JSONLs
  const sources = [
    join(home, '.claude', 'projects', '-home-runner-workspace'),
    join(cwd, '.replit-tools', '.session-archive', 'claude', 'projects', '-home-runner-workspace'),
  ];

  const STOP_WORDS = new Set(['the','and','this','that','with','from','have','been','will','would','could','should','just','also','into','about','some','what','when','where','which','their','there','then','than','them','these','those','other','more','only','very','each','most','like','make','want','need','does','dont','didnt','cant','wont','your','they','were','are','for','not','but','was','you','all','can','had','her','one','our','out','use','its','let','get','has','him','his','how','did','got','may','new','now','old','see','way','who','any','few','said']);

  for (const dir of sources) {
    if (!existsSync(dir)) continue;
    let files: string[];
    try { files = readdirSync(dir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
      const sessionId = f.replace('.jsonl', '');

      // Skip if already indexed and file hasn't grown
      const filePath = join(dir, f);
      let fileSize = 0;
      try { fileSize = statSync(filePath).size; } catch { continue; }
      if (index[sessionId] && index[sessionId]._fileSize >= fileSize) continue;

      // Parse session
      try {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);

        const wordCounts: Record<string, number> = {};
        const fileSet = new Set<string>();
        let firstPrompt: string | null = null;
        let lastPrompt: string | null = null;
        let lastTimestamp = 0;
        let messageCount = 0;

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as Record<string, unknown>;

            // Track timestamps
            if (entry.timestamp) {
              const raw = typeof entry.timestamp === 'number' ? entry.timestamp : Date.parse(entry.timestamp as string);
              const ts = raw > 1e12 ? raw / 1000 : raw;
              if (ts > lastTimestamp) lastTimestamp = ts;
            }

            // Extract user messages
            let text: string | null = null;
            if (entry.type === 'user' && (entry.message as Record<string, unknown>)?.content) {
              const msgContent = (entry.message as Record<string, unknown>).content;
              text = typeof msgContent === 'string'
                ? msgContent
                : ((msgContent as Array<Record<string, unknown>>)?.[0]?.text as string) ?? null;
            }
            if (entry.display) text = text || (entry.display as string);

            if (!text) continue;
            messageCount++;

            if (!firstPrompt) firstPrompt = text.slice(0, 80);
            lastPrompt = text.slice(0, 80);

            // Extract file paths
            const filePaths = text.match(/[\w./~-]+\.(?:mjs|js|ts|tsx|jsx|json|md|css|html|py|sh|sql|toml|yaml|yml)\b/g);
            if (filePaths) filePaths.forEach(p => fileSet.add(p));

            // Count words for topics
            const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
            for (const w of words) {
              wordCounts[w] = (wordCounts[w] || 0) + 1;
            }
          } catch { continue; }
        }

        // Top 10 topics by frequency
        const topics = Object.entries(wordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([w]) => w);

        const sessionEntry: SessionIndexEntry = {
          id: sessionId,
          topics,
          files: [...fileSet].slice(0, 20),
          prompts: { first: firstPrompt || '', last: lastPrompt || '' },
          date: lastTimestamp ? new Date(lastTimestamp * 1000).toISOString() : null,
          messageCount,
          tool: 'claude',
          _fileSize: fileSize,
        };
        sessionEntry.smartName = generateSmartName(sessionEntry);
        index[sessionId] = sessionEntry;
      } catch { continue; }
    }
  }

  // Also index codex sessions (same pattern)
  const codexDir = join(home, '.codex', 'sessions');
  if (existsSync(codexDir)) {
    const walk = (dir: string): string[] => {
      let results: string[] = [];
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) results = results.concat(walk(full));
          else if (entry.isFile() && entry.name.endsWith('.jsonl')) results.push(full);
        }
      } catch {}
      return results;
    };

    for (const filePath of walk(codexDir)) {
      try {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        if (!lines.length) continue;
        const meta = JSON.parse(lines[0]) as Record<string, unknown>;
        if (meta.type !== 'session_meta' || !meta.payload) continue;
        const payload = meta.payload as Record<string, unknown>;
        const id = payload.id as string;
        if (!id || index[id]) continue;

        let fileSize = 0;
        try { fileSize = statSync(filePath).size; } catch { continue; }

        let firstPrompt: string | null = null, lastPrompt: string | null = null, messageCount = 0;
        let lastTimestamp = Date.parse((payload.timestamp as string) || (meta.timestamp as string)) / 1000 || 0;

        for (const ln of lines) {
          try {
            const j = JSON.parse(ln) as Record<string, unknown>;
            if (j.timestamp) {
              const ts = Date.parse(j.timestamp as string) / 1000;
              if (ts > lastTimestamp) lastTimestamp = ts;
            }
            if (j.type === 'event_msg') {
              const jPayload = j.payload as Record<string, unknown> | undefined;
              if (jPayload?.type === 'user_message') {
                const text = ((jPayload.message as string) || '').trim();
                if (text) {
                  messageCount++;
                  if (!firstPrompt) firstPrompt = text.slice(0, 80);
                  lastPrompt = text.slice(0, 80);
                }
              }
            }
          } catch { continue; }
        }

        const codexEntry: SessionIndexEntry = {
          id, topics: [], files: [],
          prompts: { first: firstPrompt || '', last: lastPrompt || '' },
          date: lastTimestamp ? new Date(lastTimestamp * 1000).toISOString() : null,
          messageCount, tool: 'codex', _fileSize: fileSize,
        };
        codexEntry.smartName = generateSmartName(codexEntry);
        index[id] = codexEntry;
      } catch { continue; }
    }
  }

  // Save index
  try {
    mkdirSync(join(cwd, '.dualbrain'), { recursive: true });
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
  } catch {}

  return index;
}

/**
 * Search sessions using the replit-tools archive as primary source.
 * Falls back to the parallel session index when archive is unavailable.
 *
 * Results include: { sessionId, date, relevance, files, summary, matchingLines }
 * Sorted by relevance * recencyMultiplier descending.
 */
export function searchSessions(query: string, cwd: string = process.cwd()): SessionSearchResult[] {
  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  if (!terms.length) return [];

  // Try archive-backed search first
  const archiveResults = archiveBackedSearch(terms, cwd);
  if (archiveResults.length > 0) return archiveResults;

  // Fallback: parallel index
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');
  let index: Record<string, SessionIndexEntry> = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}
  if (Object.keys(index).length === 0) index = buildSessionIndex(cwd);

  const results: SessionSearchResult[] = [];
  for (const session of Object.values(index)) {
    let score = 0;
    const searchText = [
      ...(session.topics || []),
      ...(session.files || []),
      session.prompts?.first || '',
      session.prompts?.last  || '',
    ].join(' ').toLowerCase();

    for (const term of terms) {
      if (searchText.includes(term)) score++;
      if ((session.topics || []).includes(term)) score += 2;
      if ((session.files || []).some(f => f.includes(term))) score += 2;
    }

    if (score > 0) {
      const mult = recencyMultiplier(session.date || '');
      results.push({
        sessionId: session.id,
        date: session.date,
        relevance: score,
        _score: score * mult,
        files: session.files || [],
        summary: (session.prompts?.first || session.id).slice(0, 100),
        matchingLines: [],
        messageCount: session.messageCount,
      });
    }
  }

  return results.sort((a, b) => b._score - a._score);
}

/**
 * Search session JSONL files in the archive directly (streaming, no full load).
 */
function archiveBackedSearch(terms: string[], cwd: string): SessionSearchResult[] {
  const projectDir = existsSync(ARCHIVE_PROJECTS) ? ARCHIVE_PROJECTS
    : join(cwd, '.replit-tools', '.session-archive', 'claude', 'projects', '-home-runner-workspace');
  if (!existsSync(projectDir)) return [];

  let files: string[];
  try { files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-')); }
  catch { return []; }

  const results: SessionSearchResult[] = [];

  for (const file of files) {
    const sessionId = file.replace(/\.jsonl$/, '');
    const filePath = join(projectDir, file);
    let content: string;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }

    const lines = content.split('\n').filter(Boolean);
    const matchingLines: string[] = [];
    const fileSet = new Set<string>();
    let firstPrompt: string | null = null;
    let lastTimestamp = 0;
    let messageCount = 0;
    let baseScore = 0;

    for (const line of lines) {
      let entry: Record<string, unknown>;
      try { entry = JSON.parse(line); } catch { continue; }

      // Track timestamps
      if (entry.timestamp) {
        const ts = typeof entry.timestamp === 'number'
          ? (entry.timestamp > 1e12 ? entry.timestamp : entry.timestamp * 1000)
          : Date.parse(entry.timestamp as string);
        if (ts > lastTimestamp) lastTimestamp = ts;
      }

      if (entry.type !== 'user') continue;
      const text = extractMessageText(entry);
      if (!text) continue;
      messageCount++;
      if (!firstPrompt && isRealPrompt(text)) firstPrompt = text;

      // Extract file references
      const filePaths = text.match(/[\w./~-]+\.(?:mjs|js|ts|tsx|jsx|json|md|css|html|py|sh|sql|toml|yaml|yml)\b/g);
      if (filePaths) filePaths.forEach(p => fileSet.add(p));

      // Score against terms
      const lower = text.toLowerCase();
      let lineScore = 0;
      for (const term of terms) {
        if (lower.includes(term)) lineScore++;
      }
      if (lineScore > 0) {
        baseScore += lineScore;
        const excerpt = text.slice(0, 500);
        matchingLines.push(excerpt);
      }
    }

    if (baseScore > 0) {
      const mult = recencyMultiplier(lastTimestamp);
      results.push({
        sessionId,
        date: lastTimestamp ? new Date(lastTimestamp).toISOString() : null,
        relevance: baseScore,
        _score: baseScore * mult,
        files: [...fileSet].slice(0, 20),
        summary: (firstPrompt || sessionId).slice(0, 100),
        matchingLines: matchingLines.slice(0, 5),
        messageCount,
      });
    }
  }

  return results.sort((a, b) => b._score - a._score);
}

/**
 * Find sessions related to a new task prompt and file list.
 * Uses the session index (topics + files) — does not parse full JSONL files.
 */
export function findRelatedSessions(prompt: string, files: string[] = [], cwd: string = process.cwd()): RelatedSession[] {
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');
  let index: Record<string, SessionIndexEntry> = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { return []; }

  if (Object.keys(index).length === 0) return [];

  // Intent words for +1 scoring
  const INTENT_WORDS = ['fix', 'refactor', 'test', 'add', 'update', 'review', 'debug', 'build', 'remove', 'migrate', 'deploy', 'implement', 'create'];

  // Normalize the new task's prompt into words
  const promptLower = (prompt || '').toLowerCase();
  const promptWords = new Set(promptLower.split(/\W+/).filter(w => w.length > 3));

  // Normalize the new task's file paths for comparison
  const normalizeFile = (f: string): string => (f || '').split('/').pop()!.toLowerCase().replace(/\.[^.]+$/, '');
  const newFileNames = new Set((files || []).map(normalizeFile).filter(Boolean));

  // One-hour cutoff for excluding likely-current session
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const results: RelatedSession[] = [];

  for (const session of Object.values(index)) {
    // Skip archived sessions
    if (session.archived) continue;

    // Skip sessions from the last hour
    const sessionTs = session.date ? Date.parse(session.date) : 0;
    if (sessionTs > oneHourAgo) continue;

    let score = 0;
    const matchedFiles: string[] = [];
    const matchedTopics: string[] = [];

    // +3 for each file in common
    for (const sessionFile of (session.files || [])) {
      const sessionFileName = normalizeFile(sessionFile);
      if (sessionFileName && newFileNames.has(sessionFileName)) {
        score += 3;
        matchedFiles.push(sessionFile);
      }
    }

    // +2 for each topic keyword in common with prompt words
    for (const topic of (session.topics || [])) {
      if (topic && promptWords.has(topic)) {
        score += 2;
        matchedTopics.push(topic);
      }
    }

    // +1 for matching intent words found in both prompt and session topics/prompts
    const sessionText = [
      ...(session.topics || []),
      session.prompts?.first || '',
      session.prompts?.last  || '',
    ].join(' ').toLowerCase();

    for (const word of INTENT_WORDS) {
      if (promptLower.includes(word) && sessionText.includes(word)) {
        score += 1;
        break; // only +1 total for intent words
      }
    }

    if (score > 3) {
      results.push({
        sessionId:     session.id,
        smartName:     session.smartName || session.prompts?.first?.slice(0, 40) || session.id.slice(0, 8),
        score,
        matchedFiles,
        matchedTopics,
        date:          session.date,
        messageCount:  session.messageCount || 0,
      });
    }
  }

  // Return top 3 sorted by score descending
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Get detailed context for a session (for smart resume preview).
 * Reads the last 20 lines of the session JSONL to surface the most recent prompt
 * and files touched.
 */
export function getSessionContext(sessionId: string, cwd: string = process.cwd()): SessionContext | null {
  const home = process.env.HOME || '/root';
  const paths = [
    join(home, '.claude', 'projects', '-home-runner-workspace', sessionId + '.jsonl'),
    join(cwd, '.replit-tools', '.session-archive', 'claude', 'projects', '-home-runner-workspace', sessionId + '.jsonl'),
  ];

  let filePath: string | null = null;
  for (const p of paths) {
    if (existsSync(p)) { filePath = p; break; }
  }
  if (!filePath) return null;

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    // Read last 20 lines for recent context
    const recentLines = lines.slice(-20);
    let lastUserPrompt: string | null = null;
    const filesSet = new Set<string>();

    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.type === 'user' && (entry.message as Record<string, unknown>)?.content) {
          const msgContent = (entry.message as Record<string, unknown>).content;
          const text = typeof msgContent === 'string'
            ? msgContent
            : ((msgContent as Array<Record<string, unknown>>)?.[0]?.text as string) ?? null;
          if (text) lastUserPrompt = text.slice(0, 120);
        }
        if (entry.display) lastUserPrompt = (entry.display as string).slice(0, 120);

        // Look for file edits in tool use
        if (entry.type === 'tool_use' || entry.type === 'tool_result') {
          const toolInput = entry.tool_input as Record<string, unknown> | undefined;
          const fp = toolInput?.file_path || toolInput?.path;
          if (fp) filesSet.add((fp as string).split('/').pop()!);
        }
      } catch { continue; }
    }

    return {
      lastPrompt: lastUserPrompt,
      filesTouched: [...filesSet].slice(0, 5),
      totalLines: lines.length,
    };
  } catch { return null; }
}

// ─── Archive-backed metadata extraction ──��───────────────────────────────────

/**
 * Extract structured metadata from a session JSONL file.
 * Reads the file once; handles malformed entries gracefully.
 */
export function extractSessionMeta(sessionFilePath: string): ExtractedSessionMeta {
  const id = sessionFilePath.split('/').pop()!.replace(/\.jsonl$/, '');
  const result: ExtractedSessionMeta = { id, date: null, messageCount: 0, files: [], taskSummary: null, firstPrompt: null, lastPrompt: null, duration: null };

  let content: string;
  try { content = readFileSync(sessionFilePath, 'utf8'); } catch { return result; }

  const fileSet = new Set<string>();
  let minTs = Infinity;
  let maxTs = 0;

  for (const line of content.split('\n')) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try { entry = JSON.parse(line); } catch { continue; }

    // Timestamps
    if (entry.timestamp) {
      const ts = typeof entry.timestamp === 'number'
        ? (entry.timestamp > 1e12 ? entry.timestamp : entry.timestamp * 1000)
        : Date.parse(entry.timestamp as string);
      if (ts && ts < minTs) minTs = ts;
      if (ts && ts > maxTs) maxTs = ts;
    }

    if (entry.type !== 'user') continue;
    const text = extractMessageText(entry);
    if (!text || !text.trim()) continue;

    result.messageCount++;

    // File paths (src/, bin/, common extensions)
    const filePaths = text.match(/[\w./~-]+\.(?:mjs|js|ts|tsx|jsx|json|md|css|html|py|sh|sql|toml|yaml|yml)\b/g);
    if (filePaths) filePaths.forEach(p => fileSet.add(p));
    // Also catch src/ or bin/ paths without extensions
    const dirPaths = text.match(/(?:src|bin|lib|test|tests|\.claude\/hooks)\/[\w./~-]+/g);
    if (dirPaths) dirPaths.forEach(p => fileSet.add(p));

    if (isRealPrompt(text)) {
      if (!result.firstPrompt) {
        result.firstPrompt = text.slice(0, 100);
        result.taskSummary = text.slice(0, 100);
      }
      result.lastPrompt = text.slice(0, 100);
    }
  }

  result.files = [...fileSet].slice(0, 30);
  if (maxTs) result.date = new Date(maxTs).toISOString();
  if (minTs !== Infinity && maxTs) result.duration = Math.round((maxTs - minTs) / 1000); // seconds

  return result;
}

// ─── Routing context from session history ────────────────────────────────────

/**
 * Build routing context from recent sessions (last 7 days) related to a task.
 * Used by the dispatch pipeline to detect prior attempts and flag risk signals.
 */
export function getRoutingContext(cwd: string, taskDescription: string): RoutingContext {
  const result: RoutingContext = { relatedSessions: [], riskSignals: [], priorAttempts: [], relevantFiles: [] };
  const projectDir = existsSync(ARCHIVE_PROJECTS) ? ARCHIVE_PROJECTS
    : join(cwd, '.replit-tools', '.session-archive', 'claude', 'projects', '-home-runner-workspace');
  if (!existsSync(projectDir)) return result;

  let files: string[];
  try { files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-')); }
  catch { return result; }

  const taskLower = (taskDescription || '').toLowerCase();
  const taskTerms = taskLower.split(/\W+/).filter(w => w.length > 3);
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const fileSet = new Set<string>();

  for (const file of files) {
    const filePath = join(projectDir, file);
    let meta: ExtractedSessionMeta;
    try { meta = extractSessionMeta(filePath); } catch { continue; }

    // Only consider last 7 days
    if (!meta.date || Date.parse(meta.date) < sevenDaysAgo) continue;

    // Score relevance to task
    const sessionText = [meta.firstPrompt || '', meta.lastPrompt || '', ...meta.files].join(' ').toLowerCase();
    let score = 0;
    for (const term of taskTerms) {
      if (sessionText.includes(term)) score++;
    }

    if (score === 0) continue;

    // Collect relevant files
    meta.files.forEach(f => fileSet.add(f));

    const sessionEntry = {
      sessionId: meta.id,
      date: meta.date,
      taskSummary: meta.taskSummary,
      score,
      messageCount: meta.messageCount,
      files: meta.files,
    };

    result.relatedSessions.push(sessionEntry);

    // Detect prior attempts: same task keywords, short session (< 5 min or few messages)
    if (score >= 2 && ((meta.duration !== null && meta.duration < 300) || meta.messageCount < 3)) {
      result.priorAttempts.push({
        sessionId: meta.id,
        date: meta.date,
        summary: meta.taskSummary,
        likelyIncomplete: true,
      });
      result.riskSignals.push(`Prior attempt on similar task may have stalled (session ${meta.id.slice(0, 8)})`);
    }

    // Risk signal: auth/security keywords in related sessions
    if (/auth|secret|token|credential|password/.test(sessionText)) {
      result.riskSignals.push(`Related session ${meta.id.slice(0, 8)} touched auth/security code`);
    }
  }

  // Deduplicate risk signals
  result.riskSignals = [...new Set(result.riskSignals)];
  result.relevantFiles = [...fileSet].slice(0, 20);
  result.relatedSessions.sort((a, b) => b.score - a.score);
  result.relatedSessions = result.relatedSessions.slice(0, 5);

  return result;
}

// ─── CLI (direct invocation) ──��───────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('session.mjs') || process.argv[1]?.endsWith('session.ts');
if (isMain) {
  const session = loadSession(process.cwd());
  if (session) {
    process.stdout.write(JSON.stringify(session, null, 2) + '\n');
  } else {
    process.stdout.write('(no active session)\n');
  }
}
