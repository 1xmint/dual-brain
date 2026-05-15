#!/usr/bin/env node
// dispatch.mjs — Dispatch/execution module for dual-brain.
// Takes a routing decision and launches the agent via Claude CLI or Codex CLI.
// CLI: node src/dispatch.mjs --dry-run --provider claude --model sonnet --prompt "fix the bug"
//      node src/dispatch.mjs --detect-runtime
// Exports: dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain

import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USAGE_DIR = join(__dirname, '..', '.dualbrain', 'usage');
const TIER_TIMEOUT_MS = { search: 60_000, execute: 120_000, think: 180_000 };
const CLAUDE_MODEL_IDS = { opus: 'claude-opus-4-5', sonnet: 'claude-sonnet-4-5', haiku: 'claude-haiku-4-5' };

// ─── Runtime detection (cached) ───────────────────────────────────────────────

let _runtimeCache = null;

async function detectRuntime() {
  if (_runtimeCache) return _runtimeCache;

  const check = (cmd) => new Promise((resolve) => {
    const p = spawn(cmd, ['--version'], { stdio: 'pipe' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
    setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, 3000);
  });

  const [claudeAvailable, codexAvailable] = await Promise.all([
    check('claude'),
    check('codex'),
  ]);

  const runtime =
    claudeAvailable && codexAvailable ? 'claude-code'
    : claudeAvailable                 ? 'claude-code'
    : codexAvailable                  ? 'codex-cli'
    : process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY ? 'standalone'
    : 'none';

  _runtimeCache = { claudeAvailable, codexAvailable, runtime };
  return _runtimeCache;
}

// ─── Command builder ──────────────────────────────────────────────────────────

function buildCommand(decision, prompt, files = [], _cwd) {
  const provider = decision?.provider ?? 'claude';
  const modelAlias = decision?.model ?? 'sonnet';
  const effort = decision?.effort ?? null;
  const sandbox = decision?.sandbox ?? 'danger-full-access';

  if (provider === 'claude') {
    const modelId = CLAUDE_MODEL_IDS[modelAlias] ?? modelAlias;
    const cmd = ['claude', '--model', modelId, '--print', '--output-format', 'json', '-p', prompt];
    if (effort) cmd.push('--effort', effort);
    return cmd;
  }

  // openai / codex
  const cmd = ['codex', 'exec', '-m', modelAlias, '-s', sandbox, prompt];
  if (effort) cmd.push('-c', `reasoning.effort="${effort}"`);
  return cmd;
}

// ─── Usage recorder ───────────────────────────────────────────────────────────
function recordUsage(entry) {
  try {
    mkdirSync(USAGE_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    appendFileSync(
      join(USAGE_DIR, `${date}.jsonl`),
      JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n',
    );
  } catch {}
}

// ─── Result compressor ────────────────────────────────────────────────────────
function compressResult(rawOutput = '', maxLength = 300) {
  if (!rawOutput) return '(no output)';

  // Try JSON parse first (claude --output-format json)
  try {
    const parsed = JSON.parse(rawOutput);
    const text = parsed?.result ?? parsed?.content ?? parsed?.message ?? JSON.stringify(parsed);
    return String(text).slice(0, maxLength);
  } catch {}

  // Strip code blocks
  let cleaned = rawOutput
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/^\s+at\s+.+$/gm, '')          // stack trace lines
    .replace(/\n{3,}/g, '\n\n')             // collapse blank lines
    .trim();

  // Extract first 2 meaningful sentences
  const sentences = cleaned.match(/[^.!?\n]+[.!?\n]+/g) ?? [cleaned];
  const meaningful = sentences.filter(s => s.trim().length > 15).slice(0, 2);
  const head = meaningful.join(' ').trim() || cleaned.slice(0, maxLength);

  // Append file-change hints if present
  const fileHints = rawOutput.match(/(?:changed|edited|wrote|created|modified)\s+([^\s,]+\.[a-z]+)/gi) ?? [];
  const suffix = fileHints.length ? ` | files: ${[...new Set(fileHints)].slice(0, 3).join(', ')}` : '';

  return (head + suffix).slice(0, maxLength);
}

// ─── Core runner ──────────────────────────────────────────────────────────────
function runProcess(cmd, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    const start = Date.now();
    let stdout = '';
    let stderr = '';

    const proc = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    const killer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(killer);
      resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim(), durationMs: Date.now() - start });
    });

    proc.on('error', (err) => {
      clearTimeout(killer);
      resolve({ exitCode: 1, stdout: '', stderr: err.message, durationMs: Date.now() - start });
    });
  });
}

