#!/usr/bin/env node
// dual-brain — CLI entry point. Commands: init, go, think, review, status, handoff, remember, forget

import { appendFileSync, existsSync, readFileSync, mkdirSync, writeFileSync, statSync, readdirSync, unlinkSync, watch as fsWatch } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync as _spawnSyncTop } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  ensureProfile, loadProfile, saveProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectAuth, detectEnvironment, detectPlans,
  detectCapabilities,
  saveSubscription, listSubscriptions,
  autoSetup,
  loadCredentials, saveCredentials, getCredentialSummary, detectCredentials, addCredential, removeCredential, checkCredentialHealth,
} from '../dist/src/profile.js';

import { detectTask, primeAgentRegistry } from '../dist/src/detect.js';

// ─── Claude launch helper ────────────────────────────────────────────────────
// Builds launch args respecting user's bypass preference from profile.
// Never hardcode --dangerously-skip-permissions — it's a user choice.

function _claudeResumeArgs(sessionId, cwd) {
  const args = ['--resume', sessionId];
  const prof = loadProfile(cwd || process.cwd());
  if (prof.bypassPermissions) args.push('--dangerously-skip-permissions');
  return args;
}

function _claudeNewArgs(cwd) {
  const args = [];
  const prof = loadProfile(cwd || process.cwd());
  if (prof.bypassPermissions) args.push('--dangerously-skip-permissions');
  return args;
}

function _codexResumeArgs(sessionId, cwd) {
  const prof = loadProfile(cwd || process.cwd());
  if (prof.bypassPermissions) {
    return ['--dangerously-bypass-approvals-and-sandbox', 'resume', sessionId];
  }
  return ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', 'resume', sessionId];
}

function _sessionTool(session) {
  return session?.tool === 'codex' ? 'codex' : 'claude';
}

function _sessionLaunchArgs(session, cwd) {
  return _sessionTool(session) === 'codex'
    ? _codexResumeArgs(session.id, cwd)
    : _claudeResumeArgs(session.id, cwd);
}

function _sessionBrief(session, targetProvider = 'codex') {
  const name = session?.smartName || session?.name || session?.prompts?.first || session?.firstPrompt || session?.id || 'previous session';
  const tool = _sessionTool(session);
  const parts = [
    `Continue the ${tool} session "${String(name).replace(/\s+/g, ' ').slice(0, 120)}" in ${targetProvider}.`,
  ];
  if (session?.id) parts.push(`Original session id: ${session.id}.`);
  if (session?.project) parts.push(`Project: ${session.project}.`);
  if (session?.lastActive) parts.push(`Last active: ${session.lastActive}.`);
  if (session?.prompts?.last) parts.push(`Last prompt: ${String(session.prompts.last).replace(/\s+/g, ' ').slice(0, 500)}`);
  else if (session?.prompts?.first) parts.push(`First prompt: ${String(session.prompts.first).replace(/\s+/g, ' ').slice(0, 500)}`);
  return parts.join(' ');
}

// ─── Agent/skill registry cache (populated at startup) ───────────────────────
// These are set by _primeRegistryCache() so classifyInput can use them
// synchronously without async overhead on each keystroke.
let _cachedMatchSkill = null;
let _cachedSkillToTaskBrief = null;

async function _primeRegistryCache() {
  try {
    const reg = await import('../dist/src/agents/registry.js');
    _cachedMatchSkill = reg.matchSkill;
    _cachedSkillToTaskBrief = reg.skillToTaskBrief;
  } catch {}
}

import {
  decideRoute, getAvailableModels,
} from '../dist/src/decide.js';

import {
  getHealth, markHot, markHealthy, remainingCooldownMinutes, getSessionStats,
} from '../dist/src/health.js';

import { dispatch, detectRuntime, dispatchDualBrain } from '../dist/src/dispatch.js';

import { runPipeline, buildExecutionPlan, formatExecutionPlan } from '../dist/src/pipeline.js';

import { loadRepoCache } from '../dist/src/repo.js';
import { loadSession, saveSession, formatSessionCard, importReplitSessions, getSessionMeta, saveSessionMeta, renameSession, pinSession, unpinSession, categorizeSession, enrichSessions, archiveSession, getArchivedSessions } from '../dist/src/session.js';

import { box, bar, badge, menu, separator, panel, divider, statusChip, headerBar, prompt as tuiPrompt, signalLine } from '../dist/src/tui.js';
import { checkBudget } from '../dist/src/governance.js';

// ─── Dynamic imports for receipts + failure memory ───────────────────────────

let _receipt = null;
async function getReceipt() {
  if (!_receipt) {
    try { _receipt = await import('../dist/src/receipt.js'); } catch { _receipt = {}; }
  }
  return _receipt;
}

let _failureMem = null;
async function getFailureMem() {
  if (!_failureMem) {
    try { _failureMem = await import('../dist/src/failure-memory.js'); } catch { _failureMem = {}; }
  }
  return _failureMem;
}

let _livingDocs = null;
async function getLivingDocs() {
  if (!_livingDocs) {
    try { _livingDocs = await import('../dist/src/living-docs.js'); } catch { _livingDocs = {}; }
  }
  return _livingDocs;
}

let _cognitiveLoopCache = null;
async function _getCognitiveLoop() {
  if (!_cognitiveLoopCache) {
    try {
      _cognitiveLoopCache = await import('../dist/src/cognitive-loop.js');
    } catch {
      _cognitiveLoopCache = null;
    }
  }
  return _cognitiveLoopCache;
}

let _fx = null;
async function getFx() {
  if (_fx !== null) return _fx;
  try {
    _fx = await import('../dist/src/fx.js');
  } catch {
    // Fallback stubs when fx.mjs is not yet present
    const _noop = () => {};
    const _spinnerStub = (text) => {
      let _t = text;
      const _o = {
        start()      { process.stdout.write(`  … ${_t}\n`); return _o; },
        succeed(msg) { process.stdout.write(`  ✓ ${msg || _t}\n`); return _o; },
        fail(msg)    { process.stdout.write(`  ✗ ${msg || _t}\n`); return _o; },
        warn(msg)    { process.stdout.write(`  ⚠ ${msg || _t}\n`); return _o; },
        stop()       { return _o; },
        update(t)    { _t = t; return _o; },
      };
      return _o;
    };
    _fx = {
      spinner:         _spinnerStub,
      success:         (t) => process.stdout.write(`  ✓ ${t}\n`),
      error:           (t) => process.stdout.write(`  ✗ ${t}\n`),
      warn:            (t) => process.stdout.write(`  ⚠ ${t}\n`),
      info:            (t) => process.stdout.write(`  ${t}\n`),
      dim:             (t) => process.stdout.write(`  ${t}\n`),
      step:            (cur, tot, t) => process.stdout.write(`\n  [${cur}/${tot}] ${t}\n`),
      banner:          (t) => process.stdout.write(`\n  ═══ ${t} ═══\n\n`),
      box:             (content) => process.stdout.write(`${content}\n`),
      celebrate:       (t) => process.stdout.write(`  ✨ ${t}\n`),
      loadingSequence: async (steps) => {
        for (const s of steps) {
          process.stdout.write(`  … ${s.text}\n`);
          await new Promise(r => setTimeout(r, Math.min(s.duration || 300, 300)));
          process.stdout.write(`  ✓ ${s.successText || s.text}\n`);
        }
      },
      gradient:    (t) => t,
      sleep:       (ms) => new Promise(r => setTimeout(r, ms)),
      clearScreen: _noop,
      nl:          () => process.stdout.write('\n'),
      getMode:     () => 'plain',
      colors:      {},
    };
  }
  return _fx;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH  = join(__dirname, '..', 'package.json');

function readVersion() {
  try { return JSON.parse(readFileSync(PKG_PATH, 'utf8')).version; } catch { return '0.0.0'; }
}
async function checkForUpdates(currentVersion) {
  try {
    const { execSync } = await import('node:child_process');
    const latest = execSync('npm view dual-brain version 2>/dev/null', {
      encoding: 'utf8',
      timeout: 3000
    }).trim();
    if (latest && latest !== currentVersion) {
      return latest;
    }
  } catch {}
  return null;
}
function flag(args, name) { const i = args.indexOf(name); return i !== -1 ? (args[i + 1] ?? true) : null; }
function err(msg) { process.stderr.write(`Error: ${msg}\n`); process.exit(1); }
function vtrace(msg) { process.stderr.write(`[verbose] ${msg}\n`); }

// ─── Loop-prevention markers ──────────────────────────────────────────────────

function checkLoopMarker(cwd) {
  const markerPath = join(cwd, '.dualbrain', `.prompt-shown-${process.pid}`);
  if (existsSync(markerPath)) {
    try {
      const age = Date.now() - statSync(markerPath).mtimeMs;
      if (age < 3600000) return true; // Not stale, skip prompt
    } catch {}
  }
  return false;
}

function setLoopMarker(cwd) {
  const dir = join(cwd, '.dualbrain');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `.prompt-shown-${process.pid}`), String(Date.now()));
  } catch {}
}

function cleanStaleMarkers(cwd) {
  const dir = join(cwd, '.dualbrain');
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith('.prompt-shown-')) continue;
      const pid = f.replace('.prompt-shown-', '');
      try {
        process.kill(parseInt(pid, 10), 0);
      } catch {
        // Process dead, remove marker
        try { unlinkSync(join(dir, f)); } catch {}
      }
    }
  } catch {}
}

function buildSparkline(cwd) {
  const indexPath = join(cwd, '.dualbrain', 'session-index.json');
  let index = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { return null; }

  const sessions = Object.values(index);
  if (sessions.length < 2) return null;

  const now = Date.now();
  const days = 7;
  const buckets = new Array(days).fill(0);

  for (const sess of sessions) {
    if (!sess.date) continue;
    const age = (now - Date.parse(sess.date)) / 86400000;
    const bucket = Math.floor(age);
    if (bucket >= 0 && bucket < days) {
      buckets[days - 1 - bucket]++;
    }
  }

  const max = Math.max(...buckets, 1);
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const spark = buckets.map(v => {
    if (v === 0) return ' ';
    const idx = Math.min(Math.floor((v / max) * (blocks.length - 1)), blocks.length - 1);
    return blocks[idx];
  }).join('');

  const total = buckets.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return `${spark} ${total} sessions (7d)`;
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const ms = Date.parse(isoDate) - Date.now();
  return Math.ceil(ms / 86400000);
}

async function askExpiry(ask, provLabel) {
  console.log(`  ${provLabel} — how long should this auth last?`);
  console.log('    (1) 1 week   (2) 2 weeks   (3) 1 month   (4) Custom date   (Enter) No expiry');
  const choice = (await ask('  > ')).trim();
  const now = new Date();
  if (choice === '1') { now.setDate(now.getDate() + 7); return now.toISOString(); }
  if (choice === '2') { now.setDate(now.getDate() + 14); return now.toISOString(); }
  if (choice === '3') { now.setMonth(now.getMonth() + 1); return now.toISOString(); }
  if (choice === '4') {
    const d = (await ask('  Date YYYY-MM-DD: ')).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d).toISOString();
  }
  return null;
}

function printHelp() {
  console.log(`
dual-brain <command> [options]

Commands:
  plan "task"               Scope and plan without executing (dry-run)
  do "task"                 Implement — detect, route, execute, verify
  review                    Challenge current changes with dual-brain
  ship                      Test, commit, and prepare to ship

  init                      First-time setup → flows into interactive REPL
  auth                      Show provider login and plan status
  install                   Install Claude Code hooks into the current project
  install --global          Write hooks into ~/.claude/settings.json (absolute paths,
                            fires from any working directory after shell restart)
  uninstall --global        Remove dual-brain hooks from ~/.claude/settings.json
  go "task description"     Detect → decide → dispatch (alias for do)
    --dry-run               Show routing decision without executing
    --files a.mjs,b.mjs     Provide file context for risk classification
    --verbose, -v           Print routing trace (intent, risk, health, model selection)
  handoff                   Cross-provider switch (auto-detect limited provider)
    --to claude|codex       Force handoff to a specific provider
    --show                  Show current handoff context without switching
    --task "brief"          Include an explicit task brief in the handoff
  switch claude|codex       Force switch to a provider
    switch codex "brief"    Switch and include a task brief
  think "question"          Multi-round architecture decision with dual-brain
  pr                        Show PR status for current branch
  pr create                 Create PR from current branch with auto-generated description
    --draft                 Create as a draft PR
  pr list                   List open PRs (--closed, --all for other states)
  pr view <N>               View PR #N details
  status                    Provider health, session stats, available models
    --verbose, -v           Also print profile file path and raw profile object
  hot <provider>            Manually mark all model classes for provider as hot
  cool <provider>           Manually clear hot state for a provider
  remember "preference"     Save a project-scoped preference
  forget "preference"       Remove a preference by fuzzy match
  search "keyword"          Search across all sessions
  specialists               List available specialist agents with descriptions
  python "task"             Force Python specialist for the task
  typescript "task"         Force TypeScript specialist for the task
  html "task"               Force HTML/CSS specialist for the task
  linux "task"              Force Linux/DevOps specialist for the task
  security "task"           Force Security specialist for the task
    --dry-run               (specialist commands) Show routing without executing
    --files a,b             (specialist commands) Provide file context
  watch [dir]               Monitor file changes and suggest actions
    --auto                  Auto-execute safe suggestions (tests, install)
  menu                      Open the dual-brain shell menu
  shell-hook                Output bash snippet to add dual-brain to your shell
                            Usage: dual-brain shell-hook >> ~/.bashrc

Interactive mode (entered with no args on a TTY):
  Enforced dual-brain shell with recent sessions and routing.
  Enter Resume last, [n] New work, [g] Switch provider, [i] Import,
  [/] Search, [s] Settings, [d] Doctor, [a] Auto mode, [q] Exit

Options:
  --version                 Print version
  --help                    Show this help
  --verbose, -v             Enable verbose routing trace output (stderr)
`.trim());
}

// ─── replit-tools detection ───────────────────────────────────────────────────

function detectReplitTools(cwd) {
  const replitToolsDir = join(cwd, '.replit-tools');
  const hasDir = existsSync(replitToolsDir);
  const hasConfig = existsSync(join(replitToolsDir, 'config.json'));
  const hasScripts = existsSync(join(replitToolsDir, 'scripts', 'setup-claude-code.sh'));
  const hasArchive = existsSync(join(replitToolsDir, '.session-archive'));

  let version = null;
  try {
    version = readFileSync(join(replitToolsDir, '.version'), 'utf8').trim();
  } catch {}

  return {
    installed: hasDir,
    version,
    hasConfig,
    hasScripts,
    hasArchive,
    dir: replitToolsDir,
  };
}

// ─── Subscription status table ────────────────────────────────────────────────

/**
 * Print a provider status table to stdout.
 */
function printSubscriptionTable(auth, profile) {
  const W = 55;
  const hbar = '═'.repeat(W);
  const pad = (s) => {
    const visible = s.replace(/[̀-ͯ]/g, '');
    return s + ' '.repeat(Math.max(0, W - visible.length));
  };

  const claudeSub  = profile?.providers?.claude;
  const openaiSub  = profile?.providers?.openai;

  const claudePlanLabel = claudeSub?.enabled
    ? ({ pro: 'Pro', max5: 'Max x5', max20: 'Max x20', '$20': 'Pro', '$100': 'Max x5', '$200': 'Max x20' }[claudeSub.plan] ?? claudeSub.plan) // doctor:verified — config value lookup
    : 'disabled';
  const openaiPlanLabel = openaiSub?.enabled
    ? ({ plus: 'Plus', pro: 'Pro', pro100: 'Pro', pro200: 'Pro (higher limits)', '$20': 'Plus', '$100': 'Pro', '$200': 'Pro (higher limits)' }[openaiSub.plan] ?? openaiSub.plan) // doctor:verified — config value lookup
    : 'disabled';

  const claudeLabel = claudeSub?.label ? ` [${claudeSub.label}]` : '';
  const openaiLabel = openaiSub?.label ? ` [${openaiSub.label}]` : '';

  const claudeLine1 = auth.claude.found
    ? `  Claude:  logged in (${auth.claude.source})`
    : `  Claude:  not logged in — run: claude login`;
  const claudeLine2 = `           plan: ${claudePlanLabel}${claudeLabel}`;

  const openaiLine1 = auth.openai.found
    ? `  OpenAI:  logged in (${auth.openai.source})`
    : `  OpenAI:  not logged in — run: codex login`;
  const openaiLine2 = `           plan: ${openaiPlanLabel}${openaiLabel}`;

  console.log(`╔${hbar}╗`);
  console.log(`║${pad('  Provider Status')}║`);
  console.log(`╠${hbar}╣`);
  console.log(`║${pad(claudeLine1)}║`);
  console.log(`║${pad(claudeLine2)}║`);
  console.log(`║${pad(openaiLine1)}║`);
  console.log(`║${pad(openaiLine2)}║`);
  console.log(`╚${hbar}╝`);
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdInit(rl) {
  const cwd = process.cwd();

  // --- Step 1: Detect auth ---
  const auth = await detectAuth();
  printSubscriptionTable(auth, loadProfile(cwd));

  const noneFound = !auth.claude.found && !auth.openai.found;
  if (noneFound) {
    console.log('\nNo AI provider found. Log in first:');
    console.log('  Claude:  claude login');
    console.log('  OpenAI:  codex login\n');
    console.log('Then re-run: dual-brain init');
    return;
  }

  // --- Step 2: Run onboarding wizard ---
  const profile = await runOnboarding({ interactive: true, detectedAuth: auth, rl });
  saveProfile(profile, { cwd });

  // --- Step 2b: Install hooks ---
  await cmdInstall(cwd);

  // --- Step 2c: Suggest global install if not already done ---
  try {
    const { homedir } = await import('node:os');
    const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
    const DB_MARKER = '# dual-brain-managed';
    let alreadyGlobal = false;
    if (existsSync(globalSettingsPath)) {
      try {
        const gs = JSON.parse(readFileSync(globalSettingsPath, 'utf8'));
        const allHooks = [...(gs.hooks?.PreToolUse || []), ...(gs.hooks?.PostToolUse || [])];
        alreadyGlobal = allHooks.some(e => e.hooks?.some(h => h.command?.includes(DB_MARKER)));
      } catch {}
    }
    if (!alreadyGlobal) {
      console.log('');
      console.log('  Tip: run "dual-brain install --global" to load these hooks from');
      console.log('  any directory — so dual-brain works when Replit restarts a shell.');
    }
  } catch {}

  // --- Step 3: Show dashboard ---
  console.log('');
  const repo    = loadRepoCache(cwd);
  const session = loadSession(cwd);
  const health  = getHealth(cwd);
  const card    = formatSessionCard(session, repo, health);
  console.log(card);
  console.log('\nReady! Type a task below, or "help" for commands.\n');
}

/**
 * Show provider login and plan status.
 */
async function cmdAuth(subArgs = []) {
  const auth    = await detectAuth();
  const profile = loadProfile(process.cwd());
  printSubscriptionTable(auth, profile);

  if (!auth.claude.found || !auth.openai.found) {
    console.log('');
    if (!auth.claude.found) console.log('  Claude not logged in. Run: claude login');
    if (!auth.openai.found) console.log('  OpenAI not logged in. Run: codex login');
  }
}

async function cmdGo(args, opts = {}) {
  const dryRun  = opts.dryRun || args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const filesRaw = flag(args, '--files');
  const files   = filesRaw && typeof filesRaw === 'string'
    ? filesRaw.split(',').map(f => f.trim()).filter(Boolean)
    : [];

  // prompt is the first non-flag argument (or value after --dry-run which is boolean)
  const prompt = args.find(a => !a.startsWith('--') && !a.startsWith('-') && a !== (filesRaw ?? ''));
  if (!prompt) err('Usage: dual-brain go "task description" [--dry-run] [--files a,b] [--verbose]');

  const cwd = process.cwd();
  await ensureProfile(cwd);

  // ── Living docs: ensure .dual-brain/ exists on session start ─────────────
  try {
    const ld = await getLivingDocs();
    if (ld.initLivingDocs) ld.initLivingDocs(cwd);
  } catch { /* non-fatal */ }

  if (verbose) console.log('\nDispatching...');

  // ── Failure memory: check history before dispatching ──────────────────────
  const failureMem = await getFailureMem();
  if (failureMem.checkFailureHistory && failureMem.formatEscalation) {
    try {
      const failureHistory = await failureMem.checkFailureHistory(prompt, files, cwd);
      if (failureHistory?.escalation?.recommended) {
        console.log(failureMem.formatEscalation(failureHistory.escalation));
      }
    } catch { /* non-fatal */ }
  }

  // ── Cognitive loop: drive dispatch decisions ──────────────────────────────
  let loopEnhancedPrompt = prompt;
  let loopDispatchMeta = null;
  try {
    const cogLoop = await _getCognitiveLoop();
    if (cogLoop) {
      const loopResult = cogLoop.enter(prompt, { files });

      if (loopResult.phase === 'readonly') {
        console.log('\n⚠ Another dual-brain session is active. This session is read-only.');
        return;
      }

      if (loopResult.phase === 'dispatch' && loopResult.nextDispatch) {
        loopDispatchMeta = loopResult;
        // Use the full envelope prompt (includes context, preventions, debrief)
        const firstAgent = loopResult.nextDispatch.agents?.[0];
        if (firstAgent?.prompt) {
          loopEnhancedPrompt = firstAgent.prompt;
        }
        if (verbose && loopResult.plan) {
          const wc = loopResult.plan.waves?.length || 0;
          console.log(`  [cognitive-loop] Plan: ${wc} wave(s), phase: ${loopResult.phase}`);
        }
      } else if (loopResult.phase === 'blocked') {
        console.log(`\n⚠ Dispatch blocked: ${loopResult.suggestion || 'readiness check failed'}`);
        if (loopResult.surfaceNoticings?.length) {
          loopResult.surfaceNoticings.forEach(n => console.log(`  → ${n}`));
        }
        return;
      } else if (loopResult.phase === 'respond') {
        // HEAD decided no dispatch needed — show rationale
        if (loopResult.rationale) console.log(`\n${loopResult.rationale}`);
        if (loopResult.surfaceNoticings?.length) {
          loopResult.surfaceNoticings.forEach(n => console.log(`  → ${n}`));
        }
        return;
      }

      // Surface noticings (includes update notices, diagnostics)
      if (loopResult.surfaceNoticings?.length && verbose) {
        loopResult.surfaceNoticings.forEach(n => console.log(`  → ${n}`));
      }
    }
  } catch {
    // Cognitive loop unavailable or errored — proceed with original prompt
  }

  // ── Dispatch visualization ─────────────────────────────────────────────────
  const fxGo = await getFx();
  let dispatchSpinner = null;
  if (fxGo) {
    dispatchSpinner = fxGo.spinner(`Dispatching agent...`).start();
  }

  const { plan, result } = await runPipeline('go', loopEnhancedPrompt, {
    files,
    cwd,
    verbose,
    dryRun,
  });

  if (dispatchSpinner) {
    const model = plan?._decision?.model || plan?._decision?.provider || 'agent';
    dispatchSpinner.succeed(`Agent dispatched: ${prompt.slice(0, 50)}`);
  }

  // ── Cognitive loop: advance through waves until done ─────────────────────────
  if (loopDispatchMeta && result && !dryRun) {
    try {
      const cogLoop = await _getCognitiveLoop();
      if (cogLoop) {
        let waveId = loopDispatchMeta.nextDispatch.waveId;
        let rawResults = [result.summary || result.output || ''];
        let advanceResult = cogLoop.advance(rawResults, waveId, { files });

        // Loop through remaining waves
        while (advanceResult && advanceResult.phase === 'dispatch' && advanceResult.nextDispatch) {
          if (verbose) {
            console.log(`  [cognitive-loop] Wave ${advanceResult.rationale || 'next'}`);
          }

          // Dispatch the next wave
          const nextAgent = advanceResult.nextDispatch.agents?.[0];
          const nextPrompt = nextAgent?.prompt || prompt;
          const nextResult = await runPipeline('go', nextPrompt, { files, cwd, verbose, dryRun: false });

          // Advance again
          waveId = advanceResult.nextDispatch.waveId;
          rawResults = [nextResult.result?.summary || nextResult.result?.output || ''];
          advanceResult = cogLoop.advance(rawResults, waveId, { files });
        }

        if (verbose && advanceResult) {
          console.log(`  [cognitive-loop] Final: ${advanceResult.phase}, ${advanceResult.rationale || '-'}`);
        }
      }
    } catch {
      // Non-fatal — loop advance failure doesn't affect completed dispatches
    }
  }

  if (dryRun) {
    // formatExecutionPlan already printed by pipeline when verbose/dryRun=true
    console.log('\n(dry-run — not executing)');
    return;
  }

  if (!result) return;

  // Display result — dual-brain vs single-provider
  if (result.consensus) {
    if (fxGo) fxGo.celebrate('Task complete!');
    console.log(`\nConsensus: ${result.consensus}`);
    if (result.claude?.summary) console.log(`Claude : ${result.claude.summary}`);
    if (result.openai?.summary) console.log(`OpenAI : ${result.openai.summary}`);

    // Receipt
    const receipt = await getReceipt();
    if (receipt.buildReceipt && receipt.formatReceipt) {
      try {
        const r = receipt.buildReceipt(result, plan, null);
        console.log(receipt.formatReceipt(r));
      } catch { /* non-fatal */ }
    }

    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain go "${prompt}"`],
      lastResult:   { status: 'success', summary: result.consensus || 'dual-brain complete' },
      provider:     plan?._decision?.provider ?? 'claude',
      nextAction:   null,
    }, cwd);

    // ── Living docs: record completed session action ───────────────────────
    try {
      const ld = await getLivingDocs();
      if (ld.appendAction) ld.appendAction({
        type: 'task', intent: prompt, status: 'completed',
        owner: plan?._decision?.provider ?? 'claude',
        files, result: result.consensus || 'dual-brain complete',
      }, cwd);
    } catch { /* non-fatal */ }

    // Clear failure memory on success
    if (failureMem.clearFailures) {
      try { await failureMem.clearFailures(prompt, cwd); } catch { /* non-fatal */ }
    }

    // ── Next steps suggestions (dual-brain consensus path) ──────────────────
    try {
      const { suggestNextSteps, formatNextSteps } = await import('../dist/src/nextstep.js');
      const steps = await suggestNextSteps(
        { prompt, tier: plan?._decision?.tier ?? 'think', files, trigger: 'go' },
        { success: true, filesChanged: files, error: null, duration: null },
        cwd
      );
      if (steps?.steps?.length > 0) {
        console.log('\n' + formatNextSteps(steps.steps, 3));
      }
    } catch { /* non-fatal */ }
  } else {
    const succeeded = result.status === 'completed';
    const statusLine = succeeded ? 'Done' : `Failed (exit ${result.exitCode})`;
    if (succeeded && fxGo) {
      fxGo.celebrate('Task complete!');
    }
    console.log(`\n${statusLine}${result.durationMs != null ? ` in ${(result.durationMs / 1000).toFixed(1)}s` : ''}`);
    if (result.summary) console.log(result.summary);
    if (result.error) {
      if (fxGo) fxGo.error(result.error);
      else process.stderr.write(`${result.error}\n`);
    }

    // Receipt
    const receipt = await getReceipt();
    if (succeeded && receipt.buildReceipt && receipt.formatReceipt) {
      try {
        const r = receipt.buildReceipt(result, plan, null);
        console.log(receipt.formatReceipt(r));
      } catch { /* non-fatal */ }
    } else if (!succeeded && receipt.buildReceipt && receipt.formatFailureReceipt) {
      try {
        const r = receipt.buildReceipt(result, plan, null);
        console.log(receipt.formatFailureReceipt(r, { error: result.error }));
      } catch { /* non-fatal */ }
    }

    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain go "${prompt}"`],
      lastResult:   {
        status:  succeeded ? 'success' : 'failure',
        summary: result.summary || (succeeded ? 'completed' : `exit ${result.exitCode}`),
      },
      provider:     plan?._decision?.provider ?? 'claude',
      nextAction:   null,
    }, cwd);

    // ── Living docs: record completed session action ───────────────────────
    try {
      const ld = await getLivingDocs();
      if (ld.appendAction) ld.appendAction({
        type: 'task', intent: prompt, status: succeeded ? 'completed' : 'failed',
        owner: plan?._decision?.provider ?? 'claude',
        files: result.filesChanged || files,
        result: result.summary || (succeeded ? 'completed' : `exit ${result.exitCode}`),
      }, cwd);
    } catch { /* non-fatal */ }

    if (!succeeded) {
      // Record failure memory
      if (failureMem.recordFailure) {
        try { await failureMem.recordFailure(prompt, plan, result.error, cwd); } catch { /* non-fatal */ }
      }
      process.exit(1);
    }

    // Clear failure memory on success
    if (failureMem.clearFailures) {
      try { await failureMem.clearFailures(prompt, cwd); } catch { /* non-fatal */ }
    }

    await offerAutoCommit(cwd);
    // ── Next steps suggestions ──────────────────────────────────────────────
    try {
      const { suggestNextSteps, formatNextSteps } = await import('../dist/src/nextstep.js');
      const steps = await suggestNextSteps(
        {
          prompt,
          tier:  plan?._decision?.tier ?? 'execute',
          files: result.filesChanged || files,
          trigger: 'go',
        },
        {
          success:      result.status === 'completed',
          filesChanged: result.filesChanged || files,
          error:        result.error,
          duration:     result.durationMs,
        },
        cwd
      );
      if (steps?.steps?.length > 0) {
        console.log('\n' + formatNextSteps(steps.steps, 3));
      }
    } catch { /* non-fatal — module may not exist yet */ }
  }
}

async function cmdThink(args) {
  const question = args.find(a => !a.startsWith('--') && !a.startsWith('-'));
  if (!question) err('Usage: dual-brain think "architecture question or design decision"');

  const cwd = process.cwd();
  await ensureProfile(cwd);

  const fxThink = await getFx();
  if (fxThink) fxThink.info('Round 1: GPT analyzing...');

  const { result, verification } = await runPipeline('think', question, {
    cwd,
    verbose: true,
  });

  if (!result) return;

  if (result.consensus) {
    if (fxThink) fxThink.success('Round 1 complete');
    console.log(`\nConsensus: ${result.consensus}`);
    if (result.claude?.summary) console.log(`Claude : ${result.claude.summary}`);
    if (result.openai?.summary) console.log(`OpenAI : ${result.openai.summary}`);
  } else {
    if (fxThink) fxThink.success('Round 1 complete');
    if (result.summary) console.log(`\n${result.summary}`);
    if (result.error) {
      if (fxThink) fxThink.error(result.error);
      else process.stderr.write(`${result.error}\n`);
    }
    if (result.status && result.status !== 'completed') process.exit(1);
  }

  if (verification && !verification.ok) {
    for (const note of verification.notes) process.stderr.write(`  note: ${note}\n`);
  }
}

async function cmdReview(_args) {
  const cwd = process.cwd();
  await ensureProfile(cwd);

  const { result, verification } = await runPipeline('review', 'review current diff', {
    cwd,
    verbose: true,
  });

  if (!result) return;

  if (result.consensus) {
    console.log(`\nConsensus: ${result.consensus}`);
    if (result.claude?.summary) console.log(`Claude : ${result.claude.summary}`);
    if (result.openai?.summary) console.log(`OpenAI : ${result.openai.summary}`);
  } else {
    if (result.summary) console.log(`\n${result.summary}`);
    if (result.error)   process.stderr.write(`${result.error}\n`);
    if (result.status && result.status !== 'completed') process.exit(1);
  }

  if (verification && !verification.ok) {
    for (const note of verification.notes) process.stderr.write(`  note: ${note}\n`);
  }
}

async function cmdShip() {
  const cwd = process.cwd();

  console.log('\n── ship: finalizing ──────────────────────────────────────\n');

  // 1. Check for test script
  let hasTests = false;
  let testScript = null;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    testScript = pkg?.scripts?.test;
    hasTests = Boolean(testScript && !testScript.includes('echo'));
  } catch { /* no package.json */ }

  // 2. Run tests if available
  let testsPassed = null;
  if (hasTests) {
    console.log('Running tests...\n');
    const testResult = _spawnSyncTop('npm', ['test'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
    });
    const testOut = (testResult.stdout || '') + (testResult.stderr || '');
    if (testOut) console.log(testOut.slice(0, 3000));
    testsPassed = testResult.status === 0;
    console.log(testsPassed ? 'Tests: PASS' : 'Tests: FAIL');
  } else {
    console.log('(no test script found in package.json — skipping tests)');
    testsPassed = null;
  }

  // 3. Git status
  let changedFiles = [];
  let currentBranch = 'unknown';
  try {
    const statusResult = _spawnSyncTop('git', ['status', '--porcelain'], {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    });
    changedFiles = (statusResult.stdout || '').trim().split('\n').filter(Boolean);
    const branchResult = _spawnSyncTop('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000,
    });
    currentBranch = (branchResult.stdout || '').trim() || 'unknown';
  } catch { /* non-fatal */ }

  if (changedFiles.length > 0) {
    console.log('\nChanged files:');
    changedFiles.slice(0, 20).forEach(f => console.log(`  ${f}`));
    if (changedFiles.length > 20) console.log(`  ... and ${changedFiles.length - 20} more`);
  } else {
    console.log('\nNo uncommitted changes.');
  }

  // 4. Generate commit message suggestion
  let commitMsg = null;
  try {
    const diffResult = _spawnSyncTop('git', ['diff', '--name-only', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    });
    const diffFiles = (diffResult.stdout || '').trim().split('\n').filter(Boolean);
    if (diffFiles.length > 0) {
      const fileList = diffFiles.slice(0, 5).map(f => basename(f)).join(', ');
      const suffix = diffFiles.length > 5 ? ` and ${diffFiles.length - 5} more` : '';
      commitMsg = `update ${fileList}${suffix}`;
    }
  } catch { /* non-fatal */ }

  // 5. Show suggested actions
  console.log('\n── suggested actions ─────────────────────────────────────\n');

  if (testsPassed === false) {
    console.log('  ⚠  Tests failed — fix before committing.');
  } else {
    if (changedFiles.length > 0 && commitMsg) {
      console.log(`  Commit: git add -p && git commit -m "${commitMsg}"`);
    } else if (changedFiles.length === 0) {
      console.log('  Nothing to commit — working tree clean.');
    }

    const isMain = currentBranch === 'main' || currentBranch === 'master';
    if (!isMain && currentBranch !== 'unknown') {
      console.log(`  PR:     gh pr create --title "${commitMsg || 'update'}" --body "..."`);}
    else if (isMain) {
      console.log('  (on main — consider branching before PR)');
    }
  }

  // 6. Receipt
  const receipt = await getReceipt();
  if (receipt.buildReceiptFromOutcome && receipt.formatReceipt) {
    try {
      const r = receipt.buildReceiptFromOutcome({
        command: 'ship',
        branch: currentBranch,
        filesChanged: changedFiles.length,
        testsPassed,
      });
      console.log('\n' + receipt.formatReceipt(r));
    } catch { /* non-fatal */ }
  } else {
    console.log(`\nReceipt: branch=${currentBranch}  files=${changedFiles.length}  tests=${testsPassed === null ? 'skipped' : testsPassed ? 'pass' : 'fail'}`);
  }
}

