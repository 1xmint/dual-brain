/**
 * inbox.mjs — Cross-session signal system for dual-brain orchestrator
 *
 * Agents write messages to .dualbrain/inbox/. HEAD and the cognitive loop
 * check the inbox at entry points. Messages have TTL and recipient types.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const INBOX_DIR = join(process.cwd(), '.dualbrain', 'inbox');
const INDEX_PATH = join(INBOX_DIR, '_index.json');
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24h
const MAX_ACTIVE = 50;
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function ensureDir() {
  if (!existsSync(INBOX_DIR)) mkdirSync(INBOX_DIR, { recursive: true });
}

function readIndex() {
  try {
    if (existsSync(INDEX_PATH)) return JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  } catch { /* rebuild */ }
  return rebuildIndex();
}

function rebuildIndex() {
  ensureDir();
  const entries = [];
  for (const f of readdirSync(INBOX_DIR)) {
    if (f === '_index.json' || !f.endsWith('.json')) continue;
    try {
      const msg = JSON.parse(readFileSync(join(INBOX_DIR, f), 'utf8'));
      entries.push({ id: msg.id, to: msg.to, type: msg.type, priority: msg.priority, createdAt: msg.createdAt, expired: Date.now() > msg.createdAt + msg.ttl });
    } catch { /* skip corrupt */ }
  }
  writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2));
  return entries;
}

function writeIndex(entries) {
  ensureDir();
  writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2));
}

function readMessage(id) {
  try {
    return JSON.parse(readFileSync(join(INBOX_DIR, `${id}.json`), 'utf8'));
  } catch { return null; }
}

function matchesRecipient(msgTo, recipient) {
  if (msgTo === 'all' || msgTo === recipient) return true;
  if (msgTo === 'worker:*' && recipient.startsWith('worker:')) return true;
  return false;
}

/** Write a message to the inbox. */
export function send(partial) {
  if (!partial.to || !partial.type || !partial.subject || !partial.body) {
    throw new Error('inbox.send requires: to, type, subject, body');
  }
  ensureDir();
  const msg = {
    id: randomUUID(),
    from: partial.from || 'system',
    to: partial.to,
    type: partial.type,
    priority: partial.priority || 'medium',
    subject: partial.subject,
    body: partial.body,
    ttl: partial.ttl ?? DEFAULT_TTL,
    createdAt: Date.now(),
    readBy: partial.readBy || [],
    relatedFiles: partial.relatedFiles || [],
    tags: partial.tags || [],
  };
  // Enforce cap — purge oldest if over limit
  const index = readIndex();
  const active = index.filter(e => !e.expired);
  if (active.length >= MAX_ACTIVE) {
    const sorted = [...active].sort((a, b) => a.createdAt - b.createdAt);
    const toRemove = sorted.slice(0, active.length - MAX_ACTIVE + 1);
    for (const e of toRemove) {
      try { unlinkSync(join(INBOX_DIR, `${e.id}.json`)); } catch { /* ok */ }
    }
    const removeIds = new Set(toRemove.map(e => e.id));
    const trimmed = index.filter(e => !removeIds.has(e.id));
    trimmed.push({ id: msg.id, to: msg.to, type: msg.type, priority: msg.priority, createdAt: msg.createdAt, expired: false });
    writeIndex(trimmed);
  } else {
    index.push({ id: msg.id, to: msg.to, type: msg.type, priority: msg.priority, createdAt: msg.createdAt, expired: false });
    writeIndex(index);
  }
  writeFileSync(join(INBOX_DIR, `${msg.id}.json`), JSON.stringify(msg, null, 2));
  return msg;
}

/** Read messages for a recipient. */
export function check(recipient, options = {}) {
  const { unreadOnly = false, types, minPriority, limit } = options;
  const index = readIndex();
  const now = Date.now();
  const minP = minPriority ? PRIORITY_ORDER[minPriority] ?? 3 : 3;
  let results = [];
  for (const entry of index) {
    if (now > entry.createdAt + DEFAULT_TTL) continue; // rough TTL check
    if (!matchesRecipient(entry.to, recipient)) continue;
    if (types && !types.includes(entry.type)) continue;
    if ((PRIORITY_ORDER[entry.priority] ?? 3) > minP) continue;
    const msg = readMessage(entry.id);
    if (!msg) continue;
    if (now > msg.createdAt + msg.ttl) continue; // precise TTL
    if (unreadOnly && msg.readBy.includes(recipient)) continue;
    results.push(msg);
  }
  results.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3) || b.createdAt - a.createdAt);
  if (limit) results = results.slice(0, limit);
  return results;
}

/** Mark a message as read by a specific reader. */
export function markRead(messageId, reader) {
  const path = join(INBOX_DIR, `${messageId}.json`);
  const msg = readMessage(messageId);
  if (!msg) return;
  if (!msg.readBy.includes(reader)) {
    msg.readBy.push(reader);
    writeFileSync(path, JSON.stringify(msg, null, 2));
  }
}

/** Clean up expired and fully-read messages. */
export function purge(options = {}) {
  const { purgeRead = false } = options;
  const index = readIndex();
  const now = Date.now();
  let expired = 0, read = 0;
  const keep = [];
  for (const entry of index) {
    const msg = readMessage(entry.id);
    if (!msg) continue;
    if (now > msg.createdAt + msg.ttl) {
      try { unlinkSync(join(INBOX_DIR, `${entry.id}.json`)); } catch { /* ok */ }
      expired++;
      continue;
    }
    if (purgeRead && msg.readBy.length > 0 && msg.to !== 'all') {
      try { unlinkSync(join(INBOX_DIR, `${entry.id}.json`)); } catch { /* ok */ }
      read++;
      continue;
    }
    keep.push(entry);
  }
  writeIndex(keep);
  return { expired, read };
}

/** Produce a concise text summary for prompt injection. */
export function generateInboxBrief(recipient) {
  const msgs = check(recipient, { unreadOnly: true, limit: 5 });
  if (!msgs.length) return '';
  const lines = [`\u{1F4EC} Inbox (${msgs.length} unread):`];
  let len = lines[0].length;
  for (const m of msgs) {
    const line = `• [${m.priority}] ${m.from !== 'system' ? `From ${m.from}: ` : ''}${m.subject}`;
    if (len + line.length > 480) { lines.push('• ...'); break; }
    lines.push(line);
    len += line.length;
  }
  return lines.join('\n');
}

/** Convenience: send a continuation message when session ends. */
export function sendContinuation(context) {
  return send({
    from: context.from || 'head',
    to: 'session:next',
    type: 'continuation',
    priority: 'high',
    subject: context.subject || 'Session continuation state',
    body: typeof context.body === 'string' ? context.body : JSON.stringify(context.state || context, null, 2),
    relatedFiles: context.relatedFiles || [],
    tags: ['continuation', ...(context.tags || [])],
    ttl: context.ttl ?? DEFAULT_TTL * 3, // 72h for continuations
  });
}

/** Convenience: check for the most recent unread continuation. */
export function checkContinuation(reader = 'head') {
  const msgs = check('session:next', { unreadOnly: true, types: ['continuation'], limit: 1 });
  return msgs.length ? msgs[0] : null;
}
