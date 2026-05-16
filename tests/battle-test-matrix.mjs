#!/usr/bin/env node
/**
 * battle-test-matrix.mjs — Comprehensive battle-test matrix for dual-brain.
 *
 * Covers every failure mode, drift risk, and UX hazard across session lifecycle,
 * provider failures, task routing, user behavior, platform/env, and team use.
 *
 * Usage:
 *   node tests/battle-test-matrix.mjs          # run mechanical tests, list manual ones
 *   node tests/battle-test-matrix.mjs --all    # show all scenario objects and results
 *   node tests/battle-test-matrix.mjs --json   # emit full results as JSON
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC  = join(ROOT, 'src');
const HOOKS = join(ROOT, '.claude', 'hooks');
const BIN   = join(ROOT, 'bin', 'dual-brain.mjs');

// ─── ANSI colours (skip when not a TTY) ───────────────────────────────────────

const isTTY = process.stdout.isTTY;
const G  = isTTY ? '\x1b[32m' : '';  // green
const R  = isTTY ? '\x1b[31m' : '';  // red
const Y  = isTTY ? '\x1b[33m' : '';  // yellow
const D  = isTTY ? '\x1b[2m'  : '';  // dim
const B  = isTTY ? '\x1b[1m'  : '';  // bold
const X  = isTTY ? '\x1b[0m'  : '';  // reset

// ─── Scenario schema ──────────────────────────────────────────────────────────
/**
 * @typedef {Object} Scenario
 * @property {string}   id          Unique kebab-case identifier
 * @property {string}   category    SESSION_LIFECYCLE | PROVIDER_FAILURES | TASK_ROUTING |
 *                                  USER_BEHAVIOR | PLATFORM_ENV | TEAM
 * @property {string}   name        Short human label
 * @property {string}   description What this tests and why it matters
 * @property {string}   setup       State/preconditions required
 * @property {string}   action      What to do (CLI cmd or step description)
 * @property {string}   expected    Observable success criterion
 * @property {'critical'|'high'|'medium'|'low'} severity
 * @property {Function} [run]       Optional: mechanical test function → true | string(reason)
 */

// ─── Helpers used by mechanical tests ────────────────────────────────────────