// ─── Main dispatch ────────────────────────────────────────────────────────────
async function dispatch(input = {}) {
  const { decision = {}, prompt, files = [], cwd = process.cwd(), dryRun = false } = input;

  if (!prompt) throw new Error('prompt is required');

  const provider = decision.provider ?? 'claude';
  const model    = decision.model ?? 'sonnet';
  const tier     = decision.tier ?? 'execute';
  const timeoutMs = TIER_TIMEOUT_MS[tier] ?? 120_000;

  const rt = await detectRuntime();

  // Determine actual provider if preferred CLI is missing
  let effectiveProvider = provider;
  if (provider === 'claude' && !rt.claudeAvailable && rt.codexAvailable) effectiveProvider = 'openai';
  if (provider === 'openai' && !rt.codexAvailable && rt.claudeAvailable) effectiveProvider = 'claude';

  const effectiveDecision = { ...decision, provider: effectiveProvider };
  const command = buildCommand(effectiveDecision, prompt, files, cwd);

  if (dryRun) {
    return { status: 'dry-run', provider: effectiveProvider, model, command, exitCode: null, summary: null, durationMs: 0, usage: null, error: null };
  }

  const { exitCode, stdout, stderr, durationMs } = await runProcess(command, cwd, timeoutMs);

  // Extract token usage from JSON output if available
  let usage = null;
  try {
    const parsed = JSON.parse(stdout);
    if (parsed?.usage) {
      usage = { inputTokens: parsed.usage.input_tokens ?? 0, outputTokens: parsed.usage.output_tokens ?? 0 };
    }
  } catch {}

  const success = exitCode === 0;
  const summary = success ? compressResult(stdout) : compressResult(stderr || stdout);

  recordUsage({
    provider: effectiveProvider,
    model,
    tier,
    durationMs,
    inputTokens:  usage?.inputTokens  ?? null,
    outputTokens: usage?.outputTokens ?? null,
    success,
  });

  return {
    status:     success ? 'completed' : 'failed',
    provider:   effectiveProvider,
    model,
    command,
    exitCode,
    summary,
    durationMs,
    usage,
    error: success ? null : (stderr || stdout).slice(0, 200),
  };
}

// ─── Dual-brain dispatch (parallel) ───────────────────────────────────────────
async function dispatchDualBrain(input = {}) {
  const { decision = {}, prompt, files = [], cwd = process.cwd(), dryRun = false } = input;
  if (!prompt) throw new Error('prompt is required');

  const tier = decision.tier ?? 'execute';

  const claudeDecision = { ...decision, provider: 'claude', model: decision.model ?? 'sonnet' };
  const openaiDecision = { ...decision, provider: 'openai', model: decision.openaiModel ?? 'o4-mini' };

  const [claudeResult, openaiResult] = await Promise.all([
    dispatch({ decision: claudeDecision, prompt, files, cwd, dryRun }),
    dispatch({ decision: openaiDecision, prompt, files, cwd, dryRun }),
  ]);

  return {
    tier,
    claude: claudeResult,
    openai: openaiResult,
    consensus: claudeResult.status === 'completed' && openaiResult.status === 'completed'
      ? 'both-passed'
      : claudeResult.status === 'failed' && openaiResult.status === 'failed'
        ? 'both-failed'
        : 'split',
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i !== -1 ? (args[i + 1] ?? true) : null; };

  if (args.includes('--detect-runtime')) {
    const rt = await detectRuntime();
    console.log(JSON.stringify(rt, null, 2));
    process.exit(0);
  }

  const prompt = flag('--prompt') || args.find(a => !a.startsWith('--'));
  if (!prompt) {
    console.error('Usage: node src/dispatch.mjs --prompt "..." [--provider claude|openai] [--model sonnet] [--tier execute] [--dry-run]');
    console.error('       node src/dispatch.mjs --detect-runtime');
    process.exit(1);
  }

  const decision = {
    provider: flag('--provider') || 'claude',
    model:    flag('--model')    || 'sonnet',
    tier:     flag('--tier')     || 'execute',
    effort:   flag('--effort')   || null,
  };

  try {
    const result = await dispatch({ decision, prompt, dryRun: args.includes('--dry-run') });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('dispatch error:', err.message);
    process.exit(1);
  }
}

export { dispatch, buildCommand, detectRuntime, compressResult, dispatchDualBrain };
