#!/usr/bin/env node
/**
 * session.mjs — Persist task state between terminal sessions.
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_FILE   = '.dualbrain/session.json';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── File I/O ─────────────────────────────────────────────────────────────────

function sessionPath(cwd) {
  return join(cwd ?? process.cwd(), SESSION_FILE);
}

function ensureDir(cwd) {
  mkdirSync(join(cwd ?? process.cwd(), '.dualbrain'), { recursive: true });
}

// ─── Schema defaults ──────────────────────────────────────────────────────────

function defaultSession() {
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

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Load the session file. Returns null if missing or older than 24 hours.
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function loadSession(cwd = process.cwd()) {
  const p = sessionPath(cwd);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const age = Date.now() - Date.parse(data.updatedAt || data.startedAt || 0);
    if (age > SESSION_TTL_MS) return null;
    return data;
  } catch { return null; }
}

/**
 * Write session state atomically (tmp + rename).
 * @param {object} state
 * @param {string} [cwd]
 */
export function saveSession(state, cwd = process.cwd()) {
  ensureDir(cwd);
  const p   = sessionPath(cwd);
  const tmp = p + '.tmp.' + process.pid;
  const data = {
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
 * @param {object} patch
 * @param {string} [cwd]
 */
export function updateSession(patch, cwd = process.cwd()) {
  const existing = loadSession(cwd) || defaultSession();
  const updated  = { ...existing, ...patch };

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
 * @param {string} [cwd]
 */
export function clearSession(cwd = process.cwd()) {
  const p = sessionPath(cwd);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* non-fatal */ }
  }
}

// ─── Session card formatting ──────────────────────────────────────────────────

/**
 * Format a compact status card (≤5 lines) for display when running `dual-brain`.
 *
 * @param {object|null} session — from loadSession()
 * @param {object}      repo    — from detectRepo() / loadRepoCache()
 * @param {object}      health  — from getHealth()  (shape: { states: {}, session: {} })
 * @param {object}      [profile] — optional profile for enabled-state checks
 * @returns {string}
 */
export function formatSessionCard(session, repo, health, profile) {
  const lines = [];

  // Line 1: Repo identity
  const repoParts = [];
  if (repo.name)           repoParts.push(repo.name);
  if (repo.type !== 'unknown') {
    const typeLabel = repo.type.charAt(0).toUpperCase() + repo.type.slice(1);
    repoParts.push(typeLabel);
  }
  if (repo.packageManager) repoParts.push(repo.packageManager);

  // Detect test runner label (Vitest, Jest, pytest, etc.)
  const testCmd = repo.commands?.test || '';
  let testLabel = null;
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

  function providerStatus(name) {
    const entries = Object.entries(states).filter(([k]) => k.startsWith(`${name}:`));
    if (entries.length === 0) return 'healthy';
    const statuses = entries.map(([, v]) => v.status);
    if (statuses.includes('hot'))      return 'hot';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('probing'))  return 'probing';
    return 'healthy';
  }

  const healthParts = [];
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
    const parts = [];
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

// ─── Replit-tools session import ──────────────────────────────────────────────

/**
 * Returns true if the text looks like a real user prompt (not a status line,
 * slash command, paste marker, or agent-generated noise).
 * @param {string} text
 * @returns {boolean}
 */
function isRealPrompt(text) {
  if (!text || !text.trim()) return false;
  const t = text.trim();
  if (/^[✅❌📦🔗⚠️🚀🎉🔧📝]/.test(t)) return false;
  if (/Claude (history|binary|versions) symlink/.test(t)) return false;
  if (t.startsWith('# AGENTS.md')) return false;
  if (t === 'login' || t === 'logout') return false;
  if (t.startsWith('/')) return false;
  if (t.startsWith('[Pasted')) return false;
  return true;
}

/**
 * Human-readable time-ago string from a Unix timestamp (ms).
 * @param {number} timestamp
 * @returns {string}
 */
function timeAgo(timestamp) {
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
 *
 * @param {string} cwd
 * @returns {Array<{
 *   id: string, name: string, project: string,
 *   promptCount: number, lastActive: string,
 *   isActive: boolean, source: string, age: string
 * }>}
 */
export function importReplitSessions(cwd = process.cwd()) {
  const sessions = [];

  // Check multiple possible locations for replit-tools
  const candidates = [
    join(cwd, '.replit-tools', '.claude-persistent'),
    join('/home/runner/workspace', '.replit-tools', '.claude-persistent'),
  ];
  // Deduplicate
  const seen = new Set();
  const replitBases = candidates.filter(p => {
    const norm = p.replace(/\/+$/, '');
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });

  let replitBase = null;
  for (const candidate of replitBases) {
    if (existsSync(join(candidate, 'history.jsonl'))) {
      replitBase = candidate;
      break;
    }
  }
  if (!replitBase) return sessions;

  // Read history.jsonl
  const historyPath = join(replitBase, 'history.jsonl');

  let lines;
  try {
    lines = readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
  } catch { return sessions; }

  const bySession = new Map(); // sessionId → { entries, firstPrompt, lastTimestamp }

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.sessionId) continue;

      if (!bySession.has(entry.sessionId)) {
        bySession.set(entry.sessionId, {
          sessionId: entry.sessionId,
          project: entry.project,
          entries: [],
          firstPrompt: null,
          lastTimestamp: 0,
        });
      }

      const sess = bySession.get(entry.sessionId);
      sess.entries.push(entry);
      if (entry.timestamp > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp;

      // Find first meaningful user prompt
      if (!sess.firstPrompt && isRealPrompt(entry.display)) {
        sess.firstPrompt = entry.display;
      }
    } catch { continue; }
  }

  // Also read from the session archive as a fallback (contains cleaned-up sessions)
  const archivePath = join(cwd, '.replit-tools', '.session-archive', 'claude', 'history.jsonl');
  let archiveLines = [];
  try {
    if (existsSync(archivePath)) {
      archiveLines = readFileSync(archivePath, 'utf8').split('\n').filter(Boolean);
    }
  } catch { /* non-fatal */ }

  for (const line of archiveLines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.sessionId) continue;
      if (bySession.has(entry.sessionId)) continue; // already indexed from main history

      bySession.set(entry.sessionId, {
        sessionId: entry.sessionId,
        project: entry.project,
        entries: [],
        firstPrompt: null,
        lastTimestamp: 0,
      });

      const sess = bySession.get(entry.sessionId);
      sess.entries.push(entry);
      if (entry.timestamp > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp;
      if (!sess.firstPrompt && isRealPrompt(entry.display)) {
        sess.firstPrompt = entry.display;
      }
    } catch { continue; }
  }

  // For archive sessions with multiple entries, finish accumulating them
  // (second pass for sessions newly added from archive)
  for (const line of archiveLines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.sessionId) continue;
      const sess = bySession.get(entry.sessionId);
      if (!sess) continue;
      // Already pushed in first pass for new sessions; skip double-push
      if (sess.entries.includes(entry)) continue;
      sess.entries.push(entry);
      if (entry.timestamp > sess.lastTimestamp) sess.lastTimestamp = entry.timestamp;
      if (!sess.firstPrompt && isRealPrompt(entry.display)) {
        sess.firstPrompt = entry.display;
      }
    } catch { continue; }
  }

  // Scan ~/.codex/sessions/ for codex session JSONLs (YYYY/MM/DD tree)
  const codexSessionsDir = join(process.env.HOME || '/root', '.codex', 'sessions');
  if (existsSync(codexSessionsDir)) {
    try {
      const walk = (dir) => {
        let results = [];
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
          const lines = content.split('\n').filter(Boolean);
          if (!lines.length) continue;

          const meta = JSON.parse(lines[0]);
          if (meta.type !== 'session_meta' || !meta.payload) continue;
          if (meta.payload.cwd !== cwd && meta.payload.cwd !== '/home/runner/workspace') continue;

          const id = meta.payload.id;
          if (bySession.has(id)) continue;

          let firstPrompt = null;
          let lastTimestamp = Date.parse(meta.payload.timestamp || meta.timestamp) / 1000;

          for (const ln of lines) {
            try {
              const j = JSON.parse(ln);
              if (j.timestamp) {
                const ts = Date.parse(j.timestamp) / 1000;
                if (ts > lastTimestamp) lastTimestamp = ts;
              }
              if (!firstPrompt && j.type === 'event_msg' && j.payload?.type === 'user_message') {
                const text = (j.payload.message || '').trim();
                if (text) firstPrompt = text;
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
  const activeSessionIds = new Set();
  if (existsSync(sessionsDir)) {
    try {
      for (const f of readdirSync(sessionsDir)) {
        try {
          const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'));
          if (data.sessionId) activeSessionIds.add(data.sessionId);
        } catch { continue; }
      }
    } catch { /* non-fatal */ }
  }

  // Determine recency window from config (default 48 hours)
  const configPath = join(cwd, '.replit-tools', 'config.json');
  let windowHours = 48;
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      windowHours = cfg.recentWindowHours || 48;
    }
  } catch { /* non-fatal */ }
  const windowMs = windowHours * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;

  // Load existing session index for smartName lookup (best-effort, non-fatal)
  let sessionIndex = {};
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
        const firstReal = sess.entries.find(e => e.display && e.display !== 'login');
        name = firstReal?.display || `Session ${id.slice(0, 8)}`;
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
  sessions.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));

  return sessions;
}

// ─── Session metadata overlay ─────────────────────────────────────────────────

const SESSION_META_FILE = '.dualbrain/sessions.json';

function sessionMetaPath(cwd) {
  return join(cwd ?? process.cwd(), SESSION_META_FILE);
}

export function getSessionMeta(cwd = process.cwd()) {
  const p = sessionMetaPath(cwd);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveSessionMeta(meta, cwd = process.cwd()) {
  ensureDir(cwd);
  const p   = sessionMetaPath(cwd);
  const tmp = p + '.tmp.' + process.pid;
  writeFileSync(tmp, JSON.stringify(meta, null, 2) + '\n');
  renameSync(tmp, p);
}

export function renameSession(sessionId, name, cwd = process.cwd()) {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], name, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

export function pinSession(sessionId, cwd = process.cwd()) {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], pinned: true, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

export function unpinSession(sessionId, cwd = process.cwd()) {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], pinned: false };
  saveSessionMeta(meta, cwd);
}