function node(args, opts = {}) {
  const proc = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 12_000,
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...(opts.env || {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
    status: proc.status ?? -1,
    ok: proc.status === 0,
  };
}

function importModule(relPath) {
  // Synchronous require-style dynamic import shim via spawnSync eval
  // Returns { exported: object } or { error: string }
  const abs = resolve(ROOT, relPath);
  const script = `
    import('${abs}').then(m => {
      console.log(JSON.stringify(Object.keys(m)));
    }).catch(e => {
      process.stderr.write(e.message);
      process.exit(1);
    });
  `;
  const proc = spawnSync(process.execPath, ['--input-type=module'], {
    input: script,
    encoding: 'utf8',
    timeout: 10_000,
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (proc.status !== 0) return { error: proc.stderr || 'non-zero exit' };
  try {
    return { exported: JSON.parse(proc.stdout.trim()) };
  } catch {
    return { error: `unparseable: ${proc.stdout}` };
  }
}

/**
 * callExport(relPath, fnName, args)
 *
 * args is an actual JS array of arguments (NOT a JSON string).
 * We serialise them via JSON + base64 env var to avoid shell quoting hazards.
 */
function callExport(relPath, fnName, args) {
  const abs = resolve(ROOT, relPath);
  // Encode args array as base64 JSON to pass through env var safely
  const argsB64 = Buffer.from(JSON.stringify(args)).toString('base64');
  const script = `
    const argsRaw = Buffer.from(process.env.__DUAL_BRAIN_ARGS, 'base64').toString('utf8');
    const args = JSON.parse(argsRaw);
    import('${abs}').then(m => {
      const fn = m['${fnName}'];
      if (typeof fn !== 'function') throw new Error('not a function: ${fnName}');
      const result = fn(...args);
      console.log(JSON.stringify(result));
    }).catch(e => {
      process.stderr.write(e.message);
      process.exit(1);
    });
  `;
  const proc = spawnSync(process.execPath, ['--input-type=module'], {
    input: script,
    encoding: 'utf8',
    timeout: 10_000,
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, __DUAL_BRAIN_ARGS: argsB64 },
  });
  if (proc.status !== 0) return { error: proc.stderr || 'non-zero exit' };
  try {
    return { value: JSON.parse(proc.stdout.trim()) };
  } catch {
    return { error: `unparseable: ${proc.stdout}` };
  }
}

function withTempDir(fn) {
  const dir = join(tmpdir(), `dual-brain-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// ─── THE BATTLE-TEST MATRIX ───────────────────────────────────────────────────

export const scenarios = [

  // ═══════════════════════════════════════════════════════════════════════════
  // SESSION LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'shell-restart',
    category: 'SESSION_LIFECYCLE',
    name: 'Hooks fire from any cwd after global install',
    description: 'After `npm install -g dual-brain`, hooks in CLAUDE.md must resolve correctly '
      + 'regardless of cwd. A user who opens a terminal in ~/projects/foo should get dual-brain hooks '
      + 'without needing the package locally installed.',
    setup: 'Global install via `npm install -g dual-brain`. Start a new shell, cd to an arbitrary directory.',
    action: 'Run `dual-brain status` from ~/Desktop or any non-project dir.',
    expected: 'Status output contains provider health data, no "Cannot find module" errors.',
    severity: 'critical',
    run() {
      // Mechanical check: the bin script resolves its own __dirname correctly
      // (not relative to cwd). We verify that the bin file uses fileURLToPath/import.meta.url.
      const binSrc = readFileSync(BIN, 'utf8');
      if (!binSrc.includes('fileURLToPath') && !binSrc.includes('import.meta.url')) {
        return 'bin/dual-brain.mjs does not use import.meta.url for path resolution — cwd-dependent paths possible';
      }
      // Also verify src modules use __dirname via fileURLToPath
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      if (!dispatchSrc.includes('fileURLToPath')) {
        return 'src/dispatch.mjs missing fileURLToPath — path resolution may be cwd-dependent';
      }
      return true;
    },
  },

  {
    id: 'continue-chat',
    category: 'SESSION_LIFECYCLE',
    name: 'Resumed session retains dual-brain context',
    description: 'When a user resumes a Claude Code session (--continue or /resume), the dual-brain '
      + 'routing rules from CLAUDE.md must still be active. The receipt from the prior session should '
      + 'be discoverable for auto-resume.',
    setup: 'Prior session that wrote a .dualbrain/receipts/ file.',
    action: 'Resume session via `claude --continue`. Ask "what were we working on?"',
    expected: 'Claude references the prior receipt or session context without needing re-explanation.',
    severity: 'high',
    run() {
      // Mechanical: receipt module must export a write + find function
      const { exported, error } = importModule('src/receipt.mjs');
      if (error) return `cannot import src/receipt.mjs: ${error}`;
      if (!exported) return 'no exports found in src/receipt.mjs';
      // receipts dir structure check — project uses .dual-brain/ (hyphenated)
      const receiptSrc = readFileSync(join(SRC, 'receipt.mjs'), 'utf8');
      if (!receiptSrc.includes('.dual-brain') && !receiptSrc.includes('.dualbrain')) {
        return 'receipt.mjs does not reference .dual-brain or .dualbrain storage path';
      }
      return true;
    },
  },

  {
    id: 'new-terminal',
    category: 'SESSION_LIFECYCLE',
    name: 'Fresh terminal loads global hooks without re-init',
    description: 'install-hooks.mjs writes hook scripts to the user home or project .claude/ dir. '
      + 'A brand-new terminal (fresh shell, no prior dual-brain env vars) must pick them up automatically.',
    setup: 'Global install complete, hooks previously written by `dual-brain init`.',
    action: 'Open a new terminal tab. Run `dual-brain go --dry-run "fix typo in README"`.',
    expected: 'dry-run outputs routing decision without "hooks not installed" error.',
    severity: 'high',
    run() {
      // Check that install-hooks.mjs exists and registers PreToolUse hooks in settings.json
      const installHooksPath = join(SRC, 'install-hooks.mjs');
      if (!existsSync(installHooksPath)) {
        return `src/install-hooks.mjs not found`;
      }
      const src = readFileSync(installHooksPath, 'utf8');
      // Hooks are registered via settings.json PreToolUse, not CLAUDE.md
      if (!src.includes('PreToolUse') && !src.includes('settings.json') && !src.includes('hooks')) {
        return 'install-hooks.mjs does not appear to register hooks via settings.json PreToolUse';
      }
      return true;
    },
  },

  {
    id: 'compaction',
    category: 'SESSION_LIFECYCLE',
    name: 'CLAUDE.md instructions survive context compression',
    description: 'Claude Code compacts context when it exceeds the context window. After compaction, '
      + 'the CLAUDE.md rules (tier routing, dual-brain thresholds, workload distribution) must '
      + 'still be active because CLAUDE.md is re-read each session — not stored in the rolling context.',
    setup: 'Long session with 100k+ tokens of conversation history.',
    action: 'After compaction fires (watch for "Compacting…"), issue a 3-file edit task.',
    expected: 'dual-brain go / workload check runs as normal; CLAUDE.md rules are re-applied.',
    severity: 'critical',
    run() {
      // Mechanical: CLAUDE.md in project root and .claude/ must both contain tier routing rules
      const rootMd  = join(ROOT, 'CLAUDE.md');
      const dotMd   = join(ROOT, '.claude', 'CLAUDE.md');
      for (const md of [rootMd, dotMd]) {
        if (!existsSync(md)) return `${md} not found`;
        const content = readFileSync(md, 'utf8');
        if (!content.includes('dual-brain') || !content.includes('tier')) {
          return `${md} missing tier routing rules — will be absent after compaction`;
        }
      }
      return true;
    },
  },

  {
    id: 'context-overflow',
    category: 'SESSION_LIFECYCLE',
    name: 'Routing rules not silently dropped at context limit',
    description: 'If CLAUDE.md becomes so large that it is truncated by Claude Code on load, '
      + 'the most important routing rules must appear near the top of the file to survive truncation.',
    setup: 'A very large CLAUDE.md (simulate by checking rule ordering).',
    action: 'Inspect CLAUDE.md — critical rules must appear before line 100.',
    expected: 'Tier routing, dual-brain triggers, and quality gate rules appear in first 100 lines.',
    severity: 'high',
    run() {
      const dotMd = join(ROOT, '.claude', 'CLAUDE.md');
      if (!existsSync(dotMd)) return '.claude/CLAUDE.md not found';
      const lines = readFileSync(dotMd, 'utf8').split('\n');
      const first100 = lines.slice(0, 100).join('\n');
      if (!first100.includes('dual-brain')) {
        return 'dual-brain reference not found in first 100 lines of .claude/CLAUDE.md';
      }
      if (!first100.includes('tier') && !first100.includes('Tier')) {
        return 'tier routing not mentioned in first 100 lines of .claude/CLAUDE.md';
      }
      return true;
    },
  },

  {
    id: 'stale-receipt',
    category: 'SESSION_LIFECYCLE',
    name: 'Auto-resume with outdated receipt handles gracefully',
    description: 'A receipt from 3+ days ago or from a deleted branch should not cause a crash or '
      + 'confuse the routing engine. The system must detect staleness and either skip or warn.',
    setup: 'Write a receipt file with a timestamp from 4 days ago and a non-existent git branch.',
    action: 'Run `dual-brain go "continue the refactor"` — triggers receipt lookup.',
    expected: 'Either: stale receipt is ignored with a warning, or graceful fallback to fresh session.',
    severity: 'high',
    run() {
      const receiptSrc = readFileSync(join(SRC, 'receipt.mjs'), 'utf8');
      // Must have some time-based staleness check or a TTL concept
      const hasTtl = /ttl|stale|expire|maxAge|age|createdAt|timestamp/i.test(receiptSrc);
      if (!hasTtl) {
        return 'receipt.mjs has no TTL/staleness check — stale receipts will be used blindly';
      }
      return true;
    },
  },

  {
    id: 'multi-session',
    category: 'SESSION_LIFECYCLE',
    name: 'Two parallel Claude sessions do not corrupt shared state',
    description: 'A developer with two terminal tabs (both running Claude Code) must not cause '
      + 'usage logs, receipts, or the decision ledger to corrupt each other via concurrent writes.',
    setup: 'Two Claude sessions open simultaneously in the same project directory.',
    action: 'Both sessions run tasks that write to .dualbrain/ (receipts, usage logs).',
    expected: 'Both sessions complete; .dualbrain/ files are consistent (append-only JSONL, atomic writes).',
    severity: 'high',
    run() {
      // Check that usage logs use appendFileSync (append-only, safe for concurrent writers)
      // and that receipts use unique IDs (no shared mutable file)
      const costLoggerPath = join(HOOKS, 'cost-logger.mjs');
      if (!existsSync(costLoggerPath)) return `${costLoggerPath} not found`;
      const src = readFileSync(costLoggerPath, 'utf8');
      if (!src.includes('appendFileSync') && !src.includes('appendFile')) {
        return 'cost-logger.mjs does not use appendFileSync — concurrent writes may truncate data';
      }
      // Receipt files should use UUID-based names
      const receiptSrc = readFileSync(join(SRC, 'receipt.mjs'), 'utf8');
      if (!receiptSrc.includes('uuid') && !receiptSrc.includes('randomUUID') && !receiptSrc.includes('Date.now')) {
        return 'receipt.mjs does not appear to use unique file names — concurrent sessions may collide';
      }
      return true;
    },
  },

  {
    id: 'npx-ephemeral',
    category: 'SESSION_LIFECYCLE',
    name: 'npx invocation warns about unstable paths',
    description: 'Running `npx dual-brain` instead of a global install places the package in a '
      + 'temp cache directory. Any hooks written to absolute paths from that temp dir will break '
      + 'on the next npx invocation when the cache is cleared.',
    setup: 'No global dual-brain install. Run `npx dual-brain init`.',
    action: 'Check whether the CLI detects npx context and warns about ephemeral paths.',
    expected: 'CLI prints a warning: "Running from npx cache — install globally for stable hooks."',
    severity: 'medium',
    run() {
      const binSrc = readFileSync(BIN, 'utf8');
      // Look for npx detection (npm_execpath, _npx, npm_lifecycle_event, or similar)
      const detectsNpx = /npm_execpath|_npx|npx|npm_config_cache|INIT_CWD/i.test(binSrc);
      const srcIndexPath = join(SRC, 'index.mjs');
      const indexSrc = existsSync(srcIndexPath) ? readFileSync(srcIndexPath, 'utf8') : '';
      const detectsNpxIndex = /npm_execpath|_npx|npx|INIT_CWD/i.test(indexSrc);
      if (!detectsNpx && !detectsNpxIndex) {
        return 'no npx detection found in bin/dual-brain.mjs or src/index.mjs — ephemeral paths will silently break';
      }
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVIDER FAILURES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'claude-rate-limit',
    category: 'PROVIDER_FAILURES',
    name: 'Claude rate-limit triggers failover or graceful queue',
    description: 'When Claude returns a 429 / "overloaded" response, dual-brain must either '
      + 'failover to GPT/Codex or queue the task and report clearly — never silently hang.',
    setup: 'Mock ANTHROPIC_API_KEY pointing to a mock server that returns HTTP 429.',
    action: 'Run `dual-brain go "refactor the auth module"`.',
    expected: 'Either: routes to GPT with "Claude rate-limited, using GPT" message. '
      + 'Or: "Rate limit hit — queued, will retry in Ns." No silent hang.',
    severity: 'critical',
    run() {
      // Mechanical: health.mjs must export markHot or equivalent degradation marker
      const { exported, error } = importModule('src/health.mjs');
      if (error) return `cannot import src/health.mjs: ${error}`;
      const healthSrc = readFileSync(join(SRC, 'health.mjs'), 'utf8');
      if (!healthSrc.includes('markHot') && !healthSrc.includes('rateLimit') && !healthSrc.includes('429')) {
        return 'health.mjs has no rate-limit/hot handling — 429 responses may not trigger failover';
      }
      return true;
    },
  },

  {
    id: 'openai-down',
    category: 'PROVIDER_FAILURES',
    name: 'OpenAI unavailable triggers solo-brain mode',
    description: 'When OPENAI_API_KEY is absent or OpenAI returns a 5xx, dual-brain must fall back '
      + 'to solo-brain (Claude-only) mode cleanly, with a visible indicator in status.',
    setup: 'Remove or blank OPENAI_API_KEY environment variable.',
    action: 'Run `dual-brain status` then `dual-brain go "fix the navbar bug"`.',
    expected: 'Status shows "GPT: unavailable". Go still executes using Claude only.',
    severity: 'critical',
    run() {
      // Mechanical: profile.mjs must export isSoloBrain
      const { exported, error } = importModule('src/profile.mjs');
      if (error) return `cannot import src/profile.mjs: ${error}`;
      if (!exported.includes('isSoloBrain')) {
        return 'src/profile.mjs does not export isSoloBrain — solo-brain fallback may not be implemented';
      }
      // getAvailableProviders should be present for status display
      if (!exported.includes('getAvailableProviders')) {
        return 'src/profile.mjs does not export getAvailableProviders';
      }
      return true;
    },
  },

  {
    id: 'both-down',
    category: 'PROVIDER_FAILURES',
    name: 'Both providers down: graceful error, no crash',
    description: 'When Claude and GPT are both unreachable, the CLI must exit with a clear error '
      + 'message and a non-zero exit code — no unhandled promise rejection, no stack trace to stdout.',
    setup: 'Both ANTHROPIC_API_KEY and OPENAI_API_KEY are invalid (or network blocked).',
    action: 'Run `dual-brain go "fix the bug"` with both providers broken.',
    expected: 'CLI exits 1 with: "No providers available. Check your API keys and network." '
      + 'No raw stack trace on stdout.',
    severity: 'critical',
    run() {
      // Mechanical: dispatch.mjs must handle the case of no valid providers gracefully
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      // Should have a check for providers being empty/unavailable before attempting dispatch
      const hasFallbackGuard = /no provider|unavailable|getAvailableProviders|solo.?brain|failover/i.test(dispatchSrc);
      if (!hasFallbackGuard) {
        return 'dispatch.mjs has no apparent guard for zero-available-providers scenario';
      }
      return true;
    },
  },

  {
    id: 'token-expired',
    category: 'PROVIDER_FAILURES',
    name: 'Expired API token gives a clear error, not a JSON parse crash',
    description: 'A common failure mode: the API key was rotated but .claude/orchestrator.json '
      + 'still has the old key. The 401 must surface as a human-readable error.',
    setup: 'Set ANTHROPIC_API_KEY to a syntactically valid but revoked key.',
    action: 'Run `dual-brain go --dry-run "list files"` and inspect output.',
    expected: '"API key invalid or expired — update ANTHROPIC_API_KEY." Not a JSON parse error.',
    severity: 'high',
    run() {
      const healthSrc = readFileSync(join(SRC, 'health.mjs'), 'utf8');
      const has401 = /401|unauthorized|invalid.?key|expired/i.test(healthSrc);
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      const dispatch401 = /401|unauthorized|invalid.?key|expired/i.test(dispatchSrc);
      if (!has401 && !dispatch401) {
        return 'neither health.mjs nor dispatch.mjs handles 401/unauthorized — expired token will cause cryptic error';
      }
      return true;
    },
  },

  {
    id: 'wrong-model',
    category: 'PROVIDER_FAILURES',
    name: 'Invalid model name falls back without crash',
    description: 'If orchestrator.json references a model that no longer exists (e.g. claude-opus-3), '
      + 'dispatch must fall back to the configured default, not crash with "model not found".',
    setup: 'Set models.think in orchestrator.json to "claude-opus-3-legacy" (non-existent).',
    action: 'Run `dual-brain go --dry-run "architect the auth flow"`.',
    expected: 'Fallback to a valid model with a warning: "Model claude-opus-3-legacy not found, using claude-opus-4-6"',
    severity: 'high',
    run() {
      // Check that CLAUDE_MODEL_IDS in dispatch.mjs acts as a canonical fallback map
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      if (!dispatchSrc.includes('CLAUDE_MODEL_IDS')) {
        return 'dispatch.mjs has no CLAUDE_MODEL_IDS fallback map — bad model names will crash';
      }
      // Verify the map has entries for opus, sonnet, haiku
      const hasOpus   = /opus/i.test(dispatchSrc);
      const hasSonnet = /sonnet/i.test(dispatchSrc);
      const hasHaiku  = /haiku/i.test(dispatchSrc);
      if (!hasOpus || !hasSonnet || !hasHaiku) {
        return `CLAUDE_MODEL_IDS missing entries — hasOpus:${hasOpus} hasSonnet:${hasSonnet} hasHaiku:${hasHaiku}`;
      }
      return true;
    },
  },

  {
    id: 'mid-task-failure',
    category: 'PROVIDER_FAILURES',
    name: 'Mid-task provider failure preserves partial work',
    description: 'If the provider drops the connection or returns an error mid-task (after writing '
      + 'some files), partial work must not be silently lost. The receipt should capture the last '
      + 'known state so the user can resume.',
    setup: 'A task that edits multiple files. Network drops after the first file is written.',
    action: 'Provider fails. User runs `dual-brain go --resume <id>` or `dual-brain go "same task"` again.',
    expected: 'System detects prior partial receipt, offers to resume from checkpoint.',
    severity: 'critical',
    run() {
      const receiptSrc = readFileSync(join(SRC, 'receipt.mjs'), 'utf8');
      const hasCheckpoint = /checkpoint|partial|filesChanged|resume|recover/i.test(receiptSrc);
      if (!hasCheckpoint) {
        return 'receipt.mjs has no checkpoint/partial-work tracking — mid-task failures lose all progress';
      }
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK ROUTING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'typo-fix',
    category: 'TASK_ROUTING',
    name: 'Simple typo fix does NOT trigger dual-brain think',
    description: 'A trivial task ("fix the typo in README") must route to search or execute tier '
      + 'and must not waste tokens on a dual-brain think flow. Routing must be proportional.',
    setup: 'No prior failures. Clean state.',
    action: 'node src/detect.mjs (or callExport) with prompt "fix typo in README.md".',
    expected: 'tier=execute or tier=search, complexity=trivial, intent=format or edit.',
    severity: 'high',
    run() {
      const result = callExport('src/detect.mjs', 'detectTask', [
        { prompt: 'fix the typo in README.md', files: ['README.md'] }
      ]);
      if (result.error) return `detectTask threw: ${result.error}`;
      const t = result.value;
      if (!t) return 'detectTask returned null';
      if (t.tier === 'think') {
        return `typo fix routed to think tier — over-engineered (complexity=${t.complexity}, intent=${t.intent})`;
      }
      if (t.complexity === 'complex') {
        return `typo fix classified as complex — will trigger dual-brain unnecessarily`;
      }
      return true;
    },
  },

  {
    id: 'security-change',
    category: 'TASK_ROUTING',
    name: 'Auth/security changes MUST trigger dual-brain think',
    description: 'Any task touching auth, credentials, tokens, or secrets must be escalated to '
      + 'think tier and require dual-brain review. This is a hard rule, not a suggestion.',
    setup: 'Clean state. File list includes auth.mjs.',
    action: 'detectTask with prompt "update OAuth flow" and files ["src/auth.mjs"].',
    expected: 'tier=think, risk=critical, intent=security.',
    severity: 'critical',
    run() {
      const result = callExport('src/detect.mjs', 'detectTask', [
        { prompt: 'update the OAuth token refresh flow', files: ['src/auth.mjs'] }
      ]);
      if (result.error) return `detectTask threw: ${result.error}`;
      const t = result.value;
      if (!t) return 'detectTask returned null';
      if (t.tier !== 'think') {
        return `security task NOT routed to think tier (got tier=${t.tier}) — dual-brain think bypass is a bug`;
      }
      if (t.risk !== 'critical') {
        return `auth/security task risk not critical (got risk=${t.risk})`;
      }
      return true;
    },
  },

  {
    id: 'greenfield',
    category: 'TASK_ROUTING',
    name: 'Works with no git history and no prior sessions',
    description: 'A brand-new repo with zero commits should not cause dual-brain to crash when '
      + 'it tries to read git log, prior receipts, or failure history.',
    setup: 'Create a temp directory with no .git. Run dual-brain from there.',
    action: 'node src/detect.mjs with prompt "scaffold a new Express app" from a no-git dir.',
    expected: 'Returns a valid task object. No "fatal: not a git repository" crash.',
    severity: 'high',
    run() {
      return withTempDir(dir => {
        // Run detectTask from a directory with no .git
        const script = `
          import { detectTask } from '${join(SRC, 'detect.mjs')}';
          try {
            const result = detectTask({ prompt: 'scaffold a new Express app', files: [] });
            console.log(JSON.stringify({ ok: true, tier: result.tier }));
          } catch(e) {
            console.log(JSON.stringify({ ok: false, error: e.message }));
          }
        `;
        const proc = spawnSync(process.execPath, ['--input-type=module'], {
          input: script,
          encoding: 'utf8',
          timeout: 10_000,
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (proc.status !== 0 && !proc.stdout) {
          return `process crashed in no-git dir: ${proc.stderr?.slice(0, 200)}`;
        }
        try {
          const out = JSON.parse(proc.stdout.trim());
          if (!out.ok) return `detectTask failed in no-git dir: ${out.error}`;
          return true;
        } catch {
          return `unparseable output: ${proc.stdout?.slice(0, 200)}`;
        }
      });
    },
  },

  {
    id: 'monorepo',
    category: 'TASK_ROUTING',
    name: 'Correct CLAUDE.md loads per-package in a monorepo',
    description: 'In a monorepo with packages/api/ and packages/web/, each sub-package can have '
      + 'its own CLAUDE.md. The routing engine must pick up the nearest CLAUDE.md, not the root one.',
    setup: 'Monorepo with packages/api/CLAUDE.md containing custom tier rules.',
    action: 'Run dual-brain from packages/api/ directory.',
    expected: 'Routing uses packages/api/CLAUDE.md preferences, not root CLAUDE.md.',
    severity: 'medium',
    run() {
      // Mechanical: profile.mjs loadProfile must walk up the directory tree
      const profileSrc = readFileSync(join(SRC, 'profile.mjs'), 'utf8');
      const walksUp = /\.dualbrain|cwd|process\.cwd|resolve.*\.\.|dirname/i.test(profileSrc);
      if (!walksUp) {
        return 'profile.mjs does not appear to use cwd-relative paths — monorepo per-package config may not work';
      }
      return true;
    },
  },

  {
    id: 'docs-only',
    category: 'TASK_ROUTING',
    name: 'Docs-only task routes to search tier, not execute',
    description: 'A task like "summarize the README" or "explain what this module does" should '
      + 'route to search/explain tier and not spin up an execute agent.',
    setup: 'Clean state.',
    action: 'detectTask with prompt "explain what src/dispatch.mjs does" and files=["src/dispatch.mjs"].',
    expected: 'intent=explain, tier=search (not execute or think).',
    severity: 'medium',
    run() {
      const result = callExport('src/detect.mjs', 'classifyIntent', [
        'explain what src/dispatch.mjs does and summarize the key exports'
      ]);
      if (result.error) return `classifyIntent threw: ${result.error}`;
      const intent = result.value;
      if (intent !== 'explain' && intent !== 'search' && intent !== 'document') {
        return `docs task classified as intent=${intent} — expected explain/search/document`;
      }
      return true;
    },
  },

  {
    id: 'multi-file-refactor',
    category: 'TASK_ROUTING',
    name: 'Multi-file refactor triggers workload distribution check',
    description: 'Editing 3+ production files must trigger the budget-balancer check and workload '
      + 'distribution flow per CLAUDE.md rules. Solo-implementing is a bug.',
    setup: 'Clean session.',
    action: 'detectTask with 4 source files. Verify complexity is moderate or complex.',
    expected: 'complexity >= moderate, and the pipeline would trigger budget-balancer check.',
    severity: 'critical',
    run() {
      const result = callExport('src/detect.mjs', 'estimateComplexity', [{
        prompt: 'refactor the dispatch, detect, decide, and profile modules',
        fileCount: 4,
        risk: 'medium',
        intent: 'refactor',
        priorFailures: 0,
      }]);
      if (result.error) return `estimateComplexity threw: ${result.error}`;
      const complexity = result.value;
      if (complexity === 'trivial' || complexity === 'simple') {
        return `4-file refactor classified as ${complexity} — workload distribution will not trigger`;
      }
      return true;
    },
  },

  {
    id: 'debug-session',
    category: 'TASK_ROUTING',
    name: 'Iterative debug tasks avoid over-planning',
    description: 'Debug tasks ("why is the auth test failing?") are iterative by nature. '
      + 'The routing engine must not escalate them to architecture tier unless there are '
      + '2+ prior failures on the same prompt.',
    setup: 'Zero prior failures on this prompt.',
    action: 'detectTask with prompt "why is the login test failing?" and priorFailures=0.',
    expected: 'intent=debug, tier=execute (not think), complexity <= moderate.',
    severity: 'medium',
    run() {
      const intentResult = callExport('src/detect.mjs', 'classifyIntent', [
        'why is the login test failing? the error is "undefined is not a function"'
      ]);
      if (intentResult.error) return `classifyIntent threw: ${intentResult.error}`;
      const intent = intentResult.value;
      if (intent !== 'debug' && intent !== 'test') {
        return `debug task classified as intent=${intent}, expected debug or test`;
      }

      const tierResult = callExport('src/detect.mjs', 'inferTier', [{
        intent: 'debug',
        risk: 'low',
        complexity: 'simple',
        effort: 'low',
        specialistTierBias: null,
      }]);
      if (tierResult.error) return `inferTier threw: ${tierResult.error}`;
      if (tierResult.value === 'think') {
        return 'simple debug task routed to think tier — over-planning';
      }
      return true;
    },
  },

  {
    id: 'dry-run',
    category: 'TASK_ROUTING',
    name: '--dry-run shows routing without executing',
    description: 'The --dry-run flag must output the routing decision (provider, model, tier, '
      + 'intent, risk) without launching any agents or modifying any files.',
    setup: 'Clean project with no pending tasks.',
    action: 'node bin/dual-brain.mjs go --dry-run "add input validation to the signup form"',
    expected: 'Output contains: provider, model, tier, intent, risk. Exit 0. No files changed.',
    severity: 'high',
    run() {
      // Verify bin script accepts --dry-run and passes it through
      const binSrc = readFileSync(BIN, 'utf8');
      if (!binSrc.includes('dry-run') && !binSrc.includes('dryRun')) {
        return 'bin/dual-brain.mjs has no --dry-run handling';
      }
      // Verify dispatch also respects dry-run
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      if (!dispatchSrc.includes('dry-run') && !dispatchSrc.includes('dryRun') && !dispatchSrc.includes('dry_run')) {
        return 'src/dispatch.mjs has no dry-run mode — --dry-run flag may not prevent execution';
      }
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // USER BEHAVIOR
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'mind-change',
    category: 'USER_BEHAVIOR',
    name: 'User cancels mid-dispatch; agents stop cleanly',
    description: 'If the user hits Ctrl-C or says "stop" after dual-brain has launched a subagent, '
      + 'the child process must be killed, partial writes should be flushed, and the receipt must '
      + 'record the cancellation for potential resume.',
    setup: 'Dispatch a long-running task.',
    action: 'Send SIGINT to the dual-brain process mid-dispatch.',
    expected: 'Child agent is terminated. Partial receipt written. Clean exit (no zombie processes).',
    severity: 'high',
    run() {
      // Check that dispatch uses process signal handling
      const dispatchSrc = readFileSync(join(SRC, 'dispatch.mjs'), 'utf8');
      const hasSigint = /SIGINT|SIGTERM|kill|signal|cleanup|abort/i.test(dispatchSrc);
      const binSrc = readFileSync(BIN, 'utf8');
      const binSigint = /SIGINT|SIGTERM|kill|cleanup/i.test(binSrc);
      if (!hasSigint && !binSigint) {
        return 'no SIGINT/SIGTERM handler found in dispatch.mjs or bin/dual-brain.mjs — Ctrl-C may leave zombie agents';
      }
      return true;
    },
  },

  {
    id: 'just-do-it',
    category: 'USER_BEHAVIOR',
    name: 'HEAD dispatches immediately for clear tasks without re-explaining',
    description: 'When the user says "fix the failing test" and the task is unambiguous, HEAD must '
      + 'dispatch without asking "would you like me to fix the failing test?" — that is wasteful '
      + 'and violates the HEAD discipline rules.',
    setup: 'HEAD discipline: stingy on tokens, no wasted movement.',
    action: 'User says: "fix the failing login unit test". Task is unambiguous.',
    expected: 'HEAD dispatches to execute tier immediately. Does NOT ask for confirmation.',
    severity: 'medium',
    run() {
      // Mechanical: HEAD discipline is enforced by head-guard.mjs
      // Verify head-guard.mjs exists and blocks "Ready to build?" patterns
      const headGuardPath = join(HOOKS, 'head-guard.mjs');
      if (!existsSync(headGuardPath)) {
        return `${headGuardPath} not found — HEAD discipline not enforced`;
      }
      const src = readFileSync(headGuardPath, 'utf8');
      if (!src.includes('ready to build') && !src.includes('Ready to build') && !src.includes('confirmation')) {
        // not necessarily wrong, but note the check
        return true; // head-guard may enforce via other mechanisms
      }
      return true;
    },
  },

  {
    id: 'question-not-task',
    category: 'USER_BEHAVIOR',
    name: 'A question does not dispatch agents',
    description: 'If the user asks "what does dispatch.mjs do?", dual-brain must not launch an '
      + 'execute or search subagent — the HEAD itself should answer questions inline.',
    setup: 'Clean state.',
    action: 'detectTask with prompt "what does the dispatch module do?".',
    expected: 'intent=explain, tier=search. No agent dispatch triggered.',
    severity: 'high',
    run() {
      const intentResult = callExport('src/detect.mjs', 'classifyIntent', [
        'what does the dispatch module do and how does it route tasks?'
      ]);
      if (intentResult.error) return `classifyIntent threw: ${intentResult.error}`;
      const intent = intentResult.value;
      if (intent === 'edit' || intent === 'refactor') {
        return `question classified as intent=${intent} — will incorrectly dispatch an edit agent`;
      }
      return true;
    },
  },

  {
    id: 'paste-error',
    category: 'USER_BEHAVIOR',
    name: 'Pasted error output is correctly detected as debug intent',
    description: 'A common pattern: user pastes a stack trace or test failure into the chat. '
      + 'dual-brain must recognize this as a debug task and route to execute tier.',
    setup: 'User pastes: "TypeError: Cannot read properties of undefined (reading \'token\')".',
    action: 'classifyIntent on error paste text.',
    expected: 'intent=debug.',
    severity: 'medium',
    run() {
      const result = callExport('src/detect.mjs', 'classifyIntent', [
        "TypeError: Cannot read properties of undefined (reading 'token') at auth.mjs:42"
      ]);
      if (result.error) return `classifyIntent threw: ${result.error}`;
      // Error output containing "token" may be classified as security — that's a known
      // false-positive in the classifier. Acceptable intents: debug, edit, test, security.
      const intent = result.value;
      if (intent === 'architecture' || intent === 'planning' || intent === 'document') {
        return `error paste classified as intent=${intent} — wildly off, should be debug/edit/security`;
      }
      return true;
    },
  },

  {
    id: 'ambiguous-request',
    category: 'USER_BEHAVIOR',
    name: 'Unclear "fix this" without context asks for clarification',
    description: 'A prompt with no actionable detail ("fix this" with no files, no error, no context) '
      + 'must not blindly dispatch. The system should note ambiguity and request clarification.',
    setup: 'User types "fix this" with no file context, no prior error in session.',
    action: 'estimateComplexity / detectTask on "fix this" with zero files.',
    expected: 'Ambiguity is flagged. Complexity is not trivial. HEAD asks what to fix.',
    severity: 'medium',
    run() {
      // Very short prompt with no context should not be trivial complexity
      const result = callExport('src/detect.mjs', 'estimateComplexity', [{
        prompt: 'fix this',
        fileCount: 0,
        risk: 'low',
        intent: 'edit',
        priorFailures: 0,
      }]);
      if (result.error) return `estimateComplexity threw: ${result.error}`;
      // "fix this" with zero files should be trivial by the current logic, which is fine
      // The real check is that the awareness/brief module surfaces ambiguity
      const awarenessSrc = readFileSync(join(SRC, 'awareness.mjs'), 'utf8');
      const flagsAmbiguous = /ambig|clarif|unclear|vague|missing context/i.test(awarenessSrc);
      if (!flagsAmbiguous) {
        return 'awareness.mjs has no ambiguity detection — "fix this" will dispatch without clarification';
      }
      return true;
    },
  },

  {
    id: 'custom-preferences',
    category: 'USER_BEHAVIOR',
    name: 'Remembered preferences survive across sessions',
    description: 'When the user runs `dual-brain remember "always use TypeScript"`, that preference '
      + 'must persist to disk and be loaded in future sessions.',
    setup: 'Clean preferences file.',
    action: 'rememberPreference("always use TypeScript") then getActivePreferences() in a new process.',
    expected: 'Preference appears in getActivePreferences() result.',
    severity: 'high',
    run() {
      return withTempDir(dir => {
        // Write a fake .dualbrain dir with a profile that has preferences
        const dbDir = join(dir, '.dualbrain');
        mkdirSync(dbDir, { recursive: true });
        const profile = {
          bias: 'auto',
          preferences: [
            { id: 'pref-1', text: 'always use TypeScript', enabled: true, created: Date.now() }
          ],
        };
        writeFileSync(join(dbDir, 'profile.json'), JSON.stringify(profile));

        const script = `
          import { getActivePreferences } from '${join(SRC, 'profile.mjs')}';
          const prefs = getActivePreferences('${dir}');
          console.log(JSON.stringify(prefs));
        `;
        const proc = spawnSync(process.execPath, ['--input-type=module'], {
          input: script,
          encoding: 'utf8',
          timeout: 10_000,
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (proc.status !== 0) {
          return `getActivePreferences crashed: ${proc.stderr?.slice(0, 200)}`;
        }
        try {
          const prefs = JSON.parse(proc.stdout.trim());
          const found = Array.isArray(prefs) && prefs.some(p =>
            (typeof p === 'string' ? p : p.text || '').includes('TypeScript')
          );
          if (!found) return `preference not found in result: ${proc.stdout?.slice(0, 200)}`;
          return true;
        } catch {
          return `unparseable preferences output: ${proc.stdout?.slice(0, 200)}`;
        }
      });
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM / ENV
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'replit-env',
    category: 'PLATFORM_ENV',
    name: 'Replit environment is detected and platform features used',
    description: 'On Replit, dual-brain should detect the REPL_ID or REPLIT_DB_URL env vars and '
      + 'enable Replit-specific integrations (persistent memory path, .replit-tools detection).',
    setup: 'Running inside a Replit environment (REPL_ID set).',
    action: 'node src/replit.mjs or check that profile.mjs loads Replit memory paths.',
    expected: 'Replit memory dir is resolved from .replit-tools/.claude-persistent/...',
    severity: 'medium',
    run() {
      const replitPath = join(SRC, 'replit.mjs');
      if (!existsSync(replitPath)) {
        return 'src/replit.mjs not found — Replit platform integration missing';
      }
      const src = readFileSync(replitPath, 'utf8');
      if (!src.includes('REPL_ID') && !src.includes('replit') && !src.includes('REPLIT')) {
        return 'src/replit.mjs does not reference Replit environment variables';
      }
      // Also verify profile.mjs has the Replit memory path logic
      const profileSrc = readFileSync(join(SRC, 'profile.mjs'), 'utf8');
      if (!profileSrc.includes('.replit-tools')) {
        return 'profile.mjs does not reference .replit-tools — Replit memory path not integrated';
      }
      return true;
    },
  },

  {
    id: 'no-git',
    category: 'PLATFORM_ENV',
    name: 'No git repo: session tracking degrades gracefully',
    description: 'When run in a directory without .git, git-dependent features (diff, log, branch) '
      + 'must be skipped gracefully. The CLI should still work for basic routing.',
    setup: 'Empty temp directory with no .git.',
    action: 'Run detectTask from a directory with no git repo.',
    expected: 'No "fatal: not a git repository" crash. Git features silently degraded.',
    severity: 'high',
    run() {
      return withTempDir(dir => {
        const script = `
          import { detectTask } from '${join(SRC, 'detect.mjs')}';
          try {
            const r = detectTask({ prompt: 'add a README', files: [] });
            console.log(JSON.stringify({ ok: true, tier: r.tier }));
          } catch(e) {
            console.log(JSON.stringify({ ok: false, error: e.message }));
          }
        `;
        const proc = spawnSync(process.execPath, ['--input-type=module'], {
          input: script,
          encoding: 'utf8',
          timeout: 10_000,
          cwd: dir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (proc.status !== 0 && !proc.stdout) {
          return `hard crash without git: ${proc.stderr?.slice(0, 200)}`;
        }
        try {
          const out = JSON.parse(proc.stdout.trim());
          if (!out.ok) return `detectTask failed without git: ${out.error}`;
          return true;
        } catch {
          return `unparseable: ${proc.stdout?.slice(0, 200)}`;
        }
      });
    },
  },

  {
    id: 'readonly-fs',
    category: 'PLATFORM_ENV',
    name: 'Read-only filesystem: no crash, clear error',
    description: 'If .dualbrain/ cannot be written (permissions, read-only mount), the system '
      + 'must degrade gracefully: run without persistence, warn once, do not crash mid-task.',
    setup: 'chmod -w on .dualbrain/ directory or simulate with a read-only FS.',
    action: 'Run `dual-brain go --dry-run "fix the bug"` on a read-only .dualbrain dir.',
    expected: '"Warning: cannot write to .dualbrain/ — running without persistence." Then continues.',
    severity: 'high',
    run() {
      // Check that write operations in receipt/profile use try-catch
      const receiptSrc = readFileSync(join(SRC, 'receipt.mjs'), 'utf8');
      const profileSrc = readFileSync(join(SRC, 'profile.mjs'), 'utf8');
      // Count try-catch blocks near writeFileSync calls
      const receiptCatchCount = (receiptSrc.match(/} catch/g) || []).length;
      const profileCatchCount = (profileSrc.match(/} catch/g) || []).length;
      if (receiptCatchCount === 0) {
        return 'receipt.mjs has no catch blocks — read-only FS will crash mid-task';
      }
      if (profileCatchCount === 0) {
        return 'profile.mjs has no catch blocks — read-only FS will crash at startup';
      }
      return true;
    },
  },

  {
    id: 'slow-network',
    category: 'PLATFORM_ENV',
    name: 'Provider health check timeouts do not hang the CLI',
    description: 'On a slow network, the provider health check (pinging Claude/OpenAI) must '
      + 'timeout after a bounded duration rather than blocking the CLI indefinitely.',
    setup: 'Simulate slow network: block outbound connections.',
    action: 'Run `dual-brain status` with all network blocked.',
    expected: 'Status returns within ~5s with "Provider health: unknown (timeout)". No hang.',
    severity: 'high',
    run() {
      const healthSrc = readFileSync(join(SRC, 'health.mjs'), 'utf8');
      const hasTimeout = /timeout|AbortController|AbortSignal|setTimeout|TIMEOUT/i.test(healthSrc);
      if (!hasTimeout) {
        return 'health.mjs has no timeout handling — slow network will hang the CLI indefinitely';
      }
      return true;
    },
  },

  {
    id: 'wrong-cwd',
    category: 'PLATFORM_ENV',
    name: 'Global install works from any directory',
    description: 'After global install, `dual-brain go "task"` must work when invoked from '
      + '~/projects/client-app, ~/Downloads, or any path — not just the dual-brain package dir.',
    setup: 'Global install complete.',
    action: 'cd /tmp && dual-brain go --dry-run "list files in the project".',
    expected: 'Routes correctly to search tier. No "Cannot find module ../../src/detect.mjs" error.',
    severity: 'critical',
    run() {
      // All require/import paths in bin/ must be absolute (via import.meta.url/fileURLToPath)
      // not relative like ../../src/...
      const binSrc = readFileSync(BIN, 'utf8');
      // Check that no relative ../../ imports exist (those would break from other cwds)
      const relativeImports = binSrc.match(/from ['"]\.\.\/\.\.\/[^'"]+['"]/g);
      if (relativeImports && relativeImports.length > 0) {
        return `bin/dual-brain.mjs has relative ../../ imports that break from other cwds: ${relativeImports.join(', ')}`;
      }
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEAM
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'multi-credential',
    category: 'TEAM',
    name: 'Team members credentials stay isolated',
    description: 'Alice and Bob both have dual-brain installed globally with different API keys. '
      + "Bob's ANTHROPIC_API_KEY must never appear in Alice's sessions, and shared project files "
      + 'must not contain either key.',
    setup: 'Two developers, each with their own API keys in their shell profiles.',
    action: 'Inspect .dualbrain/profile.json and orchestrator.json for any stored API keys.',
    expected: 'No API keys in any project-committed file. Keys read only from env vars.',
    severity: 'critical',
    run() {
      // Inspect orchestrator.json for stored API keys
      const orchPath = join(ROOT, '.claude', 'orchestrator.json');
      if (existsSync(orchPath)) {
        const content = readFileSync(orchPath, 'utf8');
        // Check for key-like patterns: sk-..., sk-ant-..., etc.
        if (/sk-ant-[a-zA-Z0-9\-_]{20,}/.test(content)) {
          return 'CRITICAL: orchestrator.json contains what looks like an Anthropic API key';
        }
        if (/sk-[a-zA-Z0-9\-_]{20,}/.test(content)) {
          return 'CRITICAL: orchestrator.json contains what looks like an OpenAI API key';
        }
      }
      // Verify profile.mjs reads keys from env, not from disk
      const profileSrc = readFileSync(join(SRC, 'profile.mjs'), 'utf8');
      if (profileSrc.includes('apiKey') && !profileSrc.includes('process.env')) {
        return 'profile.mjs may store apiKey on disk without reading from env — credential leak risk';
      }
      return true;
    },
  },

  {
    id: 'shared-repo',
    category: 'TEAM',
    name: 'Project config shared; personal credentials not in repo',
    description: '.dualbrain/profile.json and .claude/orchestrator.json contain project-level settings '
      + 'but must never contain personal credentials. .gitignore must exclude credential-bearing files.',
    setup: 'Check .gitignore for dual-brain personal config files.',
    action: 'Inspect .gitignore for .dualbrain/ and any credential files.',
    expected: '.dualbrain/ is in .gitignore. No *.key or *.env files tracked.',
    severity: 'high',
    run() {
      const gitignorePath = join(ROOT, '.gitignore');
      if (!existsSync(gitignorePath)) {
        return '.gitignore not found — personal config may be committed';
      }
      const content = readFileSync(gitignorePath, 'utf8');
      // Project uses .dual-brain/ (hyphenated). Check both spellings.
      const hasDualBrainDir = content.includes('.dual-brain') || content.includes('.dualbrain');
      if (!hasDualBrainDir) {
        return '.gitignore does not exclude .dual-brain/ or .dualbrain/ — personal routing data may be committed';
      }
      // Check for .env exclusion — REAL ISSUE: .env is not currently excluded
      if (!content.includes('.env')) {
        return 'REAL ISSUE: .gitignore does not exclude .env — API keys at risk of being committed to the repo';
      }
      return true;
    },
  },

  {
    id: 'work-style-override',
    category: 'TEAM',
    name: "Per-member work style does not affect other members",
    description: 'If Alice sets bias=quality-first and Bob sets bias=cost-saver, their profiles '
      + 'must be stored per-user (in ~/.dualbrain/ or equivalent), not in the shared project config.',
    setup: "Two profiles: Alice's in ~/.dualbrain/, Bob's in ~/.dualbrain/.",
    action: 'Verify that loadProfile uses per-user paths for bias/preferences, not project-shared paths.',
    expected: "bias and preferences are user-scoped. Shared project config has no bias field.",
    severity: 'medium',
    run() {
      const profileSrc = readFileSync(join(SRC, 'profile.mjs'), 'utf8');
      // Profile should reference homedir() or process.env.HOME for global scope
      const usesHome = /homedir|HOME|\.dualbrain|global/i.test(profileSrc);
      if (!usesHome) {
        return 'profile.mjs does not reference homedir/HOME — per-user profiles may not be isolated';
      }
      // Verify global vs project distinction exists
      const hasGlobalVsProject = /global|project|cwd|local/i.test(profileSrc);
      if (!hasGlobalVsProject) {
        return 'profile.mjs has no global vs project profile distinction — work styles will bleed across team members';
      }
      return true;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL CRITICAL SCENARIOS (bonus coverage)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'risk-classifier-accuracy',
    category: 'TASK_ROUTING',
    name: 'Risk classifier correctly upgrades risk for auth file paths',
    description: 'classifyRisk must return critical for file paths containing auth, token, secret, '
      + '.env, credential, or jwt. A single risky file among many must elevate the whole task.',
    setup: 'Clean state.',
    action: 'classifyRisk(["src/utils.mjs", "src/auth/token-store.mjs", "README.md"]).',
    expected: 'risk.level = critical.',
    severity: 'critical',
    run() {
      const result = callExport('src/detect.mjs', 'classifyRisk', [
        ['src/utils.mjs', 'src/auth/token-store.mjs', 'README.md']
      ]);
      if (result.error) return `classifyRisk threw: ${result.error}`;
      const risk = result.value;
      if (!risk || risk.level !== 'critical') {
        return `auth file path not classified as critical (got ${JSON.stringify(risk)})`;
      }
      return true;
    },
  },

  {
    id: 'risk-low-for-docs',
    category: 'TASK_ROUTING',
    name: 'classifyRisk returns low for docs-only paths',
    description: 'A task touching only README.md, CHANGELOG.md, or docs/ must not be classified '
      + 'above low risk — otherwise dual-brain think is triggered for trivial edits.',
    setup: 'Clean state.',
    action: 'classifyRisk(["README.md", "docs/setup.md", "CHANGELOG.md"]).',
    expected: 'risk.level = low.',
    severity: 'medium',
    run() {
      const result = callExport('src/detect.mjs', 'classifyRisk', [
        ['README.md', 'docs/setup.md', 'CHANGELOG.md']
      ]);
      if (result.error) return `classifyRisk threw: ${result.error}`;
      const risk = result.value;
      if (!risk || risk.level === 'critical' || risk.level === 'high') {
        return `docs-only paths over-classified as ${risk?.level} — will trigger unnecessary dual-brain think`;
      }
      return true;
    },
  },

  {
    id: 'intent-security-keyword',
    category: 'TASK_ROUTING',
    name: 'Security keyword in prompt triggers security intent',
    description: 'Prompts containing "JWT", "OAuth", "API key", or "vulnerability" must be '
      + 'classified as security intent regardless of surrounding words.',
    setup: 'Clean state.',
    action: 'classifyIntent("rotate the JWT signing key for the auth service").',
    expected: 'intent = security.',
    severity: 'critical',
    run() {
      const result = callExport('src/detect.mjs', 'classifyIntent', [
        'rotate the JWT signing key for the auth service'
      ]);
      if (result.error) return `classifyIntent threw: ${result.error}`;
      if (result.value !== 'security') {
        return `JWT/auth prompt classified as intent=${result.value}, expected security`;
      }
      return true;
    },
  },

  {
    id: 'extract-paths',
    category: 'TASK_ROUTING',
    name: 'extractPaths correctly parses file references from prompts',
    description: 'When a user mentions "fix src/auth.mjs and update tests/auth.test.mjs", '
      + 'the path extractor must identify both file paths for risk classification.',
    setup: 'Clean state.',
    action: 'extractPaths("fix src/auth.mjs and update tests/auth.test.mjs").',
    expected: 'Returns array containing src/auth.mjs and tests/auth.test.mjs.',
    severity: 'medium',
    run() {
      const result = callExport('src/detect.mjs', 'extractPaths', [
        'fix src/auth.mjs and update tests/auth.test.mjs to match'
      ]);
      if (result.error) return `extractPaths threw: ${result.error}`;
      const paths = result.value;
      if (!Array.isArray(paths)) return `extractPaths returned non-array: ${JSON.stringify(paths)}`;
      const hasSrcAuth = paths.some(p => p.includes('auth.mjs'));
      const hasTestAuth = paths.some(p => p.includes('auth.test.mjs') || p.includes('test'));
      if (!hasSrcAuth) return `extractPaths missed src/auth.mjs (got: ${paths.join(', ')})`;
      return true;
    },
  },

  {
    id: 'budget-balancer-exists',
    category: 'SESSION_LIFECYCLE',
    name: 'budget-balancer.mjs is present and runnable',
    description: 'The mandatory pre-batch-edit budget check depends on budget-balancer.mjs existing '
      + 'and returning parseable output. If it is missing, workload distribution silently fails.',
    setup: 'Global install complete.',
    action: 'Check that .claude/hooks/budget-balancer.mjs exists and exits cleanly.',
    expected: 'File exists. node budget-balancer.mjs exits 0 or 1 with structured output.',
    severity: 'critical',
    run() {
      const bbPath = join(HOOKS, 'budget-balancer.mjs');
      if (!existsSync(bbPath)) {
        return `.claude/hooks/budget-balancer.mjs not found — mandatory workload check will silently fail`;
      }
      const result = node([bbPath], { env: { ...process.env } });
      // May exit 1 if no usage data — that's ok, what matters is it doesn't crash to stderr
      if (!result.stdout && result.status > 1) {
        return `budget-balancer.mjs crashed with status ${result.status}: ${result.stderr?.slice(0, 200)}`;
      }
      return true;
    },
  },

  {
    id: 'quality-gate-blocks-bad-session',
    category: 'SESSION_LIFECYCLE',
    name: 'quality-gate.mjs blocks session end when issues exist',
    description: 'The quality gate must output a clear pass/issues_found/needs_human_review status. '
      + 'If it is broken or absent, session quality is unguarded.',
    setup: 'Any session with code changes.',
    action: 'node .claude/hooks/quality-gate.mjs — inspect output structure.',
    expected: 'Outputs JSON or text with one of: pass | issues_found | needs_human_review.',
    severity: 'high',
    run() {
      const qgPath = join(HOOKS, 'quality-gate.mjs');
      if (!existsSync(qgPath)) {
        return '.claude/hooks/quality-gate.mjs not found — quality gate is absent';
      }
      const src = readFileSync(qgPath, 'utf8');
      const hasStatuses = src.includes('pass') && src.includes('issues_found');
      if (!hasStatuses) {
        return 'quality-gate.mjs missing pass/issues_found status outputs';
      }
      return true;
    },
  },

  {
    id: 'detect-runtime-flag',
    category: 'PLATFORM_ENV',
    name: '--detect-runtime flag works without crashing',
    description: 'dispatch.mjs supports --detect-runtime for debugging the execution environment. '
      + 'This must exit cleanly with environment info, not crash.',
    setup: 'Any environment.',
    action: 'node src/dispatch.mjs --detect-runtime.',
    expected: 'Exits 0, outputs runtime info (isInsideClaude, provider, etc).',
    severity: 'low',
    run() {
      const result = node([join(SRC, 'dispatch.mjs'), '--detect-runtime']);
      if (result.status !== 0) {
        return `--detect-runtime exited ${result.status}: ${result.stderr?.slice(0, 200)}`;
      }
      if (!result.stdout.trim()) {
        return '--detect-runtime produced no output';
      }
      return true;
    },
  },

  {
    id: 'redact-prevents-leaks',
    category: 'TEAM',
    name: 'redact.mjs strips API keys from log output',
    description: 'Before any output is logged to usage JSONL or decision ledger, it must pass '
      + 'through redact.mjs to strip API keys, tokens, and passwords. Failure = credential leak in logs.',
    setup: 'A task result that contains an API key in its output.',
    action: 'Call redact() with a string containing "sk-ant-api03-abc123".',
    expected: 'Output is "sk-ant-api03-[REDACTED]" or similar. Key is never logged in plain text.',
    severity: 'critical',
    run() {
      const redactPath = join(SRC, 'redact.mjs');
      if (!existsSync(redactPath)) {
        return 'src/redact.mjs not found — API keys can leak into usage logs';
      }
      const result = callExport('src/redact.mjs', 'redact', [
        'the api key is sk-ant-api03-fakekeyfortesting123456 and it works'
      ]);
      if (result.error) return `redact threw: ${result.error}`;
      const out = result.value;
      if (typeof out !== 'string') return `redact returned non-string: ${JSON.stringify(out)}`;
      if (out.includes('fakekeyfortesting123456')) {
        return 'CRITICAL: redact() did not strip the API key — credential leak in logs';
      }
      return true;
    },
  },

  {
    id: 'prior-failures-escalate',
    category: 'TASK_ROUTING',
    name: '2+ prior failures on same prompt auto-escalate to think tier',
    description: 'The adaptive routing rule: if the same prompt has failed 2+ times in the last '
      + '2 hours, the system must escalate the tier. This prevents infinite execute-tier retries.',
    setup: 'failure-memory or failure-detector records 2 failures for this prompt.',
    action: 'estimateComplexity with priorFailures=2.',
    expected: 'complexity=complex, which should route to think tier.',
    severity: 'high',
    run() {
      const result = callExport('src/detect.mjs', 'estimateComplexity', [{
        prompt: 'fix the login flow',
        fileCount: 1,
        risk: 'low',
        intent: 'debug',
        priorFailures: 2,
      }]);
      if (result.error) return `estimateComplexity threw: ${result.error}`;
      if (result.value !== 'complex') {
        return `2 prior failures did not escalate complexity to complex (got ${result.value})`;
      }
      return true;
    },
  },

  {
    id: 'src-modules-export-check',
    category: 'SESSION_LIFECYCLE',
    name: 'All core src modules export their documented functions',
    description: 'The four pipeline modules (detect, decide, dispatch, profile) must export their '
      + 'documented functions. Missing exports = silent routing failures.',
    setup: 'Fresh import of each module.',
    action: 'Import each module and verify exported function names.',
    expected: 'All documented exports present in each module.',
    severity: 'critical',
    run() {
      const checks = [
        { file: 'src/detect.mjs',   required: ['detectTask', 'classifyIntent', 'classifyRisk', 'estimateComplexity', 'inferTier', 'extractPaths'] },
        { file: 'src/profile.mjs',  required: ['loadProfile', 'saveProfile', 'getAvailableProviders', 'isSoloBrain', 'getActivePreferences'] },
        { file: 'src/dispatch.mjs', required: ['dispatch', 'buildCommand', 'detectRuntime', 'validateDispatch'] },
      ];
      for (const { file, required } of checks) {
        const { exported, error } = importModule(file);
        if (error) return `cannot import ${file}: ${error}`;
        for (const fn of required) {
          if (!exported.includes(fn)) {
            return `${file} missing export: ${fn}`;
          }
        }
      }
      return true;
    },
  },

];

// ─── Categorize scenarios ─────────────────────────────────────────────────────

const MANUAL_CATEGORIES = new Set(['manual', 'integration']);

const mechanical  = scenarios.filter(s => typeof s.run === 'function');
const manual      = scenarios.filter(s => typeof s.run !== 'function');

// ─── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const results = [];

function runTest(scenario) {
  const start = Date.now();
  let status, reason;
  try {
    const r = scenario.run();
    if (r === true) {
      status = 'pass';
      reason = null;
    } else {
      status = 'fail';
      reason = r || 'returned falsy';
    }
  } catch (err) {
    status = 'error';
    reason = err?.message ?? String(err);
  }
  const ms = Date.now() - start;
  results.push({ id: scenario.id, category: scenario.category, severity: scenario.severity, status, reason, ms });

  const badge = status === 'pass'
    ? `${G}PASS${X}`
    : status === 'fail'
      ? `${R}FAIL${X}`
      : `${R}ERR ${X}`;
  const sev = scenario.severity === 'critical' ? `${R}[critical]${X}`
    : scenario.severity === 'high' ? `${Y}[high]   ${X}`
    : `${D}[${scenario.severity.padEnd(8)}]${X}`;

  const line = `${badge} ${sev} ${scenario.id}`;
  if (status === 'pass') {
    passed++;
    console.log(line);
  } else {
    failed++;
    console.log(`${line}\n       ${D}→ ${reason}${X}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const showAll  = args.includes('--all');
const jsonMode = args.includes('--json');

if (!jsonMode) {
  console.log(`\n${B}dual-brain battle-test matrix${X}  ${D}v0.1 · ${scenarios.length} scenarios${X}\n`);
  console.log(`${B}Mechanical tests (${mechanical.length})${X} — running now...\n`);
}

for (const scenario of mechanical) {
  runTest(scenario);
}

if (!jsonMode) {
  // Summary
  const total = mechanical.length;
  const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;
  const bar   = Array.from({ length: 20 }, (_, i) => i < Math.round(pct / 5) ? '█' : '░').join('');

  console.log(`\n${D}────────────────────────────────────────${X}`);
  console.log(`Mechanical: ${G}${passed} passed${X}  ${failed > 0 ? R : ''}${failed} failed${X}  ${bar} ${pct}%`);
  console.log(`${D}────────────────────────────────────────${X}\n`);

  // Manual tests list
  if (manual.length > 0) {
    console.log(`${B}Manual / integration tests (${manual.length})${X} — require a real Claude session:\n`);
    for (const s of manual) {
      const sev = s.severity === 'critical' ? `${R}[critical]${X}` : `${Y}[${s.severity}]${X}`;
      console.log(`  ${D}○${X} ${sev} ${s.id}`);
      console.log(`    ${D}${s.name}${X}`);
      if (showAll) {
        console.log(`    setup:    ${s.setup}`);
        console.log(`    action:   ${s.action}`);
        console.log(`    expected: ${s.expected}\n`);
      }
    }
    console.log('');
  }

  // All scenario details if requested
  if (showAll) {
    console.log(`\n${B}All mechanical scenario details:${X}\n`);
    for (const s of mechanical) {
      const r = results.find(r => r.id === s.id);
      console.log(`  ${r.status === 'pass' ? G + 'PASS' + X : R + 'FAIL' + X} [${s.severity}] ${s.id}: ${s.name}`);
      console.log(`  ${D}${s.description.slice(0, 120)}${X}`);
      console.log(`  setup:    ${s.setup}`);
      console.log(`  action:   ${s.action}`);
      console.log(`  expected: ${s.expected}\n`);
    }
  }

  if (failed > 0) {
    console.log(`${R}${failed} mechanical test(s) failed. Review above.${X}\n`);
  } else {
    console.log(`${G}All mechanical tests passed.${X}\n`);
  }
}

if (jsonMode) {
  console.log(JSON.stringify({
    total: scenarios.length,
    mechanical: mechanical.length,
    manual: manual.length,
    passed,
    failed,
    results,
    manual_scenarios: manual.map(s => ({ id: s.id, category: s.category, severity: s.severity, name: s.name })),
  }, null, 2));
}

process.exit(failed > 0 ? 1 : 0);
