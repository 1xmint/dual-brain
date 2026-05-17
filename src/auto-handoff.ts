/**
 * auto-handoff.ts — Automatic cross-provider handoff system.
 *
 * When one provider hits its rate limit, this module exports the conversation
 * context and switches to the other provider seamlessly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { atomicWriteJson, readJsonSafe } from './integrity.js';
import { getProviderState, getAllProviderStates } from './provider-manager.js';
import { loadSession } from './session.js';
import type { Provider } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LimitStatus {
  limited: boolean;
  provider: string;
  resetsAt?: string;
  otherAvailable: boolean;
  otherProvider?: string;
}

export interface HandoffContext {
  objective: string;
  filesChanged: string[];
  recentDecisions: Array<{ model: string; tier: string; timestamp: string }>;
  conversationSummary: string;
  currentPhase: string;
  exportedAt: string;
}

export interface HandoffOpts {
  fromProvider: string;
  cwd?: string;
  auto?: boolean;
  force?: boolean;
}

export interface HandoffResult {
  success: boolean;
  command?: string[];
  contextFile?: string;
  message: string;
}

export interface HandoffUXMessage {
  text: string;
  action: 'auto-switch' | 'prompt-setup' | 'wait';
  command?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HANDOFF_DIR = '.dual-brain/handoff';
const HANDOFF_FILE = 'latest.json';
const DISPATCH_LOG = '.dual-brain/dispatch-log.ndjson';

/** Map provider names to CLI commands. */
const PROVIDER_CLI: Record<string, string> = {
  anthropic: 'claude',
  openai: 'codex',
};

