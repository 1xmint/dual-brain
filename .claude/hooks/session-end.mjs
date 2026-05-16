#!/usr/bin/env node
// session-end.mjs — Stop hook for dual-brain. Runs when Claude session ends.
// Generates receipt, records metrics, cleans up stale locks.

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE = join(new URL(import.meta.url).pathname, '..', '..', '..');
const DUALBRAIN = join(WORKSPACE, '.dualbrain');
const RECEIPTS_DIR = join(DUALBRAIN, 'receipts');

// Read hook input from stdin
let input = {};
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  // Stop hook may not always get structured input
}

async function run() {
  mkdirSync(RECEIPTS_DIR, { recursive: true });

  // 1. Generate session receipt
  const receipt = {
    timestamp: new Date().toISOString(),
    sessionId: input.session_id || 'unknown',
    reason: input.stop_hook_reason || 'session_end',
    metrics: {},
    cleanup: [],
  };

  // 2. Collect metrics from audit log
  const auditFile = join(DUALBRAIN, 'audit', 'head-audit.jsonl');
  if (existsSync(auditFile)) {
    try {
      const lines = readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean);
      const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

      // Filter to this session (last 2 hours as proxy)
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      const sessionEntries = entries.filter(e => (e.timestamp || 0) > cutoff);

      receipt.metrics.toolCalls = sessionEntries.length;
      receipt.metrics.blocked = sessionEntries.filter(e => e.decision === 'block').length;
      receipt.metrics.allowed = sessionEntries.filter(e => e.decision === 'allow').length;
      receipt.metrics.agentDispatches = sessionEntries.filter(e => e.tool === 'Agent').length;
    } catch {}
  }

  // 3. Check for cost log
  const costLog = join(DUALBRAIN, 'cost-log.jsonl');
  if (existsSync(costLog)) {
    try {
      const lines = readFileSync(costLog, 'utf8').trim().split('\n').filter(Boolean);
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      const recent = lines.map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(e => e && (e.timestamp || 0) > cutoff);

      receipt.metrics.costEntries = recent.length;
    } catch {}
  }

  // 4. Clean up stale lock files
  try {
    const scanDirs = [DUALBRAIN, join(DUALBRAIN, 'doctor'), join(DUALBRAIN, 'receipts')];
    for (const dir of scanDirs) {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter(f => f.endsWith('.lock'));
      for (const f of files) {
        const lockPath = join(dir, f);
        try {
          const lockData = JSON.parse(readFileSync(lockPath, 'utf8'));
          const age = Date.now() - (lockData.createdAt || 0);
          if (age > 60000) { // older than 1 minute = stale
            unlinkSync(lockPath);
            receipt.cleanup.push(`removed stale lock: ${f}`);
          }
        } catch {
          // Corrupt lock — remove
          try { unlinkSync(lockPath); receipt.cleanup.push(`removed corrupt lock: ${f}`); } catch {}
        }
      }
    }
  } catch {}

  // 5. Record git state for next session
  try {
    const { execSync } = await import('node:child_process');
    receipt.gitState = {
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: WORKSPACE, encoding: 'utf8', timeout: 3000 }).trim(),
      uncommitted: parseInt(execSync('git status --porcelain | wc -l', { cwd: WORKSPACE, encoding: 'utf8', timeout: 3000 }).trim()) || 0,
      lastCommit: execSync('git log --oneline -1', { cwd: WORKSPACE, encoding: 'utf8', timeout: 3000 }).trim(),
    };
  } catch {}

  // 6. Save receipt
  const receiptFile = join(RECEIPTS_DIR, `receipt-${Date.now()}.json`);
  writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');

  // 7. Print summary to stderr (visible to user)
  const summary = [];
  if (receipt.metrics.toolCalls) summary.push(`${receipt.metrics.toolCalls} tool calls`);
  if (receipt.metrics.agentDispatches) summary.push(`${receipt.metrics.agentDispatches} agents dispatched`);
  if (receipt.cleanup.length) summary.push(`${receipt.cleanup.length} locks cleaned`);

  if (summary.length) {
    process.stderr.write(`[dual-brain] Session end: ${summary.join(', ')}\n`);
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(0));
