#!/usr/bin/env node
// dual-brain — CLI entry point. Commands: init, go, think, review, status, remember, forget

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
} from '../src/profile.mjs';

import { detectTask } from '../src/detect.mjs';

import {
  decideRoute, getAvailableModels,
} from '../src/decide.mjs';

import {
  getHealth, markHot, markHealthy, remainingCooldownMinutes, getSessionStats,
} from '../src/health.mjs';

import { dispatch, detectRuntime, dispatchDualBrain } from '../src/dispatch.mjs';

import { runPipeline, buildExecutionPlan, formatExecutionPlan } from '../src/pipeline.mjs';

import { loadRepoCache } from '../src/repo.mjs';
import { loadSession, saveSession, formatSessionCard, importReplitSessions, getSessionMeta, saveSessionMeta, renameSession, pinSession, unpinSession, categorizeSession, enrichSessions, archiveSession, getArchivedSessions } from '../src/session.mjs';

import { box, bar, badge, menu, separator } from '../src/tui.mjs';

// ─── Dynamic imports for receipts + failure memory ───────────────────────────

let _receipt = null;
async function getReceipt() {
  if (!_receipt) {
    try { _receipt = await import('../src/receipt.mjs'); } catch { _receipt = {}; }
  }
  return _receipt;
}

