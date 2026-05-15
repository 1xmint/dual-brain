#!/usr/bin/env node
// dual-brain — CLI entry point. Commands: init, go, status, remember, forget

import { appendFileSync, existsSync, readFileSync, mkdirSync, writeFileSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync as _spawnSyncTop } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  ensureProfile, loadProfile, saveProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectAuth, detectEnvironment, detectPlans,
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

import { loadRepoCache } from '../src/repo.mjs';
import { loadSession, saveSession, formatSessionCard, importReplitSessions, getSessionMeta, saveSessionMeta, renameSession, pinSession, unpinSession, categorizeSession, enrichSessions, archiveSession, getArchivedSessions } from '../src/session.mjs';

import { box, bar, badge, menu, separator } from '../src/tui.mjs';

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
  init                      First-time setup → flows into interactive REPL
  auth                      Show subscription and login status
  install                   Install Claude Code hooks into the current project
  go "task description"     Detect → decide → dispatch a task
    --dry-run               Show routing decision without executing
    --files a.mjs,b.mjs     Provide file context for risk classification
    --verbose, -v           Print routing trace (intent, risk, health, model selection)
  status                    Provider health, session stats, available models
    --verbose, -v           Also print profile file path and raw profile object
  hot <provider>            Manually mark all model classes for provider as hot
  cool <provider>           Manually clear hot state for a provider
  remember "preference"     Save a project-scoped preference
  forget "preference"       Remove a preference by fuzzy match
  search "keyword"           Search across all sessions
  specialists               List available specialist agents with descriptions
  python "task"             Force Python specialist for the task
  typescript "task"         Force TypeScript specialist for the task
  html "task"               Force HTML/CSS specialist for the task
  linux "task"              Force Linux/DevOps specialist for the task
  security "task"           Force Security specialist for the task
    --dry-run               (specialist commands) Show routing without executing
    --files a,b             (specialist commands) Provide file context
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
 * Print a subscription status table to stdout.
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
    ? ({ pro: 'Pro ($20/mo)', max5: 'Max x5 ($100/mo)', max20: 'Max x20 ($200/mo)', '$20': 'Pro ($20/mo)', '$100': 'Max x5 ($100/mo)', '$200': 'Max x20 ($200/mo)' }[claudeSub.plan] ?? claudeSub.plan)
    : 'disabled';
  const openaiPlanLabel = openaiSub?.enabled
    ? ({ plus: 'Plus ($20/mo)', pro: 'Pro ($100/mo)', pro100: 'Pro ($100/mo)', pro200: 'Pro ($200/mo)', '$20': 'Plus ($20/mo)', '$100': 'Pro ($100/mo)', '$200': 'Pro ($200/mo)' }[openaiSub.plan] ?? openaiSub.plan)
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
  console.log(`║${pad('  Subscription Status')}║`);
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
 * Show subscription status (replaces old API key auth display).
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