export function categorizeSession(sessionId, category, cwd = process.cwd()) {
  const meta = getSessionMeta(cwd);
  meta[sessionId] = { ...meta[sessionId], category, createdAt: meta[sessionId]?.createdAt ?? new Date().toISOString() };
  saveSessionMeta(meta, cwd);
}

const AUTO_LABEL_RULES = [
  { keywords: ['auth', 'login', 'credential', 'security', 'token'], label: 'security' },
  { keywords: ['ui', 'css', 'style', 'component', 'react', 'frontend'], label: 'ui' },
  { keywords: ['refactor', 'cleanup', 'rename', 'reorganize'], label: 'refactor' },
  { keywords: ['bug', 'fix', 'error', 'crash', 'broken'], label: 'bugfix' },
  { keywords: ['test', 'spec', 'coverage'], label: 'testing' },
  { keywords: ['deploy', 'ci', 'build', 'release'], label: 'devops' },
  { keywords: ['plan', 'design', 'architect', 'brainstorm'], label: 'planning' },
];

export function autoLabel(session) {
  const text = (session.name || '').toLowerCase();
  for (const { keywords, label } of AUTO_LABEL_RULES) {
    if (keywords.some(kw => new RegExp(`\\b${kw}\\b`).test(text))) return label;
  }
  return null;
}