let _failureMem = null;
async function getFailureMem() {
  if (!_failureMem) {
    try { _failureMem = await import('../src/failure-memory.mjs'); } catch { _failureMem = {}; }
  }
  return _failureMem;
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
  go "task description"     Detect → decide → dispatch (alias for do)
    --dry-run               Show routing decision without executing
    --files a.mjs,b.mjs     Provide file context for risk classification
    --verbose, -v           Print routing trace (intent, risk, health, model selection)
  think "question"          Multi-round architecture decision with dual-brain
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
  shell-hook                Output bash snippet to add dual-brain to your shell
                            Usage: dual-brain shell-hook >> ~/.bashrc

Interactive mode (entered with no args on a TTY):
  Session manager with recent sessions and routing.
  [n] New session, [c] Continue last, [1-9] Resume, [s] Settings, [q] Exit

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
    : `  Claude:  not logged in — run: claude auth login`;
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
    console.log('  Claude:  claude auth login');
    console.log('  OpenAI:  codex login\n');
    console.log('Then re-run: dual-brain init');
    return;
  }

  // --- Step 2: Run onboarding wizard ---
  const profile = await runOnboarding({ interactive: true, detectedAuth: auth, rl });
  saveProfile(profile, { cwd });

  // --- Step 2b: Install hooks ---
  await cmdInstall(cwd);

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
    if (!auth.claude.found) console.log('  Claude not logged in. Run: claude auth login');
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

  const { plan, result } = await runPipeline('go', prompt, {
    files,
    cwd,
    verbose,
    dryRun,
  });

  if (dryRun) {
    // formatExecutionPlan already printed by pipeline when verbose/dryRun=true
    console.log('\n(dry-run — not executing)');
    return;
  }

  if (!result) return;

  // Display result — dual-brain vs single-provider
  if (result.consensus) {
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

    // Clear failure memory on success
    if (failureMem.clearFailures) {
      try { await failureMem.clearFailures(prompt, cwd); } catch { /* non-fatal */ }
    }

    // ── Next steps suggestions (dual-brain consensus path) ──────────────────
    try {
      const { suggestNextSteps, formatNextSteps } = await import('../src/nextstep.mjs');
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
    console.log(`\n${statusLine}${result.durationMs != null ? ` in ${(result.durationMs / 1000).toFixed(1)}s` : ''}`);
    if (result.summary) console.log(result.summary);
    if (result.error)   process.stderr.write(`${result.error}\n`);

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
      const { suggestNextSteps, formatNextSteps } = await import('../src/nextstep.mjs');
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

  const { result, verification } = await runPipeline('think', question, {
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

  console.log('=== Dual-Brain Status ===\n');

  // Providers + health
  console.log('Providers:');
  if (providers.length === 0) {
    console.log('  (none configured — run: dual-brain init)');
  } else {
    for (const p of providers) {
      const label = p.name === 'claude' ? 'Claude' : 'OpenAI';
      // Collect all model-class states for this provider
      const provStates = Object.entries(states)
        .filter(([k]) => k.startsWith(`${p.name}:`));
      const sess = sessionStats[p.name] ?? { calls: 0, tokens: 0 };

      const planStr = p.plan ? `  plan=${p.plan}` : '';
      if (provStates.length === 0) {
        console.log(`  ${label}${planStr}  status=healthy  calls=${sess.calls}  tokens=${sess.tokens}`);
      } else {
        for (const [k, st] of provStates) {
          const modelClass = k.split(':').slice(1).join(':');
          let statusStr = st.status;
          if (st.status === 'hot') {
            const remaining = remainingCooldownMinutes(p.name, modelClass, cwd);
            statusStr = remaining > 0 ? `hot (retry in ${remaining}m)` : 'hot (cooling)';
          }
          console.log(`  ${label}${planStr}  model=${modelClass}  status=${statusStr}  calls=${sess.calls}  tokens=${sess.tokens}`);
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
}

// ─── cmdHot / cmdCool ─────────────────────────────────────────────────────────

const PROVIDER_MODEL_CLASSES = {
  claude: ['haiku', 'sonnet', 'opus'],
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5'],
};

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
  const { installHooks } = await import('../src/install-hooks.mjs');
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

// ─── Screen helpers ───────────────────────────────────────────────────────────

/**
 * Render the data-tools-style rounded header box for the main screen.
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
  const credit = `by Steve Moraco + dual-brain`;

  const allProviderLines = [...providerLines];
  if (dtVersion) {
    allProviderLines.push(`📦 data-tools v${dtVersion} detected`);
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
  return existsSync(projectPath) || existsSync(globalPath);
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

  // --- Detect data-tools / replit-tools sessions ---
  const env = detectEnvironment();
  const existingSessions = importReplitSessions(cwd);
  if (env.hasReplitTools) {
    detectedLines.push(`  data-tools detected`);
  }
  if (existingSessions.length > 0) {
    detectedLines.push(`  ${existingSessions.length} session${existingSessions.length !== 1 ? 's' : ''} found from data-tools`);
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
    console.log('  claude auth login   — for Claude');
    console.log('  codex login         — for OpenAI/Codex\n');
    console.log('Then re-run: dual-brain init');
    return { next: 'exit' };
  }

  console.log('  [Enter] Save and go');
  console.log('  [c]     Customize work style');
  if (existingSessions.length > 0) {
    console.log(`  [i]     Import ${existingSessions.length} session${existingSessions.length !== 1 ? 's' : ''} from data-tools`);
  }
  if (!rt.installed) {
    console.log('');
    console.log('  💡 Tip: Install replit-tools for session persistence:');
    console.log('     npx replit-tools');
  }
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'i' && existingSessions.length > 0) {
    console.log(`\n  Importing ${existingSessions.length} sessions from data-tools...\n`);
    const recent = existingSessions.slice(0, 5);
    for (const sess of recent) {
      console.log(`  ${sess.age.padEnd(6)}  ${sess.name}`);
    }
    if (existingSessions.length > 5) {
      console.log(`  ... and ${existingSessions.length - 5} more`);
    }
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
      const { ensurePersistence } = await import('../src/session.mjs');
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
function buildProviderStatusLine(profile, auth, maxWidth = 54) {
  const GREEN = '[32m●[0m';
  const RED   = '[31m●[0m';

  const claudeDot = auth.claude.found ? GREEN : RED;
  const openaiDot = auth.openai.found ? GREEN : RED;

  const WORK_STYLE_LABELS = {
    'auto':          '⚡ Fast',
    'cost-saver':    '⚡ Fast',
    'balanced':      '⚖️  Balanced',
    'quality-first': '🔥 Full Power',
    'solo-claude':   '⚡ Fast',
    'solo-openai':   '⚡ Fast',
  };
  const WORK_STYLE_TIPS = {
    'auto':          'adapts routing by task risk',
    'cost-saver':    'single model, minimal reviews',
    'balanced':      'smart routing, reviews when needed',
    'quality-first': 'dual-brain on everything important',
    'solo-claude':   'Claude only, no GPT dispatch',
    'solo-openai':   'OpenAI only, no Claude dispatch',
  };
  const bias  = profile?.bias || profile?.mode || 'balanced';
  const label = WORK_STYLE_LABELS[bias] || '⚖️  Balanced';
  const fullTip = WORK_STYLE_TIPS[bias] || 'smart routing, reviews when needed';

  // Trim tip to fit within box width (measure visible chars: strip ANSI + variation selectors)
  const labelPlain = label.replace(/[︀-️]/g, '').replace(/[[0-9;]*m/g, '');
  const prefixLen = ('● Claude  ● OpenAI  ' + labelPlain + ' — ').length;
  const tipMax = maxWidth - prefixLen;
  const tip = tipMax >= 6
    ? (fullTip.length > tipMax ? fullTip.slice(0, tipMax - 1) + '…' : fullTip)
    : '';

  const suffix = tip ? `[2m — ${tip}[0m` : '';
  return `${claudeDot} Claude  ${openaiDot} OpenAI  ${label}${suffix}`;
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

// ─── Screen: mainScreen ───────────────────────────────────────────────────────

async function mainScreen(rl, ask) {
  const cwd     = process.cwd();
  const version = readVersion();
  const profile = loadProfile(cwd);
  const auth    = await detectAuth();

  const claudeSub = profile?.providers?.claude;
  const openaiSub = profile?.providers?.openai;

  // Check subscription expiry for auto-refresh
  const now          = Date.now();
  const claudeExpired = claudeSub?.expiresAt && Date.parse(claudeSub.expiresAt) < now;
  const openaiExpired = openaiSub?.expiresAt && Date.parse(openaiSub.expiresAt) < now;

  // Silent OAuth token auto-refresh
  try {
    const { autoRefreshToken } = await import('../src/profile.mjs');
    await autoRefreshToken(cwd);
  } catch {}

  // Append-only session archive sync
  try {
    const { syncSessionMirror } = await import('../src/session.mjs');
    syncSessionMirror(cwd);
  } catch {}

  // Auto-refresh expired subscriptions
  if (claudeExpired || openaiExpired) {
    const { spawnSync } = await import('node:child_process');
    if (claudeExpired) {
      const r = spawnSync('claude', ['auth', 'login'], { stdio: 'inherit', timeout: 30000 });
      if (r.status === 0) { claudeSub.expiresAt = null; saveProfile(profile, { cwd }); }
    }
    if (openaiExpired) {
      const r = spawnSync('codex', ['login'], { stdio: 'inherit', timeout: 30000 });
      if (r.status === 0) { openaiSub.expiresAt = null; saveProfile(profile, { cwd }); }
    }
  }

  // Build session index in background (powers search + smart resume)
  try {
    const { buildSessionIndex } = await import('../src/session.mjs');
    buildSessionIndex(cwd);
  } catch {}

  // Gather recent sessions
  const allSessions    = enrichSessions(importReplitSessions(cwd), cwd);
  const recentSessions = allSessions.slice(0, 3);
  const staleCount     = allSessions.filter(s => {
    const ageMs = s.lastActive ? Date.now() - new Date(s.lastActive).getTime() : 0;
    return ageMs >= 7 * 86400000;
  }).length;

  // Detect data-tools version
  const rtMain    = detectReplitTools(cwd);
  const dtVersion = (rtMain.installed && rtMain.version) ? rtMain.version : null;

  // ── Interrupted work detection ────────────────────────────────────────────
  const interrupted = detectInterruptedWork(allSessions, cwd);

  // ── Box layout ────────────────────────────────────────────────────────────
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60); // outer width (including │ │)
  const W     = boxW - 4;                // inner content width (│ {content} │)

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;

  const row = (content) => makeBoxRow(content, W);

  // ── Header: one line above the box ────────────────────────────────────────
  process.stdout.write(`\n🧠 dual-brain v${version}\n`);
  {
    let gitName = '';
    try {
      const { execSync } = await import('node:child_process');
      gitName = execSync('git config user.name', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
    } catch { /* ignore */ }
    if (gitName) {
      const hour = new Date().getHours();
      let greet;
      if (hour >= 5 && hour <= 11)  greet = 'Good morning';
      else if (hour >= 12 && hour <= 16) greet = 'Good afternoon';
      else if (hour >= 17 && hour <= 21) greet = 'Good evening';
      else                               greet = 'Late night';
      process.stdout.write(`\x1b[2m${greet}, ${gitName}\x1b[0m\n`);
    }
  }

  // ── Continuation card (interrupted work) ─────────────────────────────────
  if (interrupted) {
    const ctop = `┌${'─'.repeat(boxW - 2)}┐`;
    const csep = `├${'─'.repeat(boxW - 2)}┤`;
    const cbot = `└${'─'.repeat(boxW - 2)}┘`;
    const crow = (content) => makeBoxRow(content, W);

    const titleLine = `\x1b[33m💡\x1b[0m Continue: ${interrupted.sessionName}`;
    const lastLine  = interrupted.lastState
      ? `   Last: ${interrupted.lastState} · ${interrupted.ageLabel}`
      : `   ${interrupted.reason} · ${interrupted.ageLabel}`;
    const actLine   = '   [Enter] Resume  [n] New session  [s] Skip';

    process.stdout.write([ctop, crow(titleLine), csep, crow(lastLine), crow(actLine), cbot].join('\n') + '\n\n');

    // Wait for a keypress to decide what to do with the card
    const readline2 = await import('node:readline');
    readline2.emitKeypressEvents(process.stdin, rl);

    const cardChoice = await new Promise((resolve) => {
      const wasRaw2 = process.stdin.isRaw;
      const canRaw2 = process.stdin.isTTY && typeof process.stdin.setRawMode === 'function';
      if (canRaw2) process.stdin.setRawMode(true);

      const cleanup2 = () => {
        process.stdin.removeListener('keypress', onCardKey);
        if (canRaw2) {
          try { process.stdin.setRawMode(wasRaw2 || false); } catch {}
        }
      };

      const onCardKey = (str, key) => {
        if (!key) return;
        const name = key.name || '';
        const seq  = key.sequence || str || '';

        if (key.ctrl && (name === 'c' || name === 'd')) {
          cleanup2();
          process.stdout.write('\n');
          resolve('q');
          return;
        }

        if (name === 'return' || name === 'enter' || seq === '\r' || seq === '\n') {
          cleanup2();
          process.stdout.write('\n');
          resolve('resume');
          return;
        }

        if (!str || str.length === 0) return;
        const lower = str.toLowerCase();
        if (lower === 'n' || lower === 's' || lower === 'q') {
          cleanup2();
          process.stdout.write('\n');
          resolve(lower);
          return;
        }
      };

      process.stdin.on('keypress', onCardKey);
    });

    if (cardChoice === 'q') return { next: 'exit' };

    if (cardChoice === 'resume') {
      const { spawnSync } = await import('node:child_process');
      process.stdout.write(`  Launching: claude --resume ${interrupted.sessionId}\n\n`);
      spawnSync('claude', ['--resume', interrupted.sessionId], { stdio: 'inherit' });
      saveTerminalState(cwd, getTerminalId(), interrupted.sessionId, 'claude');
      return { next: 'main' };
    }

    if (cardChoice === 'n') return { next: 'new-session' };

    // 's' → fall through to normal dashboard
  }

  // ── Status section ────────────────────────────────────────────────────────
  const providerLine = buildProviderStatusLine(profile, auth, W);

  const statusRows = [row(providerLine)];
  if (dtVersion) {
    statusRows.push(row(`\x1b[2m📦 data-tools v${dtVersion}\x1b[0m`));
  }

  // ── Observer observations (top 2, high priority first) ───────────────────
  let quickObservations = [];
  try {
    const observerMod = await import('../src/observer.mjs');
    const quickState = await observerMod.getQuickState(cwd);
    if (quickState?.observations?.length > 0) {
      const PRIO = { high: 0, medium: 1, low: 2 };
      const sorted = [...quickState.observations].sort(
        (a, b) => (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2)
      );
      quickObservations = sorted.slice(0, 2);
      for (const obs of quickObservations) {
        let prefix;
        if (obs.priority === 'high')   prefix = '🔴';
        else if (obs.priority === 'medium') prefix = '🟡';
        else                                prefix = '\x1b[2m💡\x1b[0m';
        statusRows.push(row(`${prefix} ${obs.message}`));
      }
    }
  } catch { /* non-fatal — module may not exist yet */ }

  // ── Action cards (git state + open PRs) ──────────────────────────────────
  const repoState  = detectRepoState(cwd);
  const openPRs    = await detectOpenPRs(cwd);
  const actionRows = buildActionRows(repoState, row, openPRs);

  // ── High-priority observer action cards ───────────────────────────────────
  if (quickObservations.some(o => o.priority === 'high')) {
    const DIM   = '\x1b[2m';
    const RESET = '\x1b[0m';
    actionRows.push(row(`${DIM}[r] Security review  [t] Run tests  [c] Commit${RESET}`));
  }

  // ── Related sessions hint (only when no continuation card is showing) ─────
  if (!interrupted && recentSessions.length > 0) {
    try {
      const { findRelatedSessions } = await import('../src/session.mjs');
      const mostRecent = recentSessions[0];
      // Build a pseudo-prompt from the most recent session's name/objective
      const recentPrompt = mostRecent.name || '';
      // Load session index to get files for the most recent session
      const indexPath = join(cwd, '.dualbrain', 'session-index.json');
      let recentFiles = [];
      try {
        const idx = JSON.parse(readFileSync(indexPath, 'utf8'));
        recentFiles = idx[mostRecent.id]?.files || [];
      } catch {}
      const related = findRelatedSessions(recentPrompt, recentFiles, cwd);
      if (related.length > 0) {
        const relAgeLabel = (isoDate) => {
          if (!isoDate) return '';
          const diff  = Date.now() - Date.parse(isoDate);
          const days  = Math.floor(diff / 86400000);
          const hours = Math.floor(diff / 3600000);
          if (days >= 1) return `${days}d`;
          return `${hours}h ago`;
        };
        const relatedParts = related.slice(0, 2).map(r => {
          const age = relAgeLabel(r.date);
          return age ? `${r.smartName} (${age})` : r.smartName;
        });
        const DIM   = '\x1b[2m';
        const RESET = '\x1b[0m';
        actionRows.push(row(`${DIM}📎 Related: ${relatedParts.join(', ')}${RESET}`));
      }
    } catch { /* non-fatal */ }
  }
  // ── End related sessions hint ─────────────────────────────────────────────

  // ── Sessions section ──────────────────────────────────────────────────────
  const sessionRows = [];
  if (recentSessions.length === 0) {
    const noSessMsg = 'No sessions yet. Press n to start.';
    sessionRows.push(row(noSessMsg));
  } else {
    recentSessions.forEach((sess, i) => {
      // Normalize name: strip "Session XXXXXXXX" fallbacks
      let rawName = sess.name || '';
      if (/^Session [0-9a-f]{8,}$/i.test(rawName)) {
        rawName = sess.project
          ? sess.project.replace(/^-/, '/').replace(/-/g, '/')
          : sess.id.slice(0, 8);
      }

      // Build badges (ANSI color; track visible width separately)
      const badges = [];
      const badgeVisible = [];
      if (sess.isActive) {
        badges.push('\x1b[32m[active]\x1b[0m');
        badgeVisible.push('[active]'.length);
      }
      const ageMs = sess.lastActive ? Date.now() - new Date(sess.lastActive).getTime() : 0;
      if (ageMs > 7 * 24 * 3600 * 1000) {
        badges.push('\x1b[2m[stale]\x1b[0m');
        badgeVisible.push('[stale]'.length);
      }
      const msgCount    = sess.messageCount ?? sess.promptCount ?? 0;
      // Human-readable: "4 tasks" instead of "(4)"
      const taskLabel   = msgCount === 1 ? '1 task' : `${msgCount} tasks`;
      const taskBadge   = `\x1b[2m${taskLabel}\x1b[0m`;
      const taskBadgeW  = taskLabel.length;

      const badgeStr = badges.join('');
      const badgesW  = badgeVisible.reduce((s, n) => s + n, 0);

      // Layout: "{num}  {name...}{badges}  {age}  {tasks}"
      // Use basename for name — strip full paths for readability
      const displayName = rawName.startsWith('/')
        ? rawName.split('/').filter(Boolean).pop() || rawName
        : rawName;

      const numStr  = String(i + 1);
      const ageStr  = sess.age || '';
      // Available for name: W minus fixed chrome, badge widths, and task badge
      const nameMax = W - numStr.length - 2 - badgesW - 2 - ageStr.length - 2 - taskBadgeW;
      const truncName = displayName.length > nameMax
        ? displayName.slice(0, Math.max(0, nameMax - 3)) + '...'
        : displayName.padEnd(nameMax);
      const content = `${numStr}  ${truncName}${badgeStr}  ${ageStr}  ${taskBadge}`;
      sessionRows.push(row(content));
    });
  }

  // ── Actions bar — four product verbs first, then navigation ────────────────
  const actionsContent = 'd Do  p Plan  r Review  s Ship  │  n New  / Search  q Quit';
  const actionsRow     = row(actionsContent);

  // ── Print the full box ────────────────────────────────────────────────────
  // Include action cards between status and sessions (with separators only when non-empty)
  const poweredByRow = row('\x1b[2mPowered by data-tools · Steve Moraco\x1b[0m');
  const lines = [
    top,
    ...statusRows,
    ...(actionRows.length > 0 ? [sep, ...actionRows] : []),
    sep,
    ...sessionRows,
    sep,
    actionsRow,
    sep,
    poweredByRow,
    bot,
  ];
  // ── Stale session hint ──────────────────────────────────────────────────
  if (staleCount >= 3) {
    process.stdout.write(`\x1b[2m${staleCount} stale sessions (>7d) — press s → archive to clean up\x1b[0m\n`);
  }

  process.stdout.write(lines.join('\n') + '\n\n');

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
        const singleKeySet = new Set(['n', 's', 'q', '/', 'i', 'd', 'p', 'r']);
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

  // Typed task → dispatch as "dual-brain go"
  if (raw.startsWith('__task__:')) {
    const prompt = raw.slice('__task__:'.length).trim();
    if (prompt) {
      return { next: 'go', prompt };
    }
    return { next: 'main' };
  }

  // Enter (empty) → resume most recent session
  if (raw === '' || choice === '\r') {
    if (recentSessions.length === 0) {
      return { next: 'new-session' };
    }
    const sess = recentSessions[0];
    const { spawnSync } = await import('node:child_process');
    process.stdout.write(`\n  Launching: claude --resume ${sess.id}\n\n`);
    spawnSync('claude', ['--resume', sess.id], { stdio: 'inherit' });
    saveTerminalState(cwd, getTerminalId(), sess.id, sess.tool || 'claude');
    return { next: 'main' };
  }

  // Number 1-3 → resume that session
  const numChoice = parseInt(raw, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= recentSessions.length) {
    const sess = recentSessions[numChoice - 1];
    try {
      const { getSessionContext } = await import('../src/session.mjs');
      const ctx = getSessionContext(sess.id, cwd);
      if (ctx) {
        if (ctx.lastPrompt) process.stdout.write(`\n  Last working on: ${ctx.lastPrompt}\n`);
        if (ctx.filesTouched.length > 0) process.stdout.write(`  Files touched: ${ctx.filesTouched.join(', ')}\n`);
      }
    } catch {}
    const { spawnSync } = await import('node:child_process');
    process.stdout.write(`\n  Launching: claude --resume ${sess.id}\n\n`);
    spawnSync('claude', ['--resume', sess.id], { stdio: 'inherit' });
    saveTerminalState(cwd, getTerminalId(), sess.id, sess.tool || 'claude');
    return { next: 'main' };
  }

  if (choice === 'n') { return { next: 'new-session' }; }

  // Four product verbs
  if (choice === 'd') {
    // "Do" — prompt user for a task description, then dispatch
    const prompt = (await ask('  What do you want to do? ')).trim();
    if (!prompt) return { next: 'main' };
    return { next: 'go', prompt };
  }

  if (choice === 'p') {
    // "Plan" — dry-run routing for a task
    const prompt = (await ask('  Describe the task to plan: ')).trim();
    if (!prompt) return { next: 'main' };
    return { next: 'go', prompt, dryRun: true };
  }

  if (choice === 'r') {
    // "Review" — dual-brain review current diff
    const { spawnSync } = await import('node:child_process');
    process.stdout.write('\n  Running dual-brain review...\n\n');
    spawnSync('node', ['.claude/hooks/dual-brain-review.mjs'], { stdio: 'inherit', cwd });
    return { next: 'main' };
  }

  if (choice === 's') {
    // "Ship" — run quality gate then prompt for commit/PR
    const { spawnSync } = await import('node:child_process');
    process.stdout.write('\n  Running quality gate + ship flow...\n\n');
    spawnSync('node', ['.claude/hooks/quality-gate.mjs'], { stdio: 'inherit', cwd });
    return { next: 'main' };
  }

  if (choice === '/') {
    const query = (await ask('  Search: ')).trim();
    if (!query) return { next: 'main' };

    const { searchSessions, buildSessionIndex } = await import('../src/session.mjs');
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
      process.stdout.write(`\n  Launching: ${tool} --resume ${sess.id}\n\n`);
      spawnSync(tool, ['--resume', sess.id], { stdio: 'inherit' });
    }
    return { next: 'main' };
  }

  if (choice === 'i') { return { next: 'import-picker' }; }
  if (choice === 'q' || choice === 'exit') { return { next: 'exit' }; }

  return { next: 'main' };
}

// ─── Screen: newSessionScreen ─────────────────────────────────────────────────

async function newSessionScreen(rl, ask) {
  const cwd = process.cwd();
  const input = (await ask('\n  What do you want to do? ')).trim();
  if (!input) { return { next: 'main' }; }

  const profile = loadProfile(cwd);
  const detection = detectTask({ prompt: input });
  const decision = decideRoute({ profile, detection, cwd });

  console.log(`\n  Routing: ${decision.provider}/${decision.model} (${decision.tier})`);
  console.log(`  Reason: ${decision.explanation}\n`);

  const { spawnSync } = await import('node:child_process');
  const launchTool = decision.provider === 'openai' ? 'codex' : 'claude';
  if (launchTool === 'codex') {
    spawnSync('codex', [input], { stdio: 'inherit' });
  } else {
    spawnSync('claude', ['-p', input], { stdio: 'inherit' });
  }

  // After session ends, capture the most-recent session ID so [c] can resume it
  const freshSessions = importReplitSessions(cwd);
  if (freshSessions.length > 0) {
    saveTerminalState(cwd, getTerminalId(), freshSessions[0].id, launchTool);
  }

  return { next: 'main' };
}

// ─── Screen: importPickerScreen ──────────────────────────────────────────────

async function importPickerScreen() {
  const cwd = process.cwd();

  // Load all available sessions from data-tools
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
    process.stdout.write(row('Import from data-tools') + '\n');
    process.stdout.write(sep + '\n');
    process.stdout.write(row('No data-tools sessions found.') + '\n');
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
    process.stdout.write(row('Import from data-tools') + '\n');
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

    const headerTitle = 'Import from data-tools';
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

  process.stdout.write(`✓ Imported ${importCount} session${importCount !== 1 ? 's' : ''} from data-tools\n\n`);

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

  // Box layout matching dashboard
  const termW = process.stdout.columns || 60;
  const boxW  = Math.min(termW - 2, 60);
  const W     = boxW - 4;

  const top = `┌${'─'.repeat(boxW - 2)}┐`;
  const sep = `├${'─'.repeat(boxW - 2)}┤`;
  const bot = `└${'─'.repeat(boxW - 2)}┘`;
  const row = (content) => makeBoxRow(content, W);

  // Detect if gh is available + has PRs for the PR triage option
  const settingsPRs = await detectOpenPRs(cwd);

  // Load current work style
  const profile = loadProfile(cwd);
  const currentBias = profile?.bias || profile?.mode || 'balanced';
  const WORK_STYLE_DISPLAY = {
    'cost-saver':    '⚡ Fast',
    'auto':          '⚡ Fast',
    'solo-claude':   '⚡ Fast',
    'solo-openai':   '⚡ Fast',
    'balanced':      '⚖️  Balanced',
    'quality-first': '🔥 Full Power',
  };
  const workStyleLabel = WORK_STYLE_DISPLAY[currentBias] || '⚖️  Balanced';

  const lines = [
    top,
    row('Settings'),
    sep,
    row(`[w] Work Style: ${workStyleLabel}`),
    row('[m] Manage subscriptions'),
    row('[e] Manage sessions'),
    row('[i] Import from replit-tools'),
    row('[d] Switch to data-tools'),
    row('[?] Help & shortcuts'),
    row('[x] Diagnostics'),
    ...(settingsPRs.length > 0 ? [row(`[p] PR triage (${settingsPRs.length} open)`)] : []),
    row(''),
    row('[Esc/b] Back to dashboard'),
    bot,
  ];
  process.stdout.write('\n' + lines.join('\n') + '\n\n');

  const raw    = (await ask('  Choice: ')).trim();
  const choice = raw.toLowerCase();

  if (choice === 'w') {
    // Work style picker
    const wsTop = `  ┌${'─'.repeat(51)}┐`;
    const wsSep = `  ├${'─'.repeat(51)}┤`;
    const wsBot = `  └${'─'.repeat(51)}┘`;
    const wsPad = (s) => {
      const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
      let vlen = 0;
      for (const ch of plain) {
        const cp = ch.codePointAt(0);
        if (
          (cp >= 0x1f300 && cp <= 0x1faff) ||
          (cp >= 0x2600  && cp <= 0x27bf)  ||
          cp === 0xfe0f || cp === 0x20e3
        ) { vlen += 2; } else { vlen += 1; }
      }
      return s + ' '.repeat(Math.max(0, 51 - vlen));
    };
    const wsRow = (s) => `  │ ${wsPad(s)}│`;

    const isFast  = currentBias === 'cost-saver' || currentBias === 'auto' || currentBias === 'solo-claude' || currentBias === 'solo-openai';
    const isBal   = currentBias === 'balanced';
    const isFull  = currentBias === 'quality-first';

    console.log('');
    console.log(wsTop);
    console.log(wsRow('Work Style'));
    console.log(wsSep);
    console.log(wsRow(`  1. ⚡ Fast      — quick, single model${isFast  ? '  ← current' : ''}`));
    console.log(wsRow(`  2. ⚖️  Balanced  — smart routing${isBal   ? '  ← current' : ''}`));
    console.log(wsRow(`  3. 🔥 Full Power — dual-brain everything${isFull  ? '  ← current' : ''}`));
    console.log(wsSep);
    console.log(wsRow('[Enter] Keep current'));
    console.log(wsBot);
    console.log('');

    const wsChoice = (await ask('  Choice [1/2/3/Enter]: ')).trim();
    const wsMap = { '1': 'cost-saver', '2': 'balanced', '3': 'quality-first' };
    const newBias = wsMap[wsChoice];
    if (newBias && newBias !== currentBias) {
      profile.bias = newBias;
      const enabledCount = [
        profile.providers?.claude?.enabled,
        profile.providers?.openai?.enabled,
      ].filter(Boolean).length;
      if (enabledCount >= 2) profile.mode = newBias;
      saveProfile(profile, { cwd });
      const newLabel = WORK_STYLE_DISPLAY[newBias] || newBias;
      console.log(`\n  ✓ Work style set to ${newLabel}\n`);
      await ask('  Press Enter to continue...');
    }
    return { next: 'settings' };
  }

  if (choice === 'm') { return { next: 'subscriptions' }; }

  if (choice === 'e') { return { next: 'sessions' }; }

  if (choice === 'i') {
    return { next: 'import-picker' };
  }

  if (choice === 'p' && settingsPRs.length > 0) {
    return { next: 'pr-triage', openPRs: settingsPRs };
  }

  if (choice === 'd') {
    const { spawnSync } = await import('node:child_process');
    const which = spawnSync('which', ['claude-menu'], { encoding: 'utf8' });
    if (which.status === 0) {
      spawnSync('claude-menu', { stdio: 'inherit' });
    } else {
      process.stdout.write('\n  data-tools not found — install with: npm i -g replit-tools\n\n');
      await ask('  Press Enter to continue...');
    }
    return { next: 'settings' };
  }

  if (choice === '?') {
    const W2 = 37;
    const helpTop    = `  ┌${'─'.repeat(W2)}┐`;
    const helpSep    = `  ├${'─'.repeat(W2)}┤`;
    const helpBottom = `  └${'─'.repeat(W2)}┘`;
    const helpPad    = (s) => s + ' '.repeat(Math.max(0, W2 - s.length));
    process.stdout.write('\n');
    process.stdout.write(helpTop + '\n');
    process.stdout.write(`  │ ${helpPad('At ~/workspace$ prompt:')}│\n`);
    process.stdout.write(`  │ ${helpPad('db = show this menu')}│\n`);
    process.stdout.write(`  │ ${helpPad('j  = login to claude')}│\n`);
    process.stdout.write(`  │ ${helpPad('k  = login to codex')}│\n`);
    process.stdout.write(helpSep + '\n');
    process.stdout.write(`  │ ${helpPad('In Claude:')}│\n`);
    process.stdout.write(`  │ ${helpPad('Ctrl+C x2 = back to menu')}│\n`);
    process.stdout.write(`  │ ${helpPad('Ctrl+C x3 = exit to shell')}│\n`);
    process.stdout.write(helpBottom + '\n\n');
    await ask('  Press Enter to continue...');
    return { next: 'settings' };
  }

  if (choice === 'x') { return { next: 'diagnostics' }; }

  if (choice === 'b' || choice === 'back' || raw === '\x1b') { return { next: 'main' }; }

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
 * Streamlined onboarding: auto-detect capabilities, ask ONE question (work style).
 * Replaces the old 5-step wizard with a ~5-second, one-choice flow.
 * @param {{ auth, plans, existingSessions }} detection
 * @param {string} cwd
 * @param {object} rl  readline interface
 * @returns {object|null}  profile object to save, or null if cancelled/skipped
 */
async function runOnboardingWizard(_detection, cwd, rl) {
  const ask = (q) => new Promise(res => rl.question(q, res));
  const version = readVersion();

  // ── Rounded box helpers (matching mainScreen style) ────────────────────────
  const W = 51;
  const wTop    = `  ┌${'─'.repeat(W)}┐`;
  const wBottom = `  └${'─'.repeat(W)}┘`;
  const wPad = (s) => {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
    let vlen = 0;
    for (const ch of plain) {
      const cp = ch.codePointAt(0);
      if (
        (cp >= 0x1f300 && cp <= 0x1faff) ||
        (cp >= 0x2600  && cp <= 0x27bf)  ||
        cp === 0xfe0f || cp === 0x20e3
      ) { vlen += 2; } else { vlen += 1; }
    }
    return s + ' '.repeat(Math.max(0, W - vlen));
  };
  const wRow = (s) => `  │ ${wPad(s)}│`;

  // ── Use detectCapabilities for broad detection (env vars, ~/.claude, CLI) ──
  const caps = await detectCapabilities(cwd);
  const claudeReady    = caps.claude.available;
  const openaiReady    = caps.openai.available;
  const codexAvailable = caps.codex.available;

  // ── Detect replit-tools ────────────────────────────────────────────────────
  const rt = detectReplitTools(cwd);

  const GREEN = '\x1b[32m✓\x1b[0m';
  const RED   = '\x1b[31m✗\x1b[0m';
  const DIM   = '\x1b[2m';
  const RESET = '\x1b[0m';

  // ══════════════════════════════════════════════════════════════════════════
  // Step 1 — Auto-detect capabilities (instant, no spinner)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wRow(claudeReady
    ? `${GREEN} Claude Code`
    : `${RED} Claude Code — not found`));
  console.log(wRow(openaiReady
    ? `${GREEN} OpenAI API`
    : codexAvailable
      ? `${GREEN} OpenAI / Codex CLI`
      : `${DIM}○ OpenAI — not configured${RESET}`));
  console.log(wRow(rt.installed
    ? `${GREEN} replit-tools`
    : `${DIM}○ replit-tools — not found${RESET}`));
  console.log(wBottom);

  // ── Edge cases: communicate honestly, but always let them proceed ──────────
  console.log('');
  if (!claudeReady && !openaiReady && !codexAvailable) {
    console.log('  No AI providers detected — configure OPENAI_API_KEY or use');
    console.log('  within Claude Code. You can still continue and set up later.');
    console.log('');
  } else if (claudeReady && !openaiReady && !codexAvailable) {
    console.log(`  ${DIM}Tip: Add OPENAI_API_KEY for dual-brain collaboration${RESET}`);
    console.log('');
  } else if (!claudeReady && (openaiReady || codexAvailable)) {
    console.log(`  ${DIM}Note: Use within Claude Code for full dual-brain${RESET}`);
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2 — ONE question: work style
  // ══════════════════════════════════════════════════════════════════════════
  console.log(wTop);
  console.log(wRow('How do you want to work?'));
  console.log(wRow(''));
  console.log(wRow('  1  ⚡ Fast       — single model, quick tasks, skip reviews'));
  console.log(wRow('  2  ⚖️  Balanced   — smart routing, reviews on important changes'));
  console.log(wRow('  3  🔥 Full Power  — deep reasoning, dual-brain when it matters'));
  console.log(wBottom);
  console.log('');

  const styleChoice = (await ask('  Choice [2]: ')).trim();
  const styleMap   = { '1': 'cost-saver', '2': 'balanced', '3': 'quality-first' };
  const styleNames = { 'cost-saver': 'Fast', 'balanced': 'Balanced', 'quality-first': 'Full Power' };
  const chosenBias = styleMap[styleChoice] || 'balanced';
  const chosenName = styleNames[chosenBias];

  // ── Non-blocking note if metered API detected ──────────────────────────────
  if (openaiReady && caps.openai.metered) {
    console.log(`  ${DIM}OpenAI API key detected — usage is metered, guardrails enabled${RESET}`);
    console.log('');
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(wTop);
  console.log(wRow(`${GREEN} Ready — ${chosenName} mode`));
  console.log(wRow(`  Type a task to start, or press Enter for dashboard`));
  console.log(wBottom);
  console.log('');

  // ── Build and return the profile object ────────────────────────────────────
  const finalProfile = loadProfile(cwd);

  finalProfile.providers.claude = { enabled: claudeReady };
  finalProfile.providers.openai = { enabled: openaiReady || codexAvailable };
  finalProfile.apiGuardrail     = caps.openai.metered;

  const enabledCount = [claudeReady, openaiReady || codexAvailable].filter(Boolean).length;
  finalProfile.mode      = enabledCount >= 2 ? 'dual' : claudeReady ? 'solo-claude' : 'solo-openai';
  finalProfile.bias      = chosenBias;
  finalProfile.workStyle = chosenBias;

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
      : `  not logged in — run: claude auth login`,
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
    console.log('  [c] Continue this session (claude --continue)');
  } else {
    console.log('  [r] Resume this session (claude --resume)');
  }
  console.log('  [b] Back to dashboard');
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'c' || choice === 'r') {
    console.log(`\n  Launching: claude --resume ${sess.id}\n`);
    try {
      const { spawnSync } = await import('node:child_process');
      spawnSync('claude', ['--resume', sess.id], { stdio: 'inherit' });
    } catch {
      console.log('  Could not launch claude CLI. Run manually:');
      console.log(`    claude --resume ${sess.id}`);
    }
    return { next: 'dashboard' };
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
    process.stdout.write(makeBoxRow('↑↓ Navigate  Enter Resume  x Archive  r Rename', W) + '\n');
    process.stdout.write(makeBoxRow('q Back', W) + '\n');
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
        process.stdout.write(`\n  Launching: claude --resume ${sess.id}\n\n`);
        const { spawnSync } = await import('node:child_process');
        spawnSync('claude', ['--resume', sess.id], { stdio: 'inherit' });
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
    console.log(`\n  Launching: claude --resume ${sess.id}\n`);
    spawnSync('claude', ['--resume', sess.id], { stdio: 'inherit' });
    return { next: 'sessions' };
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
  settings:         settingsScreen,
  'import-picker':  importPickerScreen,
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
    // Handle type-to-start dispatch from mainScreen
    if (current === 'go' && ctx.prompt) {
      const prompt = ctx.prompt;
      const cwd    = process.cwd();
      const profile   = loadProfile(cwd);
      const detection = detectTask({ prompt });
      const decision  = decideRoute({ profile, detection, cwd });
      process.stdout.write(`\n  Routing: ${decision.provider}/${decision.model} (${decision.tier})\n`);
      process.stdout.write(`  Reason: ${decision.explanation}\n\n`);
      const { spawnSync } = await import('node:child_process');
      const launchTool = decision.provider === 'openai' ? 'codex' : 'claude';
      if (launchTool === 'codex') {
        spawnSync('codex', [prompt], { stdio: 'inherit' });
      } else {
        spawnSync('claude', ['-p', prompt], { stdio: 'inherit' });
      }
      const freshSessions = importReplitSessions(cwd);
      if (freshSessions.length > 0) {
        saveTerminalState(cwd, getTerminalId(), freshSessions[0].id, launchTool);
      }
      await offerAutoCommit(cwd);
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
          : result?.prompt    ? { prompt: result.prompt }
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
  const args = process.argv.slice(2);
  const cmd  = args[0];

  if (cmd === '--help' || cmd === '-h') { printHelp(); return; }
  if (cmd === '--version' || cmd === '-v') { console.log(readVersion()); return; }

  // Interactive-only commands: enter screen state machine (only when TTY)
  const isInteractive = process.stdin.isTTY;

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
          console.log('\n  ✅ Setup complete! Starting dual-brain...\n');
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
        console.log('\n  ✅ Setup complete! Starting dual-brain...\n');
      }
      rl.close();
      await runScreens('main');
    } else {
      await cmdInit();
    }
    return;
  }

  // One-shot commands — run and exit
  if (cmd === 'install')  { await cmdInstall(); return; }
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
  if (cmd === 'status')   { await cmdStatus(args.slice(1)); return; }
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

    const { searchSessions, buildSessionIndex } = await import('../src/session.mjs');
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
    'init', 'install', 'auth', 'go', 'do', 'plan', 'ship', 'think', 'review', 'status', 'hot', 'cool',
    'remember', 'forget', 'break-glass', 'specialists', 'search', 'shell-hook', 'watch',
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
