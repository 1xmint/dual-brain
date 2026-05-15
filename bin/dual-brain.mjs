#!/usr/bin/env node
// dual-brain — CLI entry point. Commands: init, go, status, remember, forget

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  ensureProfile, loadProfile, saveProfile, runOnboarding,
  rememberPreference, forgetPreference, getActivePreferences,
  getAvailableProviders, isSoloBrain, getHeadModel,
  detectAuth, detectEnvironment, setupAuth,
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
import { loadSession, saveSession, formatSessionCard, importReplitSessions } from '../src/session.mjs';

import { box, bar, badge, menu, separator } from '../src/tui.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH  = join(__dirname, '..', 'package.json');

function readVersion() {
  try { return JSON.parse(readFileSync(PKG_PATH, 'utf8')).version; } catch { return '0.0.0'; }
}
function flag(args, name) { const i = args.indexOf(name); return i !== -1 ? (args[i + 1] ?? true) : null; }
function err(msg) { process.stderr.write(`Error: ${msg}\n`); process.exit(1); }
function vtrace(msg) { process.stderr.write(`[verbose] ${msg}\n`); }

function printHelp() {
  console.log(`
dual-brain <command> [options]

Commands:
  init                      First-time setup → flows into interactive REPL
  auth                      Show authentication status for all providers
  auth setup                Paste API keys directly (recommended for Replit)
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

Interactive mode (entered with no args on a TTY):
  Shows dashboard screen with menu-driven navigation.
  [g] Go — dispatch a task
  [s] Status, [p] Profile, [a] Auth, [d] Diagnostics
  [c] Command mode (REPL), [q] Exit

Options:
  --version                 Print version
  --help                    Show this help
  --verbose, -v             Enable verbose routing trace output (stderr)
`.trim());
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Print a compact auth status table to stdout.
 * @param {{ claude: object, openai: object }} auth  Result from detectAuth()
 */
function printAuthTable(auth) {
  const W = 55; // inner width (wide enough for source labels)
  const hbar = '═'.repeat(W);
  const pad = (s) => {
    const visible = s.replace(/[̀-ͯ]/g, ''); // strip combining chars for length
    return s + ' '.repeat(Math.max(0, W - visible.length));
  };

  const claudeLine1 = auth.claude.found
    ? `  Claude:  ✓ found via ${auth.claude.source}`
    : `  Claude:  ✗ not found`;
  const claudeLine2 = auth.claude.found
    ? `           ${auth.claude.masked}`
    : `           run: dual-brain auth setup`;

  const openaiLine1 = auth.openai.found
    ? `  OpenAI:  ✓ found via ${auth.openai.source}`
    : `  OpenAI:  ✗ not found`;
  const openaiLine2 = auth.openai.found
    ? `           ${auth.openai.masked}`
    : `           run: dual-brain auth setup`;

  console.log(`╔${hbar}╗`);
  console.log(`║${pad('  Auth Status')}║`);
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

  // --- Step 1: Auth preflight ---
  const auth = await detectAuth();
  printAuthTable(auth);

  const noneFound = !auth.claude.found && !auth.openai.found;
  if (noneFound) {
    console.log('\nNo AI provider credentials found. Let\'s set up at least one now.\n');
    // Use the provided rl (REPL instance) or create a temporary one
    const rlOwned = !rl;
    if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await setupAuth(rl);
    } finally {
      if (rlOwned) rl.close();
    }
    // Re-check after setup
    const authAfter = await detectAuth();
    if (!authAfter.claude.found && !authAfter.openai.found) {
      console.log('\nNo credentials configured. You can run "auth setup" in the REPL anytime.');
      // Still flow into REPL — don't exit
      return;
    }
  }

  // --- Step 2: Run onboarding wizard (pass shared rl so it isn't closed) ---
  const profile = await runOnboarding({ interactive: true, detectedAuth: auth, rl });
  saveProfile(profile, { cwd });

  // --- Step 3: Show dashboard ---
  console.log('');
  const repo    = loadRepoCache(cwd);
  const session = loadSession(cwd);
  const health  = getHealth(cwd);
  const card    = formatSessionCard(session, repo, health);
  console.log(card);
  console.log('\nReady! Type a task below, or "help" for commands.\n');
}