export function enrichSessions(sessions, cwd = process.cwd()) {
  const meta = getSessionMeta(cwd);
  const enriched = sessions.map(sess => {
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
    return new Date(b.lastActive) - new Date(a.lastActive);
  });
  return enriched;
}

// ─── Persistence settings ─────────────────────────────────────────────────────

/**
 * Ensure Claude and Codex are configured to retain session history indefinitely.
 * Mirrors what replit-tools does to prevent session cleanup/deletion.
 *
 * @param {string} [cwd]
 * @returns {string[]} List of changes made (empty if already configured)
 */
export function ensurePersistence(cwd = process.cwd()) {
  const home = process.env.HOME || '/root';
  const results = [];

  // 1. Claude: set cleanupPeriodDays
  const claudeSettingsPaths = [
    join(home, '.claude', 'settings.json'),
    join(cwd, '.replit-tools', '.claude-persistent', 'settings.json'),
  ];

  for (const settingsPath of claudeSettingsPaths) {
    if (!existsSync(settingsPath)) continue;
    try {
      let settings = {};
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

// ─── Session archive mirror sync ─────────────────────────────────────────────

/**
 * Append-only mirror sync for Claude/Codex sessions (matches what replit-tools does).
 * Files in the mirror only grow — if the source deletes a session, the mirror still has it.
 *
 * @param {string} [cwd]
 * @returns {{ copied: number, grew: number, disabled?: boolean }}
 */
export function syncSessionMirror(cwd = process.cwd()) {
  const home = process.env.HOME || '/root';
  const mirrorBase = join(cwd, '.replit-tools', '.session-archive');

  // Check if replit-tools exists
  if (!existsSync(join(cwd, '.replit-tools'))) return { copied: 0, grew: 0 };

  // Check config — mirror can be disabled
  const configPath = join(cwd, '.replit-tools', 'config.json');
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      if (cfg.mirror && cfg.mirror.enabled === false) return { copied: 0, grew: 0, disabled: true };
    }
  } catch {}

  let totalCopied = 0, totalGrew = 0;

  function syncTree(srcDir, destDir) {
    if (!existsSync(srcDir)) return;

    function walk(dir) {
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

// ─── Smart session naming ─────────────────────────────────────────────────────

/**
 * File pattern → human label mapping (checked in order, first match wins).
 * Each entry: { pattern: RegExp, label: string, action?: string }
 */
const FILE_PATTERN_RULES = [
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
const TOPIC_ACTION_MAP = [
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
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Strip file extensions from a name candidate.
 * @param {string} name
 * @returns {string}
 */
function stripExtensions(name) {
  return name.replace(/\.(mjs|js|ts|tsx|jsx|json|md|css|html|py|sh|sql|toml|yaml|yml)\b/gi, '');
}

/**
 * Truncate a string to maxLen characters, preserving whole words where possible.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 40) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen).replace(/\s+\S*$/, '');
  return cut || str.slice(0, maxLen);
}

/**
 * Generate a smart human-readable session name from session index data.
 *
 * Priority:
 *   1. Dominant file pattern (e.g. auth*.mjs → "Refactor Auth Module")
 *   2. Top topics (e.g. ['auth','token','refresh'] → "Auth Token Refresh")
 *   3. Fallback: first prompt truncated to 40 chars
 *
 * Rules: ≤40 chars, Title Case, no file extensions, action-prefixed when detectable.
 *
 * @param {{ topics?: string[], files?: string[], prompts?: { first?: string } }} sessionData
 * @returns {string}
 */
export function generateSmartName(sessionData) {
  const topics = sessionData.topics || [];
  const files  = sessionData.files  || [];
  const firstPrompt = sessionData.prompts?.first || '';

  // ── Step 1: Detect dominant action from topics ─────────────────────────────
  let detectedAction = null;
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

    let candidate;
    if (actionWord) {
      // Use action + remaining topics
      candidate = [actionWord, ...topTopics.filter(t => t !== actionWord.toLowerCase())].slice(0, 3).join(' ');
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
 *
 * @param {string} [cwd]
 * @returns {object} index — keyed by session UUID
 */
export function buildSessionIndex(cwd = process.cwd()) {
  const home = process.env.HOME || '/root';
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');

  // Load existing index
  let index = {};
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
    let files;
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

        const wordCounts = {};
        const fileSet = new Set();
        let firstPrompt = null;
        let lastPrompt = null;
        let lastTimestamp = 0;
        let messageCount = 0;

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);

            // Track timestamps
            if (entry.timestamp) {
              const raw = typeof entry.timestamp === 'number' ? entry.timestamp : Date.parse(entry.timestamp);
              const ts = raw > 1e12 ? raw / 1000 : raw;
              if (ts > lastTimestamp) lastTimestamp = ts;
            }

            // Extract user messages
            let text = null;
            if (entry.type === 'user' && entry.message?.content) {
              text = typeof entry.message.content === 'string'
                ? entry.message.content
                : entry.message.content?.[0]?.text;
            }
            if (entry.display) text = text || entry.display;

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

        const sessionEntry = {
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
    const walk = (dir) => {
      let results = [];
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
        const meta = JSON.parse(lines[0]);
        if (meta.type !== 'session_meta' || !meta.payload) continue;
        const id = meta.payload.id;
        if (!id || index[id]) continue;

        let fileSize = 0;
        try { fileSize = statSync(filePath).size; } catch { continue; }

        let firstPrompt = null, lastPrompt = null, messageCount = 0;
        let lastTimestamp = Date.parse(meta.payload.timestamp || meta.timestamp) / 1000 || 0;

        for (const ln of lines) {
          try {
            const j = JSON.parse(ln);
            if (j.timestamp) {
              const ts = Date.parse(j.timestamp) / 1000;
              if (ts > lastTimestamp) lastTimestamp = ts;
            }
            if (j.type === 'event_msg' && j.payload?.type === 'user_message') {
              const text = (j.payload.message || '').trim();
              if (text) {
                messageCount++;
                if (!firstPrompt) firstPrompt = text.slice(0, 80);
                lastPrompt = text.slice(0, 80);
              }
            }
          } catch { continue; }
        }

        const codexEntry = {
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
 * Search the session index by keyword. Returns matching sessions sorted by relevance.
 *
 * @param {string} query
 * @param {string} [cwd]
 * @returns {Array<object>} sessions with `_score` field, sorted descending
 */
export function searchSessions(query, cwd = process.cwd()) {
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');
  let index = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch {}

  if (Object.keys(index).length === 0) {
    index = buildSessionIndex(cwd);
  }

  const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
  const results = [];

  for (const session of Object.values(index)) {
    let score = 0;
    const searchText = [
      ...session.topics,
      ...session.files,
      session.prompts.first,
      session.prompts.last,
    ].join(' ').toLowerCase();

    for (const term of terms) {
      if (searchText.includes(term)) score++;
      if (session.topics.includes(term)) score += 2;
      if (session.files.some(f => f.includes(term))) score += 2;
    }

    if (score > 0) {
      results.push({ ...session, _score: score });
    }
  }

  return results.sort((a, b) => b._score - a._score);
}

/**
 * Get detailed context for a session (for smart resume preview).
 * Reads the last 20 lines of the session JSONL to surface the most recent prompt
 * and files touched.
 *
 * @param {string} sessionId
 * @param {string} [cwd]
 * @returns {{ lastPrompt: string|null, filesTouched: string[], totalLines: number }|null}
 */
export function getSessionContext(sessionId, cwd = process.cwd()) {
  const home = process.env.HOME || '/root';
  const paths = [
    join(home, '.claude', 'projects', '-home-runner-workspace', sessionId + '.jsonl'),
    join(cwd, '.replit-tools', '.session-archive', 'claude', 'projects', '-home-runner-workspace', sessionId + '.jsonl'),
  ];

  let filePath = null;
  for (const p of paths) {
    if (existsSync(p)) { filePath = p; break; }
  }
  if (!filePath) return null;

  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    // Read last 20 lines for recent context
    const recentLines = lines.slice(-20);
    let lastUserPrompt = null;
    const filesSet = new Set();

    for (const line of recentLines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'user' && entry.message?.content) {
          const text = typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content?.[0]?.text;
          if (text) lastUserPrompt = text.slice(0, 120);
        }
        if (entry.display) lastUserPrompt = entry.display.slice(0, 120);

        // Look for file edits in tool use
        if (entry.type === 'tool_use' || entry.type === 'tool_result') {
          const fp = entry.tool_input?.file_path || entry.tool_input?.path;
          if (fp) filesSet.add(fp.split('/').pop());
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

// ─── CLI (direct invocation) ──────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('session.mjs');
if (isMain) {
  const session = loadSession(process.cwd());
  if (session) {
    process.stdout.write(JSON.stringify(session, null, 2) + '\n');
  } else {
    process.stdout.write('(no active session)\n');
  }
}