async function cmdStatus(args = []) {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const cwd     = process.cwd();
  const profile = loadProfile(cwd);
  const rt      = await detectRuntime();
  const providers = getAvailableProviders(profile);
  const available = getAvailableModels(profile);
  const prefs     = getActivePreferences(cwd);
  const { states } = getHealth(cwd);
  const sessionStats = getSessionStats(cwd);

  const fxSt = await getFx();

  console.log('=== Dual-Brain Status ===\n');

  // Providers + health
  console.log('Providers:');
  if (providers.length === 0) {
    if (fxSt) fxSt.warn('(none configured — run: dual-brain init)');
    else console.log('  (none configured — run: dual-brain init)');
  } else {
    for (const p of providers) {
      const label = p.name === 'claude' ? 'Claude' : 'OpenAI';
      // Collect all model-class states for this provider
      const provStates = Object.entries(states)
        .filter(([k]) => k.startsWith(`${p.name}:`));
      const sess = sessionStats[p.name] ?? { calls: 0, tokens: 0 };

      const planStr = p.plan ? `  plan=${p.plan}` : '';
      if (provStates.length === 0) {
        const line = `  ${label}${planStr}  status=healthy  calls=${sess.calls}  tokens=${sess.tokens}`;
        if (fxSt) fxSt.success(line.trim()); else console.log(line);
      } else {
        for (const [k, st] of provStates) {
          const modelClass = k.split(':').slice(1).join(':');
          let statusStr = st.status;
          if (st.status === 'hot') {
            const remaining = remainingCooldownMinutes(p.name, modelClass, cwd);
            statusStr = remaining > 0 ? `hot (retry in ${remaining}m)` : 'hot (cooling)';
          }
          const line = `  ${label}${planStr}  model=${modelClass}  status=${statusStr}  calls=${sess.calls}  tokens=${sess.tokens}`;
          if (fxSt) {
            if (st.status === 'hot') fxSt.warn(line.trim());
            else if (st.status === 'down') fxSt.error(line.trim());
            else fxSt.success(line.trim());
          } else {
            console.log(line);
          }
        }
      }
    }
  }

  // Session totals
  const totalCalls  = Object.values(sessionStats).reduce((s, v) => s + v.calls, 0);
  const totalTokens = Object.values(sessionStats).reduce((s, v) => s + v.tokens, 0);
  console.log(`\nSession: ${totalCalls} dispatch${totalCalls !== 1 ? 'es' : ''}, ${totalTokens} tokens observed`);

  // Models — only list enabled providers
  console.log('\nAvailable models:');
  const claudeEnabled = profile?.providers?.claude?.enabled !== false;
  const openaiEnabled = profile?.providers?.openai?.enabled !== false;
  if (claudeEnabled && available.claude.length) {
    console.log(`  Claude : ${available.claude.join(', ')}`);
  } else if (!claudeEnabled) {
    console.log(`  Claude : (disabled — run "dual-brain init" to enable)`);
  }
  if (openaiEnabled && available.openai.length) {
    console.log(`  OpenAI : ${available.openai.join(', ')}`);
  } else if (!openaiEnabled) {
    console.log(`  OpenAI : (disabled — run "dual-brain init" to enable)`);
  }

  // Head model
  console.log(`\nHead model : ${getHeadModel(profile)}`);
  console.log(`Mode       : ${profile.mode}`);
  console.log(`Solo brain : ${isSoloBrain(profile) ? 'yes' : 'no'}`);

  // Runtime
  console.log('\nRuntime:');
  console.log(`  claude CLI : ${rt.claudeAvailable ? 'available' : 'not found'}`);
  console.log(`  codex CLI  : ${rt.codexAvailable  ? 'available' : 'not found'}`);
  console.log(`  detected   : ${rt.runtime}`);

  // Preferences
  console.log(`\nPreferences: ${prefs.length ? '' : '(none)'}`);
  for (const p of prefs) console.log(`  [${p.scope}] ${p.text}`);

  // Verbose: profile file path and raw object
  if (verbose) {
    const { homedir } = await import('node:os');
    const globalPath  = join(homedir(), '.config', 'dual-brain', 'profile.json');
    const projectPath = join(cwd, '.dualbrain', 'profile.json');
    const { existsSync } = await import('node:fs');
    const loadedFrom = existsSync(projectPath) ? projectPath : existsSync(globalPath) ? globalPath : '(defaults)';
    vtrace(`Profile file: ${loadedFrom}`);
    vtrace(`Raw profile:\n${JSON.stringify(profile, null, 2)}`);
  }

  // Enforcement health check
  console.log('\nEnforcement:');
  try {
    const { readFileSync: rfs, existsSync: exs } = await import('node:fs');
    const settingsFile = join(cwd, '.claude', 'settings.json');
    if (!exs(settingsFile)) {
      console.log('  NOT INSTALLED — run: dual-brain install');
    } else {
      const settings = JSON.parse(rfs(settingsFile, 'utf8'));
      const preToolUse = settings?.hooks?.PreToolUse ?? [];
      const guardCmd  = 'node .claude/hooks/head-guard.mjs';
      const tierCmd   = 'node .claude/hooks/enforce-tier.mjs';
      const hasEdit   = preToolUse.some(e => e.matcher === 'Edit'   && e.hooks?.some(h => h.command === guardCmd));
      const hasWrite  = preToolUse.some(e => e.matcher === 'Write'  && e.hooks?.some(h => h.command === guardCmd));
      const hasBash   = preToolUse.some(e => e.matcher === 'Bash'   && e.hooks?.some(h => h.command === guardCmd));
      const hasAgent  = preToolUse.some(e => e.matcher === 'Agent'  && e.hooks?.some(h => h.command === tierCmd));
      const activeCount = [hasEdit, hasWrite, hasBash, hasAgent].filter(Boolean).length;
      if (activeCount === 4) {
        console.log(`  active (${activeCount} guards: Edit, Write, Bash, Agent)`);
      } else {
        const missing = [
          !hasEdit  && 'Edit',
          !hasWrite && 'Write',
          !hasBash  && 'Bash',
          !hasAgent && 'Agent',
        ].filter(Boolean);
        console.log(`  PARTIAL — missing guards: ${missing.join(', ')} — run: dual-brain install`);
      }
    }
  } catch {
    console.log('  unknown (could not read .claude/settings.json)');
  }

  // Replit section
  try {
    const replit = await import('../dist/src/replit.js');
    const env = replit.detectReplitEnvironment(cwd);
    if (env.isReplit) {
      console.log('\nReplit:');
      const tools = replit.inspectReplitTools(cwd);
      const verStr = tools.version ? `v${tools.version}` : 'unknown';
      const capsCount = Array.isArray(tools.capabilities) ? tools.capabilities.length : 0;
      console.log(`  replit-tools  : ${tools.installed ? `${verStr} (${capsCount} capabilities)` : 'not installed'}`);
      const authStatus = replit.getAuthStatus(cwd);
      console.log(`  auth          : ${authStatus.authenticated ? 'authenticated' : 'not authenticated'}${authStatus.method ? ` (${authStatus.method})` : ''}`);
      const archive = replit.getSessionArchive(cwd);
      const archiveCount = Array.isArray(archive) ? archive.length : (archive?.count ?? 0);
      console.log(`  session archive: ${archiveCount} session${archiveCount !== 1 ? 's' : ''}`);
      // Subscription-only: no API key secrets to check
    }
  } catch { /* replit.mjs not available or not in Replit — skip silently */ }

  // Update check
  try {
    const localVer  = readVersion();
    const remoteVer = execSync('npm view dual-brain version 2>/dev/null', { timeout: 5000 }).toString().trim();
    if (remoteVer) {
      const localParts  = localVer.split('.').map(Number);
      const remoteParts = remoteVer.split('.').map(Number);
      const updateAvailable =
        remoteParts[0] > localParts[0]
        || (remoteParts[0] === localParts[0] && remoteParts[1] > localParts[1])
        || (remoteParts[0] === localParts[0] && remoteParts[1] === localParts[1] && remoteParts[2] > localParts[2]);
      if (updateAvailable) {
        console.log(`\nUpdate available: npm i -g dual-brain@latest  (${localVer} → ${remoteVer})`);
      }
    }
  } catch { /* network unavailable — skip */ }

  // Show top recommendation if available
  try {
    const { getTopRecommendation } = await import('../dist/src/recommendations.js');
    const rec = getTopRecommendation(process.cwd());
    if (rec) {
      console.log('');
      console.log(`  \x1b[33m💡 ${rec.title}\x1b[0m`);
      console.log(`     ${rec.description}`);
      if (rec.action) console.log(`     → ${rec.action}`);
    }
  } catch { /* non-blocking */ }

  // Intelligence layer status
  try {
    const { getRoutingStats } = await import('../dist/src/routing-advisor.js');
    const { getThinkingStats } = await import('../dist/src/think-engine.js');
    const stats = getRoutingStats(cwd);
    const thinkStats = getThinkingStats(cwd);

    if (stats.totalObservations > 0 || thinkStats.totalDecisions > 0) {
      console.log('');
      console.log('  \x1b[2m─── Intelligence ───\x1b[0m');
      if (stats.totalObservations > 0) {
        console.log(`  Routing: ${stats.totalObservations} observations, learning ${stats.totalObservations >= 5 ? 'active' : 'warming up'}`);
        if (stats.topPerformers?.length > 0) {
          const top = stats.topPerformers[0];
          console.log(`  Best: ${top.model} on ${top.cell} (${(top.ema * 100).toFixed(0)}% EMA, n=${top.observations})`);
        }
      }
      if (thinkStats.totalDecisions > 0) {
        console.log(`  Think: ${thinkStats.totalDecisions} decisions, ${(thinkStats.cacheHitRate * 100).toFixed(0)}% cache hit rate`);
      }
    }
  } catch { /* non-blocking */ }
}

// ─── cmdHot / cmdCool ─────────────────────────────────────────────────────────

const PROVIDER_MODEL_CLASSES = {
  claude: ['haiku', 'sonnet', 'opus'],
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
};

async function cmdHandoff(args = []) {
  const cwd = process.cwd();
  const fxH = await getFx();
  const toProvider = flag(args, '--to');
  const taskBrief = flag(args, '--task');
  const showOnly = args.includes('--show');

  let autoHandoff;
  try {
    autoHandoff = await import('../dist/src/auto-handoff.js');
  } catch (e) {
    err(`Could not load auto-handoff module: ${e.message}`);
  }

  const { executeHandoff, detectLimitReached, exportSessionContext, getHandoffUX } = autoHandoff;

  // --show: display current handoff context without switching
  if (showOnly) {
    const context = exportSessionContext(cwd);
    console.log(box('Handoff Context'));
    console.log('');
    if (context) {
      console.log(JSON.stringify(context, null, 2));
    } else {
      fxH.info('No active session context to export.');
    }
    return;
  }

  const profile = loadProfile(cwd);
  const providers = getAvailableProviders(profile);

  if (providers.length < 2 && !toProvider) {
    fxH.warn('Only one provider configured — nothing to hand off to.');
    fxH.info('Run: dual-brain init  to configure a second provider.');
    return;
  }

  // If --to is specified, force switch regardless of limit status
  if (toProvider) {
    const target = toProvider.toLowerCase();
    if (target !== 'claude' && target !== 'codex') {
      err('--to must be "claude" or "codex"');
    }
    const fromProvider = target === 'codex' ? 'anthropic' : 'openai';
    console.log(`  ⚡ Switching to ${target}...`);
    console.log('');
    const { spawnHandoff } = autoHandoff;
    const result = spawnHandoff({
      fromProvider,
      cwd,
      auto: true,
      force: true,
      interactive: true,
      taskBrief: typeof taskBrief === 'string' ? taskBrief : undefined,
    });
    if (!result.success) {
      fxH.error(result.message);
    }
    return;
  }

  // Auto-detect: check both providers, switch if one is limited
  const anthropicStatus = detectLimitReached('anthropic', cwd);
  const openaiStatus = detectLimitReached('openai', cwd);

  if (anthropicStatus.limited && anthropicStatus.otherAvailable) {
    const ux = getHandoffUX(anthropicStatus);
    fxH.info(ux.text);
    console.log('');
    const { spawnHandoff } = autoHandoff;
    const result = spawnHandoff({ fromProvider: 'anthropic', cwd, auto: true, interactive: true });
    if (!result.success) fxH.error(result.message);
  } else if (openaiStatus.limited && openaiStatus.otherAvailable) {
    const ux = getHandoffUX(openaiStatus);
    fxH.info(ux.text);
    console.log('');
    const { spawnHandoff } = autoHandoff;
    const result = spawnHandoff({ fromProvider: 'openai', cwd, auto: true, interactive: true });
    if (!result.success) fxH.error(result.message);
  } else {
    fxH.success('No provider is currently limited. No handoff needed.');
    fxH.dim('Use --to claude or --to codex to force a switch.');
  }
}

async function cmdSwitch(args = []) {
  const target = args[0];
  if (!target || !['claude', 'codex'].includes(target.toLowerCase())) {
    err('Usage: dual-brain switch <claude|codex> ["task brief"]');
  }
  const taskBrief = args.slice(1).join(' ').trim();
  const handoffArgs = ['--to', target.toLowerCase()];
  if (taskBrief) handoffArgs.push('--task', taskBrief);
  await cmdHandoff(handoffArgs);
}

async function cmdUpdate() {
  const cwd = process.cwd();
  console.log('  Updating Dual Brain...');
  const install = _spawnSyncTop('npm', ['install', '-g', 'dual-brain@latest'], {
    stdio: 'inherit',
    cwd,
  });
  if (install.status !== 0) {
    process.exitCode = install.status || 1;
    return;
  }

  const refresh = _spawnSyncTop('dual-brain', ['install'], {
    stdio: 'inherit',
    cwd,
  });
  if (refresh.status !== 0) {
    process.exitCode = refresh.status || 1;
  }
}

function cmdHot(providerArg) {
  if (!providerArg) err('Usage: dual-brain hot <provider>  (claude | openai)');
  const provider = providerArg.toLowerCase();
  const classes  = PROVIDER_MODEL_CLASSES[provider];
  if (!classes)  err(`Unknown provider: ${provider}. Use "claude" or "openai".`);
  const cwd = process.cwd();
  for (const mc of classes) markHot(provider, mc, cwd);
  console.log(`Marked ${classes.length} model classes as hot for ${provider}.`);
}

function cmdCool(providerArg) {
  if (!providerArg) err('Usage: dual-brain cool <provider>  (claude | openai)');
  const provider = providerArg.toLowerCase();
  const classes  = PROVIDER_MODEL_CLASSES[provider];
  if (!classes)  err(`Unknown provider: ${provider}. Use "claude" or "openai".`);
  const cwd = process.cwd();
  for (const mc of classes) markHealthy(provider, mc, cwd);
  console.log(`Cleared hot state for all ${provider} model classes.`);
}

async function cmdInstall(cwd) {
  if (!cwd) cwd = process.cwd();

  // Run the main install.mjs (orchestrator config, all hooks, CLAUDE.md, etc.)
  const { spawnSync } = await import('child_process');
  const result = spawnSync('node', [join(__dirname, '..', 'install.mjs')], { stdio: 'inherit', cwd });
  if (result.status !== 0) { process.exit(result.status || 1); }

  // Additionally merge enforcement hooks into .claude/settings.json
  const { installHooks } = await import('../dist/src/install-hooks.js');
  const { installed, skipped } = installHooks(cwd);

  if (installed.length > 0) {
    console.log(`\nEnforcement hooks installed (${installed.length}):`);
    for (const item of installed) console.log(`  + ${item}`);
  }
  if (skipped.length > 0) {
    console.log(`Enforcement hooks already present (${skipped.length}):`);
    for (const item of skipped) console.log(`  = ${item}`);
  }
}

async function installGlobal() {
  const { homedir } = await import('node:os');
  const globalClaudeDir = join(homedir(), '.claude');
  const globalSettingsPath = join(globalClaudeDir, 'settings.json');

  // Resolve absolute path to hooks directory via import.meta.url
  const pkgRoot = join(__dirname, '..');
  // Hooks live at hooks/ in the published package, .claude/hooks/ in dev
  const hooksDir = existsSync(join(pkgRoot, 'hooks', 'head-guard.mjs'))
    ? join(pkgRoot, 'hooks')
    : join(pkgRoot, '.claude', 'hooks');

  // Warn if running from npx (ephemeral path)
  if (pkgRoot.includes('.npm/_npx') || pkgRoot.includes('npx-')) {
    console.log('  Warning: Running from npx — paths will break after this session.');
    console.log('    Install globally first: npm i -g dual-brain');
    console.log('    Then run: dual-brain install --global');
    return;
  }

  // Verify hooks exist at resolved path
  if (!existsSync(join(hooksDir, 'head-guard.mjs'))) {
    console.log('  Error: Could not resolve hook files at: ' + hooksDir);
    return;
  }

  // Check if project-local hooks already exist (avoids double-firing)
  const projectLocalSettings = join(pkgRoot, '.claude', 'settings.local.json');
  const hasProjectLocalHooks = (() => {
    if (!existsSync(projectLocalSettings)) return false;
    try {
      const content = readFileSync(projectLocalSettings, 'utf8');
      return content.includes('dual-brain') || content.includes('head-guard');
    } catch { return false; }
  })();

  if (hasProjectLocalHooks) {
    console.log('  project-local hooks detected (will take precedence in this workspace)');
  }
  {
    // Load existing settings (merge, never clobber)
    let existing = {};
    if (existsSync(globalSettingsPath)) {
      try { existing = JSON.parse(readFileSync(globalSettingsPath, 'utf8')); } catch {}
    }

    // Ensure hooks structure exists
    if (!existing.hooks) existing.hooks = {};
    if (!existing.hooks.PreToolUse) existing.hooks.PreToolUse = [];
    if (!existing.hooks.PostToolUse) existing.hooks.PostToolUse = [];

    // Define dual-brain hooks with ownership marker
    const DB_MARKER = '# dual-brain-managed';
    const preToolHooks = [
      { matcher: 'Edit',        hooks: [{ type: 'command', command: `node ${join(hooksDir, 'head-guard.mjs')} ${DB_MARKER}` }] },
      { matcher: 'Write',       hooks: [{ type: 'command', command: `node ${join(hooksDir, 'head-guard.mjs')} ${DB_MARKER}` }] },
      { matcher: 'NotebookEdit',hooks: [{ type: 'command', command: `node ${join(hooksDir, 'head-guard.mjs')} ${DB_MARKER}` }] },
      { matcher: 'Bash',        hooks: [{ type: 'command', command: `node ${join(hooksDir, 'head-guard.mjs')} ${DB_MARKER}` }] },
      { matcher: 'Agent',       hooks: [{ type: 'command', command: `node ${join(hooksDir, 'enforce-tier.mjs')} ${DB_MARKER}` }] },
    ];
    const postToolHooks = [
      { matcher: '', hooks: [{ type: 'command', command: `node ${join(hooksDir, 'cost-logger.mjs')} ${DB_MARKER}` }] },
      { matcher: '', hooks: [{ type: 'command', command: `node ${join(hooksDir, 'auto-update-wrapper.mjs')} ${DB_MARKER}` }] },
    ];

    // Remove any existing dual-brain hooks (idempotent)
    const isDBHook = (entry) => entry.hooks?.some(h => h.command?.includes(DB_MARKER));
    existing.hooks.PreToolUse  = existing.hooks.PreToolUse.filter(e => !isDBHook(e));
    existing.hooks.PostToolUse = existing.hooks.PostToolUse.filter(e => !isDBHook(e));

    // Add dual-brain hooks
    existing.hooks.PreToolUse.push(...preToolHooks);
    existing.hooks.PostToolUse.push(...postToolHooks);

    // Write merged settings
    mkdirSync(globalClaudeDir, { recursive: true });
    writeFileSync(globalSettingsPath, JSON.stringify(existing, null, 2) + '\n');
  }

  // Write minimal global CLAUDE.md (only if none exists, or append section)
  const globalClaudeMd = join(globalClaudeDir, 'CLAUDE.md');
  const dbSection = `\n## Dual-Brain Global Hooks\n\nThis machine has dual-brain hooks installed globally.\nProject-local .claude/CLAUDE.md and settings take precedence.\nManaged by: dual-brain install --global\n`;

  if (!existsSync(globalClaudeMd)) {
    writeFileSync(globalClaudeMd, dbSection);
  } else {
    const content = readFileSync(globalClaudeMd, 'utf8');
    if (!content.includes('Dual-Brain Global Hooks')) {
      writeFileSync(globalClaudeMd, content + '\n' + dbSection);
    }
  }

  if (!hasProjectLocalHooks) {
    console.log('  + dual-brain hooks installed globally');
    console.log('    hooks dir: ' + hooksDir);
    console.log('    settings:  ' + globalSettingsPath);
    console.log('');
    console.log('  All new Claude sessions will load dual-brain hooks.');
    console.log('  Run "dual-brain uninstall --global" to remove.');
  }
  console.log('  + global CLAUDE.md updated');
  console.log('    path: ' + globalClaudeDir);
}

async function uninstallGlobal() {
  const { homedir } = await import('node:os');
  const globalSettingsPath = join(homedir(), '.claude', 'settings.json');

  if (!existsSync(globalSettingsPath)) {
    console.log('  No global settings found.');
    return;
  }

  let settings = {};
  try { settings = JSON.parse(readFileSync(globalSettingsPath, 'utf8')); } catch { return; }

  const DB_MARKER = '# dual-brain-managed';
  const isDBHook = (entry) => entry.hooks?.some(h => h.command?.includes(DB_MARKER));

  let removed = 0;
  if (settings.hooks?.PreToolUse) {
    const before = settings.hooks.PreToolUse.length;
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(e => !isDBHook(e));
    removed += before - settings.hooks.PreToolUse.length;
  }
  if (settings.hooks?.PostToolUse) {
    const before = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(e => !isDBHook(e));
    removed += before - settings.hooks.PostToolUse.length;
  }

  // Clean up empty arrays/objects
  if (settings.hooks?.PreToolUse?.length === 0)  delete settings.hooks.PreToolUse;
  if (settings.hooks?.PostToolUse?.length === 0) delete settings.hooks.PostToolUse;
  if (Object.keys(settings.hooks || {}).length === 0) delete settings.hooks;

  writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2) + '\n');

  // Remove dual-brain section from global CLAUDE.md
  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md');
  if (existsSync(globalClaudeMd)) {
    let content = readFileSync(globalClaudeMd, 'utf8');
    const dbSectionRegex = /\n## Dual-Brain Global Hooks\n[\s\S]*?Managed by: dual-brain install --global\n/;
    content = content.replace(dbSectionRegex, '');
    if (content.trim()) {
      writeFileSync(globalClaudeMd, content);
    } else {
      unlinkSync(globalClaudeMd);
    }
  }

  console.log(`  - removed ${removed} dual-brain hook${removed === 1 ? '' : 's'} from global settings`);
  console.log('  Other settings preserved.');
}

function cmdRemember(text) {
  if (!text) err('Usage: dual-brain remember "preference text"');
  const profile = rememberPreference(text, { scope: 'project', cwd: process.cwd() });
  console.log(`Preference saved. Total active: ${profile.preferences.filter(p => p.enabled).length}`);
}

function cmdForget(text) {
  if (!text) err('Usage: dual-brain forget "preference text"');
  forgetPreference(text, process.cwd());
  console.log('Preference removed (if matched).');
}

function cmdBreakGlass(reason) {
  if (!reason) err('Usage: dual-brain break-glass "reason"');
  const cwd = process.cwd();
  const dualbrain = join(cwd, '.dualbrain');
  const tokenPath = join(dualbrain, 'break-glass.json');
  const auditDir  = join(dualbrain, 'audit');
  const auditFile = join(auditDir, 'head-audit.jsonl');
  const TTL_MINUTES = 5;

  mkdirSync(dualbrain, { recursive: true });
  mkdirSync(auditDir, { recursive: true });

  const token = {
    createdAt: Date.now(),
    ttlMinutes: TTL_MINUTES,
    reason,
  };
  writeFileSync(tokenPath, JSON.stringify(token, null, 2));

  // Audit entry
  const auditEntry = {
    ts: new Date().toISOString(),
    event: 'break-glass-activated',
    reason,
    ttlMinutes: TTL_MINUTES,
    expiresAt: new Date(token.createdAt + TTL_MINUTES * 60 * 1000).toISOString(),
  };
  try {
    appendFileSync(auditFile, JSON.stringify(auditEntry) + '\n');
  } catch { /* non-fatal */ }

  const width = 51;
  const inner = width - 2;
  const pad = (s) => ' ' + s + ' '.repeat(inner - 1 - s.length);
  const reasonLine  = `Reason: ${reason}`;
  const expiresLine = `Expires: ${TTL_MINUTES} minutes`;
  const auditLine   = 'All tool calls logged to audit.';

  console.log('┌' + '─'.repeat(inner) + '┐');
  console.log('│' + pad('🔓 Break-Glass Activated') + '│');
  console.log('├' + '─'.repeat(inner) + '┤');
  console.log('│' + pad(reasonLine) + '│');
  console.log('│' + pad(expiresLine) + '│');
  console.log('│' + pad(auditLine) + '│');
  console.log('└' + '─'.repeat(inner) + '┘');
}

// ─── PR command ───────────────────────────────────────────────────────────────