async function cmdGo(args) {
  const dryRun  = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const filesRaw = flag(args, '--files');
  const files   = filesRaw && typeof filesRaw === 'string'
    ? filesRaw.split(',').map(f => f.trim()).filter(Boolean)
    : [];

  // prompt is the first non-flag argument (or value after --dry-run which is boolean)
  const prompt = args.find(a => !a.startsWith('--') && !a.startsWith('-') && a !== (filesRaw ?? ''));
  if (!prompt) err('Usage: dual-brain go "task description" [--dry-run] [--files a,b] [--verbose]');

  const cwd     = process.cwd();
  const profile = await ensureProfile(cwd);
  const detection = detectTask({ prompt, files });

  // Print the one-sentence classification
  console.log(detection.explanation);

  // Verbose: emit detection trace before routing decision
  if (verbose) {
    vtrace(`Intent: ${detection.intent} | Risk: ${detection.risk} | Complexity: ${detection.complexity} | Effort: ${detection.effort ?? 'n/a'}`);
    vtrace(`Tier: ${detection.tier} | Files: ${detection.fileCount ?? files.length} | Requires write: ${detection.requiresWrite}`);
  }

  // Verbose: emit provider health scores before dispatch
  if (verbose) {
    const providers = getAvailableProviders(profile);
    const { states } = getHealth(cwd);
    const providerScores = ['claude', 'openai'].map(name => {
      const enabled = providers.some(p => p.name === name);
      if (!enabled) return `${name}=unavailable`;
      // Find any state entry for this provider
      const statuses = Object.entries(states)
        .filter(([k]) => k.startsWith(`${name}:`))
        .map(([, v]) => v.status);
      const worst = statuses.includes('hot') ? 'hot'
        : statuses.includes('probing') ? 'probing'
        : statuses.includes('degraded') ? 'degraded'
        : 'healthy';
      return `${name}=${worst}`;
    }).join(' ');
    vtrace(`Provider health: ${providerScores}`);
  }

  const decision = decideRoute({ profile, detection, cwd });

  // Verbose: emit model selection and dual-brain rationale
  if (verbose) {
    const modelLabel = decision.effort ? `${decision.model} (${decision.effort})` : decision.model;
    const modelStatus = getAvailableModels(profile)[decision.provider]?.includes(decision.model)
      ? 'available, matches tier'
      : 'selected';
    vtrace(`Model selection: ${modelLabel} (${modelStatus})`);
    vtrace(`Dual-brain: ${decision.dualBrain ? 'yes' : 'no'} (${isSoloBrain(profile) ? 'solo provider' : 'dual provider'}, ${detection.risk} risk)`);
  }

  // Print routing table
  console.log(`  provider   : ${decision.provider}`);
  console.log(`  model      : ${decision.model}${decision.effort ? ' (' + decision.effort + ')' : ''}`);
  console.log(`  tier       : ${decision.tier}`);
  console.log(`  dual-brain : ${decision.dualBrain ? 'yes' : 'no'}`);
  console.log(`  reason     : ${decision.explanation}`);

  if (dryRun) {
    console.log('\n(dry-run — not executing)');
    return;
  }

  console.log('\nDispatching...');
  let result;
  if (decision.dualBrain) {
    result = await dispatchDualBrain({ decision, prompt, files, cwd });
    console.log(`\nConsensus: ${result.consensus}`);
    if (result.claude?.summary) console.log(`Claude : ${result.claude.summary}`);
    if (result.openai?.summary) console.log(`OpenAI : ${result.openai.summary}`);
    // Save session state
    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain go "${prompt}"`],
      lastResult:   { status: 'success', summary: result.consensus || 'dual-brain complete' },
      provider:     decision.provider,
      nextAction:   null,
    }, cwd);
  } else {
    result = await dispatch({ decision, prompt, files, cwd });
    const statusLine = result.status === 'completed' ? 'Done' : `Failed (exit ${result.exitCode})`;
    console.log(`\n${statusLine} in ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.summary) console.log(result.summary);
    if (result.error)   process.stderr.write(`${result.error}\n`);
    // Save session state regardless of success/failure
    saveSession({
      objective:    prompt,
      branch:       null,
      filesChanged: files,
      commandsRun:  [`dual-brain go "${prompt}"`],
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

      if (provStates.length === 0) {
        console.log(`  ${label}  plan=${p.plan}  status=healthy  calls=${sess.calls}  tokens=${sess.tokens}`);
      } else {
        for (const [k, st] of provStates) {
          const modelClass = k.split(':').slice(1).join(':');
          let statusStr = st.status;
          if (st.status === 'hot') {
            const remaining = remainingCooldownMinutes(p.name, modelClass, cwd);
            statusStr = remaining > 0 ? `hot (retry in ${remaining}m)` : 'hot (cooling)';
          }
          console.log(`  ${label}  plan=${p.plan}  model=${modelClass}  status=${statusStr}  calls=${sess.calls}  tokens=${sess.tokens}`);
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
  pro:   'Pro ($20/mo)',
  max5:  'Max x5 ($100/mo)',
  max20: 'Max x20 ($200/mo)',
  '$20':  'Pro ($20/mo)',
  '$100': 'Max x5 ($100/mo)',
  '$200': 'Max x20 ($200/mo)',
};
const OPENAI_PLAN_LABELS = {
  plus:   'Plus ($20/mo)',
  pro:    'Pro ($100/mo)',
  pro100: 'Pro ($100/mo)',
  pro200: 'Pro ($200/mo)',
  '$20':  'Plus ($20/mo)',
  '$100': 'Pro ($100/mo)',
  '$200': 'Pro ($200/mo)',
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
  console.log('  [c]     Customize plan tier');
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
    console.log(separator('Claude subscription'));
    console.log('  (1) Pro ($20/mo)');
    console.log('  (2) Max x5 ($100/mo)');
    console.log('  (3) Max x20 ($200/mo)');
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
    console.log(separator('OpenAI subscription'));
    console.log('  (1) Plus ($20/mo)');
    console.log('  (2) Pro ($100/mo)');
    console.log('  (3) Pro ($200/mo higher limits)');
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
  console.log('  Team auth: label subscriptions and set expiry for auto-refresh.');
  console.log('  When a subscription expires, dual-brain will prompt re-login automatically.');
  console.log('');
  console.log('  [Enter] Skip   [t] Set up team auth');
  const teamChoice = (await ask('  Choice: ')).trim().toLowerCase();
  if (teamChoice === 't') {
    for (const provider of ['claude', 'openai']) {
      if (!existingProfile.providers[provider]?.enabled) continue;
      const provLabel = provider === 'claude' ? 'Claude' : 'OpenAI';
      const label = (await ask(`  ${provLabel} label (e.g. "Josh's $100 sub"): `)).trim();
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

// ─── Dashboard box helpers ────────────────────────────────────────────────────

/**
 * Build a provider status string for the dashboard status line.
 * Returns a string like: "🟢 Claude $100×2 $20×1  🟢 OpenAI $100"
 * Uses ANSI color codes for the dots (no emoji width issues).
 */
function buildProviderStatusLine(profile, auth) {
  const GREEN = '\x1b[32m●\x1b[0m';
  const RED   = '\x1b[31m●\x1b[0m';
  const now   = Date.now();

  function providerSegment(provKey, displayName) {
    const sub    = profile?.providers?.[provKey];
    const found  = provKey === 'claude' ? auth.claude.found : auth.openai.found;
    if (!found) return `${RED} ${displayName}: not connected`;

    const expired = sub?.expiresAt && Date.parse(sub.expiresAt) < now;
    if (expired)  return `${RED} ${displayName}: expired`;

    const dot = GREEN;
    // Multi-sub: show aggregated plan amounts
    const subs = sub?.subs;
    if (subs && subs.length > 0) {
      const agg = aggregatePlans(subs);
      return `${dot} ${displayName} ${agg}`;
    }
    // Single plan
    const planPrice = PLAN_PRICES[sub?.plan] || sub?.plan || 'connected';
    return `${dot} ${displayName} ${planPrice}`;
  }

  const parts = [];
  parts.push(providerSegment('claude', 'Claude'));
  parts.push(providerSegment('openai', 'OpenAI'));
  return parts.join('  ');
}

/**
 * Render a box row padded to inner width W (stripping ANSI for length calculation).
 * Returns a string like: "│ content padded to W │"
 */
function makeBoxRow(content, W) {
  const plain = content.replace(/\x1b\[[0-9;]*m/g, '');
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

  // ── Status section ────────────────────────────────────────────────────────
  const providerLine = buildProviderStatusLine(profile, auth);

  const statusRows = [row(providerLine)];
  if (dtVersion) {
    statusRows.push(row(`\x1b[2m📦 data-tools v${dtVersion}\x1b[0m`));
  }

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
      if (sess.source === 'replit-tools' || sess.source === 'data-tools') {
        badges.push('\x1b[36m[dt]\x1b[0m');
        badgeVisible.push('[dt]'.length);
      }
      const ageMs = sess.lastActive ? Date.now() - new Date(sess.lastActive).getTime() : 0;
      if (ageMs > 7 * 24 * 3600 * 1000) {
        badges.push('\x1b[2m[stale]\x1b[0m');
        badgeVisible.push('[stale]'.length);
      }
      const msgCount    = sess.messageCount ?? sess.promptCount ?? 0;
      const msgBadge    = `\x1b[2m(${msgCount})\x1b[0m`;
      const msgBadgeW   = `(${msgCount})`.length;

      const badgeStr = badges.join('');
      const badgesW  = badgeVisible.reduce((s, n) => s + n, 0);

      // Layout: "{num}  {name...}{badges}  {age}  {msg}"
      const numStr  = String(i + 1);
      const ageStr  = sess.age || '';
      // Available for name: W minus fixed chrome, badge widths, and msg badge
      const nameMax = W - numStr.length - 2 - badgesW - 2 - ageStr.length - 2 - msgBadgeW;
      const truncName = rawName.length > nameMax
        ? rawName.slice(0, Math.max(0, nameMax - 3)) + '...'
        : rawName.padEnd(nameMax);
      const content = `${numStr}  ${truncName}${badgeStr}  ${ageStr}  ${msgBadge}`;
      sessionRows.push(row(content));
    });
  }

  // ── Actions bar ───────────────────────────────────────────────────────────
  const actionsContent = '↵ Resume  n New  / Search  i Import  s Settings  q Quit';
  const actionsRow     = row(actionsContent);

  // ── Print the full box ────────────────────────────────────────────────────
  const lines = [
    top,
    ...statusRows,
    sep,
    ...sessionRows,
    sep,
    actionsRow,
    bot,
  ];
  // ── Stale session hint ──────────────────────────────────────────────────
  if (staleCount >= 3) {
    process.stdout.write(`\x1b[2m${staleCount} stale sessions (>7d) — press s → archive to clean up\x1b[0m\n`);
  }

  process.stdout.write(lines.join('\n') + '\n');
  process.stdout.write(`\x1b[2mPowered by data-tools · Steve Moraco\x1b[0m\n\n`);

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
        if (lower === 'n' || lower === 's' || lower === 'q' || lower === '/' || lower === 'i') {
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

  if (choice === 's') { return { next: 'settings' }; }
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

  const lines = [
    top,
    row('Settings'),
    sep,
    row('[m] Manage subscriptions'),
    row('[e] Manage sessions'),
    row('[i] Import from replit-tools'),
    row('[d] Switch to data-tools'),
    row('[?] Help & shortcuts'),
    row('[x] Diagnostics'),
    row(''),
    row('[Esc/b] Back to dashboard'),
    bot,
  ];
  process.stdout.write('\n' + lines.join('\n') + '\n\n');

  const raw    = (await ask('  Choice: ')).trim();
  const choice = raw.toLowerCase();

  if (choice === 'm') { return { next: 'subscriptions' }; }

  if (choice === 'e') { return { next: 'sessions' }; }

  if (choice === 'i') {
    return { next: 'import-picker' };
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

const PLAN_PRICES = {
  pro: '$20', max5: '$100', max20: '$200',
  plus: '$20', pro100: '$100', pro200: '$200',
};

function aggregatePlans(subs) {
  if (!subs || subs.length === 0) return '';
  const counts = {};
  for (const s of subs) {
    const price = PLAN_PRICES[s.plan] || s.plan;
    counts[price] = (counts[price] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => parseInt(b[0].slice(1)) - parseInt(a[0].slice(1)))
    .map(([price, count]) => `${price}×${count}`)
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
    console.log('\n  Linking Claude subscription...');
    console.log('  A browser window will open — paste the code below when prompted.\n');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('claude', ['auth', 'login'], { stdio: 'inherit', timeout: 60000 });
    if (r.status === 0) {
      console.log('\n  ✅ Claude linked successfully!\n');
      const label = (await ask("  Label (e.g. \"Josh's $100 sub\", or Enter to skip): ")).trim();
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
    console.log('\n  Linking Codex subscription...');
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
      console.log('\n  No subscriptions to remove.\n');
      await ask('  Press Enter to continue...');
      return { next: 'subscriptions' };
    }

    console.log('\n  Remove a subscription:\n');
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
 * 5-step onboarding wizard shown on first run (no .dualbrain/profile.json).
 * Matches the rounded ┌─┐ box style used in mainScreen / renderHeader.
 * @param {{ auth, plans, existingSessions }} detection
 * @param {string} cwd
 * @param {object} rl  readline interface
 * @returns {object|null}  profile object to save, or null if cancelled/skipped
 */
async function runOnboardingWizard(detection, cwd, rl) {
  const ask = (q) => new Promise(res => rl.question(q, res));
  const version = readVersion();

  // ── Rounded box helpers (matching mainScreen style) ────────────────────────
  const W = 51;
  const wTop    = `  ┌${'─'.repeat(W)}┐`;
  const wSep    = `  ├${'─'.repeat(W)}┤`;
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

  // ── Collected wizard state ─────────────────────────────────────────────────
  const state = {
    claudePlan:     null,
    openaiPlan:     null,
    headModel:      null,
    importSessions: false,
    profile:        'auto',
  };

  const { auth, plans, existingSessions } = detection;
  const claudeReady = auth.claude.found;
  const openaiReady = auth.openai.found;

  // ══════════════════════════════════════════════════════════════════════════
  // Step 1 — Welcome & provider detection
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wSep);
  console.log(wRow(`Step 1 of 5: Detected providers`));
  console.log(wSep);

  // Plan tier is inferred from auth config signals — not the actual plan name.
  // Show the tier ($20/$100/$200) with "configured" suffix to be honest.
  const claudePlanSuffix = claudeReady && plans.claude ? ` · ${plans.claude} configured` : '';
  const openaiPlanSuffix = openaiReady && plans.openai ? ` · ${plans.openai} configured` : '';

  console.log(wRow(claudeReady
    ? `✓ Claude CLI${claudePlanSuffix}`
    : `✗ Claude CLI  not logged in`));
  console.log(wRow(openaiReady
    ? `✓ Codex CLI${openaiPlanSuffix}`
    : `✗ Codex CLI   not logged in`));
  if (existingSessions.length > 0) {
    console.log(wRow(`✓ ${existingSessions.length} data-tools session${existingSessions.length !== 1 ? 's' : ''} found`));
  }
  console.log(wSep);
  console.log(wRow(`[Enter] Continue setup   [s] Skip wizard`));
  console.log(wBottom);
  console.log('');

  if (!claudeReady && !openaiReady) {
    console.log('  No AI provider found. Log in first:');
    console.log('    claude auth login   — for Claude');
    console.log('    codex login         — for OpenAI/Codex');
    console.log('  Then re-run: dual-brain init\n');
    return null;
  }

  const step1 = (await ask('  > ')).trim().toLowerCase();
  if (step1 === 's') {
    // Skip: auto-save detected plans and proceed directly
    const skippedProfile = loadProfile(cwd);
    if (claudeReady) skippedProfile.providers.claude = { enabled: true, plan: plans.claude || 'pro' };
    if (openaiReady) skippedProfile.providers.openai = { enabled: true, plan: plans.openai || 'plus' };
    const enabledCount = [claudeReady, openaiReady].filter(Boolean).length;
    skippedProfile.mode = enabledCount >= 2 ? 'auto' : claudeReady ? 'solo-claude' : 'solo-openai';
    return skippedProfile;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Step 2 — Budget / plan selection
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wSep);
  console.log(wRow(`Step 2 of 5: Subscription plans`));
  console.log(wSep);

  if (claudeReady) {
    // Plan tier is inferred from auth config (rate-limit signal), not the actual plan name.
    const configuredClaudePlan = plans.claude || '$20';
    const configuredClaudeDesc = configuredClaudePlan + ' configured';
    console.log(wRow(`Claude — ${configuredClaudeDesc}`));
    console.log(wRow(`  [1] Pro ($20/mo)`));
    console.log(wRow(`  [2] Max x5 ($100/mo)`));
    console.log(wRow(`  [3] Max x20 ($200/mo)`));
    console.log(wRow(`  [Enter] Keep configured (${configuredClaudePlan})`));
    console.log(wSep);
    const claudeChoice = (await ask('  Claude plan [1/2/3/Enter]: ')).trim();
    const claudePlanMap = { '1': 'pro', '2': 'max5', '3': 'max20' };
    state.claudePlan = claudePlanMap[claudeChoice] || configuredClaudePlan;
  }

  if (openaiReady) {
    // Plan tier is inferred from JWT claim in auth config, not the actual plan name.
    const configuredOpenaiPlan = plans.openai || '$20';
    const configuredOpenaiDesc = configuredOpenaiPlan + ' configured';
    console.log(wRow(`OpenAI — ${configuredOpenaiDesc}`));
    console.log(wRow(`  [1] Plus ($20/mo)`));
    console.log(wRow(`  [2] Pro ($100/mo)`));
    console.log(wRow(`  [3] Pro ($200/mo higher limits)`));
    console.log(wRow(`  [Enter] Keep configured (${configuredOpenaiPlan})`));
    console.log(wSep);
    const openaiChoice = (await ask('  OpenAI plan [1/2/3/Enter]: ')).trim();
    const openaiPlanMap = { '1': 'plus', '2': 'pro', '3': 'pro200' };
    state.openaiPlan = openaiPlanMap[openaiChoice] || configuredOpenaiPlan;
  }

  console.log(wBottom);

  // ══════════════════════════════════════════════════════════════════════════
  // Step 3 — HEAD model selection
  // ══════════════════════════════════════════════════════════════════════════
  const hasBigPlan = state.claudePlan === 'max5' || state.claudePlan === 'max20';
  const recommendedModel = hasBigPlan ? 'claude-opus-4-5' : 'claude-sonnet-4-5';
  const recommendedLabel = hasBigPlan
    ? 'Opus (Max plan — best quality)'
    : 'Sonnet (Pro plan — balanced speed/quality)';

  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wSep);
  console.log(wRow(`Step 3 of 5: HEAD model (think-tier)`));
  console.log(wSep);
  console.log(wRow(`Recommended: ${recommendedLabel}`));
  console.log(wSep);
  console.log(wRow(`  [1] Haiku   — fastest, lowest cost`));
  console.log(wRow(`  [2] Sonnet  — balanced (recommended for Pro)`));
  console.log(wRow(`  [3] Opus    — best quality (recommended for Max)`));
  console.log(wRow(`  [Enter] Use recommended`));
  console.log(wBottom);
  console.log('');

  const step3 = (await ask('  HEAD model [1/2/3/Enter]: ')).trim();
  const modelMap = {
    '1': 'claude-haiku-4-5',
    '2': 'claude-sonnet-4-5',
    '3': 'claude-opus-4-5',
  };
  state.headModel = modelMap[step3] || recommendedModel;

  // ══════════════════════════════════════════════════════════════════════════
  // Step 4 — Import sessions + profile selection
  // ══════════════════════════════════════════════════════════════════════════
  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wSep);
  console.log(wRow(`Step 4 of 5: Sessions & routing profile`));
  console.log(wSep);

  if (existingSessions.length > 0) {
    console.log(wRow(`Import ${existingSessions.length} data-tools session${existingSessions.length !== 1 ? 's' : ''}?`));
    console.log(wRow(`  [y] Yes   [Enter/n] Skip`));
    console.log(wSep);
    const importChoice = (await ask('  Import sessions [y/Enter]: ')).trim().toLowerCase();
    state.importSessions = importChoice === 'y';
    if (state.importSessions) {
      console.log('');
      console.log(`  Importing ${existingSessions.length} sessions...`);
      const recent = existingSessions.slice(0, 5);
      for (const sess of recent) {
        console.log(`  ${sess.age.padEnd(6)}  ${sess.name}`);
      }
      if (existingSessions.length > 5) {
        console.log(`  ... and ${existingSessions.length - 5} more`);
      }
    }
    console.log(wSep);
  }

  console.log(wRow(`Routing profile:`));
  console.log(wRow(`  [1] auto         — adapts based on task risk & outcomes`));
  console.log(wRow(`  [2] balanced     — best model per tier, normal budgets`));
  console.log(wRow(`  [3] cost-saver   — prefer cheaper models, skip GPT`));
  console.log(wRow(`  [4] quality-first — dual-brain for medium+ risk`));
  console.log(wRow(`  [Enter] auto (recommended)`));
  console.log(wBottom);
  console.log('');

  const step4 = (await ask('  Profile [1/2/3/4/Enter]: ')).trim();
  const profileMap = { '1': 'auto', '2': 'balanced', '3': 'cost-saver', '4': 'quality-first' };
  state.profile = profileMap[step4] || 'auto';

  // ══════════════════════════════════════════════════════════════════════════
  // Step 5 — Summary & confirm
  // ══════════════════════════════════════════════════════════════════════════
  const claudeSummary = state.claudePlan
    ? `Claude:     ${CLAUDE_PLAN_LABELS[state.claudePlan] ?? state.claudePlan}`
    : `Claude:     not configured`;
  const openaiSummary = state.openaiPlan
    ? `OpenAI:     ${OPENAI_PLAN_LABELS[state.openaiPlan] ?? state.openaiPlan}`
    : `OpenAI:     not configured`;
  const modelSummary   = `HEAD model: ${state.headModel}`;
  const profileSummary = `Profile:    ${state.profile}`;
  const sessionSummary = existingSessions.length > 0
    ? `Sessions:   ${state.importSessions ? `${existingSessions.length} imported` : 'skipped'}`
    : null;

  console.log('');
  console.log(wTop);
  console.log(wRow(`🧠 Dual-Brain v${version} — First-time Setup`));
  console.log(wSep);
  console.log(wRow(`Step 5 of 5: Summary`));
  console.log(wSep);
  console.log(wRow(claudeSummary));
  console.log(wRow(openaiSummary));
  console.log(wRow(modelSummary));
  console.log(wRow(profileSummary));
  if (sessionSummary) console.log(wRow(sessionSummary));
  console.log(wSep);
  console.log(wRow(`[Enter] Save and start   [q] Quit without saving`));
  console.log(wBottom);
  console.log('');

  const step5 = (await ask('  > ')).trim().toLowerCase();
  if (step5 === 'q') {
    console.log('\n  Setup cancelled.\n');
    return null;
  }

  // ── Build and return the profile object ────────────────────────────────────
  const finalProfile = loadProfile(cwd);

  if (state.claudePlan) {
    finalProfile.providers.claude = { enabled: true, plan: state.claudePlan };
  } else if (claudeReady) {
    finalProfile.providers.claude = { enabled: true, plan: plans.claude || 'pro' };
  }

  if (state.openaiPlan) {
    finalProfile.providers.openai = { enabled: true, plan: state.openaiPlan };
  } else if (openaiReady) {
    finalProfile.providers.openai = { enabled: true, plan: plans.openai || 'plus' };
  }

  const enabledCount = [
    finalProfile.providers?.claude?.enabled,
    finalProfile.providers?.openai?.enabled,
  ].filter(Boolean).length;

  finalProfile.mode = enabledCount >= 2 ? state.profile : claudeReady ? 'solo-claude' : 'solo-openai';
  finalProfile.headModel = state.headModel;
  finalProfile.bias = state.profile;

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

  console.log(box('Subscription Status', authLines));
  console.log('');
  console.log(menu([
    { key: 'a', label: 'Manage subscriptions', section: '' },
    { key: 'b', label: 'Back to dashboard',    section: '' },
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

// ─── Screen state machine ─────────────────────────────────────────────────────

const SCREENS = {
  welcome:          welcomeScreen,
  main:             mainScreen,
  'new-session':    newSessionScreen,
  settings:         settingsScreen,
  'import-picker':  importPickerScreen,
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
      current = 'main';
      ctx = {};
      continue;
    }

    const screen = SCREENS[current];
    if (!screen) break;
    try {
      const result = await screen(rl, ask, ctx);
      current = result?.next || 'exit';
      // Pass through context (e.g. selected session, typed prompt) to next screen
      ctx = result?.session ? { session: result.session }
          : result?.prompt  ? { prompt: result.prompt }
          : {};
    } catch (e) {
      console.error(`Error: ${e.message}`);
      current = 'main';
      ctx = {};
    }
  }
  rl.close();
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

  console.log(`  specialist : ${specialist}`);
  console.log(`  provider   : ${decision.provider}`);
  console.log(`  model      : ${decision.model}${decision.effort ? ' (' + decision.effort + ')' : ''}`);
  console.log(`  tier       : ${decision.tier}`);
  console.log(`  dual-brain : ${decision.dualBrain ? 'yes' : 'no'}`);
  console.log(`  reason     : ${decision.explanation}`);

  if (dryRun) {
    console.log('\n(dry-run — not executing)');
    return;
  }

  console.log('\nDispatching...');
  let result;
  if (decision.dualBrain) {
    result = await dispatchDualBrain({ decision, prompt, files, cwd });
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
    result = await dispatch({ decision, prompt, files, cwd });
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
        // First run: run the 5-step onboarding wizard, then go to main.
        process.stdout.write(`\ndual-brain v${readVersion()} — Setup\n\nDetecting your setup...\n`);
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
      // Non-TTY: print status card and exit
      const cwd = process.cwd();
      const repo    = loadRepoCache(cwd);
      const session = loadSession(cwd);
      const health  = getHealth(cwd);
      const card    = formatSessionCard(session, repo, health);
      console.log(card);
    }
    return;
  }

  if (cmd === 'init') {
    if (isInteractive) {
      // Run 5-step onboarding wizard then main screen
      const cwd = process.cwd();
      process.stdout.write(`\ndual-brain v${readVersion()} — Setup\n\nDetecting your setup...\n`);
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
  if (cmd === 'go')       { await cmdGo(args.slice(1)); return; }
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

  process.stderr.write(`Unknown command: ${cmd}\nRun "dual-brain --help" for usage.\n`);
  process.exit(1);
}

main().catch(e => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