/** Map provider names to their "other". */
const OTHER_PROVIDER: Record<string, string> = {
  anthropic: 'openai',
  openai: 'anthropic',
  claude: 'openai',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeProvider(provider: string): string {
  return provider === 'claude' ? 'anthropic' : provider;
}

function handoffDir(cwd?: string): string {
  return join(cwd || process.cwd(), HANDOFF_DIR);
}

function handoffFile(cwd?: string): string {
  return join(handoffDir(cwd), HANDOFF_FILE);
}

function ensureHandoffDir(cwd?: string): void {
  const dir = handoffDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read recent routing decisions from the dispatch log.
 */
function readRecentDecisions(cwd?: string, limit = 5): Array<{ model: string; tier: string; timestamp: string }> {
  try {
    const logPath = join(cwd || process.cwd(), DISPATCH_LOG);
    if (!existsSync(logPath)) return [];

    const content = readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Take the last N entries
    const recent = lines.slice(-limit);
    const decisions: Array<{ model: string; tier: string; timestamp: string }> = [];

    for (const line of recent) {
      try {
        const entry = JSON.parse(line) as { model?: string; provider?: string; timestamp?: string; tier?: string };
        decisions.push({
          model: entry.model || 'unknown',
          tier: entry.tier || entry.provider || 'unknown',
          timestamp: entry.timestamp || new Date().toISOString(),
        });
      } catch {
        // Skip malformed lines
      }
    }

    return decisions;
  } catch {
    return [];
  }
}

/**
 * Format a relative time string for when the limit resets.
 */
function formatResetTime(resetsAt: string): string {
  const delta = new Date(resetsAt).getTime() - Date.now();
  if (delta <= 0) return 'now';
  const minutes = Math.ceil(delta / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h`;
}

// ─── Exported Functions ─────────────────────────────────────────────────────

/**
 * Check if a provider is rate-limited.
 * Reads from provider-manager state and checks for common rate limit patterns.
 */
export function detectLimitReached(provider: string, cwd?: string): LimitStatus {
  try {
    const normalized = normalizeProvider(provider);
    const state = getProviderState(normalized, cwd);
    const other = OTHER_PROVIDER[normalized] || (normalized === 'anthropic' ? 'openai' : 'anthropic');

    const limited = state.status === 'rate-limited' || state.status === 'down';

    let otherAvailable = false;
    if (limited) {
      const otherState = getProviderState(other, cwd);
      otherAvailable = otherState.status === 'healthy' || otherState.status === 'degraded';
    }

    return {
      limited,
      provider: normalized,
      resetsAt: state.cooldownUntil || undefined,
      otherAvailable,
      otherProvider: other,
    };
  } catch {
    return {
      limited: false,
      provider: normalizeProvider(provider),
      otherAvailable: false,
    };
  }
}

/**
 * Read the current session state and produce a portable context object.
 */
export function exportSessionContext(cwd?: string): HandoffContext {
  try {
    const session = loadSession(cwd || process.cwd());
    const decisions = readRecentDecisions(cwd);

    const objective = session?.objective || '(no objective recorded)';
    const filesChanged = session?.filesChanged || [];
    const currentPhase = session?.nextAction || 'unknown';

    // Build a conversation summary from session state
    const summaryParts: string[] = [];
    if (session?.objective) {
      summaryParts.push(`Working on: ${session.objective}`);
    }
    if (session?.lastResult?.summary) {
      summaryParts.push(`Last result: ${session.lastResult.summary}`);
    }
    if (session?.commandsRun?.length) {
      const recentCmds = session.commandsRun.slice(-3);
      summaryParts.push(`Recent commands: ${recentCmds.join(', ')}`);
    }
    if (session?.branch) {
      summaryParts.push(`Branch: ${session.branch}`);
    }

    const conversationSummary = summaryParts.length > 0
      ? summaryParts.join('. ')
      : '(no session context available)';

    return {
      objective,
      filesChanged,
      recentDecisions: decisions,
      conversationSummary,
      currentPhase,
      exportedAt: new Date().toISOString(),
    };
  } catch {
    return {
      objective: '(failed to export context)',
      filesChanged: [],
      recentDecisions: [],
      conversationSummary: '(export error)',
      currentPhase: 'unknown',
      exportedAt: new Date().toISOString(),
    };
  }
}

/**
 * Generate a prompt string that can be fed to the other provider to resume work.
 */
export function buildHandoffPrompt(context: HandoffContext): string {
  const lines: string[] = [
    '# Handoff Context — Resuming Work From Another Provider',
    '',
    '## Objective',
    context.objective,
    '',
  ];

  if (context.filesChanged.length > 0) {
    lines.push('## Files Changed');
    for (const f of context.filesChanged) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (context.conversationSummary && context.conversationSummary !== '(no session context available)') {
    lines.push('## Session Summary');
    lines.push(context.conversationSummary);
    lines.push('');
  }

  if (context.recentDecisions.length > 0) {
    lines.push('## Recent Routing Decisions');
    for (const d of context.recentDecisions) {
      lines.push(`- ${d.model} (${d.tier}) at ${d.timestamp}`);
    }
    lines.push('');
  }

  if (context.currentPhase && context.currentPhase !== 'unknown') {
    lines.push('## Current Phase');
    lines.push(context.currentPhase);
    lines.push('');
  }

  lines.push('## Instructions');
  lines.push('Continue working on the objective above. The previous provider hit its rate limit.');
  lines.push('Pick up where it left off — do not ask the user to repeat themselves.');
  lines.push(`Context exported at: ${context.exportedAt}`);

  return lines.join('\n');
}

/**
 * Execute the full handoff flow:
 * 1. Detect which provider to switch TO
 * 2. Export context
 * 3. Build the handoff prompt
 * 4. Return the command to launch the other CLI
 *
 * Does NOT actually spawn the process (caller decides).
 */
export function executeHandoff(opts: HandoffOpts): HandoffResult {
  try {
    const { fromProvider, cwd, auto, force } = opts;
    const normalized = normalizeProvider(fromProvider);
    const other = OTHER_PROVIDER[normalized] || (normalized === 'anthropic' ? 'openai' : 'anthropic');

    // Check that the other provider is available (skip if forced)
    if (!force) {
      const otherState = getProviderState(other, cwd);
      if (otherState.status === 'rate-limited' || otherState.status === 'down') {
        return {
          success: false,
          message: `Cannot handoff: ${other} is also ${otherState.status}. Both providers unavailable.`,
        };
      }
    }

    // Export session context
    const context = exportSessionContext(cwd);

    // Build handoff prompt
    const prompt = buildHandoffPrompt(context);

    // Write context to handoff file
    ensureHandoffDir(cwd);
    const contextFilePath = handoffFile(cwd);

    const handoffData = {
      context,
      prompt,
      fromProvider: normalized,
      toProvider: other,
      auto: auto ?? false,
      createdAt: new Date().toISOString(),
    };

    atomicWriteJson(contextFilePath, handoffData);

    // Build the CLI command
    const cli = PROVIDER_CLI[other] || other;
    const command = [cli, '--resume', contextFilePath];

    const autoLabel = auto ? ' (auto)' : '';
    return {
      success: true,
      command,
      contextFile: contextFilePath,
      message: `Handoff${autoLabel}: ${normalized} → ${other}. Context saved to ${contextFilePath}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Handoff failed: ${message}`,
    };
  }
}

/**
 * Seamlessly spawn the other provider CLI with handoff context.
 * Replaces the current process — user stays in the same terminal,
 * conversation continues with the new provider.
 */
export function spawnHandoff(opts: HandoffOpts & { interactive?: boolean; force?: boolean }): HandoffResult {
  try {
    const result = executeHandoff({ ...opts, force: opts.force });
    if (!result.success || !result.command || !result.contextFile) return result;

    const [cli, ...cliArgs] = result.command;
    const contextData = readJsonSafe(result.contextFile) as { prompt?: string } | null;
    const prompt = contextData?.prompt || '';

    // Write the prompt to a temp file the CLI can read
    const promptFile = join(opts.cwd || process.cwd(), '.dual-brain/handoff/prompt.md');
    writeFileSync(promptFile, prompt, 'utf8');

    // Build the command based on which CLI we're launching
    let spawnArgs: string[];
    const codexNonTty = cli === 'codex' && !process.stdin.isTTY;
    if (cli === 'codex') {
      // Codex accepts the initial prompt as a positional argument.
      // `-p` is the config profile flag, so do not use it here.
      // In non-TTY contexts like Claude Code's shell tool, the interactive TUI
      // cannot start, so use non-interactive exec instead.
      // Replit's bubblewrap setup can reject Codex's workspace sandbox, so the
      // non-TTY fallback uses Codex's no-sandbox mode and relies on Replit's
      // outer workspace isolation.
      spawnArgs = codexNonTty
        ? ['exec', '--sandbox', 'danger-full-access', '--ask-for-approval', 'never', prompt.slice(0, 4000)]
        : [prompt.slice(0, 4000)];
    } else {
      // Claude: use -p flag with prompt
      spawnArgs = ['-p', prompt.slice(0, 4000), '--no-input'];
    }

    if (opts.interactive !== false) {
      // Spawn with inherited stdio — user stays in same terminal
      const child = spawn(cli, spawnArgs, {
        stdio: codexNonTty ? ['ignore', 'inherit', 'inherit'] : 'inherit',
        cwd: opts.cwd || process.cwd(),
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });
    }

    return {
      success: true,
      command: [cli, ...spawnArgs],
      contextFile: result.contextFile,
      message: `⚡ Switching to ${cli}...`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Auto-spawn failed: ${message}. Run manually: dual-brain handoff --show`,
    };
  }
}

/**
 * Return the user-facing message for a rate limit situation.
 */
export function getHandoffUX(status: LimitStatus): HandoffUXMessage {
  const providerLabel = PROVIDER_CLI[status.provider] || status.provider;
  const otherLabel = status.otherProvider ? (PROVIDER_CLI[status.otherProvider] || status.otherProvider) : 'other';

  // Both providers limited
  if (status.limited && !status.otherAvailable) {
    // Check if we have a reset time
    if (status.resetsAt) {
      const timeStr = formatResetTime(status.resetsAt);
      return {
        text: `⚡ Both providers at limit. Resets in ${timeStr}.`,
        action: 'wait',
      };
    }
    return {
      text: `⚡ Both providers at limit. Resets in ~5m.`,
      action: 'wait',
    };
  }

  // Limited but other is available
  if (status.limited && status.otherAvailable && status.otherProvider) {
    return {
      text: `⚡ ${providerLabel} limit reached → switching to ${otherLabel}`,
      action: 'auto-switch',
      command: `dual-brain handoff --to ${status.otherProvider}`,
    };
  }

  // Limited but other provider not configured
  if (status.limited && !status.otherAvailable) {
    return {
      text: `⚡ ${providerLabel} limit reached. Set up ${otherLabel} to continue? Run: dual-brain init`,
      action: 'prompt-setup',
      command: 'dual-brain init',
    };
  }

  // Not limited (shouldn't normally be called, but handle gracefully)
  return {
    text: `${providerLabel} is operating normally.`,
    action: 'wait',
  };
}