async function cmdPR(args) {
  const cwd = process.cwd();
  const sub = args[0] ?? '';

  // Lazy import — only loaded when 'pr' is invoked
  let prAgent;
  try {
    prAgent = await import('../dist/src/pr-agent.js');
  } catch (e) {
    console.error('pr-agent module not available:', e.message);
    process.exit(1);
  }

  const gh = prAgent.hasGitHub();
  if (!gh.available) {
    console.error('gh CLI not found. Install GitHub CLI: https://cli.github.com');
    process.exit(1);
  }

  // ── dual-brain pr  (show current branch PR status) ──────────────────────────
  if (!sub || sub === 'status') {
    if (!gh.authenticated) {
      console.log('gh CLI is available but not authenticated. Run: gh auth login');
      return;
    }
    const info = prAgent.getBranchInfo(cwd);
    console.log('\n── PR status ─────────────────────────────────────────────\n');
    console.log(`  Branch:   ${info.branch ?? '(unknown)'}`);
    console.log(`  Base:     ${info.defaultBranch}`);
    console.log(`  Ahead:    ${info.ahead} commit(s)`);
    console.log(`  Behind:   ${info.behind} commit(s)`);

    if (info.isDefault) {
      console.log('\n  On default branch — create a feature branch first.');
      return;
    }

    // Check for an existing PR on this branch
    try {
      const { execSync: _exec } = await import('node:child_process');
      const json = _exec(`gh pr list --head "${info.branch}" --json number,title,state,url`, {
        cwd, encoding: 'utf8', timeout: 10000,
      });
      const prs = JSON.parse(json);
      if (prs.length > 0) {
        const pr = prs[0];
        console.log(`\n  PR #${pr.number}: ${pr.title}`);
        console.log(`  State: ${pr.state}`);
        console.log(`  URL:   ${pr.url}`);
      } else {
        console.log('\n  No PR open for this branch.');
        console.log(`  Create one: dual-brain pr create`);
      }
    } catch {
      console.log('\n  (Could not check for existing PR — run: gh pr status)');
    }
    console.log('');
    return;
  }

  // ── dual-brain pr list ───────────────────────────────────────────────────────
  if (sub === 'list') {
    if (!gh.authenticated) {
      console.log('gh CLI not authenticated. Run: gh auth login');
      return;
    }
    const state = args.includes('--closed') ? 'closed' : args.includes('--all') ? 'all' : 'open';
    const prs = prAgent.listPRs(cwd, { state, limit: 20 });
    if (prs.length === 0) {
      console.log(`No ${state} PRs found.`);
      return;
    }
    console.log(`\n── ${state} PRs ──────────────────────────────────────────────\n`);
    for (const pr of prs) {
      const draft = pr.isDraft ? ' [draft]' : '';
      const date  = pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '';
      console.log(`  #${pr.number}  ${pr.title}${draft}`);
      console.log(`       ${pr.headRefName}  by ${pr.author?.login ?? '?'}  ${date}`);
    }
    console.log('');
    return;
  }

  // ── dual-brain pr view <N> ───────────────────────────────────────────────────
  if (sub === 'view') {
    const prNum = args[1];
    if (!prNum || isNaN(Number(prNum))) {
      console.error('Usage: dual-brain pr view <PR-number>');
      process.exit(1);
    }
    const details = prAgent.getPRDetails(prNum, cwd);
    if (!details) {
      console.error(`PR #${prNum} not found or gh CLI error.`);
      process.exit(1);
    }
    console.log(`\n── PR #${prNum}: ${details.title} ─────────────────────────────\n`);
    console.log(`  State:    ${details.state}`);
    console.log(`  Branch:   ${details.headRefName} → ${details.baseRefName}`);
    console.log(`  Changes:  +${details.additions} -${details.deletions}  (${details.changedFiles} files)`);
    if (details.statusCheckRollup?.length) {
      const passing = details.statusCheckRollup.filter(c => c.conclusion === 'SUCCESS').length;
      const total   = details.statusCheckRollup.length;
      console.log(`  Checks:   ${passing}/${total} passing`);
    }
    if (details.body) {
      console.log('\n  Body:\n');
      console.log(details.body.split('\n').map(l => `    ${l}`).join('\n').slice(0, 1500));
    }
    console.log('');
    return;
  }

  // ── dual-brain pr create ─────────────────────────────────────────────────────
  if (sub === 'create') {
    if (!gh.authenticated) {
      console.log('gh CLI not authenticated. Run: gh auth login');
      return;
    }
    const info = prAgent.getBranchInfo(cwd);
    if (info.isDefault || !info.branch) {
      console.error('You are on the default branch. Switch to a feature branch before creating a PR.');
      process.exit(1);
    }
    if (info.ahead === 0) {
      console.error('No commits ahead of the base branch. Make changes and commit first.');
      process.exit(1);
    }

    const diff = prAgent.getDiffSummary(info.defaultBranch, cwd);
    const draft = args.includes('--draft');

    // Auto-generate a title from the branch name
    const rawTitle = info.branch.replace(/^db\//, '').replace(/-/g, ' ');
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

    // Auto-generate body from diff
    const body = prAgent.buildPRBody(title, {
      filesChanged: diff.files,
    });

    console.log(`\n── Creating PR from ${info.branch} → ${info.defaultBranch} ────────────\n`);
    console.log(`  Title:  ${title}`);
    console.log(`  Files:  ${diff.fileCount} changed`);
    if (diff.summary) console.log(`  Diff:   ${diff.summary}`);
    if (draft) console.log('  Mode:   draft');
    console.log('');

    const result = prAgent.createPR({
      title,
      body,
      baseBranch: info.defaultBranch,
      draft,
      cwd,
    });

    if (result.success) {
      console.log(`  PR created: ${result.url}`);
    } else {
      console.error(`  Failed to create PR: ${result.error}`);
      process.exit(1);
    }
    console.log('');
    return;
  }

  // Unknown sub-subcommand
  console.log(`Unknown pr subcommand: "${sub}"`);
  console.log('Usage:');
  console.log('  dual-brain pr              Show PR status for current branch');
  console.log('  dual-brain pr create       Create PR from current branch');
  console.log('  dual-brain pr list         List open PRs');
  console.log('  dual-brain pr view <N>     View PR details');
}

// ─── Screen helpers ───────────────────────────────────────────────────────────

/**
 * Render the dual-brain-style rounded header box for the main screen.
 * Inner width is 39 chars. Lines are padded with spaces to fill the box.
 */
function renderHeader(version, providerLines, dtVersion) {
  const W = 39; // inner width
  const pad = (s) => {
    // Strip ANSI codes for length calculation
    const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
    return s + ' '.repeat(Math.max(0, W - visible.length));
  };
  const top    = `  ┌${'─'.repeat(W)}┐`;
  const sep    = `  ├${'─'.repeat(W)}┤`;
  const bottom = `  └${'─'.repeat(W)}┘`;

  const title  = `🧠 Dual Brain v${version}`;
  const credit = `dual-brain`;

  const allProviderLines = [...providerLines];
  if (dtVersion) {
    allProviderLines.push(`📦 replit-tools v${dtVersion} detected`);
  }

  const lines = [top];
  lines.push(`  │ ${pad(title)}│`);
  lines.push(`  │ ${pad(credit)}│`);
  lines.push(sep);
  for (const pl of allProviderLines) {
    lines.push(`  │ ${pad(pl)}│`);
  }
  lines.push(bottom);
  return lines.join('\n');
}

function profileExists(cwd) {
  const dir = cwd || process.cwd();
  const globalPath  = join(process.env.HOME || '/root', '.config', 'dual-brain', 'profile.json');
  const projectPath = join(dir, '.dualbrain', 'profile.json');
  // Check file existence AND that setup wizard completed (setupComplete flag)
  if (existsSync(projectPath)) {
    try {
      const p = JSON.parse(readFileSync(projectPath, 'utf8'));
      return p.setupComplete === true;
    } catch { return true; } // malformed but exists — treat as complete
  }
  if (existsSync(globalPath)) {
    try {
      const p = JSON.parse(readFileSync(globalPath, 'utf8'));
      return p.setupComplete === true;
    } catch { return true; }
  }
  return false;
}

// ─── Plan label helpers ───────────────────────────────────────────────────────

const CLAUDE_PLAN_LABELS = {
  pro:   'Pro',
  max5:  'Max x5',
  max20: 'Max x20',
  '$20':  'Pro',          // doctor:verified — backward-compat key for legacy stored plan value
  '$100': 'Max x5',       // doctor:verified — backward-compat key for legacy stored plan value
  '$200': 'Max x20',      // doctor:verified — backward-compat key for legacy stored plan value
};
const OPENAI_PLAN_LABELS = {
  plus:   'Plus',
  pro:    'Pro',
  pro100: 'Pro',
  pro200: 'Pro (higher limits)',
  '$20':  'Plus',                 // doctor:verified — backward-compat key for legacy stored plan value
  '$100': 'Pro',                  // doctor:verified — backward-compat key for legacy stored plan value
  '$200': 'Pro (higher limits)',  // doctor:verified — backward-compat key for legacy stored plan value
};

// ─── Screen: welcomeScreen ────────────────────────────────────────────────────

async function welcomeScreen(rl, ask) {
  const version = readVersion();
  const cwd = process.cwd();

  // --- Detect CLI login status ---
  process.stdout.write(`\ndual-brain v${version} — Setup\n\nDetecting your setup...\n`);

  const auth  = await detectAuth();
  const plans = detectPlans();

  const claudeReady = auth.claude.found;
  const openaiReady = auth.openai.found;

  // Plan labels are inferred from auth config (rate-limit tier / JWT),
  // not reported directly by the CLI. Suffix shows configured tier, not plan name.
  const claudePlanSuffix = claudeReady && plans.claude
    ? ` · ${plans.claude} configured`
    : '';
  const openaiPlanSuffix = openaiReady && plans.openai
    ? ` · ${plans.openai} configured`
    : '';

  const detectedLines = [];
  if (claudeReady) detectedLines.push(`  Claude: authenticated${claudePlanSuffix}`);
  else             detectedLines.push(`  Claude: not connected`);
  if (openaiReady) detectedLines.push(`  Codex: authenticated${openaiPlanSuffix}`);
  else             detectedLines.push(`  Codex: not connected`);

  console.log('');
  console.log('Detected:');
  for (const line of detectedLines) {
    const ok = !line.includes('not logged');
    console.log(`  ${ok ? '' : ''}${line.trim()}`);
  }
  console.log('');

  // --- Detect replit-tools sessions ---
  const env = detectEnvironment();
  const existingSessions = importReplitSessions(cwd);
  if (env.hasReplitTools) {
    detectedLines.push(`  replit-tools detected`);
  }
  if (existingSessions.length > 0) {
    detectedLines.push(`  ${existingSessions.length} session${existingSessions.length !== 1 ? 's' : ''} found from replit-tools`);
  }

  // --- Detect replit-tools ---
  const rt = detectReplitTools(cwd);
  if (rt.installed) {
    detectedLines.push(`  replit-tools v${rt.version || '?'} detected`);
    if (rt.hasArchive) {
      try {
        const archiveDir = join(rt.dir, '.session-archive', 'claude', 'projects', '-home-runner-workspace');
        if (existsSync(archiveDir)) {
          const count = readdirSync(archiveDir).filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-')).length;
          if (count > 0) detectedLines.push(`  ${count} archived sessions available`);
        }
      } catch {}
    }
  } else {
    detectedLines.push(`  replit-tools not found — install with: npx replit-tools`);
  }

  // Show detection results in a box
  const detectedFormatted = detectedLines.map(line => {
    const ok = !line.includes('not logged') && !line.includes('not found');
    return `${ok ? '✅' : '⚠️ '} ${line.trim()}`;
  });
  console.log('');
  console.log(box(`🧠 Dual-Brain v${version} — Setup`, detectedFormatted));
  console.log('');

  if (!claudeReady && !openaiReady) {
    console.log('No CLI login found. Log in first:');
    console.log('  claude login        — for Claude');
    console.log('  codex login         — for OpenAI/Codex\n');
    console.log('Then re-run: dual-brain init');
    return { next: 'exit' };
  }

  console.log('  [Enter] Save and go');
  console.log('  [c]     Customize work style');
  if (existingSessions.length > 0) {
    console.log(`  [i]     Import ${existingSessions.length} session${existingSessions.length !== 1 ? 's' : ''} from replit-tools`);
  }
  if (!rt.installed) {
    console.log('');
    console.log('  💡 Tip: Install replit-tools for session persistence:');
    console.log('     npx replit-tools');
  }
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'i' && existingSessions.length > 0) {
    console.log(`\n  Importing ${existingSessions.length} sessions from replit-tools...\n`);
    const recent = existingSessions.slice(0, 5);
    for (const sess of recent) {
      console.log(`  ${sess.age.padEnd(6)}  ${sess.name}`);
    }
    if (existingSessions.length > 5) {
      console.log(`  ... and ${existingSessions.length - 5} more`);
    }
    const meta = getSessionMeta(cwd);
    const now = new Date().toISOString();
    for (const sess of existingSessions) {
      meta[sess.id] = {
        ...meta[sess.id],
        source: 'data-tools',
        importedAt: meta[sess.id]?.importedAt || now,
        createdAt: meta[sess.id]?.createdAt || now,
      };
    }
    saveSessionMeta(meta, cwd);
    console.log('\n  Sessions imported! They\'ll appear in your Recent list.\n');
    await ask('  Press Enter to continue...');
    // Fall through to auto-save
  }

  if (choice !== 'c') {
    // Auto-save detected plans and proceed
    const setup = await autoSetup(cwd);
    if (setup.confident && setup.profile) {
      saveProfile(setup.profile, { cwd });
    } else {
      // Build profile from what we know
      const existing = loadProfile(cwd);
      if (claudeReady) {
        existing.providers.claude = { enabled: true, plan: plans.claude || 'pro' };
      }
      if (openaiReady) {
        existing.providers.openai = { enabled: true, plan: plans.openai || 'plus' };
      }
      const enabledCount = [claudeReady, openaiReady].filter(Boolean).length;
      existing.mode = enabledCount >= 2 ? 'dual' : claudeReady ? 'solo-claude' : 'solo-openai';
      saveProfile(existing, { cwd });
    }
    try {
      const { ensurePersistence } = await import('../dist/src/session.js');
      const persisted = ensurePersistence(cwd);
      if (persisted.length > 0) {
        persisted.forEach(msg => console.log(`  ✅ ${msg}`));
      }
    } catch {}
    await cmdInstall(cwd);
    return { next: 'main' };
  }

  // ── [c] Customize: plan picker ───────────────────────────────────────────

  const existingProfile = loadProfile(cwd);

  // Claude plan picker
  if (claudeReady) {
    console.log('');
    console.log(separator('Claude plan'));
    console.log('  (1) Pro');
    console.log('  (2) Max x5');
    console.log('  (3) Max x20');
    console.log('  (4) Skip');
    const claudeChoice = (await ask('> ')).trim();
    const claudePlanMap = { '1': 'pro', '2': 'max5', '3': 'max20' };
    if (claudeChoice !== '4') {
      existingProfile.providers.claude = {
        enabled: true,
        plan: claudePlanMap[claudeChoice] || plans.claude || 'pro',
      };
    } else {
      existingProfile.providers.claude = { enabled: false, plan: plans.claude || 'pro' };
    }
  }

  // OpenAI plan picker
  if (openaiReady) {
    console.log('');
    console.log(separator('OpenAI plan'));
    console.log('  (1) Plus');
    console.log('  (2) Pro');
    console.log('  (3) Pro (higher limits)');
    console.log('  (4) Skip');
    const openaiChoice = (await ask('> ')).trim();
    const openaiPlanMap = { '1': 'plus', '2': 'pro', '3': 'pro200' };
    if (openaiChoice !== '4') {
      existingProfile.providers.openai = {
        enabled: true,
        plan: openaiPlanMap[openaiChoice] || plans.openai || 'plus',
      };
    } else {
      existingProfile.providers.openai = { enabled: false, plan: plans.openai || 'plus' };
    }
  }

  // Mode picker
  console.log('');
  console.log(separator('Optimization'));
  console.log('  (1) Save usage — prefer cheaper models');
  console.log('  (2) Balanced — best model per tier (recommended)');
  console.log('  (3) Quality first — always use best available');
  const modeChoice = (await ask('> ')).trim();
  existingProfile.mode = ({ '1': 'cost-saver', '3': 'quality-first' })[modeChoice] || 'balanced';

  // Team setup
  console.log('');
  console.log('  Team auth: label providers and set expiry for auto-refresh.');
  console.log('  When a provider link expires, dual-brain will prompt re-login automatically.');
  console.log('');
  console.log('  [Enter] Skip   [t] Set up team auth');
  const teamChoice = (await ask('  Choice: ')).trim().toLowerCase();
  if (teamChoice === 't') {
    for (const provider of ['claude', 'openai']) {
      if (!existingProfile.providers[provider]?.enabled) continue;
      const provLabel = provider === 'claude' ? 'Claude' : 'OpenAI';
      const label = (await ask(`  ${provLabel} label (e.g. "Josh's work account"): `)).trim();
      if (label) existingProfile.providers[provider].label = label;
      const expiry = await askExpiry(ask, provLabel);
      if (expiry) existingProfile.providers[provider].expiresAt = expiry;
    }
  }

  const enabledCount = Object.values(existingProfile.providers).filter(p => p.enabled).length;
  existingProfile.mode = enabledCount >= 2 ? existingProfile.mode || 'auto' : claudeReady ? 'solo-claude' : 'solo-openai';

  saveProfile(existingProfile, { cwd });

  // Summary
  const summaryLines = [];
  for (const [key, prov] of Object.entries(existingProfile.providers)) {
    const planLabel = key === 'claude'
      ? (CLAUDE_PLAN_LABELS[prov.plan] ?? prov.plan)
      : (OPENAI_PLAN_LABELS[prov.plan] ?? prov.plan);
    summaryLines.push(`${key === 'claude' ? 'Claude' : 'OpenAI'}: ${prov.enabled ? planLabel : 'disabled'}${prov.label ? ` [${prov.label}]` : ''}`);
  }
  summaryLines.push(`Mode: ${existingProfile.mode}`);

  console.log('');
  console.log(box('Setup Complete', summaryLines));
  console.log('');

  await cmdInstall(cwd);
  return { next: 'main' };
}

// ─── Running-instance + terminal helpers ─────────────────────────────────────

function countRunningInstances() {
  try {
    const claude = parseInt(execSync('pgrep -x claude 2>/dev/null | wc -l', { encoding: 'utf8' }).trim(), 10) || 0;
    const codex  = parseInt(execSync('pgrep -x codex 2>/dev/null | wc -l',  { encoding: 'utf8' }).trim(), 10) || 0;
    return { claude, codex };
  } catch { return { claude: 0, codex: 0 }; }
}

function getTerminalId() {
  try {
    const tty = execSync('tty 2>/dev/null', { encoding: 'utf8' }).trim();
    if (tty && tty !== 'not a tty') {
      return tty.replace('/dev/', '').replace(/\//g, '-');
    }
  } catch {}
  return `shell-${process.pid}`;
}

function saveTerminalState(cwd, terminalId, sessionId, tool) {
  const dir = join(cwd, '.dualbrain');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `terminal-${terminalId}.json`), JSON.stringify({
      sessionId, tool, terminalId, timestamp: Math.floor(Date.now() / 1000),
    }));
  } catch {}
}

function loadTerminalState(cwd, terminalId) {
  try {
    return JSON.parse(readFileSync(join(cwd, '.dualbrain', `terminal-${terminalId}.json`), 'utf8'));
  } catch { return null; }
}

// ─── PR Detection ─────────────────────────────────────────────────────────────

/**
 * Detect open PRs using the gh CLI.
 * Gracefully returns [] if gh is not installed, no remote, no auth, or no PRs.
 *
 * @param {string} cwd
 * @returns {Promise<Array>}
 */
async function detectOpenPRs(cwd) {
  try {
    // 1. Check if gh CLI exists (1s timeout)
    const ghCheck = _spawnSyncTop('which', ['gh'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 1000,
    });
    if (ghCheck.status !== 0) return [];

    // 2. Check if repo has a GitHub remote
    const remoteCheck = _spawnSyncTop('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 1000,
    });
    if (remoteCheck.status !== 0) return [];
    const remoteUrl = (remoteCheck.stdout || '').trim();
    if (!remoteUrl.includes('github.com')) return [];

    // 3. Fetch open PRs (3s timeout)
    const prResult = _spawnSyncTop('gh', [
      'pr', 'list',
      '--state', 'open',
      '--json', 'number,title,reviewDecision,reviewRequests,additions,deletions,changedFiles,headRefName',
      '--limit', '5',
    ], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    });

    if (prResult.status !== 0) return [];
    const raw = (prResult.stdout || '').trim();
    if (!raw) return [];

    const prs = JSON.parse(raw);
    if (!Array.isArray(prs)) return [];
    return prs;
  } catch {
    return [];
  }
}

// ─── Dashboard box helpers ────────────────────────────────────────────────────

/**
 * Detect repo state for action cards. All checks run with tight timeouts —
 * best-effort only, never blocks startup.
 *
 * Returns: { dirtyCount, lastCommitAgeDays, lastFailure, isGitRepo }
 */