async function cmdAuth(subArgs = [], rl) {
  const sub = subArgs[0];

  if (sub === 'setup') {
    return cmdAuthSetup(rl);
  }

  const auth = await detectAuth();
  printAuthTable(auth);

  // If anything is missing, point to setup command
  if (!auth.claude.found || !auth.openai.found) {
    console.log('\nRun "dual-brain auth setup" (or "auth setup" in REPL) to paste API keys.');
  }
}

async function cmdAuthSetup(rl) {
  const rlOwned = !rl;
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await setupAuth(rl);
  } finally {
    if (rlOwned) rl.close();
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

  // Models
  console.log('\nAvailable models:');
  if (available.claude.length) console.log(`  Claude : ${available.claude.join(', ')}`);
  if (available.openai.length) console.log(`  OpenAI : ${available.openai.join(', ')}`);

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
  openai: ['o4-mini', 'o3', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-5.4', 'gpt-5.5'],
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

async function cmdInstall() {
  const cwd = process.cwd();

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

  process.exit(0);
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

// ─── Screen helpers ───────────────────────────────────────────────────────────

function profileExists(cwd) {
  const dir = cwd || process.cwd();
  const globalPath  = join(process.env.HOME || '/root', '.config', 'dual-brain', 'profile.json');
  const projectPath = join(dir, '.dualbrain', 'profile.json');
  return existsSync(projectPath) || existsSync(globalPath);
}

// ─── Screen: welcomeScreen ────────────────────────────────────────────────────

async function welcomeScreen(rl, ask) {
  const version = readVersion();
  const cwd = process.cwd();

  // --- Try auto-setup first ---
  console.log(box(`🧠 Dual-Brain v${version} — Setup`, [
    'Detecting environment...',
  ]));
  console.log('');

  const setup = await autoSetup(cwd);

  if (setup.confident) {
    // Build summary lines for the auto-detected state
    const detectedLines = [
      'Detecting environment...',
      ...setup.actions.map(a => `✓ ${a}`),
      ...setup.warnings.map(w => `⚠ ${w}`),
    ];

    const modeLabel = setup.profile.mode === 'dual'      ? 'dual mode, balanced'
      : setup.profile.mode === 'solo-claude' ? 'Claude-only mode, balanced'
      : setup.profile.mode === 'solo-openai' ? 'OpenAI-only mode, balanced'
      : `${setup.profile.mode}, balanced`;

    const readyBox = box(`🧠 Dual-Brain v${version} — Setup`, [
      ...detectedLines,
      '',
      `Ready to go! Auto-configured ${modeLabel}.`,
    ]);
    console.log(readyBox);
    console.log('');
    console.log('  [Enter] Start coding →');
    console.log('  [c]     Customize setup');
    console.log('  [a]     Auth management');
    console.log('');

    const choice = (await ask('  Choice: ')).trim().toLowerCase();

    if (choice === 'c') {
      // Fall through to manual wizard below
    } else if (choice === 'a') {
      return { next: 'auth' };
    } else {
      // Enter or anything else → save and go to dashboard
      saveProfile(setup.profile, { cwd });
      return { next: 'dashboard' };
    }
  } else {
    // Not confident — show what's missing before falling through to wizard
    if (setup.warnings.length > 0) {
      console.log(box(`🧠 Dual-Brain v${version} — Setup`, [
        'Auto-detection incomplete:',
        ...setup.warnings.map(w => `  ✗ ${w}`),
        '',
        'Let\'s configure manually.',
      ]));
      console.log('');
    }
  }

  // --- Manual wizard (fallback or [c] Customize) ---
  console.log(separator('Claude (Anthropic)'));
  console.log('  (1) $20/mo Pro');
  console.log('  (2) $100/mo Max 5x');
  console.log('  (3) $200/mo Max 20x');
  console.log('  (4) API key only');
  console.log('  (5) Skip — don\'t use Claude');
  const claudeChoice = (await ask('> ')).trim();

  let claudePlan = null;
  let claudeEnabled = true;
  if (claudeChoice === '1') { claudePlan = 'pro'; }
  else if (claudeChoice === '2') { claudePlan = 'max5'; }
  else if (claudeChoice === '3') { claudePlan = 'max20'; }
  else if (claudeChoice === '4') {
    claudePlan = 'api';
    // Ask for API key immediately
    const key = (await ask('Paste your Anthropic API key: ')).trim();
    if (key) {
      // Inline: set env var for this session, profile will persist
      process.env.ANTHROPIC_API_KEY = key;
      console.log('✓ Claude API key set for this session');
    }
  } else if (claudeChoice === '5') {
    claudeEnabled = false;
    claudePlan = null;
  } else {
    // Default: pro
    claudePlan = 'pro';
  }

  console.log('');

  // --- OpenAI provider selection ---
  console.log(separator('OpenAI (ChatGPT/Codex)'));
  console.log('  (1) $20/mo Plus');
  console.log('  (2) $100/mo Pro');
  console.log('  (3) $200/mo Pro (higher limits)');
  console.log('  (4) API key only');
  console.log('  (5) Skip — don\'t use OpenAI');
  const openaiChoice = (await ask('> ')).trim();

  let openaiPlan = null;
  let openaiEnabled = true;
  if (openaiChoice === '1') { openaiPlan = 'plus'; }
  else if (openaiChoice === '2') { openaiPlan = 'pro'; }
  else if (openaiChoice === '3') { openaiPlan = 'pro200'; }
  else if (openaiChoice === '4') {
    openaiPlan = 'api';
    const key = (await ask('Paste your OpenAI API key: ')).trim();
    if (key) {
      process.env.OPENAI_API_KEY = key;
      console.log('✓ OpenAI API key set for this session');
    }
  } else if (openaiChoice === '5') {
    openaiEnabled = false;
    openaiPlan = null;
  } else {
    openaiPlan = 'plus';
  }

  console.log('');

  // --- Optimization mode ---
  console.log(separator('Optimization'));
  console.log('  (1) Save usage — prefer cheaper models');
  console.log('  (2) Balanced — best model per tier (recommended)');
  console.log('  (3) Quality first — always use best available');
  const modeChoice = (await ask('> ')).trim();

  let mode = 'balanced';
  if (modeChoice === '1') { mode = 'cost-saver'; }
  else if (modeChoice === '3') { mode = 'quality-first'; }

  // --- Build and save profile ---
  const existingProfile = loadProfile(cwd);
  const profile = {
    ...existingProfile,
    mode,
    providers: {
      claude: {
        enabled: claudeEnabled,
        plan: claudePlan || 'pro',
      },
      openai: {
        enabled: openaiEnabled,
        plan: openaiPlan || 'plus',
      },
    },
  };
  saveProfile(profile, { cwd });

  // --- Detect environment for summary ---
  const env = detectEnvironment();
  const auth = await detectAuth();

  const summaryLines = [
    `Mode: ${mode}`,
    claudeEnabled
      ? `Claude: ${claudePlan} plan ${auth.claude.found ? badge('connected') : badge('missing')}`
      : 'Claude: disabled',
    openaiEnabled
      ? `OpenAI: ${openaiPlan} plan ${auth.openai.found ? badge('connected') : badge('missing')}`
      : 'OpenAI: disabled',
    env.isReplit ? '🌀 Replit environment detected' : '',
  ].filter(Boolean);

  console.log('');
  console.log(box('Setup Complete', summaryLines));
  console.log('');

  return { next: 'dashboard' };
}

// ─── Screen: dashboardScreen ──────────────────────────────────────────────────

async function dashboardScreen(rl, ask) {
  const cwd = process.cwd();
  const version = readVersion();
  const profile = loadProfile(cwd);
  const auth = await detectAuth();
  const env = detectEnvironment();

  // Build status lines for box
  const claudeStatus = auth.claude.found ? `🟢 Claude ${badge('connected')}` : `🔴 Claude ${badge('missing')}`;
  const openaiStatus = auth.openai.found ? `🟢 OpenAI ${badge('connected')}` : `🔴 OpenAI ${badge('missing')}`;
  const envLabel = env.hasReplitTools ? 'Replit + replit-tools' : env.isReplit ? 'Replit' : 'local';

  // Enforcement check
  let guardCount = 0;
  try {
    const settingsFile = join(cwd, '.claude', 'settings.json');
    if (existsSync(settingsFile)) {
      const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
      const preToolUse = settings?.hooks?.PreToolUse ?? [];
      const guardCmd  = 'node .claude/hooks/head-guard.mjs';
      const tierCmd   = 'node .claude/hooks/enforce-tier.mjs';
      const hasEdit   = preToolUse.some(e => e.matcher === 'Edit'   && e.hooks?.some(h => h.command === guardCmd));
      const hasWrite  = preToolUse.some(e => e.matcher === 'Write'  && e.hooks?.some(h => h.command === guardCmd));
      const hasBash   = preToolUse.some(e => e.matcher === 'Bash'   && e.hooks?.some(h => h.command === guardCmd));
      const hasAgent  = preToolUse.some(e => e.matcher === 'Agent'  && e.hooks?.some(h => h.command === tierCmd));
      guardCount = [hasEdit, hasWrite, hasBash, hasAgent].filter(Boolean).length;
    }
  } catch { /* ignore */ }

  const authSummary = (auth.claude.found && auth.openai.found)
    ? 'both providers connected'
    : auth.claude.found
      ? 'Claude connected, OpenAI missing'
      : auth.openai.found
        ? 'OpenAI connected, Claude missing'
        : 'no providers connected';

  const dashLines = [
    `${claudeStatus}   ${openaiStatus}`,
    `🌀 ${envLabel}`,
    '',
    `✓ Profile: ${profile.mode} · ${profile.providers?.claude?.enabled && profile.providers?.openai?.enabled ? 'dual' : 'solo'} mode`,
    `✓ Enforcement: ${guardCount} guards active`,
    `✓ Auth: ${authSummary}`,
  ];

  console.log(box(`🧠 Dual-Brain v${version}`, dashLines));
  console.log('');

  // ── Recent Sessions (replit-tools import) ──────────────────────────────────
  const recentSessions = importReplitSessions(cwd).slice(0, 5);
  if (recentSessions.length > 0) {
    console.log(separator('Recent Sessions'));
    recentSessions.forEach((sess, i) => {
      const activeIndicator = sess.isActive ? '●' : ' ';
      const promptsLabel = `(${sess.promptCount} prompt${sess.promptCount !== 1 ? 's' : ''})`;
      console.log(`  [${i + 1}] ${sess.age.padEnd(6)}  ${activeIndicator} ${sess.name} ${promptsLabel}`);
    });
    console.log('');
  }

  console.log(menu([
    { key: 's', label: 'Status — detailed provider info', section: 'Info' },
    { key: 'p', label: 'Profile & preferences',        section: 'Settings' },
    { key: 'a', label: 'Auth management',              section: 'Settings' },
    { key: 'd', label: 'Diagnostics & repair',         section: 'Settings' },
    { key: 'q', label: 'Exit to shell',                section: '' },
  ]));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  // Numeric choice → session detail
  const numChoice = parseInt(choice, 10);
  if (!isNaN(numChoice) && numChoice >= 1 && numChoice <= recentSessions.length) {
    return { next: 'session-detail', session: recentSessions[numChoice - 1] };
  }

  if (choice === 's') {
    await cmdStatus([]);
    await ask('\n  Press Enter to return to dashboard...');
    return { next: 'dashboard' };
  }

  if (choice === 'p') { return { next: 'profile' }; }
  if (choice === 'a') { return { next: 'auth' }; }
  if (choice === 'd') { return { next: 'diagnostics' }; }
  if (choice === 'q' || choice === 'exit') { return { next: 'exit' }; }

  // Unknown choice — stay on dashboard
  return { next: 'dashboard' };
}

// ─── Screen: authScreen ───────────────────────────────────────────────────────

async function authScreen(rl, ask) {
  const auth = await detectAuth();

  const authLines = [
    'Claude:',
  ];

  if (auth.claude.found) {
    authLines.push(`  source: ${auth.claude.source}  ${badge('connected')}`);
    authLines.push(`  key:    ${auth.claude.masked}`);
  } else {
    authLines.push(`  not configured  ${badge('missing')}`);
  }

  authLines.push('');
  authLines.push('OpenAI:');

  if (auth.openai.found) {
    authLines.push(`  source: ${auth.openai.source}  ${badge('connected')}`);
    authLines.push(`  key:    ${auth.openai.masked}`);
  } else {
    authLines.push(`  not configured  ${badge('missing')}`);
  }

  console.log(box('🔑 Auth Management', authLines));
  console.log('');
  console.log(menu([
    { key: 'a', label: 'Add API key',        section: '' },
    { key: 't', label: 'Test keys',          section: '' },
    { key: 'b', label: 'Back to dashboard',  section: '' },
  ]));
  console.log('');

  const choice = (await ask('  Choice: ')).trim().toLowerCase();

  if (choice === 'a') {
    await setupAuth(rl);
    return { next: 'auth' }; // refresh
  }

  if (choice === 't') {
    console.log('\n  Testing auth...');
    const authNow = await detectAuth();
    console.log(`  Claude: ${authNow.claude.found ? 'OK — ' + authNow.claude.source : 'NOT FOUND'}`);
    console.log(`  OpenAI: ${authNow.openai.found ? 'OK — ' + authNow.openai.source : 'NOT FOUND'}`);
    await ask('\n  Press Enter to continue...');
    return { next: 'auth' };
  }

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
  const { detectPlans } = await import('../src/profile.mjs');

  // ── Version info ──────────────────────────────────────────────────────────
  const version = readVersion();
  const nodeVersion = process.version;

  // ── Provider health ───────────────────────────────────────────────────────
  const auth  = await detectAuth();
  const plans = detectPlans();
  const { states: healthStates } = getHealth(cwd);

  function _providerBadge(name) {
    const entries = Object.entries(healthStates).filter(([k]) => k.startsWith(`${name}:`));
    if (entries.length === 0) return '✅ healthy';
    const statuses = entries.map(([, v]) => v.status);
    if (statuses.includes('hot'))      return '🔴 hot';
    if (statuses.includes('degraded')) return '⚠️  degraded';
    if (statuses.includes('probing'))  return '⚠️  probing';
    return '✅ healthy';
  }

  const claudeStatus  = auth.claude.found ? _providerBadge('claude') : '❌ no auth';
  const openaiStatus  = auth.openai.found ? _providerBadge('openai') : '❌ no auth';
  const claudePlanStr = plans.claude ? `Max ${plans.claude}` : (auth.claude.masked ?? 'unknown');
  const openaiPlanStr = plans.openai ? `Pro ${plans.openai}` : (auth.openai.masked ?? 'unknown');
  const claudeAuthStr = auth.claude.masked ?? 'not configured';
  const openaiAuthStr = auth.openai.masked ?? 'not configured';

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
  // Pad a string to exactly W visible columns (for box rows without leading ║  prefix)
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
    hrow('🔧 Diagnostics'),
    `╠${hbar}╣`,
    hrow(`dual-brain v${version}`),
    hrow(`Node.js ${nodeVersion}`),
    `╚${hbar}╝`,
    '',
    separator('Provider Health'),
    `  ${claudeStatus.padEnd(14)} Claude    ${claudePlanStr.padEnd(16)} ${claudeAuthStr}`,
    `  ${openaiStatus.padEnd(14)} OpenAI    ${openaiPlanStr.padEnd(16)} ${openaiAuthStr}`,
    '',
    separator('Enforcement'),
    `  ${headGuardExists   ? '✅' : '❌'} head-guard.mjs     ${headGuardExists   ? 'installed' : 'missing — run: dual-brain install'}`,
    `  ${enforceTierExists ? '✅' : '❌'} enforce-tier.mjs   ${enforceTierExists ? 'installed' : 'missing — run: dual-brain install'}`,
    `  ${guardCount === 4  ? '✅' : '⚠️ '} settings.json      ${guardCount}/4 guards registered${guardCount < 4 ? ' — run: dual-brain install' : ''}`,
    `  ${hookifyCount > 0  ? '✅' : '⚠️ '} hookify rules      ${hookifyCount} rules${hookifyCount > 0 ? ' (check: ls .claude/hookify.*.md)' : ' — none found'}`,
    '',
    separator('Replit Tools'),
    `  ${hasReplitTools ? '✅' : '❌'} replit-tools        ${hasReplitTools ? 'detected' : 'not detected'}`,
  ];

  if (hasReplitTools) {
    if (credsFresh === null) {
      output.push('  ⚠️  Claude auth         credentials file missing');
    } else if (credsFresh) {
      output.push(`  ✅ Claude auth         fresh (expires: ${credsExpiry})`);
    } else {
      output.push(`  ❌ Claude auth         expired (${credsExpiry}) — run [r] Refresh auth`);
    }
    output.push(`  ✅ Session archive     ${historyCount} entries`);
    output.push(`  ${sessionManagerExists ? '✅' : '⚠️ '} Session manager     ${sessionManagerExists ? 'available' : 'not found'}`);
  } else {
    output.push('  ─── (not available)');
  }

  output.push('');
  output.push(separator('Quality'));
  if (testError) {
    output.push(`  ❌ Tests               error: ${testError}`);
  } else if (testPass !== null) {
    output.push(`  ${testPass === testTotal ? '✅' : '❌'} Tests               ${testPass}/${testTotal} passing`);
  }
  if (healthError) {
    output.push(`  ❌ Health check        error: ${healthError}`);
  } else if (healthPass !== null) {
    output.push(`  ${healthPass === healthTotal ? '✅' : '⚠️ '} Health check        ${healthPass}/${healthTotal} passing`);
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
      } else if (line === 'auth setup' || line === 'auth-setup') {
        await cmdAuthSetup(rl);
      } else if (line === 'auth') {
        await cmdAuth([], rl);
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

// ─── Screen state machine ─────────────────────────────────────────────────────

const SCREENS = {
  welcome:        welcomeScreen,
  dashboard:      dashboardScreen,
  auth:           authScreen,
  profile:        profileScreen,
  diagnostics:    diagnosticsScreen,
  repl:           replScreen,
  'session-detail': sessionDetailScreen,
};

async function runScreens(startScreen = 'dashboard') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));

  let current = startScreen;
  let ctx = {};
  while (current && current !== 'exit') {
    const screen = SCREENS[current];
    if (!screen) break;
    try {
      const result = await screen(rl, ask, ctx);
      current = result?.next || 'exit';
      // Pass through context (e.g. selected session) to next screen
      ctx = result?.session ? { session: result.session } : {};
    } catch (e) {
      console.error(`Error: ${e.message}`);
      current = 'dashboard'; // recover to dashboard on error
      ctx = {};
    }
  }
  rl.close();
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
      if (profileExists(cwd)) {
        // Profile already exists → go straight to dashboard
        await runScreens('dashboard');
      } else {
        // First run: welcomeScreen handles auto-setup detection internally,
        // then falls through to manual wizard if needed.
        await runScreens('welcome');
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
      // Run welcome wizard then dashboard
      await runScreens('welcome');
    } else {
      await cmdInit();
    }
    return;
  }

  // One-shot commands — run and exit
  if (cmd === 'install')  { await cmdInstall(); return; }
  if (cmd === 'auth') {
    const sub = args[1];
    if (sub === 'setup') { await cmdAuthSetup(); return; }
    await cmdAuth(args.slice(1));
    return;
  }
  if (cmd === 'go')       { await cmdGo(args.slice(1)); return; }
  if (cmd === 'status')   { await cmdStatus(args.slice(1)); return; }
  if (cmd === 'hot')      { cmdHot(args[1]); return; }
  if (cmd === 'cool')     { cmdCool(args[1]); return; }
  if (cmd === 'remember') { cmdRemember(args[1]); return; }
  if (cmd === 'forget')   { cmdForget(args[1]); return; }

  process.stderr.write(`Unknown command: ${cmd}\nRun "dual-brain --help" for usage.\n`);
  process.exit(1);
}

main().catch(e => {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
});