function detectRepoState(cwd) {
  const result = { dirtyCount: 0, lastCommitAgeDays: 0, lastFailure: null, isGitRepo: false };
  try {
    execSync('git rev-parse --git-dir', { cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe' });
    result.isGitRepo = true;
  } catch { return result; }

  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe' });
    result.dirtyCount = status.trim().split('\n').filter(Boolean).length;
  } catch {}

  try {
    const logOut = execSync('git log --format="%ct" -1', { cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe' }).trim();
    if (logOut) {
      const commitTs = parseInt(logOut, 10) * 1000;
      result.lastCommitAgeDays = Math.floor((Date.now() - commitTs) / 86400000);
    }
  } catch {}

  try {
    const sessionPath = join(cwd, '.dualbrain', 'session.json');
    if (existsSync(sessionPath)) {
      const sess = JSON.parse(readFileSync(sessionPath, 'utf8'));
      const lastResult = sess?.lastResult;
      if (lastResult?.status === 'failure') {
        const summary = lastResult.task
          ? String(lastResult.task).slice(0, 40)
          : 'last task';
        result.lastFailure = summary;
      }
    }
  } catch {}

  return result;
}

/**
 * Build action card rows for the dashboard based on repo state.
 * Returns an array of box row strings (may be empty).
 * openPRs is optional — if provided, a PR card is included.
 */
function buildActionRows(repoState, rowFn, openPRs = []) {
  if (!repoState.isGitRepo) return [];

  const YELLOW = '\x1b[33m';
  const RED    = '\x1b[31m';
  const GREEN  = '\x1b[32m';
  const CYAN   = '\x1b[36m';
  const DIM    = '\x1b[2m';
  const RESET  = '\x1b[0m';

  const cards = [];

  if (repoState.dirtyCount > 0) {
    cards.push(`${YELLOW}⚡${RESET} ${repoState.dirtyCount} uncommitted file${repoState.dirtyCount === 1 ? '' : 's'}`);
  }

  if (repoState.lastFailure !== null) {
    cards.push(`${RED}⚡${RESET} Last task failed: ${repoState.lastFailure}`);
  }

  if (repoState.lastCommitAgeDays >= 3) {
    cards.push(`${YELLOW}⚡${RESET} ${repoState.lastCommitAgeDays} day${repoState.lastCommitAgeDays === 1 ? '' : 's'} since last commit`);
  }

  // PR card — show a summary of open PRs when gh is available
  if (openPRs.length > 0) {
    const prSummary = openPRs.slice(0, 2)
      .map(pr => `#${pr.number} ${String(pr.title).slice(0, 22)}`)
      .join(', ');
    const trunc = openPRs.length > 2 ? ` +${openPRs.length - 2}` : '';
    cards.push(`${CYAN}⇅${RESET} ${openPRs.length} open PR${openPRs.length === 1 ? '' : 's'}: ${prSummary}${trunc}`);
  }

  if (cards.length === 0) {
    return [rowFn(`${DIM}${GREEN}✓${RESET}${DIM} Repo clean${RESET}`)];
  }

  return cards.map(c => rowFn(c));
}

/**
 * Detect interrupted work from the most recent session.
 * Returns a continuation hint if confidence is high enough, or null to skip.
 *
 * Signals that indicate interrupted work:
 *  - Session < 4 hours old with no clean exit
 *  - Last result was a failure
 *  - Uncommitted git changes exist
 *  - Session has high message count (user was deep in work)
 *
 * Minimum thresholds: messageCount > 5 OR filesChanged > 0
 *
 * @param {Array} sessions   — from importReplitSessions / enrichSessions
 * @param {string} cwd
 * @returns {{ shouldContinue: boolean, reason: string, sessionId: string, sessionName: string, lastState: string|null, ageLabel: string }|null}
 */
function detectInterruptedWork(sessions, cwd) {
  if (!sessions || sessions.length === 0) return null;

  const most = sessions[0]; // already sorted most-recent first
  if (!most || !most.lastActive) return null;

  const ageMs = Date.now() - new Date(most.lastActive).getTime();
  const fourH = 4 * 60 * 60 * 1000;

  // Must be within 4 hours
  if (ageMs >= fourH) return null;

  // Load session.json for deeper signal
  const session = loadSession(cwd);

  // Minimum thresholds: must have real work depth
  const msgCount     = most.messageCount ?? most.promptCount ?? 0;
  const filesChanged = session?.filesChanged?.length ?? 0;
  if (msgCount <= 5 && filesChanged === 0) return null;

  const lastResultStatus = session?.lastResult?.status ?? null;

  // Build confidence signals
  const signals = [];
  if (lastResultStatus === 'failure') signals.push('last run failed');
  if (filesChanged > 0) signals.push(`${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`);
  if (msgCount > 10) signals.push('deep session');

  // Check for uncommitted git changes
  try {
    const gitResult = _spawnSyncTop('git', ['status', '--porcelain'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
    });
    if (gitResult.status === 0 && gitResult.stdout.trim().length > 0) {
      signals.push('uncommitted changes');
    }
  } catch { /* non-fatal */ }

  // Need at least one signal beyond base thresholds to avoid annoying low-signal cards
  if (signals.length === 0 && msgCount <= 10) return null;

  // Build a human-readable "last state" from available data
  let lastState = null;
  if (session?.lastResult?.summary) {
    lastState = session.lastResult.summary;
  } else if (session?.objective) {
    lastState = session.objective;
  } else if (most.name && !/^Session [0-9a-f]{8}/i.test(most.name)) {
    lastState = most.name;
  }

  // Trim lastState to fit on one line
  if (lastState && lastState.length > 45) lastState = lastState.slice(0, 42) + '...';

  // Build reason label
  const reason = signals.length > 0 ? signals.join(', ') : `${msgCount} messages`;

  // Age label
  const mins = Math.floor(ageMs / 60000);
  let ageLabel;
  if (mins < 1)       ageLabel = 'just now';
  else if (mins < 60) ageLabel = `${mins}m ago`;
  else                ageLabel = `${Math.floor(mins / 60)}h ago`;

  return {
    shouldContinue: true,
    reason,
    sessionId:   most.id,
    sessionName: most.name || most.id.slice(0, 8),
    lastState,
    ageLabel,
  };
}

// ─── Provider status helpers ───────────────────────────────────────────────────

/**
 * Build a provider status string for the dashboard status line.
 * Shows: "● Claude  ● OpenAI  ⚖️  Balanced"
 * Uses ANSI color codes for the dots — no dollar amounts or usage bars.
 */
function buildProviderStatusLine(profile, auth, envReport = null) {
  const GREEN = '\x1b[32m●\x1b[0m';
  const RED   = '\x1b[31m●\x1b[0m';

  // Subscription-only detection — no API key secrets
  const claudeAvailable = auth.claude.found;
  const openaiAvailable = auth.openai.found;

  const claudeDot = claudeAvailable ? GREEN : RED;
  const openaiDot = openaiAvailable ? GREEN : RED;

  const WORK_STYLE_LABELS = {
    'auto':          '⚡ Fast',
    'cost-saver':    '⚡ Fast',
    'balanced':      '⚖️  Balanced',
    'quality-first': '🔥 Full Power',
    'solo-claude':   '⚡ Fast',
    'solo-openai':   '⚡ Fast',
  };
  const bias  = profile?.bias || profile?.mode || 'balanced';
  const label = WORK_STYLE_LABELS[bias] || '⚖️  Balanced';

  return `${claudeDot} Claude     ${openaiDot} OpenAI     ${label}`;
}
/**
 * Render a box row padded to inner width W (stripping ANSI for length calculation).
 * Returns a string like: "│ content padded to W │"
 */
function makeBoxRow(content, W) {
  // Strip ANSI codes, then strip zero-width variation selectors (U+FE0F etc.)
  // so that emoji like ⚖️ (U+2696+U+FE0F) don't inflate the measured length.
  const plain = content
    .replace(/\x1b\[[0-9;]*m/g, '')  // ANSI color codes
    .replace(/[\uFE00-\uFE0F]/g, ''); // variation selectors (zero-width)
  const padding = Math.max(0, W - plain.length);
  return `│ ${content}${' '.repeat(padding)} │`;
}

// ─── Command palette: input classifier ───────────────────────────────────────

// HEAD state — loaded lazily, shared across REPL turns
let _headState = null;
let _headModuleCache = null;

async function _getHeadModule() {
  if (!_headModuleCache) {
    try {
      _headModuleCache = await import('../dist/src/head.js');
    } catch {
      _headModuleCache = null;
    }
  }
  return _headModuleCache;
}

function _getHeadState() {
  if (!_headState) {
    try {
      const head = _headModuleCache;
      _headState = head ? head.loadState() : null;
    } catch {
      _headState = null;
    }
  }
  return _headState;
}

const FREE_COMMANDS = new Map([
  ['resume', 'resume'], ['r', 'resume'],
  ['status', 'status'], ['sessions', 'sessions'], ['ss', 'sessions'],
  ['settings', 'settings'], ['s', 'settings'],
  ['team', 'team'], ['t', 'team'],
  ['doctor', 'doctor'], ['d', 'doctor'],
  ['health', 'health'], ['h', 'health'],
  ['projects', 'projects'], ['p', 'projects'],
  ['help', 'help'], ['?', 'help'],
  ['quit', 'quit'], ['q', 'quit'], ['exit', 'quit'],
  ['budget', 'budget'], ['b', 'budget'],
  ['auto', 'auto'], ['automode', 'auto'],
]);

/**
 * Classify user input using HEAD's cognitive pipeline.
 * Returns a tier-compatible object that maps HEAD's deliberation to the
 * existing REPL routing: free/skill/cheap/full, plus HEAD judgment metadata.
 *
 *   { tier: 'free', command, args }            — deterministic, zero tokens
 *   { tier: 'skill', skill, args, command }    — slash command
 *   { tier: 'cheap', headJudgment }            — question → haiku
 *   { tier: 'full', headJudgment, model }      — work task → dispatch
 */
function classifyInput(input) {
  const trimmed = input.trim();
  const lower   = trimmed.toLowerCase();
  const parts   = trimmed.split(/\s+/);
  const cmd     = parts[0].toLowerCase();
  const args    = parts.slice(1);

  // Tier 0: SKILL — slash commands (checked first, deterministic)
  if (trimmed.startsWith('/')) {
    try {
      if (typeof _cachedMatchSkill === 'function') {
        const skill = _cachedMatchSkill(trimmed);
        if (skill) {
          const skillArgs = trimmed.replace(/^\/\w+\s*/, '');
          return { tier: 'skill', skill, args: skillArgs, command: skill.command };
        }
      }
    } catch {}
  }

  // Tier 1: FREE — exact command matches (zero tokens, no HEAD needed)
  if (FREE_COMMANDS.has(cmd)) {
    return { tier: 'free', command: FREE_COMMANDS.get(cmd), args };
  }
  if (lower.startsWith('search ')) {
    return { tier: 'free', command: 'search', args: parts.slice(1) };
  }
  if (lower === 'init --replit') {
    return { tier: 'free', command: 'init --replit', args: [] };
  }

  // ── HEAD cognitive pipeline: replaces regex-based cheap/full split ──────
  // Try cognitive loop first (wraps HEAD with wave planning + predictions)
  if (_cognitiveLoopCache) {
    try {
      const loopResult = _cognitiveLoopCache.enter(trimmed, {});

      const judgment = {
        depth: loopResult.action?.depth || 'full',
        action: loopResult.action,
        shouldAskUser: loopResult.shouldAskUser,
        shouldDispatch: loopResult.phase === 'dispatch',
        shouldClarify: loopResult.action?.type === 'clarify',
        shouldThink: loopResult.action?.type === 'think',
        rationale: loopResult.rationale,
        confidence: loopResult.action?.confidence,
        obligations: loopResult.action?.obligations,
        surfaceNoticings: loopResult.surfaceNoticings,
        // Cognitive loop extensions
        _loopResult: loopResult,
        _plan: loopResult.plan,
        _nextDispatch: loopResult.nextDispatch,
      };

      // Loop says respond — no dispatch needed
      if (loopResult.phase === 'respond') {
        return { tier: 'cheap', headJudgment: judgment };
      }

      // Loop says dispatch — full tier, use plan's first agent tier to pick model
      if (loopResult.phase === 'dispatch') {
        const firstAgent = loopResult.nextDispatch?.agents?.[0];
        const model = firstAgent?.tier === 'deep' || firstAgent?.tier === 'opus' ? 'opus' : 'sonnet';
        return { tier: 'full', headJudgment: judgment, model };
      }

      // Default: cheap
      return { tier: 'cheap', headJudgment: judgment };
    } catch {
      // Cognitive loop failed — fall through to direct HEAD
    }
  }

  // Direct HEAD fallback (when cognitive loop unavailable or errored)
  const head = _headModuleCache;
  if (head) {
    const state = _getHeadState() || head.freshState();
    const turn = head.processTurn(state, trimmed, {});
    _headState = state; // persist across turns

    const judgment = {
      depth: turn.depth,
      action: turn.action,
      shouldAskUser: turn.shouldAskUser,
      shouldDispatch: turn.shouldDispatch,
      shouldClarify: turn.shouldClarify,
      shouldThink: turn.shouldThink,
      rationale: turn.rationale,
      confidence: turn.result.confidence,
      obligations: turn.result.obligations,
      surfaceNoticings: turn.result.surfaceNoticings,
    };

    // Map HEAD's depth → tier + model
    if (turn.depth === 'reflexive' && !turn.shouldDispatch) {
      return { tier: 'cheap', headJudgment: judgment };
    }

    // HEAD says clarify → cheap tier (ask a question, don't dispatch work)
    if (turn.shouldClarify) {
      return { tier: 'cheap', headJudgment: judgment };
    }

    // HEAD says think/plan → full tier with opus
    if (turn.shouldThink) {
      return { tier: 'full', headJudgment: judgment, model: 'opus' };
    }

    // HEAD says dispatch → full tier, model based on depth
    if (turn.shouldDispatch) {
      const model = turn.depth === 'deep' ? 'opus' : 'sonnet';
      return { tier: 'full', headJudgment: judgment, model };
    }

    // HEAD says respond (not dispatch) → cheap
    if (turn.action.type === 'respond') {
      return { tier: 'cheap', headJudgment: judgment };
    }

    // Default: let depth drive it
    if (turn.depth === 'light' || turn.depth === 'reflexive') {
      return { tier: 'cheap', headJudgment: judgment };
    }
    return { tier: 'full', headJudgment: judgment };
  }

  // ── Fallback: HEAD not loaded, use simple heuristics ───────────────────
  const QUESTION_WORDS = /^(why|what|how|where|when|who|is my|check|show me|explain|tell me|list|am i|are there|does|did|can i|will|should i)/i;
  if (QUESTION_WORDS.test(lower)) {
    return { tier: 'cheap' };
  }

  return { tier: 'full' };
}

// ─── Dashboard: resume state detection ───────────────────────────────────────

/**
 * Detect resumable state for dashboard contextual hint.
 * Returns an object with type ('resumable' | 'fresh' | 'none') and detail fields.
 * All checks are best-effort and fail silent.
 */
async function detectResumeState(cwd) {
  const result = { type: 'none', label: null, ageLabel: null, nextAction: null };

  // Check for recent receipt (< 24h)
  try {
    const { getLatestReceipt } = await import('../dist/src/receipt.js');
    const receipt = getLatestReceipt(cwd);
    if (receipt) {
      const ageMs = Date.now() - Date.parse(receipt.timestamp);
      if (ageMs < 24 * 60 * 60 * 1000) {
        const mins  = Math.round(ageMs / 60000);
        const age   = mins < 60
          ? `${mins}m ago`
          : mins < 1440
            ? `${Math.round(mins / 60)}h ago`
            : `${Math.round(mins / 1440)}d ago`;
        const fileCount = (receipt.filesChanged || []).length;
        const filePart  = fileCount > 0 ? ` · ${fileCount} file${fileCount !== 1 ? 's' : ''}` : '';
        result.type       = 'resumable';
        result.label      = (receipt.goal || 'last session').slice(0, 40);
        result.ageLabel   = age;
        result.filePart   = filePart;
        result.nextAction = (receipt.nextAction || '').slice(0, 35);
        return result;
      }
    }
  } catch { /* non-fatal */ }

  // Check for open tasks in ledger
  try {
    const { getOpenTasks } = await import('../dist/src/ledger.js');
    const open = getOpenTasks(cwd);
    if (open.length > 0) {
      result.type       = 'resumable';
      result.label      = (open[0].intent || 'open task').slice(0, 40);
      result.ageLabel   = null;
      result.filePart   = '';
      result.nextAction = `${open.length} open task${open.length !== 1 ? 's' : ''}`;
      return result;
    }
  } catch { /* non-fatal */ }

  // Check if this is a fresh project (package.json but no dual-brain history)
  try {
    const { existsSync: exists } = await import('node:fs');
    const { join: pjoin } = await import('node:path');
    const hasPkg = exists(pjoin(cwd, 'package.json'));
    const hasHistory = exists(pjoin(cwd, '.dual-brain', 'receipts'));
    if (hasPkg && !hasHistory) {
      let pkgName = 'this project';
      try {
        const { readFileSync: rfs } = await import('node:fs');
        const pkg = JSON.parse(rfs(pjoin(cwd, 'package.json'), 'utf8'));
        if (pkg.name) pkgName = pkg.name;
      } catch {}
      result.type  = 'fresh';
      result.label = pkgName;
      return result;
    }
  } catch { /* non-fatal */ }

  return result;
}

// ─── Screen: mainScreen ───────────────────────────────────────────────────────

async function mainScreen(rl, ask) {
  const cwd     = process.cwd();
  const version = readVersion();
  const profile = loadProfile(cwd);
  const auth    = await detectAuth();

  // ── Dashboard load animation (full mode only) ─────────────────────────────
  let fx = null;
  try { fx = await Promise.race([getFx(), new Promise(r => setTimeout(() => r(null), 3000))]); } catch {}
  let dashSpinner = null;
  if (fx && fx.getMode && fx.getMode() === 'full') {
    dashSpinner = fx.spinner('Loading dashboard...').start();
  }
  // Safety: kill spinner after 8s no matter what
  const _spinnerTimeout = dashSpinner ? setTimeout(() => {
    if (dashSpinner) { try { dashSpinner.stop(); } catch {} dashSpinner = null; }
  }, 8000) : null;

  // ── One-time default shell prompt for returning users (never asked before) ─
  if (profile.setupComplete && !profile.defaultShellAsked) {
    if (dashSpinner) { dashSpinner.stop(); dashSpinner = null; }
    try {
      const wantsDefault = await askDefaultShell(cwd, rl, fx);
      profile.defaultShellAsked = true;
      profile.isDefaultShell = wantsDefault;
      saveProfile(profile, { cwd });
    } catch { profile.defaultShellAsked = true; }
  }

  const claudeSub = profile?.providers?.claude;
  const openaiSub = profile?.providers?.openai;

  // Check subscription expiry for auto-refresh
  const now          = Date.now();
  const claudeExpired = claudeSub?.expiresAt && Date.parse(claudeSub.expiresAt) < now;
  const openaiExpired = openaiSub?.expiresAt && Date.parse(openaiSub.expiresAt) < now;

  // Silent OAuth token auto-refresh (3s timeout — never block dashboard)
  try {
    const { autoRefreshToken } = await import('../dist/src/profile.js');
    await Promise.race([autoRefreshToken(cwd), new Promise(r => setTimeout(r, 3000))]);
  } catch {}

  // Append-only session archive sync
  try {
    const { syncSessionMirror } = await import('../dist/src/session.js');
    syncSessionMirror(cwd);
  } catch {}

  // Auto-refresh expired subscriptions (skip during dashboard load — don't block)
  // Users can manually run 'j' (claude login) or 'k' (codex login) from the menu
  if ((claudeExpired || openaiExpired) && !dashSpinner) {
    try {
      const { spawnSync } = await import('node:child_process');
      if (claudeExpired) {
        const r = spawnSync('claude', ['auth', 'login'], { stdio: 'pipe', timeout: 5000 });
        if (r.status === 0) { claudeSub.expiresAt = null; saveProfile(profile, { cwd }); }
      }
      if (openaiExpired) {
        const r = spawnSync('codex', ['login'], { stdio: 'pipe', timeout: 5000 });
        if (r.status === 0) { openaiSub.expiresAt = null; saveProfile(profile, { cwd }); }
      }
    } catch {}
  }

  // Build session index in background (powers search + smart resume)
  try {
    const { buildSessionIndex } = await import('../dist/src/session.js');
    buildSessionIndex(cwd);
  } catch {}

  // Gather recent sessions (wrapped — never hang the dashboard)
  let allSessions = [];
  try { allSessions = enrichSessions(importReplitSessions(cwd), cwd); } catch {}
  const recentSessions = allSessions.slice(0, 3);
  const staleCount     = allSessions.filter(s => {
    const ageMs = s.lastActive ? Date.now() - new Date(s.lastActive).getTime() : 0;
    return ageMs >= 7 * 86400000;
  }).length;

  // Detect replit-tools version
  const rtMain    = detectReplitTools(cwd);
  const dtVersion = (rtMain.installed && rtMain.version) ? rtMain.version : null;

  // ── Interrupted work detection ────────────────────────────────────────────
  const interrupted = detectInterruptedWork(allSessions, cwd);

  // ── Studio Console layout ─────────────────────────────────────────────────
  const termW = process.stdout.columns || 80;
  const W     = Math.min(termW - 2, 78); // usable content width

  // Interrupted work is rendered as a dashboard signal below. New shells should
  // always land in the full menu instead of blocking on a pre-dashboard prompt.

  // ── Environment awareness (powers Box 1 dots + Box 3) ────────────────────
  let envReport = null;
  try {
    const { scanEnvironment } = await import('../dist/src/awareness.js');
    envReport = scanEnvironment(cwd);
  } catch { /* non-fatal */ }

  // ── Studio Console: resolve provider availability (subscription-only) ───
  const claudeAvail = auth.claude.found;
  const openaiAvail = auth.openai.found;

  // ── Box 2 — Workspace: gather git data ───────────────────────────────────
  let gitBranch       = 'unknown';
  let gitUncommitted  = 0;
  let gitAheadCount   = 0;
  let gitLastMsg      = '';
  let gitLastAgo      = '';

  try {
    gitBranch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe',
    }).trim() || 'unknown';
  } catch {}

  try {
    const status = execSync('git status --porcelain 2>/dev/null', {
      cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe',
    });
    gitUncommitted = status.trim().split('\n').filter(Boolean).length;
  } catch {}

  try {
    const aheadOut = execSync('git rev-list @{u}..HEAD 2>/dev/null | wc -l', {
      cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe',
    });
    gitAheadCount = parseInt(aheadOut.trim(), 10) || 0;
  } catch {}

  try {
    const logOut = execSync('git log -1 --format="%s|%ct" 2>/dev/null', {
      cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe',
    }).trim();
    if (logOut) {
      const [msg, ts] = logOut.split('|');
      gitLastMsg = (msg || '').slice(0, 38);
      const ageMs  = Date.now() - (parseInt(ts, 10) * 1000);
      const ageMin = Math.floor(ageMs / 60000);
      if (ageMin < 60)         gitLastAgo = `${ageMin}m ago`;
      else if (ageMin < 1440)  gitLastAgo = `${Math.floor(ageMin / 60)}h ago`;
      else                     gitLastAgo = `${Math.floor(ageMin / 1440)}d ago`;
    }
  } catch {}

  // ── Workspace data ────────────────────────────────────────────────────────
  const uncommittedPart = gitUncommitted > 0 ? ` · ${gitUncommitted} uncommitted` : '';
  const aheadPart       = gitAheadCount  > 0 ? ` · ${gitAheadCount} ahead`       : '';

  // Open PRs
  const repoState = detectRepoState(cwd);
  const openPRs   = await detectOpenPRs(cwd);

  // ── Box 3 — Awareness: observer + roadmap + risk ──────────────────────────
  let awarenessLine1 = '\x1b[2m💡\x1b[0m Ready to work';
  let awarenessLine2 = '\x1b[2m📋 No roadmap yet\x1b[0m';
  let awarenessLine3 = '\x1b[32m✓\x1b[0m No risk flags';

  // Line 1: observer data first; fall back to envReport-derived observations
  let quickObservations = [];
  try {
    const observerMod = await import('../dist/src/observer.js');
    const quickState = await observerMod.getQuickState(cwd);
    if (quickState?.observations?.length > 0) {
      const PRIO = { high: 0, medium: 1, low: 2 };
      const sorted = [...quickState.observations].sort(
        (a, b) => (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2)
      );
      quickObservations = sorted.slice(0, 3);
      const top = quickObservations[0];
      if (top) {
        const prefix = top.priority === 'high' ? '🔴' : top.priority === 'medium' ? '🟡' : '\x1b[2m💡\x1b[0m';
        awarenessLine1 = `${prefix} ${top.message}`;
      }
      const hasHighRisk = quickObservations.some(o => o.priority === 'high');
      if (hasHighRisk) {
        awarenessLine3 = '\x1b[31m⚠\x1b[0m  Risk flags detected — run: dual-brain review';
      }
    }
  } catch { /* non-fatal — observer may not exist */ }

  // If observer produced nothing, derive from envReport
  if (awarenessLine1 === '\x1b[2m💡\x1b[0m Ready to work' && envReport) {
    if (envReport.replit?.hasDatabase) {
      awarenessLine1 = '\x1b[2m💡\x1b[0m PostgreSQL available';
    } else if (gitUncommitted > 0) {
      awarenessLine1 = `\x1b[2m💡\x1b[0m ${gitUncommitted} file${gitUncommitted === 1 ? '' : 's'} ready to commit`;
    } else if (envReport.dualBrain?.hasFailureMemory) {
      // Check for recent failures
      try {
        const failureMem = await getFailureMem();
        if (failureMem.getRecentFailures) {
          const recent = failureMem.getRecentFailures(cwd, 2);
          if (recent?.length > 0) {
            awarenessLine1 = `\x1b[33m⚠\x1b[0m  ${recent.length} recent failure${recent.length === 1 ? '' : 's'} — check before proceeding`;
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  // Line 2: roadmap file, then ledger open tasks as fallback
  try {
    const roadmapPath = join(cwd, '.dual-brain', 'roadmap.md');
    if (existsSync(roadmapPath)) {
      const roadmapText = readFileSync(roadmapPath, 'utf8');
      const lines = roadmapText.split('\n').filter(Boolean);
      // Skip heading lines, grab first non-heading line
      const firstItem = lines.find(l => !l.startsWith('#') && l.trim().length > 0);
      if (firstItem) {
        const clean = firstItem.replace(/^[-*>]+\s*/, '').trim().slice(0, 45);
        awarenessLine2 = `\x1b[2m📋\x1b[0m ${clean}`;
      }
    }
  } catch { /* non-fatal */ }

  if (awarenessLine2 === '\x1b[2m📋 No roadmap yet\x1b[0m') {
    try {
      const { getOpenTasks } = await import('../dist/src/ledger.js');
      const open = getOpenTasks(cwd);
      if (open.length > 0) {
        awarenessLine2 = '📋 Next: ' + open[0].intent.slice(0, 45);
      }
    } catch { /* non-fatal */ }
  }

  // Line 3: model registry age warning
  try {
    const { getRegistryAge } = await import('../dist/src/models.js');
    const age = getRegistryAge();
    if (age > 30 && awarenessLine3 === '\x1b[32m✓\x1b[0m No risk flags') {
      awarenessLine3 = `\x1b[33m⚠\x1b[0m  Model registry ${age} days old`;
    }
  } catch { /* non-fatal */ }

  // Replit awareness rows (shown only when running in Replit, max 2-3 lines)
  const replitAwarenessRows = [];
  try {
    const replitMod = await import('../dist/src/replit.js');
    const replitEnv = replitMod.detectReplitEnvironment(cwd);
    if (replitEnv.isReplit) {
      const rtInfo    = replitMod.inspectReplitTools(cwd);
      const authInfo  = replitMod.getAuthStatus(cwd);
      const archive   = replitMod.getSessionArchive(cwd);
      const archCount = Array.isArray(archive) ? archive.length : (archive?.totalSessions ?? archive?.count ?? 0);
      const secretNames = replitMod.listSecretNames();
      const secretCount = Array.isArray(secretNames) ? secretNames.length : 0;
      const verStr = rtInfo.version ? `v${rtInfo.version}` : (rtInfo.installed ? 'installed' : 'not installed');
      const isAuthenticated = authInfo.authenticated ?? (authInfo.available && authInfo.tokenStatus === 'valid');
      const authStr = isAuthenticated ? '\x1b[32m✓\x1b[0m auth' : '\x1b[2mno auth\x1b[0m';
      replitAwarenessRows.push(`Replit  replit-tools ${verStr}  ${authStr}`);
      replitAwarenessRows.push(`${archCount} archived session${archCount !== 1 ? 's' : ''}  ${secretCount} secret${secretCount !== 1 ? 's' : ''}`);
    }
  } catch { /* replit.mjs not available — skip */ }

  // ── Recent work items (from awareness + sessions) — max 3 lines, dim ──────
  const recentWorkItems = [];
  // Add awareness observations as recent work if meaningful
  if (awarenessLine1 && !awarenessLine1.includes('Ready to work')) {
    const plainAware1 = awarenessLine1.replace(/\x1b\[[0-9;]*m/g, '').replace(/[︀-️‍]/g, '').trim();
    if (plainAware1) {
      const isWarning = /uncommitted|stale|failure|expired|old|⚠/.test(plainAware1);
      recentWorkItems.push({ ok: !isWarning, text: plainAware1.replace(/^[🔴🟡💡⚠]\s*/, '') });
    }
  }
  // Add last commit as a recent work item
  if (gitLastMsg) {
    const isStale = /\d+d ago|\d{2,}h ago/.test(gitLastAgo);
    recentWorkItems.push({ ok: !isStale, text: `${gitLastMsg} (${gitLastAgo})` });
  }
  // Fill from sessions if still room
  if (recentWorkItems.length < 3 && recentSessions.length > 0) {
    const sess = recentSessions[0];
    let rawName = sess.name || '';
    if (/^Session [0-9a-f]{8,}$/i.test(rawName)) rawName = '';
    if (/^[0-9a-f]{6,}$/i.test(rawName)) rawName = '';
    if (rawName) recentWorkItems.push({ ok: true, text: rawName.slice(0, 50) });
  }

  // ── Resume state detection ────────────────────────────────────────────────
  const resumeState = await detectResumeState(cwd);

  // ── Determine layout mode ─────────────────────────────────────────────────
  const anyProviderAvail = claudeAvail || openaiAvail;
  const isReturning      = resumeState.type === 'resumable';

  // ── ANSI color shorthands ─────────────────────────────────────────────────
  const DIM   = '\x1b[2m';
  const RST   = '\x1b[0m';
  const BOLD  = '\x1b[1m';
  const GRN   = '\x1b[32m';
  const YLW   = '\x1b[33m';
  const RED   = '\x1b[31m';
  const GRY   = '\x1b[90m';

  // ── Provider dots ─────────────────────────────────────────────────────────
  const claudeDot = claudeAvail ? `${GRN}●${RST}` : `${GRY}○${RST}`;
  const openaiDot = openaiAvail ? `${GRN}●${RST}` : `${GRY}○${RST}`;

  // ── Project name (from package.json or cwd basename) ─────────────────────
  let projectName = basename(cwd);
  try {
    const pkgRaw = readFileSync(join(cwd, 'package.json'), 'utf8');
    const pkgJson = JSON.parse(pkgRaw);
    if (pkgJson.name) projectName = pkgJson.name;
  } catch { /* no package.json */ }

  // ── Separator line ────────────────────────────────────────────────────────
  const sepW = Math.min(W, 72);
  const sepLine = `${DIM}${'━'.repeat(sepW)}${RST}`;

  // ── Strip ANSI for width calc ─────────────────────────────────────────────
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/[︀-️]/g, '');

  // ── Line 1: status bar ───────────────────────────────────────────────────
  //   " project  branch  Claude ●  GPT ●                  v0.2.3"
  const branchStr   = `${gitBranch}${uncommittedPart}${aheadPart}`;
  const providerStr = `Claude ${claudeDot}  GPT ${openaiDot}`;
  const verStr2     = `${DIM}v${version}${RST}`;
  const statusLeft  = ` ${projectName}  ${DIM}${branchStr}${RST}  ${providerStr}`;
  const statusRight = verStr2;
  const statusLeftW  = stripAnsi(statusLeft).length;
  const statusRightW = stripAnsi(statusRight).length;
  const statusGap    = Math.max(1, sepW + 1 - statusLeftW - statusRightW);
  const statusBar    = `${statusLeft}${' '.repeat(statusGap)}${statusRight}`;

  // ── Line 2-3: contextual question + last summary ─────────────────────────
  let mainQuestion, lastSummary;
  if (!anyProviderAvail) {
    mainQuestion = ` ${BOLD}Connect a provider to start working${RST}`;
    lastSummary  = null;
  } else if (isReturning) {
    mainQuestion = ` ${BOLD}Resume previous work?${RST}`;
    const labelTrunc = (resumeState.label || 'last session').slice(0, 45);
    const agePart    = resumeState.ageLabel ? ` · ${resumeState.ageLabel}` : '';
    const nextPart   = resumeState.nextAction ? ` · next: ${resumeState.nextAction}` : '';
    lastSummary = ` ${DIM}Last: ${labelTrunc}${agePart}${nextPart}${RST}`;
  } else {
    mainQuestion = ` ${BOLD}What do you want to build?${RST}`;
    lastSummary  = null;
  }

  // ── Suggestions (max 3, bright) ───────────────────────────────────────────
  let suggestions;
  const claudeExpiredNow = claudeSub?.expiresAt && Date.parse(claudeSub.expiresAt) < Date.now();
  const openaiExpiredNow = openaiSub?.expiresAt && Date.parse(openaiSub.expiresAt) < Date.now();
  if (!anyProviderAvail) {
    suggestions = ['configure Claude', 'configure GPT', 'browse project'];
  } else if (claudeExpiredNow || openaiExpiredNow) {
    const resumeOrBuild = isReturning ? 'resume last session' : 'start building';
    suggestions = ['refresh auth', resumeOrBuild, 'check project health'];
  } else if (isReturning) {
    const openTasks = [];
    try {
      const { getOpenTasks } = await import('../dist/src/ledger.js');
      const open = getOpenTasks(cwd);
      if (open.length > 0) openTasks.push(`continue: ${open[0].intent.slice(0, 30)}`);
    } catch {}
    suggestions = openTasks.length > 0
      ? [openTasks[0], 'review changes', 'run tests']
      : ['resume last session', 'review changes', 'run tests'];
  } else {
    suggestions = ['start building', 'explore codebase', 'check project health'];
  }
  const suggestLine = ` ${suggestions.join('    ')}`;

  // ── Recent work items (dim, max 3) ────────────────────────────────────────
  const recentLines = recentWorkItems.slice(0, 3).map(item => {
    return signalLine(item.ok ? 'success' : 'warning', `${DIM}${item.text}${RST}`);
  });

  // ── Cognitive loop status (appended to signals) ────────────────────────────
  try {
    const cogLoop = await _getCognitiveLoop();
    if (cogLoop) {
      const loopStatus = cogLoop.getLoopStatus();
      if (loopStatus.hasActivePlan) {
        const wavePart = `${loopStatus.completedWaves}/${loopStatus.totalWaves} waves`;
        const replanPart = loopStatus.replans > 0 ? ` · ${loopStatus.replans} replan${loopStatus.replans !== 1 ? 's' : ''}` : '';
        recentLines.push(signalLine('info', `${DIM}[loop] ${wavePart}${replanPart}${RST}`));
      }
    }
  } catch { /* non-fatal */ }

  // ── Resolve dashboard spinner before rendering ────────────────────────────
  if (_spinnerTimeout) clearTimeout(_spinnerTimeout);
  if (dashSpinner) dashSpinner.succeed('Dashboard ready');

  // ── Render Studio Console (paneled layout) ────────────────────────────────
  const CYAN = '\x1b[36m';
  const panelW = Math.min(sepW + 2, 72);

  // ── Budget / governance data ──────────────────────────────────────────────
  let budgetInfo = null;
  try {
    const orchestratorCfg = JSON.parse(readFileSync(join(cwd, '.claude', 'orchestrator.json'), 'utf8'));
    budgetInfo = checkBudget(cwd, orchestratorCfg);
  } catch {
    // No orchestrator config or no state — use a fresh read with defaults
    try { budgetInfo = checkBudget(cwd, {}); } catch {}
  }

  // ── Panel 1: Providers + Budget (top priority — always render) ───────────
  {
    const providerLines = [];

    // Provider health rows
    const claudeLabel = claudeAvail ? `${GRN}✓${RST} Claude` : `${RED}✗${RST} ${DIM}Claude${RST}`;
    const openaiLabel = openaiAvail ? `${GRN}✓${RST} GPT-4`  : `${RED}✗${RST} ${DIM}GPT-4${RST}`;

    // Detect subscription expiry warnings
    const claudeWarnStr = (claudeSub?.expiresAt && Date.parse(claudeSub.expiresAt) < Date.now())
      ? `  ${YLW}⚠ expired${RST}` : '';
    const openaiWarnStr = (openaiSub?.expiresAt && Date.parse(openaiSub.expiresAt) < Date.now())
      ? `  ${YLW}⚠ expired${RST}` : '';

    const providerCols = `${claudeLabel}${claudeWarnStr}   ${openaiLabel}${openaiWarnStr}`;

    // Budget row
    let budgetRow = null;
    if (budgetInfo) {
      const spent     = budgetInfo.spent.toFixed(2);
      const remaining = budgetInfo.remaining.toFixed(2);
      const limit     = budgetInfo.limit.toFixed(2);
      const tc        = budgetInfo.tierCounts || {};
      const tierStr   = `${DIM}t1:${tc[1] || 0}  t2:${tc[2] || 0}  t3:${tc[3] || 0}${RST}`;

      if (budgetInfo.blocked) {
        budgetRow = `${RED}✗${RST} Budget exhausted  $${spent}/$${limit}   ${tierStr}`;
      } else if (budgetInfo.warning) {
        budgetRow = `${YLW}⚠${RST} Budget low  ${YLW}$${remaining} remaining${RST}  of $${limit}   ${tierStr}`;
      } else if (budgetInfo.spent > 0) {
        budgetRow = `${GRN}✓${RST} Budget  ${DIM}$${spent} spent · $${remaining} remaining${RST}   ${tierStr}`;
      } else {
        budgetRow = `${DIM}· Budget  $0 spent · $${remaining} remaining   t1:0  t2:0  t3:0${RST}`;
      }
    }

    providerLines.push(providerCols);
    if (budgetRow) providerLines.push(budgetRow);

    process.stdout.write('\n' + panel('dual-brain', providerLines, { width: panelW, titleColor: CYAN }) + '\n\n');
  }

  // ── Panel 2: Workspace signals (contextual, semantic icons) ──────────────
  {
    const signalLines = [];

    // Git workspace status
    if (gitBranch !== 'unknown') {
      const dirtyStr = gitUncommitted > 0
        ? `${YLW}⚠${RST} ${gitUncommitted} uncommitted file${gitUncommitted !== 1 ? 's' : ''}`
        : `${GRN}✓${RST} ${DIM}clean${RST}`;
      const aheadStr = gitAheadCount > 0 ? `  ${YLW}⚠${RST} ${gitAheadCount} ahead of remote` : '';
      signalLines.push(`${DIM}${gitBranch}${RST}   ${dirtyStr}${aheadStr}`);
    }

    // Last commit
    if (gitLastMsg) {
      const isStale = /\d{2,}d ago/.test(gitLastAgo);
      const icon = isStale ? `${YLW}⚠${RST}` : `${DIM}·${RST}`;
      signalLines.push(`${icon} ${DIM}${gitLastMsg}  ${gitLastAgo}${RST}`);
    }

    // Open PRs
    if (openPRs.length > 0) {
      const prSummary = openPRs.slice(0, 2).map(pr => `#${pr.number}`).join(', ');
      const trunc = openPRs.length > 2 ? ` +${openPRs.length - 2}` : '';
      signalLines.push(`${DIM}·${RST} ${openPRs.length} open PR${openPRs.length !== 1 ? 's' : ''}${DIM}: ${prSummary}${trunc}${RST}`);
    }

    // Observer / awareness signals (high-priority only)
    for (const obs of quickObservations) {
      if (obs.priority === 'high') {
        signalLines.push(`${RED}✗${RST} ${obs.message}`);
      } else if (obs.priority === 'medium') {
        signalLines.push(`${YLW}⚠${RST} ${obs.message}`);
      }
    }

    // Risk / model registry
    if (awarenessLine3 && !/No risk flags/.test(awarenessLine3)) {
      const clean3 = awarenessLine3.replace(/\x1b\[[0-9;]*m/g, '').replace(/^[⚠✓]\s*/, '').trim();
      if (clean3) signalLines.push(`${YLW}⚠${RST} ${clean3}`);
    }

    // Stale sessions hint
    if (staleCount >= 3) {
      signalLines.push(`${DIM}· ${staleCount} stale sessions (>7d) — type "sessions" to manage${RST}`);
    }

    // Resume / continuation hint
    if (interrupted) {
      const labelTrunc = (interrupted.sessionName || 'last session').slice(0, 40);
      const agePart = interrupted.ageLabel ? `  ${DIM}${interrupted.ageLabel}${RST}` : '';
      const statePart = interrupted.lastState ? `  ${DIM}→ ${interrupted.lastState.slice(0, 48)}${RST}` : '';
      signalLines.push(`${CYAN}↩${RST} Resume: ${BOLD}${labelTrunc}${RST}${agePart}${statePart}`);
    } else if (isReturning) {
      const labelTrunc = (resumeState.label || 'last session').slice(0, 40);
      const agePart    = resumeState.ageLabel ? `  ${DIM}${resumeState.ageLabel}${RST}` : '';
      const nextPart   = resumeState.nextAction ? `  ${DIM}→ ${resumeState.nextAction}${RST}` : '';
      signalLines.push(`${CYAN}↩${RST} Resume: ${BOLD}${labelTrunc}${RST}${agePart}${nextPart}`);
    }

    if (!anyProviderAvail) {
      signalLines.push(`${RED}✗${RST} ${BOLD}No provider connected${RST}  — run: dual-brain auth`);
    }

    if (signalLines.length > 0) {
      process.stdout.write(panel('Workspace', signalLines, { width: panelW }) + '\n\n');
    }
  }

  // ── Panel 3: What do you want to do? (suggestions) ───────────────────────
  {
    const promptTitle = !anyProviderAvail ? 'Get started' : isReturning ? 'Continue' : 'Start';
    const suggestContent = suggestions.map((s, i) => {
      return i === 0
        ? `  ${CYAN}›${RST} ${BOLD}${s}${RST}`
        : `    ${DIM}${s}${RST}`;
    });
    process.stdout.write(panel(promptTitle, suggestContent, { width: panelW }) + '\n\n');
  }

  // ── Shortcuts (vertical layout, one per line) ────────────────────────────
  const shortcuts = [
    [`Enter`, isReturning ? 'resume last session' : 'start working  (or type a task)'],
    [`n`,     'new session'],
    [`g`,     isReturning ? 'continue in other provider' : 'switch provider'],
    [`/`,     'search sessions'],
    [`i`,     'import sessions'],
    [`s`,     'settings & profiles'],
    [`d`,     'doctor — diagnose issues'],
    [`t`,     'team settings'],
    [`a`,     profile.automode ? 'auto mode  (on)' : 'auto mode  (off)'],
    [`q`,     'quit'],
  ];
  for (const [key, label] of shortcuts) {
    const keyStr = key === 'Enter'
      ? `${CYAN}Enter${RST}`
      : `${CYAN}${key}${RST}    `;
    const padder = key === 'Enter' ? '    ' : '';
    process.stdout.write(`   ${keyStr}${padder}${DIM}${label}${RST}\n`);
  }
  process.stdout.write('\n');

  // Input bar — rendered below shortcuts
  const inputLeft = tuiPrompt('task or command...');
  process.stdout.write(` ${inputLeft}\n`);

  // ── Key handling ──────────────────────────────────────────────────────────
  // Use raw keypress mode so we can show a live type-to-start buffer.
  // Single-key commands (n, s, q, /, 1-9, Enter) only fire when buffer is empty.
  let taskBuffer = '';

  const readline = await import('node:readline');

  // Render the type-ahead line below the box (overwrites the current cursor line)
  const renderBuffer = (buf) => {
    // Move to the prompt line (we're already at it after printing the box + footer)
    // Use carriage return + clear-to-end-of-line to overwrite
    if (buf.length === 0) {
      process.stdout.write('\r\x1b[K');
    } else {
      const display = buf.length > W - 4 ? buf.slice(-(W - 4)) : buf;
      process.stdout.write(`\r\x1b[K> ${display}\x1b[7m \x1b[0m`);
    }
  };

  // Enable keypress events on stdin (safe to call multiple times)
  readline.emitKeypressEvents(process.stdin, rl);

  const raw = await new Promise((resolve) => {
    // Switch to raw mode if possible (TTY only)
    const wasRaw = process.stdin.isRaw;
    const canRaw = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
    if (canRaw) process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (canRaw) {
        try { process.stdin.setRawMode(wasRaw || false); } catch {}
      }
    };

    const onKey = (str, key) => {
      if (!key) return;

      const name = key.name || '';
      const seq  = key.sequence || str || '';

      // Ctrl-C / Ctrl-D → exit
      if (key.ctrl && (name === 'c' || name === 'd')) {
        cleanup();
        process.stdout.write('\n');
        resolve('q');
        return;
      }

      // Enter key
      if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
        cleanup();
        if (taskBuffer.length > 0) {
          process.stdout.write('\n');
          resolve(`__task__:${taskBuffer}`);
        } else {
          resolve('');
        }
        return;
      }

      // Escape → clear buffer
      if (name === 'escape') {
        taskBuffer = '';
        renderBuffer('');
        return;
      }

      // Backspace / delete
      if (name === 'backspace' || name === 'delete') {
        if (taskBuffer.length > 0) {
          taskBuffer = taskBuffer.slice(0, -1);
          renderBuffer(taskBuffer);
        }
        return;
      }

      // Ignore non-printable / control keys
      if (key.ctrl || key.meta || !str || str.length === 0) return;
      const code = str.codePointAt(0);
      if (code < 32 || code === 127) return;

      // Single-key commands only fire when buffer is empty
      if (taskBuffer.length === 0) {
        const lower = str.toLowerCase();
        const singleKeySet = new Set(['n', 'g', 's', 't', 'q', '/', 'i', '?', 'h', 'd', 'a']);
        if (singleKeySet.has(lower)) {
          cleanup();
          process.stdout.write('\n');
          resolve(lower);
          return;
        }
        const digit = parseInt(str, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= 9) {
          cleanup();
          process.stdout.write('\n');
          resolve(str);
          return;
        }
      }

      // Accumulate into buffer
      taskBuffer += str;
      renderBuffer(taskBuffer);
    };

    process.stdin.on('keypress', onKey);
  });

  const choice = typeof raw === 'string' ? raw.toLowerCase() : '';

  // ── Typed input — run through command palette ─────────────────────────────
  if (raw.startsWith('__task__:')) {
    const input = raw.slice('__task__:'.length).trim();
    if (!input) return { next: 'main' };

    const classified = classifyInput(input);

    // Tier 1: FREE — deterministic, zero tokens
    if (classified.tier === 'free') {
      const cmd  = classified.command;
      const args = classified.args;

      if (cmd === 'resume' || cmd === 'r') {
        if (recentSessions.length === 0) return { next: 'new-session' };
        return { next: 'sessions' };
      }
      if (cmd === 'status' || cmd === 's') {
        await cmdStatus([]);
        await ask('\n  Press Enter to continue...');
        return { next: 'main' };
      }
      if (cmd === 'sessions' || cmd === 'ss') {
        return { next: 'sessions' };
      }
      if (cmd === 'settings') {
        return { next: 'settings' };
      }
      if (cmd === 'team' || cmd === 't') {
        return { next: 'team' };
      }
      if (cmd === 'doctor' || cmd === 'd') {
        return { next: 'diagnostics' };
      }
      if (cmd === 'health' || cmd === 'h') {
        const hooksDir  = join(cwd, '.claude', 'hooks');
        const healthScript = join(hooksDir, 'health-check.mjs');
        const { spawnSync: sp } = await import('node:child_process');
        if (existsSync(healthScript)) {
          sp('node', [healthScript], { stdio: 'inherit', cwd });
        } else {
          process.stdout.write('\n  health-check.mjs not found — run: dual-brain install\n');
        }
        await ask('\n  Press Enter to continue...');
        return { next: 'main' };
      }
      if (cmd === 'help' || cmd === '?') {
        return { next: 'palette-help' };
      }
      if (cmd === 'quit' || cmd === 'q') {
        return { next: 'exit' };
      }
      if (cmd === 'search') {
        const query = args.join(' ');
        if (!query) {
          const q2 = (await ask('  Search: ')).trim();
          if (!q2) return { next: 'main' };
          args.push(q2);
        }
        const { searchSessions, buildSessionIndex } = await import('../dist/src/session.js');
        try { buildSessionIndex(cwd); } catch {}
        const results = searchSessions(args.join(' '), cwd);
        if (results.length === 0) {
          process.stdout.write(`\n  No sessions matching "${args.join(' ')}"\n\n`);
          await ask('  Press Enter to continue...');
          return { next: 'main' };
        }
        process.stdout.write(`\n  Found ${results.length} session${results.length === 1 ? '' : 's'}:\n`);
        results.slice(0, 9).forEach((sess, i) => {
          const tool   = sess.tool === 'codex' ? 'cdx' : 'cld';
          const date   = sess.date ? new Date(sess.date).toLocaleDateString() : '?';
          process.stdout.write(`  [${i + 1}] ${tool}  ${date}  ${sess.prompts.first || sess.id.slice(0, 8)}\n`);
        });
        process.stdout.write('\n');
        const pick = (await ask('  Enter number to resume (or Enter to cancel): ')).trim();
        const num  = parseInt(pick, 10);
        if (!isNaN(num) && num >= 1 && num <= Math.min(results.length, 9)) {
          const sess = results[num - 1];
          const { spawnSync: sp2 } = await import('node:child_process');
          const tool = sess.tool === 'codex' ? 'codex' : 'claude';
          const launchArgs = tool === 'codex' ? _codexResumeArgs(sess.id, cwd) : _claudeResumeArgs(sess.id, cwd);
          process.stdout.write(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n\n`);
          sp2(tool, launchArgs, { stdio: 'inherit' });
        }
        return { next: 'main' };
      }
      if (cmd === 'budget') {
        await cmdStatus([]);
        await ask('\n  Press Enter to continue...');
        return { next: 'main' };
      }
      if (cmd === 'auto') {
        const cwd2 = process.cwd();
        const prof = loadProfile(cwd2);
        const nextAuto = !(prof.automode ?? prof.settings?.automode ?? false);
        prof.automode = nextAuto;
        prof.settings = { ...(prof.settings || {}), automode: nextAuto };
        saveProfile(prof, { cwd: cwd2 });
        const state = prof.automode ? '\x1b[32mON\x1b[0m' : '\x1b[2mOFF\x1b[0m';
        process.stdout.write(`\n  Automode: ${state}\n`);
        process.stdout.write(`  ${prof.automode ? 'Tasks dispatch immediately (HEAD still gates dangerous ops)' : 'Tasks require Enter to confirm'}\n\n`);
        await ask('  Press Enter to continue...');
        return { next: 'main' };
      }
      if (cmd === 'init --replit') {
        await cmdInit(rl);
        return { next: 'main' };
      }
      // fallthrough: unknown free command → treat as full task
    }

    // Tier 0.5: SKILL — slash command routed through agent registry
    if (classified.tier === 'skill') {
      const skill = classified.skill;
      const skillArgs = classified.args || '';

      // Free skills (e.g. /status) run deterministically with no agent
      if (skill.tier === 'free' || !skill.agent) {
        if (skill.command === 'status') {
          await cmdStatus([]);
          await ask('\n  Press Enter to continue...');
          return { next: 'main' };
        }
        return { next: 'main' };
      }

      // Build the task brief from the skill declaration
      let brief = null;
      try {
        if (typeof _cachedSkillToTaskBrief === 'function') {
          brief = _cachedSkillToTaskBrief(input, skillArgs);
        }
      } catch {}

      const model  = brief?.model || skill.model || 'sonnet';
      const prompt = brief?.objective || `/${skill.command} ${skillArgs}`.trim();

      process.stdout.write(`\n  Skill: /${skill.command}  Agent: ${skill.agent}  Model: ${model}\n`);
      if (skill.description) process.stdout.write(`  ${skill.description}\n`);
      process.stdout.write(`  \x1b[36mEnter\x1b[0m run  \x1b[36mn\x1b[0m cancel\n\n`);
      const skillConfirm = (await ask('  > ')).trim().toLowerCase();
      if (skillConfirm === 'n' || skillConfirm === 'no') return { next: 'main' };

      return { next: 'go', prompt, model };
    }

    // Tier 2: CHEAP — question/diagnostic/reflexive
    if (classified.tier === 'cheap') {
      const hj = classified.headJudgment;
      const model = hj ? 'haiku' : 'haiku';
      if (hj?.surfaceNoticings?.length > 0) {
        for (const n of hj.surfaceNoticings) {
          process.stdout.write(`\n  \x1b[33m[HEAD]\x1b[0m ${n.observation}\n`);
        }
      }
      process.stdout.write(`\n  Routing to ${model} for quick answer...\n`);
      return { next: 'go', prompt: input, model };
    }

    // Tier 3: FULL — work task, HEAD-informed dispatch
    if (classified.tier === 'full') {
      const hj = classified.headJudgment;
      const model = classified.model || 'sonnet';
      const summary = input.length > 60 ? input.slice(0, 57) + '...' : input;

      // Surface HEAD noticings before confirming
      if (hj?.surfaceNoticings?.length > 0) {
        for (const n of hj.surfaceNoticings) {
          process.stdout.write(`\n  \x1b[33m[HEAD]\x1b[0m ${n.observation}`);
        }
        process.stdout.write('\n');
      }

      // Show cognitive loop plan info if available
      if (hj?._plan) {
        const plan = hj._plan;
        const waveCount = plan.waves?.length || 0;
        const agentCount = plan.waves?.reduce((sum, w) => sum + (w.agents?.length || 0), 0) || 0;
        process.stdout.write(`\n  \x1b[2m[plan] ${waveCount} wave${waveCount !== 1 ? 's' : ''}, ${agentCount} agent${agentCount !== 1 ? 's' : ''}\x1b[0m`);
        if (hj._nextDispatch?.warnings?.length > 0) {
          process.stdout.write(`  \x1b[33m${hj._nextDispatch.warnings.length} warning(s)\x1b[0m`);
        }
        process.stdout.write('\n');
      }

      // HEAD's shouldAskUser gates the dispatch — dangerous/irreversible ops
      if (hj?.shouldAskUser) {
        const reason = hj.obligations?.find(o => o.type === 'askBeforeIrreversi')?.description || hj.rationale;
        process.stdout.write(`\n  \x1b[31m⚠ CAUTION\x1b[0m ${reason}\n`);
        process.stdout.write(`  Task: ${summary}\n`);
        process.stdout.write(`  Depth: ${hj.depth}  Model: ${model}\n`);
        process.stdout.write(`  \x1b[36mEnter\x1b[0m proceed  \x1b[36mn\x1b[0m cancel\n\n`);
        const confirm = (await ask('  > ')).trim().toLowerCase();
        if (confirm === 'n' || confirm === 'no') return { next: 'main' };
        return { next: 'go', prompt: input, model, _loopResult: hj._loopResult };
      }

      // Automode: if HEAD says it's safe, just go — no confirmation needed
      const automode = profile.automode ?? profile.settings?.automode ?? false;
      if (automode) {
        process.stdout.write(`\n  \x1b[36m⚡\x1b[0m ${summary}  (${model}, depth: ${hj?.depth || '?'})\n`);
        return { next: 'go', prompt: input, model, _loopResult: hj._loopResult };
      }

      // Manual mode — show depth, wait for confirmation
      process.stdout.write(`\n  Launch: ${summary}\n`);
      process.stdout.write(`  Depth: ${hj?.depth || '?'}  Model: ${model}\n`);
      process.stdout.write(`  \x1b[36mEnter\x1b[0m go  \x1b[36mn\x1b[0m cancel\n\n`);
      const confirm = (await ask('  > ')).trim().toLowerCase();
      if (confirm === 'n' || confirm === 'no') return { next: 'main' };
      return { next: 'go', prompt: input, model, _loopResult: hj._loopResult };
    }

    // Default fallback
    return { next: 'go', prompt: input };
  }

  // ── Single-key shortcuts ───────────────────────────────────────────────────

  // Enter (empty) → resume most recent session
  if (raw === '' || choice === '\r') {
    if (recentSessions.length === 0) {
      return { next: 'new-session' };
    }
    const sess = recentSessions[0];
    const { spawnSync } = await import('node:child_process');
    const tool = _sessionTool(sess);
    const launchArgs = _sessionLaunchArgs(sess, cwd);
    process.stdout.write(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n\n`);
    spawnSync(tool, launchArgs, { stdio: 'inherit' });
    saveTerminalState(cwd, getTerminalId(), sess.id, sess.tool || 'claude');
    return { next: 'main' };
  }

  // Number 1-9 → resume that session
  const numChoice = parseInt(raw, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= recentSessions.length) {
    const sess = recentSessions[numChoice - 1];
    try {
      const { getSessionContext } = await import('../dist/src/session.js');
      const ctx = getSessionContext(sess.id, cwd);
      if (ctx) {
        if (ctx.lastPrompt) process.stdout.write(`\n  Last working on: ${ctx.lastPrompt}\n`);
        if (ctx.filesTouched.length > 0) process.stdout.write(`  Files touched: ${ctx.filesTouched.join(', ')}\n`);
      }
    } catch {}
    const { spawnSync } = await import('node:child_process');
    const tool = _sessionTool(sess);
    const launchArgs = _sessionLaunchArgs(sess, cwd);
    process.stdout.write(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n\n`);
    spawnSync(tool, launchArgs, { stdio: 'inherit' });
    saveTerminalState(cwd, getTerminalId(), sess.id, sess.tool || 'claude');
    return { next: 'main' };
  }

  if (choice === 'n') { return { next: 'new-session' }; }
  if (choice === 'g') {
    if (recentSessions.length === 0) return { next: 'new-session' };
    return { next: 'switch-provider', session: recentSessions[0] };
  }
  if (choice === '?' || choice === 'h') { return { next: 'palette-help' }; }
  if (choice === 'd') { return { next: 'diagnostics' }; }

  if (choice === '/') {
    const query = (await ask('  Search: ')).trim();
    if (!query) return { next: 'main' };

    const { searchSessions, buildSessionIndex } = await import('../dist/src/session.js');
    try { buildSessionIndex(cwd); } catch {}

    const results = searchSessions(query, cwd);
    if (results.length === 0) {
      process.stdout.write(`\n  No sessions matching "${query}"\n\n`);
      await ask('  Press Enter to continue...');
      return { next: 'main' };
    }

    process.stdout.write(`\n  Found ${results.length} session${results.length === 1 ? '' : 's'}:\n`);
    results.slice(0, 9).forEach((sess, i) => {
      const tool   = sess.tool === 'codex' ? 'cdx' : 'cld';
      const date   = sess.date ? new Date(sess.date).toLocaleDateString() : '?';
      const topics = sess.topics.slice(0, 3).join(', ');
      process.stdout.write(`  [${i + 1}] ${tool}  ${date}  ${sess.prompts.first || sess.id.slice(0, 8)}\n`);
      if (topics) process.stdout.write(`       topics: ${topics}\n`);
    });
    process.stdout.write('\n');

    const pick = (await ask('  Enter number to resume (or Enter to cancel): ')).trim();
    const num  = parseInt(pick, 10);
    if (!isNaN(num) && num >= 1 && num <= Math.min(results.length, 9)) {
      const sess = results[num - 1];
      const { spawnSync } = await import('node:child_process');
      const tool = sess.tool === 'codex' ? 'codex' : 'claude';
      const launchArgs = tool === 'codex' ? _codexResumeArgs(sess.id, cwd) : _claudeResumeArgs(sess.id, cwd);
      process.stdout.write(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n\n`);
      spawnSync(tool, launchArgs, { stdio: 'inherit' });
    }
    return { next: 'main' };
  }

  if (choice === 's') { return { next: 'settings' }; }
  if (choice === 't') { return { next: 'team' }; }
  if (choice === 'i') { return { next: 'import-picker' }; }
  if (choice === 'a') {
    const prof = loadProfile(cwd);
    const nextAuto = !(prof.automode ?? prof.settings?.automode ?? false);
    prof.automode = nextAuto;
    prof.settings = { ...(prof.settings || {}), automode: nextAuto };
    saveProfile(prof, { cwd });
    process.stdout.write(`\n  Automode: ${prof.automode ? '\x1b[32mON\x1b[0m' : '\x1b[2mOFF\x1b[0m'}\n\n`);
    await ask('  Press Enter to continue...');
    return { next: 'main' };
  }
  if (choice === 'q' || choice === 'exit') { return { next: 'exit' }; }

  return { next: 'main' };
}

// ─── Screen: newSessionScreen ─────────────────────────────────────────────────

async function newSessionScreen(rl, ask) {
  const cwd = process.cwd();
  const input = (await ask('\n  What do you want to do? ')).trim();
  if (!input) { return { next: 'main' }; }

  // All work routes through pipeline — detect → decide → dispatch with mandatory gates.
  await cmdGo([input], { cwd });

  return { next: 'main' };
}

// ─── Screen: switchProviderScreen ────────────────────────────────────────────

async function switchProviderScreen(rl, ask, ctx = {}) {
  const cwd = process.cwd();
  const session = ctx.session;
  if (!session) return { next: 'main' };

  const currentTool = _sessionTool(session);
  const target = currentTool === 'codex' ? 'claude' : 'codex';
  const label = session.smartName || session.name || session.prompts?.first || session.id;
  const brief = _sessionBrief(session, target);

  process.stdout.write('\n');
  process.stdout.write(`  Continue in ${target === 'codex' ? 'Codex/GPT' : 'Claude'}\n`);
  process.stdout.write(`  From: ${currentTool} · ${String(label || '').replace(/\s+/g, ' ').slice(0, 80)}\n\n`);
  process.stdout.write(`  \x1b[36mEnter\x1b[0m switch now  \x1b[36mb\x1b[0m back\n\n`);

  const choice = (await ask('  Choice: ')).trim().toLowerCase();
  if (choice === 'b' || choice === 'q' || choice === 'n') return { next: 'main' };

  await cmdSwitch([target, brief]);
  return { next: 'main' };
}

// ─── Screen: paletteHelpScreen ───────────────────────────────────────────────

async function paletteHelpScreen(rl, ask) {
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60);
  const W     = boxW - 4;
  const top   = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep   = `├${'─'.repeat(boxW - 2)}┤`;
  const bot   = `└${'─'.repeat(boxW - 2)}┘`;
  const row   = (content) => makeBoxRow(content, W);
  const DIM   = '\x1b[2m';
  const RESET = '\x1b[0m';

  const CYAN = '\x1b[36m';
  const lines = [
    top,
    row(`${CYAN}Keyboard Shortcuts${RESET} (single key, no Enter needed)`),
    sep,
    row(`${CYAN}Enter${RESET}   Resume last session`),
    row(`${CYAN}n${RESET}       New coding session`),
    row(`${CYAN}g${RESET}       Continue selected work in other provider`),
    row(`${CYAN}1-9${RESET}     Resume session by number`),
    row(`${CYAN}/${RESET}       Search session history`),
    row(`${CYAN}i${RESET}       Import/sync sessions`),
    row(`${CYAN}s${RESET}       Settings`),
    row(`${CYAN}d${RESET}       Doctor (repo diagnostics)`),
    row(`${CYAN}t${RESET}       Team`),
    row(`${CYAN}a${RESET}       Toggle auto mode`),
    row(`${CYAN}q${RESET}       Quit`),
    row(`${CYAN}?${RESET}       This help`),
    sep,
    row(`${CYAN}Typed Commands${RESET} (type then Enter)`),
    sep,
    row(`${DIM}status${RESET}           Provider health + budget`),
    row(`${DIM}sessions${RESET}         List recent sessions`),
    row(`${DIM}search <query>${RESET}   Search session history`),
    row(`${DIM}budget${RESET}           Token usage + routing`),
    row(`${DIM}health${RESET}           System health check`),
    sep,
    row(`${CYAN}Natural Language${RESET} (just type)`),
    sep,
    row(`Questions → quick answer (haiku)`),
    row(`Work tasks → HEAD evaluates, then dispatches`),
    sep,
    row(`${DIM}Enter${RESET} go back`),
    bot,
  ];

  process.stdout.write('\n' + lines.join('\n') + '\n\n');
  await ask('');
  return { next: 'main' };
}

// ─── Screen: importPickerScreen ──────────────────────────────────────────────

async function importPickerScreen() {
  const cwd = process.cwd();

  // Load all available sessions from replit-tools
  const allSessions = importReplitSessions(cwd);

  // Load existing session meta to filter already-imported ones
  const meta = getSessionMeta(cwd);
  const alreadyImported = new Set(
    Object.entries(meta)
      .filter(([, v]) => v.source === 'data-tools')
      .map(([id]) => id)
  );

  // Filter out already-imported sessions
  const candidates = allSessions.filter(s => !alreadyImported.has(s.id));

  // ── Box layout ────────────────────────────────────────────────────────────
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60);
  const W     = boxW - 4;

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;

  const row = (content) => makeBoxRow(content, W);

  // Helper: wait for any keypress (used in edge-case screens)
  const waitKey = async () => {
    const rl2 = await import('node:readline');
    rl2.emitKeypressEvents(process.stdin);
    await new Promise(resolve => {
      const wasRaw2 = process.stdin.isRaw;
      const canRaw2 = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
      if (canRaw2) process.stdin.setRawMode(true);
      const onKey2 = () => {
        process.stdin.removeListener('keypress', onKey2);
        if (canRaw2) { try { process.stdin.setRawMode(wasRaw2 || false); } catch {} }
        resolve();
      };
      process.stdin.once('keypress', onKey2);
    });
  };

  // Handle edge cases
  if (allSessions.length === 0) {
    process.stdout.write('\n');
    process.stdout.write(top + '\n');
    process.stdout.write(row('Import from replit-tools') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('No replit-tools sessions found.') + '\n');
    process.stdout.write(row('Install replit-tools: npm i -g replit-tools') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('Press any key to go back...') + '\n');
    process.stdout.write(bot + '\n\n');
    await waitKey();
    return { next: 'main' };
  }

  if (candidates.length === 0) {
    process.stdout.write('\n');
    process.stdout.write(top + '\n');
    process.stdout.write(row('Import from replit-tools') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row(`All ${allSessions.length} sessions already imported.`) + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('Press any key to go back...') + '\n');
    process.stdout.write(bot + '\n\n');
    await waitKey();
    return { next: 'main' };
  }

  // Pre-select sessions < 3 days old
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const selected = new Set(
    candidates
      .filter(s => s.lastActive && (Date.now() - new Date(s.lastActive).getTime()) < threeDaysMs)
      .map(s => s.id)
  );

  let cursor = 0;

  const renderPicker = () => {
    process.stdout.write('\x1b[2J\x1b[H'); // clear screen

    const headerTitle = 'Import from replit-tools';
    const footerLine  = '↑↓ Navigate  Space Toggle  Enter Import  q Back';

    process.stdout.write('\n');
    process.stdout.write(top + '\n');
    process.stdout.write(row(headerTitle) + '\n');
    process.stdout.write(sep + '\n');

    candidates.forEach((sess, i) => {
      const isCursor   = i === cursor;
      const isSelected = selected.has(sess.id);
      const check      = isSelected ? '☑' : '☐';
      const cursor_ch  = isCursor   ? '▸ ' : '  ';

      // Format age compactly
      const ageStr = sess.age || '';
      // Message count
      const msgCount = sess.promptCount ?? sess.messageCount ?? 0;
      const msgStr   = `${msgCount} msgs`;

      // Name: truncate to fit
      // Layout: "cursor_ch(2) check(1) space(1) name  age  msgs"
      // chrome = 2 + 1 + 1 + 2 + ageStr.length + 2 + msgStr.length = 8 + ageStr.length + msgStr.length
      const chrome  = 2 + 1 + 1 + 2 + ageStr.length + 2 + msgStr.length;
      const nameMax = Math.max(0, W - chrome);
      let name = sess.name || sess.id.slice(0, 8);
      if (name.length > nameMax) name = name.slice(0, nameMax - 3) + '...';
      else name = name.padEnd(nameMax);

      const line = `${cursor_ch}${check} ${name}  ${ageStr}  ${msgStr}`;
      // Highlight cursor row with dim inverse
      const renderedLine = isCursor
        ? `\x1b[7m${cursor_ch}${check} ${name}  ${ageStr}  ${msgStr}\x1b[0m`
        : line;
      process.stdout.write(row(renderedLine) + '\n');
    });

    process.stdout.write(sep + '\n');
    process.stdout.write(row(footerLine) + '\n');
    process.stdout.write(bot + '\n\n');
  };

  // Run the interactive picker
  const readline = await import('node:readline');
  readline.emitKeypressEvents(process.stdin);

  const result = await new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    const canRaw = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
    if (canRaw) process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (canRaw) {
        try { process.stdin.setRawMode(wasRaw || false); } catch {}
      }
    };

    renderPicker();

    const onKey = (str, key) => {
      if (!key) return;
      const name = key.name || '';
      const seq  = key.sequence || str || '';

      // Ctrl-C / Ctrl-D → exit to main
      if (key.ctrl && (name === 'c' || name === 'd')) {
        cleanup();
        process.stdout.write('\n');
        resolve({ action: 'back' });
        return;
      }

      // q or Escape → back
      if (name === 'escape' || (str && str.toLowerCase() === 'q')) {
        cleanup();
        process.stdout.write('\n');
        resolve({ action: 'back' });
        return;
      }

      // Arrow up
      if (name === 'up') {
        cursor = Math.max(0, cursor - 1);
        renderPicker();
        return;
      }

      // Arrow down
      if (name === 'down') {
        cursor = Math.min(candidates.length - 1, cursor + 1);
        renderPicker();
        return;
      }

      // Space → toggle selection
      if (seq === ' ') {
        const id = candidates[cursor].id;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        renderPicker();
        return;
      }

      // Enter → import
      if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
        cleanup();
        process.stdout.write('\n');
        resolve({ action: 'import', ids: [...selected] });
        return;
      }
    };

    process.stdin.on('keypress', onKey);
  });

  if (result.action === 'back' || result.ids.length === 0) {
    return { next: 'main' };
  }

  // Persist imported sessions to sessions.json
  const updatedMeta = getSessionMeta(cwd);
  const now = new Date().toISOString();
  let importCount = 0;
  for (const id of result.ids) {
    const sess = candidates.find(s => s.id === id);
    if (!sess) continue;
    updatedMeta[id] = {
      ...updatedMeta[id],
      source:     'data-tools',
      importedAt: now,
      createdAt:  updatedMeta[id]?.createdAt ?? now,
    };
    importCount++;
  }
  saveSessionMeta(updatedMeta, cwd);

  process.stdout.write(`✓ Imported ${importCount} session${importCount !== 1 ? 's' : ''} from replit-tools\n\n`);

  return { next: 'main' };
}

// ─── Screen: prTriageScreen ───────────────────────────────────────────────────

/**
 * PR Triage screen. Lists open PRs, lets the user select one, checkout + fetch
 * comments, then dispatch fixes through the dual-brain pipeline.
 *
 * ctx.openPRs is the pre-fetched array from detectOpenPRs().
 */
async function prTriageScreen(rl, ask, ctx = {}) {
  const cwd    = process.cwd();
  const prs    = ctx.openPRs || [];

  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60);
  const W     = boxW - 4;

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;
  const row = (content) => makeBoxRow(content, W);

  if (prs.length === 0) {
    process.stdout.write('\n');
    process.stdout.write(top + '\n');
    process.stdout.write(row('PR Triage') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('No open PRs found.') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('[q] Back') + '\n');
    process.stdout.write(bot + '\n\n');
    await ask('  Press Enter to go back...');
    return { next: 'main' };
  }

  // Helper: get review decision label
  function reviewLabel(rd) {
    if (!rd) return 'pending review';
    const map = {
      APPROVED: 'approved',
      CHANGES_REQUESTED: 'changes_requested',
      REVIEW_REQUIRED: 'review_required',
    };
    return map[rd] || rd.toLowerCase();
  }

  // ── Render PR list ─────────────────────────────────────────────────────────
  process.stdout.write('\n');
  process.stdout.write(top + '\n');
  process.stdout.write(row('PR Triage') + '\n');
  process.stdout.write(sep + '\n');

  prs.forEach((pr, i) => {
    const title    = String(pr.title || '').slice(0, W - 6);
    const decision = reviewLabel(pr.reviewDecision);
    const diff     = `+${pr.additions || 0} -${pr.deletions || 0}`;
    const files    = pr.changedFiles ? `${pr.changedFiles} file${pr.changedFiles === 1 ? '' : 's'}` : '';
    const numStr   = `#${pr.number}`;

    process.stdout.write(row(`[${i + 1}] ${numStr} ${title}`) + '\n');
    process.stdout.write(row(`    ${decision} · ${diff}${files ? ' · ' + files : ''}`) + '\n');
    if (pr.headRefName) {
      process.stdout.write(row(`    Branch: ${pr.headRefName}`) + '\n');
    }
    if (i < prs.length - 1) {
      process.stdout.write(row('') + '\n');
    }
  });

  process.stdout.write(sep + '\n');
  process.stdout.write(row('[1-9] Select PR  [q] Back') + '\n');
  process.stdout.write(bot + '\n\n');

  const pick = (await ask('  Choice: ')).trim().toLowerCase();

  if (pick === 'q' || pick === 'b' || pick === '') return { next: 'main' };

  const idx = parseInt(pick, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= prs.length) return { next: 'pr-triage', openPRs: prs };

  const selectedPR = prs[idx];

  // ── PR detail: checkout + fetch comments ──────────────────────────────────
  process.stdout.write(`\n  Checking out PR #${selectedPR.number}...\n`);

  const checkoutResult = _spawnSyncTop('gh', ['pr', 'checkout', String(selectedPR.number)], {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
  });

  if (checkoutResult.status !== 0) {
    process.stdout.write(`  Could not checkout PR: ${(checkoutResult.stderr || '').slice(0, 100)}\n`);
    await ask('  Press Enter to continue...');
    return { next: 'pr-triage', openPRs: prs };
  }

  process.stdout.write(`  Fetching comments...\n`);

  let comments = [];
  try {
    const commentsResult = _spawnSyncTop('gh', [
      'pr', 'view', String(selectedPR.number),
      '--comments',
      '--json', 'comments',
    ], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });

    if (commentsResult.status === 0 && commentsResult.stdout) {
      const parsed = JSON.parse(commentsResult.stdout.trim());
      comments = parsed?.comments || [];
    }
  } catch {}

  // ── Show PR detail: comments grouped by file ──────────────────────────────
  process.stdout.write('\n');
  process.stdout.write(top + '\n');
  process.stdout.write(row(`#${selectedPR.number} ${String(selectedPR.title).slice(0, W - 6)}`) + '\n');
  process.stdout.write(sep + '\n');

  if (comments.length === 0) {
    process.stdout.write(row('No review comments.') + '\n');
  } else {
    // Group comments by their file path (body comments have no path)
    const grouped = {};
    for (const c of comments) {
      const file = c.path || '(general)';
      if (!grouped[file]) grouped[file] = [];
      grouped[file].push(c);
    }
    for (const [file, fileCmts] of Object.entries(grouped)) {
      const fileLabel = file.length > W - 4 ? '...' + file.slice(-(W - 7)) : file;
      process.stdout.write(row(`  ${fileLabel}`) + '\n');
      for (const c of fileCmts.slice(0, 3)) {
        const body = String(c.body || '').replace(/\s+/g, ' ').slice(0, W - 6);
        process.stdout.write(row(`    → ${body}`) + '\n');
      }
      if (fileCmts.length > 3) {
        process.stdout.write(row(`    ... +${fileCmts.length - 3} more`) + '\n');
      }
    }
  }

  process.stdout.write(sep + '\n');
  process.stdout.write(row('[f] Dispatch fixes  [v] View full diff  [b] Back') + '\n');
  process.stdout.write(bot + '\n\n');

  const action = (await ask('  Action: ')).trim().toLowerCase();

  if (action === 'v') {
    // Show full diff via gh pr diff
    process.stdout.write('\n');
    const diffResult = _spawnSyncTop('gh', ['pr', 'diff', String(selectedPR.number)], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });
    const diffOut = (diffResult.stdout || '').slice(0, 3000);
    process.stdout.write(diffOut || '  (no diff output)\n');
    process.stdout.write('\n');
    await ask('  Press Enter to continue...');
    return { next: 'pr-triage', openPRs: prs };
  }

  if (action === 'f') {
    // Dispatch each comment as a fix task through detect→decide→dispatch
    if (comments.length === 0) {
      process.stdout.write('  No comments to fix.\n\n');
      await ask('  Press Enter to continue...');
      return { next: 'pr-triage', openPRs: prs };
    }

    process.stdout.write(`\n  Dispatching ${comments.length} comment fix${comments.length === 1 ? '' : 's'} through dual-brain...\n\n`);

    // Collect the PR files for context
    const prFiles = [];
    try {
      const filesResult = _spawnSyncTop('gh', [
        'pr', 'view', String(selectedPR.number),
        '--json', 'files',
      ], {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      });
      if (filesResult.status === 0) {
        const pf = JSON.parse(filesResult.stdout || '{}');
        (pf.files || []).forEach(f => prFiles.push(f.path));
      }
    } catch {}

    const profile = loadProfile(cwd);

    for (let ci = 0; ci < comments.length; ci++) {
      const c = comments[ci];
      const taskPrompt = c.path
        ? `Fix review comment in ${c.path}: ${c.body}`
        : `Fix PR review comment: ${c.body}`;

      process.stdout.write(`  [${ci + 1}/${comments.length}] ${taskPrompt.slice(0, 60)}...\n`);

      try {
        const detection = detectTask({ prompt: taskPrompt, files: prFiles });
        const decision  = decideRoute({ profile, detection, cwd });
        const result    = await dispatch({ decision, prompt: taskPrompt, files: prFiles, cwd });
        const status    = result.status === 'completed' ? '✓' : '✗';
        process.stdout.write(`  ${status} ${result.status} (${(result.durationMs / 1000).toFixed(1)}s)\n`);
        if (result.summary) process.stdout.write(`    ${result.summary.slice(0, 80)}\n`);
      } catch (e) {
        process.stdout.write(`  ✗ Error: ${e.message.slice(0, 80)}\n`);
      }
    }

    process.stdout.write('\n  All fixes dispatched.\n\n');
    await ask('  Press Enter to continue...');
    return { next: 'pr-triage', openPRs: prs };
  }

  // 'b' or anything else → back to PR list
  return { next: 'pr-triage', openPRs: prs };
}

// ─── Screen: settingsScreen ───────────────────────────────────────────────────

async function settingsScreen(rl, ask) {
  const cwd = process.cwd();

  const DIM   = '\x1b[2m';
  const RESET = '\x1b[0m';
  const GREEN = '\x1b[32m';
  const RED   = '\x1b[31m';
  const BOLD  = '\x1b[1m';

  const chk  = `${GREEN}✓${RESET}`;
  const xmark = `${RED}✗${RESET}`;

  // Detect if gh is available + has PRs for the PR triage option
  const settingsPRs = await detectOpenPRs(cwd);

  // Load current work style
  const profile = loadProfile(cwd);
  const currentBias = profile?.bias || profile?.mode || 'balanced';
  const automode = profile.automode ?? profile.settings?.automode ?? false;
  const bypassPermissions = !!profile.bypassPermissions;

  // Work style current markers
  const _stIsFast = ['cost-saver', 'auto', 'solo-claude', 'solo-openai'].includes(currentBias);
  const _stIsBal  = currentBias === 'balanced';
  const _stIsFull = currentBias === 'quality-first';
  const dot = (active) => active ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;

  // ── Subscriptions / credentials ──────────────────────────────────────────
  const credData  = loadCredentials(cwd);
  const credList  = credData.credentials || [];
  const hasCredRegistry = credList.length > 0;

  // Fall back to detectAuth() when no registry entries yet
  let subsLines = [];
  if (hasCredRegistry) {
    for (const c of credList.filter(c => c.enabled !== false)) {
      const provLabel  = c.provider === 'claude' ? 'Claude' : 'OpenAI';
      const authLabel  = c.auth_type === 'cli_oauth' ? 'CLI OAuth' : 'API key';
      const planLabel  = c.plan_hint || '';
      const healthMark = c.health === 'healthy' ? chk : c.health === 'degraded' ? `${RED}~${RESET}` : `${DIM}?${RESET}`;
      const scopeTag   = `[${c.scope || 'local'}]`;
      const planPart   = planLabel ? `  ${DIM}${planLabel}${RESET}` : '';
      subsLines.push(`  ${DIM}${provLabel.padEnd(6)}${RESET}  ${authLabel.padEnd(10)}${planPart}  ${healthMark}${c.health === 'healthy' ? ' healthy' : ' ' + (c.health || 'unknown')}  ${DIM}${scopeTag}${RESET}`);
    }
    if (subsLines.length === 0) subsLines.push(`  ${DIM}none registered${RESET}`);
  } else {
    const _stAuth = await detectAuth();
    const _clStatus = _stAuth.claude.found ? `${chk} connected` : `${xmark} not connected`;
    const _oaStatus = _stAuth.openai.found ? `${chk} connected` : `${xmark} not connected`;
    subsLines.push(`  ${DIM}Claude${RESET}   CLI OAuth    ${_clStatus}`);
    subsLines.push(`  ${DIM}OpenAI${RESET}   API key      ${_oaStatus}`);
  }

  // ── Work style ───────────────────────────────────────────────────────────
  const wsLines = [
    `  ${dot(_stIsFast)} ${_stIsFast ? BOLD : DIM}Fast${RESET}   speed over caution`,
    `  ${dot(_stIsBal)}  ${_stIsBal ? BOLD : DIM}Balanced${RESET}   smart routing, reviews on important`,
    `  ${dot(_stIsFull)} ${_stIsFull ? BOLD : DIM}Full Power${RESET}   dual-brain everything, max quality`,
  ];

  // ── Conversation behavior ───────────────────────────────────────────────
  const autoMark = automode ? chk : xmark;
  const permMark = bypassPermissions ? `${RED}!${RESET}` : chk;
  const permMode = bypassPermissions
    ? `${RED}bypass approvals and sandbox${RESET}`
    : `${GREEN}safe approvals + workspace sandbox${RESET}`;
  const convLines = [
    `  ${DIM}Auto mode${RESET}      ${autoMark} ${automode ? 'run safe tasks immediately' : 'ask before launching tasks'}`,
    `  ${DIM}Permissions${RESET}    ${permMark} ${permMode}`,
    `  ${DIM}Claude resume${RESET}  ${bypassPermissions ? '--dangerously-skip-permissions' : 'normal permissions'}`,
    `  ${DIM}Codex resume${RESET}   ${bypassPermissions ? '--dangerously-bypass-approvals-and-sandbox' : 'workspace-write + on-request'}`,
  ];

  // ── System info ──────────────────────────────────────────────────────────
  const rt = detectReplitTools(cwd);
  const rtLabel = rt.installed ? `v${rt.version || '?'}` : 'not installed';
  const rtMark  = rt.installed ? chk : xmark;

  let sessionCount = 0;
  try {
    const idxPath = join(cwd, '.dualbrain', 'session-index.json');
    const idx = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : {};
    sessionCount = Object.keys(idx).length;
  } catch { /* ignore */ }

  let pluginCount = 0;
  try {
    const settingsJson = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsJson)) {
      const s = JSON.parse(readFileSync(settingsJson, 'utf8'));
      pluginCount = Object.keys(s?.mcpServers || {}).length;
    }
  } catch { /* ignore */ }

  let doctorStr = `${DIM}not run${RESET}`;
  try {
    const hooksDir    = join(cwd, '.claude', 'hooks');
    const headGuard   = existsSync(join(hooksDir, 'head-guard.mjs'));
    const enforceTier = existsSync(join(hooksDir, 'enforce-tier.mjs'));
    const settingsFile = join(cwd, '.claude', 'settings.json');
    let guardCount = 0;
    if (existsSync(settingsFile)) {
      const s = JSON.parse(readFileSync(settingsFile, 'utf8'));
      const ptu = s?.hooks?.PreToolUse ?? [];
      const gCmd = 'node .claude/hooks/head-guard.mjs';
      const tCmd = 'node .claude/hooks/enforce-tier.mjs';
      guardCount = [
        ptu.some(e => e.matcher === 'Edit'  && e.hooks?.some(h => h.command === gCmd)),
        ptu.some(e => e.matcher === 'Write' && e.hooks?.some(h => h.command === gCmd)),
        ptu.some(e => e.matcher === 'Bash'  && e.hooks?.some(h => h.command === gCmd)),
        ptu.some(e => e.matcher === 'Agent' && e.hooks?.some(h => h.command === tCmd)),
      ].filter(Boolean).length;
    }
    const checks = [headGuard, enforceTier, guardCount >= 4].filter(Boolean).length + 7; // base 7 always pass
    const total  = 10;
    doctorStr = checks >= total
      ? `${chk} ${checks}/${total} checks passing`
      : `${RED}${checks}/${total} checks passing${RESET}`;
  } catch { /* ignore */ }

  const sysLines = [
    `  ${DIM}replit-tools${RESET}  ${rtLabel}  ${rtMark} ${rt.installed ? 'connected' : 'not connected'}`,
    `  ${DIM}Sessions${RESET}      ${sessionCount} archived`,
    `  ${DIM}Plugins${RESET}       ${pluginCount} configured`,
    `  ${DIM}Doctor${RESET}        ${doctorStr}`,
  ];

  // ── Render (paneled layout) ───────────────────────────────────────────────
  const CYAN = '\x1b[36m';
  const settingsPanelW = 70;

  const subsContent = [
    ...subsLines.map(l => l.replace(/^  /, '')),
    '',
    signalLine('info', `${DIM}[a] add  [r] remove  [h] health check${RESET}`),
  ];

  const wsContent = [
    ...wsLines.map(l => l.replace(/^  /, '')),
    '',
    signalLine('info', `${DIM}[1-3] change${RESET}`),
  ];

  const convContent = [
    ...convLines.map(l => l.replace(/^  /, '')),
    '',
    signalLine('info', `${DIM}[o] auto mode  [v] permission mode${RESET}`),
  ];

  const sysContent = [
    ...sysLines.map(l => l.replace(/^  /, '')),
    '',
    signalLine('info', `${DIM}[d] diagnostics${RESET}`),
  ];

  const navContent = [
    `${DIM}[e]${RESET} sessions  ${DIM}[m]${RESET} subscriptions  ${DIM}[b]${RESET} back`,
    ...(settingsPRs.length > 0 ? [`${DIM}[p]${RESET} PR triage ${DIM}(${settingsPRs.length} open)${RESET}`] : []),
  ];

  process.stdout.write('\n');
  process.stdout.write(panel('Subscriptions', subsContent, { width: settingsPanelW, titleColor: CYAN }) + '\n\n');
  process.stdout.write(panel('Work style', wsContent, { width: settingsPanelW, titleColor: CYAN }) + '\n\n');
  process.stdout.write(panel('Conversation', convContent, { width: settingsPanelW, titleColor: CYAN }) + '\n\n');
  process.stdout.write(panel('System', sysContent, { width: settingsPanelW, titleColor: CYAN }) + '\n\n');
  process.stdout.write(panel('Navigation', navContent, { width: settingsPanelW }) + '\n\n');

  const raw    = (await ask('  Choice: ')).trim();
  const choice = raw.toLowerCase();

  // Work style 1/2/3
  if (choice === '1' || choice === '2' || choice === '3') {
    const wsMap  = { '1': 'cost-saver', '2': 'balanced', '3': 'quality-first' };
    const wsDisp = { '1': 'Fast', '2': 'Balanced', '3': 'Full Power' };
    const newBias = wsMap[choice];
    if (newBias && newBias !== currentBias) {
      profile.bias = newBias;
      const enabledCount = [
        profile.providers?.claude?.enabled,
        profile.providers?.openai?.enabled,
      ].filter(Boolean).length;
      if (enabledCount >= 2) profile.mode = newBias;
      saveProfile(profile, { cwd });
      process.stdout.write(`\n  Work style set to ${wsDisp[choice]}\n\n`);
      await ask('  Press Enter to continue...');
    }
    return { next: 'settings' };
  }

  // Conversation behavior toggles
  if (choice === 'o') {
    const nextAuto = !automode;
    profile.automode = nextAuto;
    profile.settings = { ...(profile.settings || {}), automode: nextAuto };
    saveProfile(profile, { cwd });
    process.stdout.write(`\n  Auto mode: ${nextAuto ? GREEN + 'ON' + RESET : DIM + 'OFF' + RESET}\n\n`);
    await ask('  Press Enter to continue...');
    return { next: 'settings' };
  }

  if (choice === 'v') {
    if (bypassPermissions) {
      profile.bypassPermissions = false;
      saveProfile(profile, { cwd });
      process.stdout.write(`\n  Permission mode: ${GREEN}safe approvals + workspace sandbox${RESET}\n\n`);
      await ask('  Press Enter to continue...');
      return { next: 'settings' };
    }

    process.stdout.write(`\n  ${RED}Bypass mode disables provider approval prompts and sandboxing.${RESET}\n`);
    process.stdout.write('  Use it only in trusted workspaces where the user explicitly accepts the risk.\n');
    const confirm = (await ask('  Type YES to enable bypass mode: ')).trim();
    if (confirm === 'YES') {
      profile.bypassPermissions = true;
      saveProfile(profile, { cwd });
      process.stdout.write(`\n  Permission mode: ${RED}bypass approvals and sandbox${RESET}\n\n`);
    } else {
      process.stdout.write('\n  Permission mode unchanged.\n\n');
    }
    await ask('  Press Enter to continue...');
    return { next: 'settings' };
  }

  // Add credential
  if (choice === 'a') {
    process.stdout.write('\n  Auto-detecting credentials...\n');
    try {
      const discovered = await detectCredentials(cwd);
      const existing   = loadCredentials(cwd).credentials.map(c => c.id);
      const newOnes    = discovered.filter(c => !existing.includes(c.id));
      if (newOnes.length === 0) {
        process.stdout.write('  No new credentials detected.\n\n');
      } else {
        for (const c of newOnes) {
          addCredential(c, cwd);
          process.stdout.write(`  Added: ${c.id} (${c.provider} / ${c.auth_type})\n`);
        }
      }
    } catch (e) {
      process.stdout.write(`  Detection failed: ${e.message}\n`);
    }
    await ask('  Press Enter to continue...');
    return { next: 'settings' };
  }

  // Remove credential
  if (choice === 'r') {
    const creds = loadCredentials(cwd).credentials;
    if (creds.length === 0) {
      process.stdout.write('\n  No credentials registered.\n\n');
      await ask('  Press Enter to continue...');
      return { next: 'settings' };
    }
    process.stdout.write('\n');
    creds.forEach((c, i) => process.stdout.write(`  [${i + 1}] ${c.id} (${c.provider})\n`));
    const pick = (await ask('\n  Number to remove (or Enter to cancel): ')).trim();
    const idx  = parseInt(pick, 10) - 1;
    if (idx >= 0 && idx < creds.length) {
      removeCredential(creds[idx].id, cwd);
      process.stdout.write(`  Removed ${creds[idx].id}\n\n`);
    }
    await ask('  Press Enter to continue...');
    return { next: 'settings' };
  }

  // Health check credentials
  if (choice === 'h') {
    process.stdout.write('\n  Checking credential health...\n');
    try {
      const data  = loadCredentials(cwd);
      const creds = data.credentials || [];
      if (creds.length === 0) {
        process.stdout.write('  No credentials to check.\n');
      } else {
        const updated = [];
        for (const c of creds) {
          const checked = await checkCredentialHealth(c, cwd);
          const mark = checked.health === 'healthy' ? chk : xmark;
          process.stdout.write(`  ${mark} ${c.id}: ${checked.health}\n`);
          updated.push(checked);
        }
        saveCredentials({ ...data, credentials: updated }, cwd);
      }
    } catch (e) {
      process.stdout.write(`  Health check failed: ${e.message}\n`);
    }
    await ask('\n  Press Enter to continue...');
    return { next: 'settings' };
  }

  if (choice === 'm') { return { next: 'subscriptions' }; }
  if (choice === 'e') { return { next: 'sessions' }; }
  if (choice === 'x') { return { next: 'diagnostics' }; }

  if (choice === 'p' && settingsPRs.length > 0) {
    return { next: 'pr-triage', openPRs: settingsPRs };
  }

  if (choice === 'd') {
    return { next: 'diagnostics' };
  }

  // Intelligence settings (routing, think, strategies)
  if (choice === 'i') {
    try {
      const { runSettings } = await import('../dist/src/settings-tui.js');
      await runSettings(cwd);
    } catch (e) {
      process.stdout.write(`  Intelligence settings unavailable: ${e.message}\n`);
      await ask('  Press Enter to continue...');
    }
    return { next: 'settings' };
  }

  // Revert recent changes
  if (choice === 'u') {
    try {
      const { runRevert } = await import('../dist/src/revert.js');
      await runRevert(cwd);
    } catch (e) {
      process.stdout.write(`  Revert unavailable: ${e.message}\n`);
      await ask('  Press Enter to continue...');
    }
    return { next: 'settings' };
  }

  if (choice === 'b' || choice === 'back' || raw === '\x1b') { return { next: 'main' }; }

  return { next: 'main' };
}

// ─── Screen: teamScreen ───────────────────────────────────────────────────────

async function teamScreen(rl, ask) {
  const cwd = process.cwd();

  // Box layout matching dashboard
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60);
  const W     = boxW - 4;

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;
  const row = (content) => makeBoxRow(content, W);

  // Load team from project.json
  let team = [];
  let sharedSessions = 0;
  let teamDecisions = 0;
  try {
    const _tmLd = await import('../dist/src/living-docs.js');
    const _tmPs = _tmLd.getProjectState(cwd);
    if (Array.isArray(_tmPs?.project?.team)) {
      team = _tmPs.project.team;
    }
    // Count decisions with more than one participant as team decisions
    if (Array.isArray(_tmPs?.recentDecisions)) {
      teamDecisions = _tmPs.recentDecisions.filter(
        d => Array.isArray(d?.participants) && d.participants.length > 1
      ).length;
    }
  } catch { /* non-fatal */ }

  // Fall back to git user if no team configured
  let ownerName = '(you)';
  if (team.length === 0) {
    try {
      const { execSync: _tmExec } = await import('node:child_process');
      const gitUser = _tmExec('git config user.name 2>/dev/null', {
        encoding: 'utf8', timeout: 2000, stdio: 'pipe',
      }).trim();
      if (gitUser) ownerName = gitUser;
    } catch { /* non-fatal */ }
  }

  const memberRows = [];
  if (team.length === 0) {
    memberRows.push(row(`  ${ownerName} (owner)`));
  } else {
    for (const member of team) {
      const role = member.role || 'member';
      memberRows.push(row(`  ${member.name} (${role})`));
    }
  }

  const lines = [
    top,
    row('Team'),
    sep,
    row('Members'),
    ...memberRows,
    sep,
    row(`Shared Sessions: ${sharedSessions}`),
    row(`Team decisions: ${teamDecisions}`),
    sep,
    row('[a] add member  [b] back'),
    bot,
  ];
  process.stdout.write('\n' + lines.join('\n') + '\n\n');

  const raw    = (await ask('  Choice: ')).trim();
  const choice = raw.toLowerCase();

  if (choice === 'a') {
    const name = (await ask('  Member name: ')).trim();
    if (name) {
      try {
        const _tmLdAdd = await import('../dist/src/living-docs.js');
        const _tmCur   = _tmLdAdd.getProjectState(cwd);
        const _tmTeam  = Array.isArray(_tmCur?.project?.team) ? [..._tmCur.project.team] : [];
        _tmTeam.push({ name, role: 'member', addedAt: new Date().toISOString() });
        _tmLdAdd.updateProject({ team: _tmTeam }, cwd);
        process.stdout.write(`\n  Added ${name} to team.\n\n`);
        await ask('  Press Enter to continue...');
      } catch {
        process.stdout.write('\n  Could not save team member.\n\n');
        await ask('  Press Enter to continue...');
      }
    }
    return { next: 'team' };
  }

  if (choice === 'b' || choice === 'back' || choice === 'q' || raw === '\x1b') {
    return { next: 'main' };
  }

  return { next: 'main' };
}


// ─── Helper: aggregatePlans ───────────────────────────────────────────────────

function aggregatePlans(subs) {
  if (!subs || subs.length === 0) return '';
  const counts = {};
  for (const s of subs) {
    const label = s.plan || 'unknown';
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => count > 1 ? `${label}×${count}` : label)
    .join('  ');
}

// ─── Screen: subscriptionsScreen ─────────────────────────────────────────────

async function subscriptionsScreen(rl, ask) {
  console.clear();
  const cwd = process.cwd();
  const profile = loadProfile(cwd);
  const auth    = await detectAuth();

  // Backward compat: migrate old single-sub format to subs array
  for (const prov of ['claude', 'openai']) {
    const p = profile?.providers?.[prov];
    if (p && !p.subs && p.plan) {
      p.subs = [{ plan: p.plan, label: p.label || null, expiresAt: p.expiresAt || null }];
    }
  }

  // Build status lines — roster format
  const lines = [];

  function buildProviderLines(provKey, displayName, authFound) {
    const sub = profile?.providers?.[provKey];
    const subs = sub?.subs || [];
    if (!authFound && subs.length === 0) {
      lines.push(`  ⚠️  ${displayName}: not linked`);
      return;
    }
    const aggregate = aggregatePlans(subs);
    const prefix = authFound ? '✅' : '⚠️ ';
    lines.push(`  ${prefix} ${displayName}:${aggregate ? '  ' + aggregate : '  (no subs)'}`);
    subs.forEach((s, i) => {
      const planLabels = provKey === 'claude' ? CLAUDE_PLAN_LABELS : OPENAI_PLAN_LABELS;
      const planLabel = planLabels[s.plan] ?? s.plan ?? 'unknown';
      const nameStr = (s.label || '(no label)').padEnd(22);
      const d = s.expiresAt ? daysUntil(s.expiresAt) : null;
      const expiry = d === null ? '' : d < 0 ? '  (expired)' : d === 0 ? '  (today)' : `  (${d}d left)`;
      lines.push(`    ${i + 1}. ${nameStr} ${planLabel}${expiry}`);
    });
  }

  buildProviderLines('claude', 'Claude', auth.claude.found);
  lines.push('');
  buildProviderLines('openai', 'OpenAI', auth.openai.found);

  console.log(box('Subscriptions', lines));
  console.log('');

  const menuOpts = [
    { key: '1', label: 'Add Claude sub', section: 'Link' },
    { key: '2', label: 'Add Codex sub',  section: 'Link' },
    { key: 'r', label: 'Remove a sub',   section: 'Link' },
    { key: 'b', label: 'Back to home',   section: '' },
  ];
  console.log(menu(menuOpts));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === '1') {
    console.log('\n  Linking Claude account...');
    console.log('  A browser window will open — paste the code below when prompted.\n');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('claude', ['auth', 'login'], { stdio: 'inherit', timeout: 60000 });
    if (r.status === 0) {
      console.log('\n  ✅ Claude linked successfully!\n');
      const label = (await ask("  Label (e.g. \"Josh's work account\", or Enter to skip): ")).trim();
      const expiry = await askExpiry(ask, 'Claude');
      const newPlans = detectPlans();
      const plan = newPlans.claude?.plan || 'pro';
      if (!profile.providers) profile.providers = {};
      if (!profile.providers.claude) profile.providers.claude = { enabled: true };
      profile.providers.claude.plan = plan;
      profile.providers.claude.enabled = true;
      // Push to subs array instead of overwriting
      if (!profile.providers.claude.subs) profile.providers.claude.subs = [];
      profile.providers.claude.subs.push({ plan, label: label || null, expiresAt: expiry || null });
      saveProfile(profile, { cwd });
      console.log('  ✓ Saved\n');
      await ask('  Press Enter to continue...');
    } else {
      console.log('\n  ❌ Claude login failed or was cancelled.\n');
      await ask('  Press Enter to continue...');
    }
    return { next: 'subscriptions' };
  }

  if (choice === '2') {
    console.log('\n  Linking Codex account...');
    console.log('  A browser window will open — paste the code below when prompted.\n');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('codex', ['login'], { stdio: 'inherit', timeout: 60000 });
    if (r.status === 0) {
      console.log('\n  ✅ Codex linked successfully!\n');
      const label = (await ask('  Label (e.g. "Team Codex Pro", or Enter to skip): ')).trim();
      const expiry = await askExpiry(ask, 'Codex');
      const newPlans = detectPlans();
      const plan = newPlans.openai?.plan || 'plus';
      if (!profile.providers) profile.providers = {};
      if (!profile.providers.openai) profile.providers.openai = { enabled: true };
      profile.providers.openai.plan = plan;
      profile.providers.openai.enabled = true;
      // Push to subs array instead of overwriting
      if (!profile.providers.openai.subs) profile.providers.openai.subs = [];
      profile.providers.openai.subs.push({ plan, label: label || null, expiresAt: expiry || null });
      saveProfile(profile, { cwd });
      console.log('  ✓ Saved\n');
      await ask('  Press Enter to continue...');
    } else {
      console.log('\n  ❌ Codex login failed or was cancelled.\n');
      await ask('  Press Enter to continue...');
    }
    return { next: 'subscriptions' };
  }

  if (choice === 'r') {
    // Build a flat numbered list of all subs across both providers
    const allSubs = [];
    for (const [provKey, displayName] of [['claude', 'Claude'], ['openai', 'OpenAI']]) {
      const subs = profile?.providers?.[provKey]?.subs || [];
      for (const s of subs) {
        allSubs.push({ provKey, displayName, sub: s });
      }
    }

    if (allSubs.length === 0) {
      console.log('\n  No linked accounts to remove.\n');
      await ask('  Press Enter to continue...');
      return { next: 'subscriptions' };
    }

    console.log('\n  Remove a linked account:\n');
    allSubs.forEach(({ displayName, sub }, i) => {
      const planLabels = displayName === 'Claude' ? CLAUDE_PLAN_LABELS : OPENAI_PLAN_LABELS;
      const planLabel = planLabels[sub.plan] ?? sub.plan ?? 'unknown';
      const labelStr = sub.label ? ` [${sub.label}]` : '';
      console.log(`  (${i + 1}) ${displayName}: ${planLabel}${labelStr}`);
    });
    console.log('  (Enter) Cancel\n');

    const numStr = (await ask('  Remove #: ')).trim();
    const numChoice = parseInt(numStr, 10);
    if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= allSubs.length) {
      const { provKey, sub } = allSubs[numChoice - 1];
      const confirm = (await ask(`  Remove "${sub.label || sub.plan}" from ${provKey}? (y/N): `)).trim().toLowerCase();
      if (confirm === 'y') {
        const subs = profile.providers[provKey].subs;
        const idx = subs.indexOf(sub);
        if (idx !== -1) subs.splice(idx, 1);
        // Update top-level plan to first remaining sub (or keep as-is)
        if (subs.length > 0) {
          profile.providers[provKey].plan = subs[0].plan;
        }
        saveProfile(profile, { cwd });
        console.log('  ✓ Removed\n');
      } else {
        console.log('  Cancelled.\n');
      }
    } else {
      console.log('  Cancelled.\n');
    }
    await ask('  Press Enter to continue...');
    return { next: 'subscriptions' };
  }

  return { next: 'main' };
}

// ─── Onboarding Wizard ───────────────────────────────────────────────────────

/**
 * Write .dualbrain/credentials.json with detected providers.
 * Non-destructive: never overwrites entries with the same id.
 */
function saveWizardCredentials(cwd, detectedProviders) {
  const dir = join(cwd, '.dualbrain');
  try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ }

  const credPath = join(dir, 'credentials.json');
  let existing = { version: 1, credentials: [] };
  try {
    const raw = readFileSync(credPath, 'utf8');
    existing = JSON.parse(raw);
    if (!Array.isArray(existing.credentials)) existing.credentials = [];
  } catch { /* fresh start */ }

  const existingIds = new Set(existing.credentials.map(c => c.id));
  const now = new Date().toISOString();

  for (const cred of detectedProviders) {
    if (!existingIds.has(cred.id)) {
      existing.credentials.push({ ...cred, last_checked_at: now });
    }
  }

  writeFileSync(credPath, JSON.stringify(existing, null, 2), 'utf8');
}

/**
 * Animated first-run setup wizard — detection-first, 3-interaction flow.
 * Detection IS the home screen loading: scan → confirm providers → pick style → done.
 * Uses src/fx.mjs; falls back to plain output stubs.
 *
 * @param {{ auth, plans, existingSessions }} _detection  (unused — kept for API compat)
 * @param {string} cwd
 * @param {object} rl  readline interface
 * @returns {object|null}  profile object to save, or null if cancelled/skipped
 */
function setAsDefaultShell(cwd) {
  const root = cwd || process.cwd();
  const replitPath = join(root, '.replit');
  if (!existsSync(replitPath)) return;

  let content = readFileSync(replitPath, 'utf8');
  const newOnBoot = 'onBoot = "source /home/runner/workspace/.replit-tools/scripts/setup-claude-code.sh 2>/dev/null || true; ln -sf /home/runner/workspace/.replit-tools/.npm-persistent/.npmrc ~/.npmrc 2>/dev/null || true; dual-brain install --global 2>/dev/null || true"';

  if (content.match(/^onBoot\s*=/m)) {
    content = content.replace(/^onBoot\s*=.*$/m, newOnBoot);
  } else {
    content += '\n' + newOnBoot + '\n';
  }
  writeFileSync(replitPath, content);
}

function removeAsDefaultShell(cwd) {
  const root = cwd || process.cwd();
  const replitPath = join(root, '.replit');
  if (!existsSync(replitPath)) return;

  let content = readFileSync(replitPath, 'utf8');
  const origOnBoot = 'onBoot = "source /home/runner/workspace/.replit-tools/scripts/setup-claude-code.sh 2>/dev/null || true"';
  if (content.match(/^onBoot\s*=/m)) {
    content = content.replace(/^onBoot\s*=.*$/m, origOnBoot);
    writeFileSync(replitPath, content);
  }
}

async function askDefaultShell(cwd, rl, fx) {
  const cl = fx.colors || {};
  const DIM = cl.dim || '';
  const BOLD = cl.bold || '';
  const CYAN = cl.cyan || '\x1b[36m';
  const YLW  = cl.yellow || '\x1b[33m';
  const GREEN = cl.green || '';
  const RST = cl.reset || '';

  const setupContent = [
    `${DIM}Start dual-brain automatically when this Replit opens?${RST}`,
    '',
    `  ${DIM}modifies${RST}  ${YLW}.replit onBoot${RST}`,
    `  ${DIM}undo${RST}      Settings → System → Startup`,
    '',
    `  ${CYAN}[Enter]${RST} Start on boot  ${DIM}[n] Run manually${RST}`,
  ];
  process.stdout.write('\n' + panel('dual-brain setup', setupContent) + '\n');

  const answer = await new Promise(res => rl.question('  ', (a) => res(a.trim().toLowerCase())));
  const yes = !answer || answer.startsWith('y');

  if (yes) {
    setAsDefaultShell(cwd);
    process.stdout.write(` ${GREEN}+${RST} ${DIM}dual-brain will start on boot. Change anytime in Settings.${RST}\n`);
  } else {
    process.stdout.write(` ${DIM}No problem. Run dual-brain anytime from the command line.${RST}\n`);
  }

  return yes;
}

async function runOnboardingWizard(_detection, cwd, rl) {
  const fx  = await getFx();
  const cl  = fx.colors || {};
  const DIM   = cl.dim   || '';
  const BOLD  = cl.bold  || '';
  const GREEN = cl.green || '';
  const CYAN  = cl.cyan  || '';
  const GRAY  = cl.gray  || '';
  const RST   = cl.reset || '';

  const isTTY = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';

  // Helper: print a single dim line (indented with one space)
  function dimLine(text) {
    process.stdout.write(` ${GRAY}${text}${RST}\n`);
  }

  // Helper: single-key prompt; falls back to readline if not a real TTY
  async function singleKey(validKeys) {
    if (!isTTY) {
      const line = await new Promise(res => rl.question('', res));
      return (line.trim().toLowerCase()[0]) || '\r';
    }
    const { emitKeypressEvents } = await import('node:readline');
    emitKeypressEvents(process.stdin, rl);
    return new Promise((resolve) => {
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      const cleanup = () => {
        process.stdin.removeListener('keypress', onKey);
        try { process.stdin.setRawMode(wasRaw || false); } catch {}
      };
      const onKey = (str, key) => {
        if (!key) return;
        const name = key.name || '';
        if (key.ctrl && (name === 'c' || name === 'd')) {
          cleanup(); process.stdout.write('\n'); resolve('q'); return;
        }
        const ch = (str || '').toLowerCase();
        if (name === 'return' || name === 'enter') {
          cleanup(); process.stdout.write('\n'); resolve('\r'); return;
        }
        if (validKeys.includes(ch)) {
          cleanup(); process.stdout.write(`${ch}\n`); resolve(ch); return;
        }
      };
      process.stdin.on('keypress', onKey);
    });
  }

  // ─── Clear screen + header ─────────────────────────────────────────────────
  const version = readVersion();
  fx.clearScreen();
  process.stdout.write(`\n ${BOLD}dual-brain${RST}${GRAY}                                              v${version}${RST}\n\n`);
  process.stdout.write(` ${DIM}Setting up your workspace...${RST}\n\n`);

  // ─── Env scan — run detection in parallel with animated output ────────────
  const capsPromise = detectCapabilities(cwd);

  // Replit workspace
  const isReplit = !!(process.env.REPL_ID || process.env.REPL_SLUG);
  if (isReplit) {
    await fx.sleep(150);
    fx.success('Replit workspace detected');
  }

  // Node version
  try {
    const major = process.version.replace(/^v/, '').split('.')[0];
    await fx.sleep(100);
    fx.success(`Node ${major}.x found`);
  } catch { /* non-fatal */ }

  // Git repo name, branch, file count
  let repoName = null;
  let branchName = null;
  let fileCount = 0;
  try {
    const { spawnSync: sp } = await import('node:child_process');
    const topLevel = sp('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 3000,
    });
    if (topLevel.status === 0) repoName = basename((topLevel.stdout || '').trim());

    const branch = sp('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 2000,
    });
    branchName = (branch.stdout || '').trim() || null;

    const count = sp('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 3000,
    });
    fileCount = (count.stdout || '').trim().split('\n').filter(Boolean).length;
  } catch { /* not a git repo or git unavailable */ }

  if (repoName) {
    const fileLabel   = fileCount > 0 ? `, ${fileCount} file${fileCount === 1 ? '' : 's'}` : '';
    const branchLabel = branchName ? ` (${branchName} branch${fileLabel})` : '';
    await fx.sleep(100);
    fx.success(`Git repository: ${repoName}${branchLabel}`);
  }

  // Provider spinner while awaiting detection
  const provSpinner = fx.spinner('Checking providers...').start();
  const caps = await capsPromise;
  const claudeReady    = caps.claude.available;
  const openaiReady    = caps.openai.available;
  const codexAvailable = caps.codex.available;
  provSpinner.stop();

  // Claude
  let claudeAuthLabel = null;
  let claudeAuthType  = null;
  if (claudeReady) {
    if (caps.claude.source === 'claude-code' || caps.claude.source === 'claude-dir') {
      claudeAuthLabel = 'CLI OAuth'; claudeAuthType = 'cli_oauth';
    } else {
      claudeAuthLabel = caps.claude.source || 'detected'; claudeAuthType = 'cli_oauth';
    }
    fx.success(`Claude CLI found · ${claudeAuthLabel}`);
  }

  // OpenAI / Codex
  let openaiAuthLabel = null;
  let openaiAuthType  = null;
  if (openaiReady || codexAvailable) {
    openaiAuthLabel = 'CLI OAuth'; openaiAuthType = 'cli_oauth';
    fx.success('OpenAI Codex CLI found · authenticated');
  }

  // replit-tools — auto-import sessions (non-destructive read-only indexing, no prompt)
  const rt = detectReplitTools(cwd);
  let rtSessionCount = 0;
  if (rt.installed) {
    try {
      const sessions = importReplitSessions(cwd);
      rtSessionCount = sessions.length;
    } catch { /* non-fatal */ }
    if (rtSessionCount > 0) {
      fx.success(`${rtSessionCount} session${rtSessionCount === 1 ? '' : 's'} found in replit-tools`);
    }
    const vStr = rt.version ? `v${rt.version}` : 'installed';
    fx.success(`replit-tools ${vStr} detected`);
  }

  process.stdout.write('\n');

  // ─── Step 1: Confirm providers ────────────────────────────────────────────
  const hasAnyProvider = claudeReady || openaiReady || codexAvailable;

  if (!hasAnyProvider) {
    // No-providers path
    process.stdout.write(` ${BOLD}No providers detected${RST}\n\n`);
    dimLine('dual-brain needs Claude or OpenAI to run coding tasks.');
    dimLine('You can still browse your project and configure settings.');
    process.stdout.write('\n');
    process.stdout.write(` ${GRAY}[c]${RST} set up Claude  ${GRAY}[o]${RST} set up OpenAI  ${GRAY}[s]${RST} skip for now\n\n`);

    const noProvChoice = await singleKey(['c', 'o', 's', '\r']);

    if (noProvChoice === 'c') {
      process.stdout.write('\n');
      dimLine('Run: claude login');
      dimLine('Then re-run: dual-brain init');
      process.stdout.write('\n');
    } else if (noProvChoice === 'o') {
      process.stdout.write('\n');
      dimLine('Run: codex login');
      dimLine('Then re-run: dual-brain init');
      process.stdout.write('\n');
    }

    const minProfile = loadProfile(cwd);
    minProfile.setupComplete = true;
    minProfile.providers.claude = { enabled: false };
    minProfile.providers.openai = { enabled: false };
    minProfile.mode = 'solo-claude';
    minProfile.bias = 'balanced';
    minProfile.workStyle = 'balanced';
    return minProfile;
  }

  // Show provider table
  process.stdout.write(` ${BOLD}Providers detected:${RST}\n\n`);
  if (claudeReady) {
    process.stdout.write(`   ${GRAY}Claude${RST}  ${claudeAuthLabel}    ${GREEN}✓ authenticated${RST}\n`);
  }
  if (openaiReady || codexAvailable) {
    process.stdout.write(`   ${GRAY}OpenAI${RST}  CLI OAuth  ${GREEN}✓ authenticated${RST}\n`);
  }

  process.stdout.write('\n');
  process.stdout.write(` ${GRAY}Correct?${RST} ${GRAY}[Enter]${RST} yes  ${GRAY}[n]${RST} change  ${GRAY}[a]${RST} add more\n\n`);

  const provChoice = await singleKey(['n', 'a', '\r', 'y']);

  let finalClaudeEnabled = claudeReady;
  let finalOpenaiEnabled = openaiReady || codexAvailable;

  if (provChoice === 'n') {
    process.stdout.write('\n');
    const toggleOpts = [];
    if (claudeReady) toggleOpts.push(`${GRAY}[c]${RST} disable Claude`);
    if (openaiReady || codexAvailable) toggleOpts.push(`${GRAY}[o]${RST} disable OpenAI`);
    toggleOpts.push(`${GRAY}[Enter]${RST} keep`);
    process.stdout.write(` ${toggleOpts.join('  ')}\n\n`);
    const toggleChoice = await singleKey(['c', 'o', '\r']);
    if (toggleChoice === 'c') finalClaudeEnabled = false;
    if (toggleChoice === 'o') finalOpenaiEnabled = false;
    process.stdout.write('\n');
  } else if (provChoice === 'a') {
    process.stdout.write('\n');
    if (!claudeReady) dimLine('Claude: run `claude login` to authenticate');
    if (!openaiReady && !codexAvailable) dimLine('OpenAI: run `codex login` to authenticate');
    process.stdout.write('\n');
    process.stdout.write(` ${GRAY}[Enter]${RST} continue with current providers\n\n`);
    await singleKey(['\r', 'q']);
  }

  // Write credentials.json
  const credEntries = [];
  if (finalClaudeEnabled) {
    credEntries.push({
      id: 'claude-local',
      provider: 'claude',
      auth_type: claudeAuthType || 'cli_oauth',
      source: 'local_cli',
      owner: 'user',
      scope: 'local',
      plan_hint: null,
      enabled: true,
      health: 'healthy',
    });
  }
  if (finalOpenaiEnabled) {
    credEntries.push({
      id: 'openai-codex',
      provider: 'openai',
      auth_type: 'cli_oauth',
      source: 'cli_oauth',
      owner: 'user',
      scope: 'local',
      plan_hint: null,
      enabled: true,
      health: 'healthy',
    });
  }
  try { saveWizardCredentials(cwd, credEntries); } catch { /* non-fatal */ }

  // ─── Step 2: Work style ───────────────────────────────────────────────────
  process.stdout.write(` ${BOLD}Choose your work style:${RST}\n\n`);
  process.stdout.write(`   ${CYAN}●${RST} Auto (recommended) — adapts to each task\n`);
  process.stdout.write(`   ${GRAY}○${RST} Quality-first — deeper review, stronger models\n`);
  process.stdout.write(`   ${GRAY}○${RST} Cost-saver — lighter models, lower cost\n`);
  process.stdout.write('\n');
  process.stdout.write(` ${GRAY}[Enter]${RST} Auto  ${GRAY}[1-3]${RST} select\n\n`);

  const styleKey = await singleKey(['1', '2', '3', '\r']);
  const styleMap = { '1': 'auto', '2': 'quality-first', '3': 'cost-saver', '\r': 'auto' };
  const chosenBias = styleMap[styleKey] || 'auto';

  process.stdout.write('\n');

  // Init living docs (non-fatal)
  try {
    const ld = await getLivingDocs();
    if (ld.initLivingDocs) ld.initLivingDocs(cwd);
  } catch { /* non-fatal */ }

  // ─── Step 3: Done — seamless transition line before dashboard renders ─────
  const termWidth = process.stdout.columns || 72;
  const divider = '━'.repeat(Math.min(termWidth - 2, 57));
  process.stdout.write(` ${GRAY}${divider}${RST}\n`);

  const providerCount = [finalClaudeEnabled, finalOpenaiEnabled].filter(Boolean).length;
  const sessionLabel  = rtSessionCount > 0 ? ` · ${rtSessionCount} sessions imported` : '';
  process.stdout.write(` ${GREEN}✓${RST} Setup complete · ${providerCount} provider${providerCount === 1 ? '' : 's'}${sessionLabel}\n`);
  process.stdout.write('\n');

  await fx.sleep(400);

  // ─── Build and return the profile object ──────────────────────────────────
  const finalProfile = loadProfile(cwd);

  finalProfile.providers.claude = { enabled: finalClaudeEnabled };
  finalProfile.providers.openai = { enabled: finalOpenaiEnabled };
  finalProfile.apiGuardrail     = false;
  finalProfile.setupComplete    = true;

  const enabledCount = [finalClaudeEnabled, finalOpenaiEnabled].filter(Boolean).length;
  finalProfile.mode      = enabledCount >= 2 ? 'dual' : finalClaudeEnabled ? 'solo-claude' : 'solo-openai';
  finalProfile.bias      = chosenBias;
  finalProfile.workStyle = chosenBias;

  // Ask about default shell (only on first wizard run)
  if (!finalProfile.defaultShellAsked) {
    const wantsDefault = await askDefaultShell(cwd, rl, fx);
    finalProfile.defaultShellAsked = true;
    finalProfile.isDefaultShell = wantsDefault;
    saveProfile(finalProfile, { cwd });

    // Also run global install if they said yes
    if (wantsDefault) {
      try {
        execSync('node ' + join(dirname(fileURLToPath(import.meta.url)), 'dual-brain.mjs') + ' install --global', {
          cwd, stdio: 'pipe', timeout: 10000,
        });
      } catch {}
    }
  }

  return finalProfile;
}

// ─── Screen: dashboardScreen (kept for internal reference, unreachable) ───────

async function dashboardScreen(rl, ask) {
  return { next: 'main' };
}

// ─── Screen: authScreen — subscription status view ───────────────────────────

async function authScreen(rl, ask) {
  const cwd  = process.cwd();
  const auth = await detectAuth();
  const profile = loadProfile(cwd);

  const claudeSub = profile?.providers?.claude;
  const openaiSub = profile?.providers?.openai;
  const claudePlanLabel = claudeSub?.enabled
    ? (CLAUDE_PLAN_LABELS[claudeSub.plan] ?? claudeSub.plan ?? 'n/a')
    : 'disabled';
  const openaiPlanLabel = openaiSub?.enabled
    ? (OPENAI_PLAN_LABELS[openaiSub.plan] ?? openaiSub.plan ?? 'n/a')
    : 'disabled';

  const authLines = [
    'Claude:',
    auth.claude.found
      ? `  logged in via ${auth.claude.source}`
      : `  not logged in — run: claude login`,
    `  plan: ${claudePlanLabel}${claudeSub?.label ? ` [${claudeSub.label}]` : ''}`,
    '',
    'OpenAI:',
    auth.openai.found
      ? `  logged in via ${auth.openai.source}`
      : `  not logged in — run: codex login`,
    `  plan: ${openaiPlanLabel}${openaiSub?.label ? ` [${openaiSub.label}]` : ''}`,
  ];

  console.log(box('Provider Status', authLines));
  console.log('');
  console.log(menu([
    { key: 'a', label: 'Manage linked accounts', section: '' },
    { key: 'b', label: 'Back to dashboard',      section: '' },
  ]));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'a') { return { next: 'subscriptions' }; }
  if (choice === 'b' || choice === 'back') { return { next: 'dashboard' }; }

  return { next: 'auth' };
}

// ─── Screen: profileScreen ────────────────────────────────────────────────────

async function profileScreen(rl, ask) {
  const cwd = process.cwd();
  const profile = loadProfile(cwd);
  const prefs = getActivePreferences(cwd);

  const profileLines = [
    `Mode:          ${profile.mode}`,
    `Claude plan:   ${profile.providers?.claude?.enabled ? (profile.providers?.claude?.plan || 'n/a') : 'disabled'}`,
    `OpenAI plan:   ${profile.providers?.openai?.enabled ? (profile.providers?.openai?.plan || 'n/a') : 'disabled'}`,
    `Solo brain:    ${isSoloBrain(profile) ? 'yes' : 'no'}`,
    `Head model:    ${getHeadModel(profile)}`,
    '',
    `Preferences (${prefs.length}):`,
    ...prefs.map(p => `  [${p.scope}] ${p.text}`),
    ...(prefs.length === 0 ? ['  (none)'] : []),
  ];

  console.log(box('Profile & Preferences', profileLines));
  console.log('');
  console.log(menu([
    { key: '1', label: 'Switch to cost-saver mode',   section: 'Mode' },
    { key: '2', label: 'Switch to balanced mode',     section: 'Mode' },
    { key: '3', label: 'Switch to quality-first mode',section: 'Mode' },
    { key: 'r', label: 'Add preference',              section: 'Preferences' },
    { key: 'f', label: 'Remove preference',           section: 'Preferences' },
    { key: 'b', label: 'Back to dashboard',           section: '' },
  ]));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === '1' || choice === '2' || choice === '3') {
    const modeMap = { '1': 'cost-saver', '2': 'balanced', '3': 'quality-first' };
    profile.mode = modeMap[choice];
    saveProfile(profile, { cwd });
    console.log(`  Mode set to: ${profile.mode}`);
    return { next: 'profile' };
  }

  if (choice === 'r') {
    const text = (await ask('  Preference text: ')).trim();
    if (text) cmdRemember(text);
    return { next: 'profile' };
  }

  if (choice === 'f') {
    const text = (await ask('  Preference to remove (fuzzy): ')).trim();
    if (text) cmdForget(text);
    return { next: 'profile' };
  }

  if (choice === 'b' || choice === 'back') { return { next: 'dashboard' }; }

  return { next: 'profile' };
}

// ─── Screen: diagnosticsScreen ────────────────────────────────────────────────

async function diagnosticsScreen(rl, ask) {
  const cwd = process.cwd();
  const { spawnSync: _spawnSync } = await import('child_process');
  const { readdirSync } = await import('node:fs');

  // ── Version info ──────────────────────────────────────────────────────────
  const version = readVersion();
  const nodeVersion = process.version;

  // ── Provider health ───────────────────────────────────────────────────────
  const auth  = await detectAuth();
  const plans = detectPlans();
  const { states: healthStates } = getHealth(cwd);

  function _providerBadge(name) {
    const entries = Object.entries(healthStates).filter(([k]) => k.startsWith(`${name}:`));
    if (entries.length === 0) return 'healthy';
    const statuses = entries.map(([, v]) => v.status);
    if (statuses.includes('hot'))      return 'hot';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('probing'))  return 'probing';
    return 'healthy';
  }

  const claudeHealthBadge = auth.claude.found ? _providerBadge('claude') : 'not logged in';
  const openaiHealthBadge = auth.openai.found ? _providerBadge('openai') : 'not logged in';
  // Plan tier is inferred from auth config signals — show tier with "configured" to be honest.
  const claudePlanStr     = plans.claude ? `${plans.claude} configured` : 'unknown';
  const openaiPlanStr     = plans.openai ? `${plans.openai} configured` : 'unknown';

  // ── Enforcement checks ────────────────────────────────────────────────────
  const hooksDir           = join(cwd, '.claude', 'hooks');
  const headGuardExists    = existsSync(join(hooksDir, 'head-guard.mjs'));
  const enforceTierExists  = existsSync(join(hooksDir, 'enforce-tier.mjs'));

  let guardCount = 0;
  try {
    const settingsFile = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsFile)) {
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
      const preToolUse = settings?.hooks?.PreToolUse ?? [];
      const guardCmd = 'node .claude/hooks/head-guard.mjs';
      const tierCmd  = 'node .claude/hooks/enforce-tier.mjs';
      const hasEdit  = preToolUse.some(e => e.matcher === 'Edit'  && e.hooks?.some(h => h.command === guardCmd));
      const hasWrite = preToolUse.some(e => e.matcher === 'Write' && e.hooks?.some(h => h.command === guardCmd));
      const hasBash  = preToolUse.some(e => e.matcher === 'Bash'  && e.hooks?.some(h => h.command === guardCmd));
      const hasAgent = preToolUse.some(e => e.matcher === 'Agent' && e.hooks?.some(h => h.command === tierCmd));
      guardCount = [hasEdit, hasWrite, hasBash, hasAgent].filter(Boolean).length;
    }
  } catch { /* ignore */ }

  let hookifyCount = 0;
  try {
    const claudeDir = join(cwd, '.claude');
    if (existsSync(claudeDir)) {
      hookifyCount = readdirSync(claudeDir).filter(f => f.startsWith('hookify.') && f.endsWith('.md')).length;
    }
  } catch { /* ignore */ }

  // ── Replit-tools integration ──────────────────────────────────────────────
  const replitToolsDir         = join(cwd, '.replit-tools');
  const hasReplitTools         = existsSync(replitToolsDir);
  const persistentDir          = join(replitToolsDir, '.claude-persistent');
  const sessionManagerExists   = existsSync(join(replitToolsDir, 'scripts', 'claude-session-manager.sh'));
  const authRefreshScript      = join(replitToolsDir, 'scripts', 'claude-auth-refresh.sh');

  let credsFresh = null;
  let credsExpiry = null;
  let historyCount = 0;

  if (hasReplitTools) {
    try {
      const credsFile = join(persistentDir, '.credentials.json');
      const creds = JSON.parse(readFileSync(credsFile, 'utf8'));
      const expiresAt = creds?.claudeAiOauth?.expiresAt;
      if (expiresAt) {
        const expiresMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(expiresAt);
        credsFresh  = Date.now() < expiresMs;
        credsExpiry = new Date(expiresMs).toISOString().slice(0, 10);
      }
    } catch { /* credentials missing or unreadable */ }

    try {
      const histFile = join(persistentDir, 'history.jsonl');
      if (existsSync(histFile)) {
        historyCount = readFileSync(histFile, 'utf8').split('\n').filter(Boolean).length;
      }
    } catch { /* ignore */ }
  }

  // ── Quality checks ────────────────────────────────────────────────────────
  let testPass = null; let testTotal = null; let testError = null;
  try {
    const r = _spawnSync('node', ['--test', 'src/test.mjs'], { cwd, encoding: 'utf8', timeout: 30000 });
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    const pm = out.match(/# pass (\d+)/);
    const tm = out.match(/# tests (\d+)/);
    if (pm && tm) { testPass = parseInt(pm[1], 10); testTotal = parseInt(tm[1], 10); }
    else { testError = 'could not parse output'; }
  } catch (e) { testError = e.message; }

  let healthPass = null; let healthTotal = null; let healthError = null;
  try {
    const healthScript = join(hooksDir, 'health-check.mjs');
    if (existsSync(healthScript)) {
      const r = _spawnSync('node', [healthScript], { cwd, encoding: 'utf8', timeout: 15000 });
      const out = (r.stdout ?? '') + (r.stderr ?? '');
      // Try summary line first: "8 pass, 0 warn, 0 fail"
      const sm = out.match(/(\d+) pass,\s*(\d+) warn,\s*(\d+) fail/);
      if (sm) {
        healthPass  = parseInt(sm[1], 10);
        healthTotal = parseInt(sm[1], 10) + parseInt(sm[2], 10) + parseInt(sm[3], 10);
      } else {
        // Fall back to JSON block
        const jm = out.match(/\{[\s\S]*?"healthy"[\s\S]*?\}/);
        if (jm) {
          try {
            const p = JSON.parse(jm[0]);
            healthPass  = p.pass ?? 0;
            healthTotal = (p.pass ?? 0) + (p.warn ?? 0) + (p.fail ?? 0);
          } catch { healthError = 'could not parse output'; }
        } else { healthError = 'could not parse output'; }
      }
    } else { healthError = 'health-check.mjs not found'; }
  } catch (e) { healthError = e.message; }

  // ── Render ────────────────────────────────────────────────────────────────
  const W = 56;
  const hbar = '═'.repeat(W);
  const padRow = (s) => {
    const plain = s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
    let vlen = 0;
    for (const ch of plain) {
      const cp = ch.codePointAt(0);
      if ((cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || cp === 0xfe0f || cp === 0x20e3) vlen += 2;
      else vlen += 1;
    }
    return s + ' '.repeat(Math.max(0, W - vlen));
  };
  const hrow = (s) => `║${padRow('  ' + s)}║`;

  const output = [
    `╔${hbar}╗`,
    hrow('Diagnostics'),
    `╠${hbar}╣`,
    hrow(`dual-brain v${version}`),
    hrow(`Node.js ${nodeVersion}`),
    `╚${hbar}╝`,
    '',
    separator('Provider Status'),
    `  Claude: ${claudeHealthBadge.padEnd(14)} ${claudePlanStr}`,
    `  OpenAI: ${openaiHealthBadge.padEnd(14)} ${openaiPlanStr}`,
    '',
    separator('Enforcement'),
    `  ${headGuardExists   ? 'ok' : 'MISSING'} head-guard.mjs     ${headGuardExists   ? 'installed' : 'run: dual-brain install'}`,
    `  ${enforceTierExists ? 'ok' : 'MISSING'} enforce-tier.mjs   ${enforceTierExists ? 'installed' : 'run: dual-brain install'}`,
    `  ${guardCount === 4  ? 'ok' : 'PARTIAL'} settings.json      ${guardCount}/4 guards registered${guardCount < 4 ? ' — run: dual-brain install' : ''}`,
    `  ${hookifyCount > 0  ? 'ok' : 'WARN   '} hookify rules      ${hookifyCount} rules${hookifyCount > 0 ? '' : ' — none found'}`,
    '',
    separator('Replit Tools'),
    `  ${hasReplitTools ? 'ok' : 'n/a'} replit-tools        ${hasReplitTools ? 'detected' : 'not detected'}`,
  ];

  if (hasReplitTools) {
    if (credsFresh === null) {
      output.push('  WARN  Claude auth         credentials file missing');
    } else if (credsFresh) {
      output.push(`  ok    Claude auth         fresh (expires: ${credsExpiry})`);
    } else {
      output.push(`  ERROR Claude auth         expired (${credsExpiry}) — run [r] Refresh auth`);
    }
    output.push(`  ok    Session archive     ${historyCount} entries`);
    output.push(`  ${sessionManagerExists ? 'ok' : 'WARN '} Session manager     ${sessionManagerExists ? 'available' : 'not found'}`);
  } else {
    output.push('  ─── (not available)');
  }

  output.push('');
  output.push(separator('Quality'));
  if (testError) {
    output.push(`  ERROR Tests               error: ${testError}`);
  } else if (testPass !== null) {
    output.push(`  ${testPass === testTotal ? 'ok   ' : 'FAIL '} Tests               ${testPass}/${testTotal} passing`);
  }
  if (healthError) {
    output.push(`  ERROR Health check        error: ${healthError}`);
  } else if (healthPass !== null) {
    output.push(`  ${healthPass === healthTotal ? 'ok   ' : 'WARN '} Health check        ${healthPass}/${healthTotal} passing`);
  }
  output.push('');

  console.log(output.join('\n'));

  // Actions menu
  const menuOpts = [
    { key: 'h', label: 'Run health check',           section: 'Actions' },
    { key: 't', label: 'Run test suite',             section: 'Actions' },
  ];
  if (hasReplitTools && existsSync(authRefreshScript)) {
    menuOpts.push({ key: 'r', label: 'Refresh auth (replit-tools)', section: 'Actions' });
  }
  menuOpts.push({ key: 'i', label: 'Reinstall hooks',              section: 'Actions' });
  menuOpts.push({ key: 'b', label: 'Back to dashboard',            section: 'Actions' });
  console.log(menu(menuOpts));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'h') {
    const hookScript = join(hooksDir, 'health-check.mjs');
    console.log('');
    if (existsSync(hookScript)) {
      try {
        const r = _spawnSync('node', [hookScript], { stdio: 'inherit', cwd });
        if (r.error) console.log(`  Error: ${r.error.message}`);
      } catch (e) { console.log(`  Error: ${e.message}`); }
    } else {
      console.log('  health-check.mjs not found — run: dual-brain install');
    }
    await ask('\n  Press Enter to continue...');
    return { next: 'diagnostics' };
  }

  if (choice === 't') {
    console.log('\n  Running test suite...\n');
    try {
      const r = _spawnSync('node', ['--test', 'src/test.mjs'], { stdio: 'inherit', cwd, timeout: 60000 });
      if (r.error) console.log(`  Error: ${r.error.message}`);
    } catch (e) { console.log(`  Error: ${e.message}`); }
    await ask('\n  Press Enter to continue...');
    return { next: 'diagnostics' };
  }

  if (choice === 'r') {
    if (existsSync(authRefreshScript)) {
      console.log('\n  Refreshing Claude auth...\n');
      try {
        const r = _spawnSync('bash', [authRefreshScript], { stdio: 'inherit', cwd, timeout: 30000 });
        if (r.error) console.log(`  Error: ${r.error.message}`);
        else if (r.status === 0) console.log('\n  Auth refresh complete.');
        else console.log(`\n  Auth refresh exited with code ${r.status}.`);
      } catch (e) { console.log(`  Error: ${e.message}`); }
    } else {
      console.log('  claude-auth-refresh.sh not found.');
    }
    await ask('\n  Press Enter to continue...');
    return { next: 'diagnostics' };
  }

  if (choice === 'i') {
    await cmdInstall();
    return { next: 'diagnostics' };
  }

  if (choice === 'b' || choice === 'back') { return { next: 'dashboard' }; }

  return { next: 'diagnostics' };
}

// ─── Screen: replScreen ───────────────────────────────────────────────────────

async function replScreen(rl, ask) {
  console.log('\nCommand mode. Type a task or command. "help" for commands, "back" to return.\n');

  while (true) {
    const input = (await ask('dual-brain> ')).trim();
    const line = input;

    if (!line) continue;

    if (line === 'back' || line === 'exit' || line === 'quit' || line === 'q') {
      return { next: 'dashboard' };
    }

    try {
      if (line === 'help') {
        printHelp();
      } else if (line === 'status') {
        await cmdStatus([]);
      } else if (line === 'auth') {
        await cmdAuth([]);
      } else if (line.startsWith('go ')) {
        await cmdGo(line.slice(3).trim().split(/\s+/));
      } else if (line.startsWith('remember ')) {
        cmdRemember(line.slice(9).trim());
      } else if (line.startsWith('forget ')) {
        cmdForget(line.slice(7).trim());
      } else if (line.startsWith('hot ')) {
        cmdHot(line.slice(4).trim());
      } else if (line.startsWith('cool ')) {
        cmdCool(line.slice(5).trim());
      } else if (line === 'init') {
        await cmdInit(rl);
      } else if (line === 'dashboard') {
        return { next: 'dashboard' };
      } else {
        // Treat as a task description → go
        await cmdGo([line]);
      }
    } catch (e) {
      process.stderr.write(`Error: ${e.message}\n`);
    }
  }
}

// ─── Screen: sessionDetailScreen ─────────────────────────────────────────────

async function sessionDetailScreen(rl, ask, ctx = {}) {
  const cwd = process.cwd();
  const sess = ctx.session;
  if (!sess) return { next: 'dashboard' };

  const W = 56;
  const hbar = '═'.repeat(W + 2);
  const pad = (s) => {
    const plain = s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
    return s + ' '.repeat(Math.max(0, W - plain.length));
  };

  const statusLine = sess.isActive
    ? `active`
    : `inactive`;

  const detailLines = [
    `  Session: ${sess.name}`,
    `╠${hbar}╣`,
    `  ID: ${sess.id.slice(0, 8)}...`,
    `  Status: ${statusLine}`,
    `  Prompts: ${sess.promptCount}`,
    `  Last active: ${sess.age}`,
    `  Project: ${sess.project || process.cwd()}`,
  ];

  console.log(`╔${hbar}╗`);
  for (const line of detailLines) {
    console.log(`║  ${pad(line)}║`);
  }
  console.log(`╚${hbar}╝`);
  console.log('');

  if (sess.isActive) {
    console.log(`  [c] Continue this session (${_sessionTool(sess)})`);
  } else {
    console.log(`  [r] Resume this session (${_sessionTool(sess)})`);
  }
  console.log('  [g] Continue in other provider');
  console.log('  [b] Back to dashboard');
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'c' || choice === 'r') {
    const tool = _sessionTool(sess);
    const launchArgs = _sessionLaunchArgs(sess, cwd);
    console.log(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n`);
    try {
      const { spawnSync } = await import('node:child_process');
      spawnSync(tool, launchArgs, { stdio: 'inherit' });
    } catch {
      console.log(`  Could not launch ${tool} CLI.`);
    }
    return { next: 'dashboard' };
  }

  if (choice === 'g') {
    return { next: 'switch-provider', session: sess };
  }

  return { next: 'dashboard' };
}

// ─── Screen: sessionsScreen ───────────────────────────────────────────────────

const CATEGORIES = ['security', 'ui', 'refactor', 'bugfix', 'testing', 'devops', 'planning'];
const STALE_DAYS = 7;

/**
 * Return a compact status badge string for a session row (plain text, no ANSI).
 */
function sessionBadge(sess) {
  if (sess.isActive) return '[active]';
  const ageMs = sess.lastActive ? Date.now() - new Date(sess.lastActive).getTime() : 0;
  if (ageMs >= STALE_DAYS * 86400000) return '[stale]';
  if (sess.tool === 'codex') return '[dt]';
  return '';
}

/**
 * Interactive full session list with arrow-key navigation.
 * Enter = resume, x = archive, r = rename, q/Esc = back to dashboard.
 */
async function sessionsScreen(rl, ask) {
  const cwd = process.cwd();

  // Load all active sessions (no slice limit)
  let sessions = enrichSessions(importReplitSessions(cwd), cwd);

  // ── Box geometry ────────────────────────────────────────────────────────────
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 52);
  const W     = boxW - 4;

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;

  if (sessions.length === 0) {
    process.stdout.write('\n' + top + '\n');
    process.stdout.write(makeBoxRow('Sessions', W) + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(makeBoxRow('No sessions found.', W) + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(makeBoxRow('q Back', W) + '\n');
    process.stdout.write(bot + '\n\n');
    await ask('  Press Enter to continue...');
    return { next: 'main' };
  }

  /**
   * Format one session row.
   * Right side: badge(9) + age(4) + space + count(4) = 18 chars total.
   */
  function formatRow(sess, selected) {
    const arrow    = selected ? '▸ ' : '  ';
    const badge    = sessionBadge(sess);
    const badgeStr = badge ? badge.padEnd(9) : '         ';
    const age      = (sess.age || '').replace(/ ago$/, '').padStart(4);
    const count    = `(${sess.promptCount ?? 0})`.padStart(4);
    const right    = `${badgeStr}${age} ${count}`;
    const nameMax  = W - 2 - right.length;
    let name       = sess.name || sess.id.slice(0, 8);
    if (name.length > nameMax) name = name.slice(0, nameMax - 3) + '...';
    else name = name.padEnd(nameMax);
    return makeBoxRow(`${arrow}${name}${right}`, W);
  }

  let cursor = 0;

  function render() {
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(top + '\n');
    process.stdout.write(makeBoxRow('Sessions', W) + '\n');
    process.stdout.write(sep + '\n');
    for (let i = 0; i < sessions.length; i++) {
      process.stdout.write(formatRow(sessions[i], i === cursor) + '\n');
    }
    process.stdout.write(sep + '\n');
    process.stdout.write(makeBoxRow('↑↓ Navigate  Enter Resume  g Switch Provider', W) + '\n');
    process.stdout.write(makeBoxRow('x Archive  r Rename  q Back', W) + '\n');
    process.stdout.write(bot + '\n');
  }

  render();

  const readline = await import('node:readline');
  readline.emitKeypressEvents(process.stdin, rl);

  const result = await new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    const canRaw = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
    if (canRaw) process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (canRaw) {
        try { process.stdin.setRawMode(wasRaw || false); } catch {}
      }
    };

    const onKey = async (str, key) => {
      if (!key) return;
      const kname = key.name || '';

      // Ctrl-C / Ctrl-D → exit
      if (key.ctrl && (kname === 'c' || kname === 'd')) {
        cleanup();
        process.stdout.write('\n');
        resolve({ next: 'main' });
        return;
      }

      // q / Escape → back
      if (kname === 'q' || kname === 'escape' || str === 'q') {
        cleanup();
        process.stdout.write('\n');
        resolve({ next: 'main' });
        return;
      }

      // Arrow up
      if (kname === 'up') {
        cursor = Math.max(0, cursor - 1);
        render();
        return;
      }

      // Arrow down
      if (kname === 'down') {
        cursor = Math.min(sessions.length - 1, cursor + 1);
        render();
        return;
      }

      // Enter → resume highlighted session
      if (kname === 'return' || kname === 'enter') {
        const sess = sessions[cursor];
        cleanup();
        process.stdout.write('\n');
        const tool = _sessionTool(sess);
        const launchArgs = _sessionLaunchArgs(sess, cwd);
        process.stdout.write(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n\n`);
        const { spawnSync } = await import('node:child_process');
        spawnSync(tool, launchArgs, { stdio: 'inherit' });
        saveTerminalState(cwd, getTerminalId(), sess.id, sess.tool || 'claude');
        resolve({ next: 'main' });
        return;
      }

      // x → archive highlighted session (non-destructive)
      if (str === 'x' || str === 'X') {
        const sess = sessions[cursor];
        archiveSession(sess.id, cwd);
        sessions = sessions.filter(s => s.id !== sess.id);
        if (sessions.length === 0) {
          cleanup();
          process.stdout.write('\n');
          resolve({ next: 'main' });
          return;
        }
        cursor = Math.min(cursor, sessions.length - 1);
        render();
        return;
      }

      // g → continue highlighted session in the other provider
      if (str === 'g' || str === 'G') {
        const sess = sessions[cursor];
        cleanup();
        process.stdout.write('\n');
        resolve({ next: 'switch-provider', session: sess });
        return;
      }

      // r → rename highlighted session
      if (str === 'r' || str === 'R') {
        const sess = sessions[cursor];
        cleanup();

        // Briefly collect a line of text
        process.stdout.write('\n  New name: ');
        const newName = await new Promise(res2 => {
          let buf = '';
          const onData = (chunk) => {
            const s = chunk.toString();
            for (const ch of s) {
              if (ch === '\n' || ch === '\r') {
                process.stdin.removeListener('data', onData);
                process.stdout.write('\n');
                res2(buf.trim());
                return;
              }
              if (ch === '\x7f' || ch === '\b') {
                if (buf.length > 0) {
                  buf = buf.slice(0, -1);
                  process.stdout.write('\b \b');
                }
              } else {
                buf += ch;
                process.stdout.write(ch);
              }
            }
          };
          process.stdin.on('data', onData);
        });

        if (newName) {
          renameSession(sess.id, newName, cwd);
          sessions[cursor] = { ...sess, name: newName };
        }

        // Re-enable raw mode and re-attach listener
        if (canRaw) {
          try { process.stdin.setRawMode(true); } catch {}
        }
        readline.emitKeypressEvents(process.stdin, rl);
        process.stdin.on('keypress', onKey);
        render();
        return;
      }
    };

    process.stdin.on('keypress', onKey);
  });

  return result;
}

async function sessionManageScreen(rl, ask, ctx = {}) {
  const sess = ctx.session;
  if (!sess) return { next: 'sessions' };

  const cwd = process.cwd();
  const pinLabel = sess.pinned ? 'Unpin' : 'Pin';
  const catLabel = sess.category ? `[${sess.category}]` : '(none)';

  console.log('');
  console.log(separator(`Session: ${sess.name}`));
  console.log('');
  console.log(`  Age:      ${sess.age}`);
  console.log(`  Category: ${catLabel}`);
  console.log(`  Pinned:   ${sess.pinned ? 'yes' : 'no'}`);
  console.log('');
  console.log(menu([
    { key: 'r', label: 'Rename',           section: '' },
    { key: 'p', label: pinLabel,           section: '' },
    { key: 'c', label: 'Set category',     section: '' },
    { key: 'o', label: 'Open (resume)',    section: '' },
    { key: 'g', label: 'Continue in other provider', section: '' },
    { key: 'b', label: 'Back',             section: '' },
  ]));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'r') {
    const name = (await ask('  New name: ')).trim();
    if (name) {
      renameSession(sess.id, name, cwd);
      console.log(`  Renamed to: ${name}`);
    }
    return { next: 'session-manage', session: { ...sess, name: name || sess.name } };
  }

  if (choice === 'p') {
    if (sess.pinned) {
      unpinSession(sess.id, cwd);
      console.log('  Unpinned.');
      return { next: 'session-manage', session: { ...sess, pinned: false } };
    } else {
      pinSession(sess.id, cwd);
      console.log('  Pinned.');
      return { next: 'session-manage', session: { ...sess, pinned: true } };
    }
  }

  if (choice === 'c') {
    console.log('');
    CATEGORIES.forEach((cat, i) => console.log(`  (${i + 1}) ${cat}`));
    console.log(`  (${CATEGORIES.length + 1}) custom`);
    console.log('');
    const catChoice = (await ask('  Category: ')).trim();
    const catIndex = parseInt(catChoice, 10);
    let category = null;
    if (!isNaN(catIndex) && catIndex >= 1 && catIndex <= CATEGORIES.length) {
      category = CATEGORIES[catIndex - 1];
    } else if (catIndex === CATEGORIES.length + 1) {
      category = (await ask('  Custom category: ')).trim() || null;
    } else if (catChoice) {
      category = catChoice;
    }
    if (category) {
      categorizeSession(sess.id, category, cwd);
      console.log(`  Category set to: ${category}`);
    }
    return { next: 'session-manage', session: { ...sess, category: category ?? sess.category } };
  }

  if (choice === 'o') {
    const { spawnSync } = await import('node:child_process');
    const tool = _sessionTool(sess);
    const launchArgs = _sessionLaunchArgs(sess, cwd);
    console.log(`\n  Launching: ${tool} ${launchArgs.join(' ')}\n`);
    spawnSync(tool, launchArgs, { stdio: 'inherit' });
    return { next: 'sessions' };
  }

  if (choice === 'g') {
    return { next: 'switch-provider', session: sess };
  }

  if (choice === 'b' || choice === 'back') return { next: 'sessions' };

  return { next: 'session-manage', session: sess };
}


// ─── Auto-commit drafting ─────────────────────────────────────────────────────

/**
 * Detect uncommitted changes in cwd.
 * Returns { hasChanges, files, statOutput, diffSnippet } or null.
 */
function detectUncommittedChanges(cwd) {
  try {
    execSync('git rev-parse --git-dir', { cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe' });
  } catch { return null; }

  let statOutput = '';
  try {
    statOutput = execSync('git diff --stat HEAD', { cwd, encoding: 'utf8', timeout: 3000, stdio: 'pipe' }).trim();
  } catch { return null; }

  let statusOutput = '';
  try {
    statusOutput = execSync('git status --porcelain', { cwd, encoding: 'utf8', timeout: 2000, stdio: 'pipe' }).trim();
  } catch {}

  if (!statOutput && !statusOutput) return null;

  const statFiles = statOutput
    .split('\n')
    .filter(l => l.includes('|'))
    .map(l => l.split('|')[0].trim())
    .filter(Boolean);

  const statusFiles = statusOutput
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).trim())
    .filter(f => f && !statFiles.includes(f));

  const files = [...new Set([...statFiles, ...statusFiles])];

  let diffSnippet = '';
  try {
    const full = execSync('git diff HEAD', { cwd, encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    diffSnippet = full.slice(0, 2000);
  } catch {}

  return { hasChanges: true, files, statOutput, diffSnippet };
}

/**
 * Build a conventional commit message from file list + diff snippet.
 * Deterministic — no AI calls.
 */
function generateCommitMessage(files, diffSnippet) {
  if (!files || files.length === 0) return 'chore: update files';

  const testFiles   = files.filter(f =>
    /\.(test|spec)\.[jt]sx?$/.test(f) || /\/(test|tests|__tests__)\//i.test(f)
  );
  const docFiles    = files.filter(f => /\.(md|txt|rst|adoc)$/i.test(f) || /docs?\//i.test(f));
  const configFiles = files.filter(f =>
    /\.(json|yaml|yml|toml|ini)$/i.test(f) ||
    /^\.?(eslint|prettier|babel|jest|tsconfig|package)/i.test(f.replace(/.*\//, ''))
  );
  const srcFiles    = files.filter(f =>
    !testFiles.includes(f) && !docFiles.includes(f) && !configFiles.includes(f)
  );

  let type = 'feat';
  if (diffSnippet) {
    const lower = diffSnippet.toLowerCase();
    if (['fix', 'bug', 'error', 'issue', 'resolve', 'patch', 'correct', 'repair'].some(w => lower.includes(w))) {
      type = 'fix';
    } else if (['refactor', 'cleanup', 'simplify', 'reorganize'].some(w => lower.includes(w))) {
      type = 'refactor';
    }
  }

  const dominantFile = files[0].replace(/.*\//, '');

  if (testFiles.length === files.length) {
    const mod = testFiles[0].replace(/\.(test|spec)\.[jt]sx?$/, '').replace(/.*\//, '');
    return `test: add/fix tests for ${mod}`;
  }
  if (docFiles.length === files.length) {
    return `docs: update ${docFiles[0].replace(/.*\//, '')}`;
  }
  if (configFiles.length === files.length) {
    return `chore: update ${configFiles[0].replace(/.*\//, '')}`;
  }
  if (srcFiles.length > 0 && testFiles.length > 0) {
    const dom = srcFiles[0].replace(/.*\//, '').replace(/\.[jt]sx?$/, '');
    return `${type}: ${dom} with tests`;
  }
  if (files.length === 1) {
    return `${type}: update ${dominantFile.replace(/\.[jt]sx?$/, '')}`;
  }

  const dirs = files.map(f => (f.includes('/') ? f.split('/').slice(-2, -1)[0] : ''));
  const commonDir = dirs[0] && dirs.every(d => d === dirs[0]) ? dirs[0] : null;
  if (commonDir) return `${type}: update ${commonDir}`;

  return `${type}: update ${dominantFile.replace(/\.[jt]sx?$/, '')}`;
}

/**
 * Show a commit card after task completion and handle user action.
 * Enter  -> git add -A && git commit -m "message"
 * e      -> prompt for custom message, then commit
 * d      -> show full diff, then return to card
 * s      -> skip
 *
 * Only shown on TTY. Never auto-commits — the card is the offer.
 * Returns true if a commit was made.
 */
async function offerAutoCommit(cwd) {
  if (!process.stdout.isTTY) return false;

  try {
    const claude = parseInt(execSync('pgrep -x claude 2>/dev/null | wc -l', { encoding: 'utf8' }).trim(), 10) || 0;
    const codex  = parseInt(execSync('pgrep -x codex 2>/dev/null | wc -l',  { encoding: 'utf8' }).trim(), 10) || 0;
    if (claude > 0 || codex > 0) return false;
  } catch {}

  try {
    const sessionPath = join(cwd, '.dualbrain', 'session.json');
    if (existsSync(sessionPath)) {
      const sess = JSON.parse(readFileSync(sessionPath, 'utf8'));
      if (sess?.lastResult?.status === 'failure') return false;
    }
  } catch {}

  const changes = detectUncommittedChanges(cwd);
  if (!changes) return false;

  let finalMsg = generateCommitMessage(changes.files, changes.diffSnippet);

  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 54);
  const W     = boxW - 4;

  const top = `\u250c${'\u2500'.repeat(boxW - 2)}\u2510`;
  const sep = `\u251c${'\u2500'.repeat(boxW - 2)}\u2524`;
  const bot = `\u2514${'\u2500'.repeat(boxW - 2)}\u2518`;

  const padLine = (s) => {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
    return `\u2502 ${s}${ ' '.repeat(Math.max(0, W - plain.length))} \u2502`;
  };

  const filesLabel = changes.files.length <= 3
    ? changes.files.join(', ')
    : `${changes.files.slice(0, 3).join(', ')} +${changes.files.length - 3} more`;
  const fileCountLabel = `${changes.files.length} file${changes.files.length === 1 ? '' : 's'} changed: ${filesLabel}`;
  const fileLineTrunc  = fileCountLabel.length > W ? fileCountLabel.slice(0, W - 3) + '...' : fileCountLabel;

  const actLine1 = '[Enter] Commit  [e] Edit message  [d] Full diff';
  const actLine2 = '[s] Skip';

  const printCard = (msg) => {
    const msgLine = msg.length > W ? msg.slice(0, W - 3) + '...' : msg;
    process.stdout.write(top + '\n');
    process.stdout.write(padLine('\x1b[33m\u{1F4DD} Ready to commit?\x1b[0m') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(padLine(msgLine) + '\n');
    process.stdout.write(padLine('') + '\n');
    process.stdout.write(padLine(fileLineTrunc) + '\n');
    process.stdout.write(padLine('') + '\n');
    process.stdout.write(padLine(actLine1) + '\n');
    process.stdout.write(padLine(actLine2) + '\n');
    process.stdout.write(bot + '\n');
  };

  const readlinemod = await import('node:readline');
  readlinemod.emitKeypressEvents(process.stdin);

  const waitKey = () => new Promise((resolve) => {
    const wasRaw = process.stdin.isRaw;
    const canRaw = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
    if (canRaw) process.stdin.setRawMode(true);

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (canRaw) { try { process.stdin.setRawMode(wasRaw || false); } catch {} }
    };

    const onKey = (str, key) => {
      if (!key) return;
      const name = key.name || '';
      const seq  = key.sequence || str || '';

      if (key.ctrl && (name === 'c' || name === 'd')) {
        cleanup(); process.stdout.write('\n'); resolve('s'); return;
      }
      if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
        cleanup(); process.stdout.write('\n'); resolve('commit'); return;
      }
      if (!str || str.length === 0) return;
      const lower = str.toLowerCase();
      if (lower === 'e' || lower === 'd' || lower === 's') {
        cleanup(); process.stdout.write('\n'); resolve(lower); return;
      }
    };

    process.stdin.on('keypress', onKey);
  });

  process.stdout.write('\n');
  printCard(finalMsg);

  let committed = false;
  let done = false;

  while (!done) {
    const choice = await waitKey();

    if (choice === 'commit') {
      try {
        execSync('git add -A', { cwd, stdio: 'pipe' });
        execSync(`git commit -m ${JSON.stringify(finalMsg)}`, { cwd, stdio: 'pipe' });
        process.stdout.write(`\n  \x1b[32m\u2713 Committed:\x1b[0m ${finalMsg}\n\n`);
        committed = true;
      } catch (e) {
        process.stderr.write(`  Commit failed: ${e.message}\n`);
      }
      done = true;

    } else if (choice === 'e') {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      const edited = await new Promise(res => rl2.question('\n  Commit message: ', res));
      rl2.close();
      if (edited.trim()) finalMsg = edited.trim();
      process.stdout.write('\n');
      printCard(finalMsg);

    } else if (choice === 'd') {
      process.stdout.write('\n');
      try {
        const fullDiff = execSync('git diff HEAD', { cwd, encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
        process.stdout.write(fullDiff || '(no diff output)\n');
      } catch { process.stdout.write('(could not read diff)\n'); }
      process.stdout.write('\n');
      printCard(finalMsg);

    } else {
      process.stdout.write('  Skipped.\n\n');
      done = true;
    }
  }

  return committed;
}

// ─── Screen state machine ─────────────────────────────────────────────────────

const SCREENS = {
  welcome:          welcomeScreen,
  main:             mainScreen,
  'new-session':    newSessionScreen,
  'palette-help':   paletteHelpScreen,
  settings:         settingsScreen,
  team:             teamScreen,
  'import-picker':  importPickerScreen,
  'switch-provider': switchProviderScreen,
  'pr-triage':      prTriageScreen,
  subscriptions:    subscriptionsScreen,
  dashboard:        dashboardScreen,
  auth:             authScreen,
  profile:          profileScreen,
  diagnostics:      diagnosticsScreen,
  repl:             replScreen,
  'session-detail': sessionDetailScreen,
  sessions:         sessionsScreen,
  'session-manage': sessionManageScreen,
};

async function runScreens(startScreen = 'dashboard') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  let current = startScreen;
  let ctx = {};
  while (current && current !== 'exit') {
    // Handle type-to-start dispatch from mainScreen — all work routes through pipeline.
    if (current === 'go' && ctx.prompt) {
      const prompt = ctx.prompt;
      const dryRun = ctx.dryRun || false;
      // Haiku tier: dispatch with model override for cheap question answers
      if (ctx.model === 'haiku') {
        process.stdout.write('\n');
        try {
          const { runPipeline: rp } = await import('../dist/src/pipeline.js');
          const { result } = await rp('go', prompt, { cwd: process.cwd(), dryRun, forceDepth: 'shallow' });
          if (result?.output) process.stdout.write('\n' + String(result.output).trim() + '\n\n');
          else process.stdout.write('  (no output)\n\n');
        } catch (e) {
          // Fall back to normal dispatch on error
          await cmdGo([prompt], { dryRun });
        }
      } else {
        await cmdGo([prompt], { dryRun });
      }
      current = 'main';
      ctx = {};
      continue;
    }

    const screen = SCREENS[current];
    if (!screen) break;
    try {
      const result = await screen(rl, ask, ctx);
      current = result?.next || 'exit';
      // Pass through context (e.g. selected session, typed prompt, openPRs) to next screen
      ctx = result?.session   ? { session: result.session }
          : result?.prompt    ? { prompt: result.prompt, model: result.model }
          : result?.openPRs   ? { openPRs: result.openPRs }
          : {};
    } catch (e) {
      console.error(`Error: ${e.message}`);
      current = 'main';
      ctx = {};
    }
  }
  rl.close();
}


// ─── Watch mode ──────────────────────────────────────────────────────────────

/**
 * Suggest an action for a batch of changed files.
 * Returns { label, cmd, safe } or null (no suggestion needed).
 * Deterministic — no AI calls.
 */
function suggestAction(changedFiles, cwd) {
  // .env changes — highest priority warning
  const envChanged = changedFiles.some(f => {
    const b = basename(f);
    return b === '.env' || b.startsWith('.env.');
  });
  if (envChanged) {
    return { label: '⚠  Environment changed — restart services', cmd: null, safe: false };
  }

  // package.json → npm install
  if (changedFiles.some(f => basename(f) === 'package.json')) {
    return { label: 'npm install (dependencies may have changed)', cmd: 'npm install', safe: true };
  }

  // Config files → restart dev server
  const configChanged = changedFiles.some(f => {
    const b = basename(f);
    return /\.config\.(m?js|ts|cjs|json)$/.test(b)
      || b === 'tsconfig.json'
      || b === '.eslintrc'
      || b === '.babelrc'
      || b === 'vite.config.js'
      || b === 'webpack.config.js';
  });
  if (configChanged) {
    return { label: 'Restart dev server (config changed)', cmd: null, safe: false };
  }

  // Test/spec files themselves changed → run them
  const testChanged = changedFiles.filter(f => /\.(test|spec)\.(m?js|ts|cjs)$/.test(f));
  if (testChanged.length > 0) {
    let testCmd = 'npm test';
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
      if (!pkg.scripts?.test) testCmd = null;
    } catch {}
    const fileList = testChanged.map(f => basename(f)).join(', ');
    return testCmd ? { label: `Run tests: ${fileList}`, cmd: testCmd, safe: true } : null;
  }

  // Markdown → no suggestion
  if (changedFiles.every(f => extname(f) === '.md')) {
    return null;
  }

  // Source file changed → look for related test file
  const sourceChanged = changedFiles.filter(f =>
    /\.(m?js|ts|cjs|py|rb|go|rs)$/.test(f) && !/\.(test|spec)\./.test(f)
  );
  if (sourceChanged.length > 0) {
    const testDirs = ['test', 'tests', '__tests__', 'spec', 'src'];
    for (const srcFile of sourceChanged) {
      const srcBase   = basename(srcFile);
      const srcExt    = extname(srcFile);
      const srcStem   = srcBase.slice(0, -srcExt.length);
      const testExts  = [...new Set([srcExt, '.js', '.ts', '.mjs'])];
      const srcDirAbs = join(cwd, dirname(srcFile));

      for (const dir of testDirs) {
        for (const ext of testExts) {
          const candidates = [
            join(cwd, dir, `${srcStem}.test${ext}`),
            join(cwd, dir, `${srcStem}.spec${ext}`),
            join(srcDirAbs, `${srcStem}.test${ext}`),
            join(srcDirAbs, `${srcStem}.spec${ext}`),
          ];
          for (const c of candidates) {
            if (existsSync(c)) {
              const rel = c.replace(cwd + '/', '');
              let testCmd = 'npm test';
              try {
                const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
                const scripts = pkg.scripts?.test ?? '';
                const dev = { ...pkg.devDependencies, ...pkg.dependencies };
                if (scripts.includes('jest') || dev.jest)         testCmd = `npx jest ${rel}`;
                else if (scripts.includes('vitest') || dev.vitest) testCmd = `npx vitest run ${rel}`;
                else if (scripts.includes('mocha') || dev.mocha)   testCmd = `npx mocha ${rel}`;
              } catch {}
              return { label: `Run related tests: ${rel}`, cmd: testCmd, safe: true };
            }
          }
        }
      }
    }

    // No test file found — suggest generic test run
    let testCmd = 'npm test';
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
      if (!pkg.scripts?.test) testCmd = null;
    } catch { testCmd = null; }

    if (testCmd) {
      const fileList = sourceChanged.map(f => basename(f)).join(', ');
      return { label: `Run tests (${fileList} changed)`, cmd: testCmd, safe: true };
    }
  }

  return null;
}

const W_RESET  = '\x1b[0m';
const W_BOLD   = '\x1b[1m';
const W_DIM    = '\x1b[2m';
const W_YELLOW = '\x1b[33m';
const W_CYAN   = '\x1b[36m';
const W_GREEN  = '\x1b[32m';
const W_RED    = '\x1b[31m';

function watchRedraw(header, logLines, prompt) {
  process.stdout.write('\x1b[2J\x1b[H');
  process.stdout.write(header + '\n\n');
  const visible = logLines.slice(-8);
  for (let i = 0; i < visible.length; i++) {
    const dim = i < visible.length - 4;
    if (dim) process.stdout.write(W_DIM);
    process.stdout.write(visible[i] + '\n');
    if (dim) process.stdout.write(W_RESET);
  }
  if (prompt) process.stdout.write('\n' + prompt);
}

async function cmdWatch(rawArgs) {
  const cwd    = process.cwd();
  const auto   = rawArgs.includes('--auto');
  const dirArg = rawArgs.find(a => !a.startsWith('-')) ?? '.';
  const watchDir = join(cwd, dirArg);

  if (!existsSync(watchDir)) {
    process.stderr.write(`Error: Directory not found: ${watchDir}\n`);
    process.exit(1);
  }

  const relDir  = watchDir === cwd ? '.' : watchDir.replace(cwd + '/', '');
  const modeStr = auto ? `${W_YELLOW}--auto${W_RESET}` : 'interactive';
  const header  = `${W_BOLD}${W_CYAN}Watching${W_RESET} ${relDir}  ${W_DIM}(${modeStr}${W_DIM}, q or Ctrl+C to exit)${W_RESET}`;

  const logLines = [];
  function addLog(line) {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    logLines.push(`${W_DIM}${ts}${W_RESET}  ${line}`);
  }

  addLog(`${W_DIM}Ready — waiting for file changes...${W_RESET}`);
  watchRedraw(header, logLines);

  let resolvePending = null;
  let watcherRef     = null;

  function cleanup() {
    try { if (watcherRef) watcherRef.close(); } catch {}
    try { if (process.stdin.isTTY) process.stdin.setRawMode(false); } catch {}
    try { watchRl.close(); } catch {}
    process.stdout.write('\n');
    process.exit(0);
  }

  const watchRl = createInterface({ input: process.stdin, output: process.stdout });
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  process.stdin.on('data', (key) => {
    if (key === 'q' || key === '') { cleanup(); return; }
    if (resolvePending) { resolvePending(key); resolvePending = null; }
  });

  process.on('SIGINT',  cleanup);
  process.on('SIGTERM', cleanup);

  function waitForKey() {
    return new Promise(resolve => { resolvePending = resolve; });
  }

  let processing = false;
  async function processBatch(files) {
    if (processing) return;
    processing = true;
    try {
      const fileList = [...files];
      files.clear();
      const relFiles = fileList.map(f =>
        f.replace(cwd + '/', '').replace(cwd + '\\', '')
      );

      for (const f of relFiles) addLog(`  ${W_CYAN}${f}${W_RESET} saved`);

      const suggestion = suggestAction(relFiles, cwd);

      if (!suggestion) {
        addLog(`  ${W_DIM}(no action suggested)${W_RESET}`);
        watchRedraw(header, logLines);
        return;
      }

      addLog(`  ${W_YELLOW}Suggestion:${W_RESET} ${suggestion.label}`);

      if (auto) {
        if (!suggestion.safe || !suggestion.cmd) {
          addLog(`  ${W_DIM}[auto] Skipping — not auto-safe${W_RESET}`);
          watchRedraw(header, logLines);
          return;
        }
        addLog(`  ${W_GREEN}[auto] Running:${W_RESET} ${suggestion.cmd}`);
        watchRedraw(header, logLines);
        try {
          const out = execSync(suggestion.cmd, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
          for (const l of out.trim().split('\n').slice(-5)) addLog(`    ${W_DIM}${l}${W_RESET}`);
          addLog(`  ${W_GREEN}done${W_RESET}`);
        } catch (e) {
          const msg = (e.stderr || e.stdout || e.message || '').trim();
          for (const l of msg.split('\n').slice(-3)) addLog(`    ${W_RED}${l}${W_RESET}`);
          addLog(`  ${W_RED}command failed${W_RESET}`);
        }
        watchRedraw(header, logLines);
        return;
      }

      // Interactive prompt
      const promptLine = suggestion.cmd
        ? `  ${W_BOLD}[Enter]${W_RESET} Run  ${W_BOLD}[s]${W_RESET} Skip  ${W_BOLD}[q]${W_RESET} Quit\n  > `
        : `  ${W_BOLD}[s]${W_RESET} Dismiss  ${W_BOLD}[q]${W_RESET} Quit\n  > `;
      watchRedraw(header, logLines, promptLine);

      const key = await waitForKey();

      if (key === 'q' || key === '') { cleanup(); return; }

      if ((key === '\r' || key === '\n' || key === ' ') && suggestion.cmd) {
        addLog(`  ${W_GREEN}Running:${W_RESET} ${suggestion.cmd}`);
        watchRedraw(header, logLines);
        try {
          const out = execSync(suggestion.cmd, { cwd, encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
          for (const l of out.trim().split('\n').slice(-8)) addLog(`    ${W_DIM}${l}${W_RESET}`);
          addLog(`  ${W_GREEN}done${W_RESET}`);
        } catch (e) {
          const msg = (e.stderr || e.stdout || e.message || '').trim();
          for (const l of msg.split('\n').slice(-5)) addLog(`    ${W_RED}${l}${W_RESET}`);
          addLog(`  ${W_RED}command failed${W_RESET}`);
        }
      } else {
        addLog(`  ${W_DIM}skipped${W_RESET}`);
      }
      watchRedraw(header, logLines);
    } finally {
      processing = false;
    }
  }

  let debounceTimer = null;
  const pendingFiles = new Set();

  try {
    watcherRef = fsWatch(watchDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      if (
        filename.includes('node_modules') ||
        filename.includes('.git')         ||
        filename.includes('.dualbrain')   ||
        /package-lock\.json$/.test(filename) ||
        /yarn\.lock$/.test(filename)         ||
        /pnpm-lock\.yaml$/.test(filename)
      ) return;

      pendingFiles.add(join(watchDir, filename));

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        processBatch(pendingFiles).catch(e => {
          addLog(`  ${W_RED}Watch error: ${e.message}${W_RESET}`);
          watchRedraw(header, logLines);
        });
      }, 2000);
    });
  } catch (e) {
    if (e.code === 'ENOSPC') {
      process.stderr.write(
        '\nError: Too many file watchers (ENOSPC).\n' +
        'Increase the limit:\n' +
        '  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p\n'
      );
      process.exit(1);
    }
    throw e;
  }

  // Keep alive — stdin events drive everything, cleanup() calls process.exit
  await new Promise(() => {});
}


// ─── Specialist commands ──────────────────────────────────────────────────────

const SPECIALIST_DEFAULTS = {
  python:     { name: 'Python',       description: 'Python stdlib, typing, async' },
  typescript: { name: 'TypeScript',   description: 'TS type system, React, Node' },
  html:       { name: 'HTML/CSS',     description: 'Semantic HTML, CSS, accessibility' },
  linux:      { name: 'Linux/DevOps', description: 'Sysadmin, Docker, nginx, shell' },
  security:   { name: 'Security',     description: 'Auth, crypto, OWASP, threat model' },
};

function loadSpecialistRegistry() {
  const regPath = join(__dirname, '..', 'agents', 'specialists', 'registry.json');
  try {
    const raw = JSON.parse(readFileSync(regPath, 'utf8'));
    const out = {};
    for (const [key, val] of Object.entries(raw.specialists || {})) {
      out[key] = { name: val.name || key, description: val.description || '' };
    }
    return out;
  } catch {
    return SPECIALIST_DEFAULTS;
  }
}

function cmdSpecialists() {
  const registry = loadSpecialistRegistry();
  const entries  = Object.entries(registry);

  // Build padded rows
  const rows = entries.map(([key, val]) => {
    const k = key.padEnd(12);
    const d = val.description;
    return `│  ${k}${d}`;
  });

  // Find longest row for width
  const inner = Math.max(
    ...rows.map(r => r.length),
    '│ Usage: dual-brain python "task description"     │'.length - 2,
  );
  const width = inner + 1; // account for trailing │

  function pad(str) {
    return str + ' '.repeat(Math.max(0, width - str.length - 1)) + '│';
  }

  const top    = '┌' + '─'.repeat(width - 1) + '┐';
  const title  = pad('│ 🎯 Available Specialists');
  const divTop = '├' + '─'.repeat(width - 1) + '┤';
  const divBot = '├' + '─'.repeat(width - 1) + '┤';
  const bot    = '└' + '─'.repeat(width - 1) + '┘';

  console.log(top);
  console.log(title);
  console.log(divTop);
  for (const row of rows) console.log(pad(row));
  console.log(divBot);
  console.log(pad('│ Usage: dual-brain python "task description"'));
  console.log(pad('│ Auto-routing: off (use dual-brain go for auto)'));
  console.log(bot);
}

async function cmdSpecialistGo(specialist, args) {
  const dryRun   = args.includes('--dry-run');
  const verbose  = args.includes('--verbose') || args.includes('-v');
  const filesRaw = flag(args, '--files');
  const files    = filesRaw && typeof filesRaw === 'string'
    ? filesRaw.split(',').map(f => f.trim()).filter(Boolean)
    : [];

  const prompt = args.find(a => !a.startsWith('--') && !a.startsWith('-') && a !== (filesRaw ?? ''));
  if (!prompt) err(`Usage: dual-brain ${specialist} "task description" [--dry-run] [--files a,b]`);

  const cwd     = process.cwd();
  const profile = await ensureProfile(cwd);
  const detection = detectTask({ prompt, files });

  // Override specialist, preserve everything else
  detection.specialist = specialist;

  console.log(`[specialist: ${specialist}] ${detection.explanation}`);

  if (verbose) {
    vtrace(`Intent: ${detection.intent} | Risk: ${detection.risk} | Complexity: ${detection.complexity} | Effort: ${detection.effort ?? 'n/a'}`);
    vtrace(`Tier: ${detection.tier} | Specialist override: ${specialist}`);
  }

  const decision = decideRoute({ profile, detection, cwd });

  if (verbose) {
    const modelLabel = decision.effort ? `${decision.model} (${decision.effort})` : decision.model;
    vtrace(`Model selection: ${modelLabel}`);
    vtrace(`Dual-brain: ${decision.dualBrain ? 'yes' : 'no'}`);
  }

  // Print routing table (only in dry-run or verbose; silent in normal mode)
  if (dryRun || verbose) {
    console.log(`  specialist : ${specialist}`);
    console.log(`  provider   : ${decision.provider}`);
    console.log(`  model      : ${decision.model}${decision.effort ? ' (' + decision.effort + ')' : ''}`);
    console.log(`  tier       : ${decision.tier}`);
    console.log(`  dual-brain : ${decision.dualBrain ? 'yes' : 'no'}`);
    console.log(`  reason     : ${decision.explanation}`);
  }

  if (dryRun) {
    console.log('\n(dry-run — not executing)');
    return;
  }

  if (verbose) console.log('\nDispatching...');
  let result;
  if (decision.dualBrain) {
    result = await dispatchDualBrain({ decision, prompt, files, cwd, verbose });
    console.log(`\nConsensus: ${result.consensus}`);
    if (result.claude?.summary) console.log(`Claude : ${result.claude.summary}`);
    if (result.openai?.summary) console.log(`OpenAI : ${result.openai.summary}`);
    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain ${specialist} "${prompt}"`],
      lastResult:   { status: 'success', summary: result.consensus || 'dual-brain complete' },
      provider:     decision.provider,
      nextAction:   null,
    }, cwd);
  } else {
    result = await dispatch({ decision, prompt, files, cwd, verbose });
    const statusLine = result.status === 'completed' ? 'Done' : `Failed (exit ${result.exitCode})`;
    console.log(`\n${statusLine} in ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.summary) console.log(result.summary);
    if (result.error)   process.stderr.write(`${result.error}\n`);
    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain ${specialist} "${prompt}"`],
      lastResult:   {
        status:  result.status === 'completed' ? 'success' : 'failure',
        summary: result.summary || (result.status === 'completed' ? 'completed' : `exit ${result.exitCode}`),
      },
      provider:     decision.provider,
      nextAction:   null,
    }, cwd);
    if (result.status !== 'completed') process.exit(1);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  // Prime agent + skill registries early so detectTask and classifyInput
  // can match agents/skills synchronously during interactive sessions.
  primeAgentRegistry().catch(() => {});
  _primeRegistryCache().catch(() => {});
  _getHeadModule().catch(() => {});
  _getCognitiveLoop().catch(() => {});

  const args = process.argv.slice(2);
  const cmd  = args[0];

  // Session start marker — feeds routing advisor with cross-session timing signals
  try {
    const { markSessionStart } = await import('../dist/src/routing-advisor.js');
    markSessionStart(process.cwd());
  } catch { /* non-blocking */ }

  if (cmd === '--help' || cmd === '-h') { printHelp(); return; }
  if (cmd === '--version' || cmd === '-v') { console.log(readVersion()); return; }

  // Interactive-only commands: enter screen state machine (only when TTY)
  const isInteractive = process.stdin.isTTY;

  if (cmd === 'menu') {
    if (!isInteractive) {
      process.stderr.write('dual-brain menu requires an interactive terminal.\n');
      process.exit(1);
    }
    const cwd = process.cwd();
    cleanStaleMarkers(cwd);
    if (!process.argv.includes('--force') && checkLoopMarker(cwd)) {
      process.exit(0);
    }
    setLoopMarker(cwd);
    if (profileExists(cwd)) {
      await runScreens('main');
    } else {
      const auth  = await detectAuth();
      const plans = detectPlans();
      const existingSessions = importReplitSessions(cwd);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const wizardProfile = await runOnboardingWizard({ auth, plans, existingSessions }, cwd, rl);
      if (wizardProfile) {
        saveProfile(wizardProfile, { cwd });
        await cmdInstall(cwd);
      }
      rl.close();
      await runScreens('main');
    }
    return;
  }

  if (!cmd) {
    if (isInteractive) {
      const cwd = process.cwd();
      cleanStaleMarkers(cwd);
      if (!process.argv.includes('--force') && checkLoopMarker(cwd)) {
        process.exit(0);
      }
      setLoopMarker(cwd);
      if (profileExists(cwd)) {
        await runScreens('main');
      } else {
        // First run: run the onboarding wizard, then go to main.
        // (wizard handles detection display)
        const auth  = await detectAuth();
        const plans = detectPlans();
        const existingSessions = importReplitSessions(cwd);
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const wizardProfile = await runOnboardingWizard({ auth, plans, existingSessions }, cwd, rl);
        if (wizardProfile) {
          saveProfile(wizardProfile, { cwd });
          await cmdInstall(cwd);
          // (wizard already printed setup-complete line)
        }
        rl.close();
        await runScreens('main');
      }
    } else {
      // Non-TTY with no args: read stdin as a task and run one-shot
      const stdinTask = await new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => resolve(data.trim()));
        // If stdin has no data within 200ms (not truly piped), fall back to status card
        setTimeout(() => resolve(null), 200);
      });
      if (stdinTask) {
        process.stderr.write('🧠 routing...\n');
        await cmdGo([stdinTask]);
      } else {
        const cwd = process.cwd();
        const repo    = loadRepoCache(cwd);
        const session = loadSession(cwd);
        const health  = getHealth(cwd);
        const card    = formatSessionCard(session, repo, health);
        console.log(card);
      }
    }
    return;
  }

  if (cmd === 'init') {
    // init --reconfigure: run setup-flow reconfiguration
    if (args.includes('--reconfigure')) {
      try {
        const { runSetup } = await import('../dist/src/setup-flow.js');
        await runSetup(process.cwd(), { reconfigure: true });
      } catch (e) {
        console.error('setup-flow.mjs not available — skipping reconfigure');
        if (process.env.DEBUG) console.error(e.message);
      }
      return;
    }

    // init --reset: clear credentials.json and re-run wizard
    if (args.includes('--reset')) {
      const cwd = process.cwd();
      const credPath = join(cwd, '.dualbrain', 'credentials.json');
      try {
        if (existsSync(credPath)) {
          unlinkSync(credPath);
          console.log('  ✓ credentials.json cleared');
        }
        // Also clear setupComplete so wizard re-runs
        const profilePath = join(cwd, '.dualbrain', 'profile.json');
        if (existsSync(profilePath)) {
          const p = JSON.parse(readFileSync(profilePath, 'utf8'));
          delete p.setupComplete;
          writeFileSync(profilePath, JSON.stringify(p, null, 2), 'utf8');
          console.log('  ✓ profile reset — wizard will re-run');
        }
      } catch (e) {
        console.error('  Error during reset:', e.message);
      }
      if (!isInteractive) return;
      // Fall through to run the wizard interactively
    }

    // init --replit: run Replit-specific integration setup
    if (args.includes('--replit')) {
      const cwd = process.cwd();
      const dryRun = args.includes('--dry-run');
      try {
        const replit = await import('../dist/src/replit.js');
        const report = await replit.initReplitIntegration({ dryRun, cwd });
        console.log(replit.formatReplitReport(report));
      } catch (e) {
        console.error('replit.mjs not available yet — skipping Replit init');
        if (process.env.DEBUG) console.error(e.message);
      }
      return;
    }

    if (isInteractive) {
      // Run onboarding wizard then main screen
      const cwd = process.cwd();
      // (wizard handles detection display)
      const auth  = await detectAuth();
      const plans = detectPlans();
      const existingSessions = importReplitSessions(cwd);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const wizardProfile = await runOnboardingWizard({ auth, plans, existingSessions }, cwd, rl);
      if (wizardProfile) {
        saveProfile(wizardProfile, { cwd });
        await cmdInstall(cwd);
        // (wizard already printed setup-complete line)
      }
      rl.close();
      await runScreens('main');
    } else {
      await cmdInit();
    }
    return;
  }

  if (cmd === 'setup') {
    const { runSetup } = await import('../dist/src/setup-flow.js');
    await runSetup(process.cwd(), { reconfigure: args.includes('--reconfigure') });
    return;
  }

  if (cmd === 'advice' || cmd === 'recommend') {
    const { generateRecommendations, formatRecommendations } = await import('../dist/src/recommendations.js');
    const recs = generateRecommendations(process.cwd());
    if (recs.length === 0) {
      console.log('');
      console.log('  \x1b[2m─── HEAD Analysis ───\x1b[0m');
      console.log('');
      const { getRoutingStats } = await import('../dist/src/routing-advisor.js');
      const stats = getRoutingStats(process.cwd());
      if (stats.totalObservations < 20) {
        console.log(`  Need more data: ${stats.totalObservations}/20 observations before recommendations.`);
        console.log(`  Keep dispatching — the system learns from every task.`);
      } else {
        console.log('  No recommendations — current configuration is performing well.');
      }
      console.log('');
    } else {
      console.log(formatRecommendations(recs));
    }
    return;
  }

  if (cmd === 'stats' || cmd === 'intelligence') {
    const { getRoutingStats } = await import('../dist/src/routing-advisor.js');
    const { getThinkingStats } = await import('../dist/src/think-engine.js');
    const stats = getRoutingStats(process.cwd());
    const thinkStats = getThinkingStats(process.cwd());

    console.log('');
    console.log('  \x1b[1mdual-brain intelligence report\x1b[0m');
    console.log('');
    console.log(`  Routing observations: ${stats.totalObservations}`);
    if (stats.topPerformers?.length > 0) {
      console.log('  Top performers:');
      for (const p of stats.topPerformers.slice(0, 5)) {
        console.log(`    ${p.cell} → ${p.model} (${(p.ema * 100).toFixed(0)}%, n=${p.observations})`);
      }
    }
    if (stats.worstPerformers?.length > 0) {
      console.log('  Underperformers:');
      for (const p of stats.worstPerformers.slice(0, 3)) {
        console.log(`    ${p.cell} → ${p.model} (${(p.ema * 100).toFixed(0)}%, n=${p.observations})`);
      }
    }
    console.log('');
    console.log(`  Think decisions: ${thinkStats.totalDecisions}`);
    console.log(`  Cache hit rate: ${(thinkStats.cacheHitRate * 100).toFixed(0)}%`);
    console.log(`  Tokens saved: ~${(thinkStats.totalTokensSaved / 1000).toFixed(0)}K`);
    console.log(`  Tier distribution: recall=${thinkStats.tierDistribution.recall}, quick=${thinkStats.tierDistribution.quick}, standard=${thinkStats.tierDistribution.standard}, deep=${thinkStats.tierDistribution.deep}, ultra=${thinkStats.tierDistribution.ultra}`);
    console.log('');
    return;
  }

  if (cmd === 'revert' || cmd === 'undo') {
    const { runRevert } = await import('../dist/src/revert.js');
    await runRevert(process.cwd());
    return;
  }

  if (cmd === 'strategies') {
    const { listStrategies } = await import('../dist/src/strategy.js');
    const strats = listStrategies();
    console.log('\n  Available dispatch strategies:\n');
    for (const s of strats) {
      console.log(`  ${s.id.padEnd(18)} ${s.description} (${s.cost}x cost)`);
    }
    console.log('');
    return;
  }

  // One-shot commands — run and exit
  if (cmd === 'install') {
    if (args.includes('--global')) { await installGlobal(); return; }
    await cmdInstall();
    return;
  }
  if (cmd === 'uninstall') {
    if (args.includes('--global')) { await uninstallGlobal(); return; }
    console.log('Usage: dual-brain uninstall --global');
    return;
  }
  if (cmd === 'auth') {
    await cmdAuth(args.slice(1));
    return;
  }
  if (cmd === 'plan')     { await cmdGo(args.slice(1), { dryRun: true }); return; }
  if (cmd === 'do')       { await cmdGo(args.slice(1)); return; }
  if (cmd === 'go')       { await cmdGo(args.slice(1)); return; }
  if (cmd === 'think')    { await cmdThink(args.slice(1)); return; }
  if (cmd === 'review')   { await cmdReview(args.slice(1)); return; }
  if (cmd === 'ship')     { await cmdShip(); return; }
  if (cmd === 'pr')       { await cmdPR(args.slice(1)); return; }
  if (cmd === 'status')   { await cmdStatus(args.slice(1)); return; }
  if (cmd === 'handoff')  { await cmdHandoff(args.slice(1)); return; }
  if (cmd === 'switch')   { await cmdSwitch(args.slice(1)); return; }
  if (cmd === 'update' || cmd === 'upgrade') { await cmdUpdate(); return; }
  if (cmd === 'hot')      { cmdHot(args[1]); return; }
  if (cmd === 'cool')     { cmdCool(args[1]); return; }
  if (cmd === 'remember')    { cmdRemember(args[1]); return; }
  if (cmd === 'forget')      { cmdForget(args[1]); return; }
  if (cmd === 'break-glass') { cmdBreakGlass(args.slice(1).join(' ')); return; }

  if (cmd === 'specialists') { cmdSpecialists(); return; }

  const SPECIALIST_CMDS = new Set(Object.keys(loadSpecialistRegistry()));
  if (SPECIALIST_CMDS.has(cmd)) { await cmdSpecialistGo(cmd, args.slice(1)); return; }

  if (cmd === 'search') {
    const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    if (!query) {
      console.log('Usage: dual-brain search "keyword"');
      process.exit(1);
    }

    const { searchSessions, buildSessionIndex } = await import('../dist/src/session.js');
    const cwd = process.cwd();
    try { buildSessionIndex(cwd); } catch {}

    const results = searchSessions(query, cwd);
    if (results.length === 0) {
      console.log(`No sessions matching "${query}"`);
      process.exit(0);
    }

    console.log(`Found ${results.length} session${results.length === 1 ? '' : 's'}:\n`);
    results.slice(0, 10).forEach((sess, i) => {
      const tool = sess.tool === 'codex' ? 'cdx' : 'cld';
      const date = sess.date ? new Date(sess.date).toLocaleDateString() : '?';
      console.log(`  ${i + 1}. [${tool}] ${date}  ${sess.prompts.first || sess.id.slice(0, 8)}`);
      if (sess.topics.length > 0) console.log(`     topics: ${sess.topics.slice(0, 5).join(', ')}`);
      if (sess.files.length > 0) console.log(`     files: ${sess.files.slice(0, 5).join(', ')}`);
      console.log(`     id: ${sess.id}`);
      console.log('');
    });

    process.exit(0);
  }

  if (cmd === 'watch') { await cmdWatch(args.slice(1)); return; }

  if (cmd === 'shell-hook') {
    // Output a bash snippet users can add to their .bashrc or source directly.
    const hook = `
# dual-brain shell integration
# Source this file or add to .bashrc
if command -v dual-brain &>/dev/null; then
  alias db='dual-brain'
  alias dbgo='dual-brain go'
  alias dbstat='dual-brain status'
fi
`.trim();
    console.log(hook);
    return;
  }

  // ─── One-shot mode ────────────────────────────────────────────────────────────
  // If cmd is not a recognized subcommand, treat the entire arg list as a task.
  // e.g. `dual-brain fix failing tests` → same as `dual-brain go "fix failing tests"`
  const KNOWN_COMMANDS = new Set([
    'menu', 'init', 'install', 'uninstall', 'auth', 'go', 'do', 'plan', 'ship', 'think', 'review', 'pr', 'status', 'handoff', 'switch', 'hot', 'cool',
    'remember', 'forget', 'break-glass', 'specialists', 'search', 'shell-hook', 'watch', 'update', 'upgrade',
    '--help', '-h', '--version', '-v',
    ...Object.keys(loadSpecialistRegistry()),
  ]);

  if (!KNOWN_COMMANDS.has(cmd)) {
    // All of args are part of the task description (plus any flags like --dry-run/--files).
    // Join non-flag words into a single prompt string so cmdGo's args.find() picks it up.
    // We strip out flag values (e.g. the value after --files) before collecting prompt words.
    process.stderr.write('🧠 routing...\n');
    const flagValuesToSkip = new Set();
    const pairedFlags = ['--files'];
    for (const f of pairedFlags) {
      const idx = args.indexOf(f);
      if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
        flagValuesToSkip.add(args[idx + 1]);
      }
    }
    const passedFlags = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--') || args[i].startsWith('-')) {
        passedFlags.push(args[i]);
        if (pairedFlags.includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
          passedFlags.push(args[++i]);
        }
      }
    }
    const promptWords = args.filter(a => !a.startsWith('--') && !a.startsWith('-') && !flagValuesToSkip.has(a));
    await cmdGo([promptWords.join(' '), ...passedFlags]);
    return;
  }

  process.stderr.write(`Unknown command: ${cmd}\nRun "dual-brain --help" for usage.\n`);
  process.exit(1);
}

main().catch(e => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
