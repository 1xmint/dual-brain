import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Provider } from './types.js';

// ── Provider capabilities registry ──────────────────────────────────────────

export interface ProviderCapabilities {
  name: string;
  cli: string;
  hasNativeCompaction: boolean;
  compactionStrategy: string;
  contextFormat: string;
  supportsSpecialists: boolean;
  supportsSituationBrief: boolean;
  maxContextTokens: number;
  sessionStorage: string;
  authCheck: string;
  resumeSupport: string;
}

const PROVIDER_CAPS: Record<string, ProviderCapabilities> = {
  claude: {
    name: 'Claude Code',
    cli: 'claude',
    hasNativeCompaction: true,
    compactionStrategy: 'automatic',
    contextFormat: 'markdown-blocks',
    supportsSpecialists: true,
    supportsSituationBrief: true,
    maxContextTokens: 200_000,
    sessionStorage: 'claude-internal',
    authCheck: 'claude --version',
    resumeSupport: 'receipt + handoff',
  },
  openai: {
    name: 'Codex CLI',
    cli: 'codex',
    hasNativeCompaction: false,
    compactionStrategy: 'none',
    contextFormat: 'plain-text',
    supportsSpecialists: false,
    supportsSituationBrief: true,
    maxContextTokens: 128_000,
    sessionStorage: '~/.codex/sessions/YYYY/MM/DD/*.jsonl',
    authCheck: 'codex --version',
    resumeSupport: 'handoff-only',
  },
};

export function getProviderCaps(provider: string): ProviderCapabilities {
  return PROVIDER_CAPS[provider] || PROVIDER_CAPS.claude;
}

// ── Provider-agnostic context injection ─────────────────────────────────────

/**
 * Build a context block that works for any provider.
 * Adapts format based on provider capabilities.
 */
export function buildContextBlock(provider: string, sections: Record<string, string | object | null | undefined>): string {
  const caps = getProviderCaps(provider);
  const lines: string[] = [];

  if (caps.contextFormat === 'markdown-blocks') {
    for (const [label, content] of Object.entries(sections)) {
      if (!content) continue;
      lines.push(`[${label.toUpperCase()}]`);
      lines.push(typeof content === 'string' ? content : JSON.stringify(content));
      lines.push(`[/${label.toUpperCase()}]`);
      lines.push('');
    }
  } else {
    for (const [label, content] of Object.entries(sections)) {
      if (!content) continue;
      lines.push(`--- ${label} ---`);
      lines.push(typeof content === 'string' ? content : JSON.stringify(content));
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// ── Compaction survival for both providers ───────────────────────────────────

export interface SurvivalState {
  activeTask?: string;
  provider?: string;
  model?: string;
  tier?: string;
  risk?: string;
  filesInProgress?: string[];
  decisions?: string[];
  warnings?: string[];
  routingRules?: string[];
}

/**
 * Build a compaction survival block tuned for the target provider.
 */
export function buildSurvivalBlock(provider: string, state: SurvivalState): string {
  const caps = getProviderCaps(provider);

  const coreLines: string[] = [];
  if (state.activeTask) coreLines.push(`TASK: ${state.activeTask}`);
  if (state.provider) coreLines.push(`PROVIDER: ${state.provider}/${state.model || 'default'}`);
  if (state.tier) coreLines.push(`TIER: ${state.tier}`);
  if (state.risk) coreLines.push(`RISK: ${state.risk}`);
  if (state.filesInProgress?.length) coreLines.push(`FILES: ${state.filesInProgress.slice(0, 10).join(', ')}`);
  if (state.decisions?.length) coreLines.push(`DECISIONS: ${state.decisions.slice(0, 3).join('; ')}`);
  if (state.warnings?.length) coreLines.push(`WARNINGS: ${state.warnings.slice(0, 3).join('; ')}`);
  if (state.routingRules?.length) coreLines.push(`ROUTING: ${state.routingRules.join('; ')}`);

  if (caps.hasNativeCompaction) {
    return `[DUAL-BRAIN CONTINUITY]\n${coreLines.join('\n')}\n[/DUAL-BRAIN CONTINUITY]`;
  }

  // Codex: compact header block — placed at prompt start for max visibility
  return `## dual-brain state\n${coreLines.join('\n')}\n---`;
}

// ── Provider-agnostic handoff ───────────────────────────────────────────────

export interface SessionState {
  taskDescription?: string;
  filesChanged?: string[];
  testsRun?: string[];
  decisions?: Array<{ provider?: string; model?: string }>;
  unresolved?: string[];
  routingHistory?: {
    lastProvider?: string;
    lastModel?: string;
    failedProviders?: string[];
  };
  resumeHint?: string;
}

export interface ProviderHandoff {
  version: number;
  provider: string;
  providerCaps: string;
  timestamp: string;
  task: string | null;
  progress: {
    filesChanged: string[];
    testsRun: string[];
    decisions: Array<{ provider?: string; model?: string }>;
  };
  unresolved: string[];
  routing: {
    lastProvider: string;
    lastModel: string | null;
    failedProviders: string[];
  };
  resumeHint: string | null;
  resumeStrategy: string;
}

/**
 * Generate a handoff receipt that works for both providers.
 */
export function generateProviderHandoff(sessionState: SessionState, provider: string): ProviderHandoff {
  const caps = getProviderCaps(provider);

  return {
    version: 2,
    provider,
    providerCaps: caps.name,
    timestamp: new Date().toISOString(),
    task: sessionState.taskDescription || null,
    progress: {
      filesChanged: (sessionState.filesChanged || []).slice(0, 20),
      testsRun: sessionState.testsRun || [],
      decisions: (sessionState.decisions || []).slice(0, 5),
    },
    unresolved: (sessionState.unresolved || []).slice(0, 5),
    routing: {
      lastProvider: provider,
      lastModel: sessionState.routingHistory?.lastModel || null,
      failedProviders: sessionState.routingHistory?.failedProviders || [],
    },
    resumeHint: sessionState.resumeHint || null,
    resumeStrategy: caps.resumeSupport,
  };
}

/**
 * Build a resume brief from the latest handoff, adapted for the resuming provider.
 */
export function buildProviderResumeBrief(cwd: string | undefined, targetProvider: string): string | null {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  let handoff: ProviderHandoff;
  try {
    handoff = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  } catch {
    return null;
  }

  const age = (Date.now() - Date.parse(handoff.timestamp)) / 3600000;
  if (age > 48) return null;

  const caps = getProviderCaps(targetProvider);
  const lines: string[] = [];

  const ageLabel = age < 1 ? 'just now' : age < 24 ? `${Math.round(age)}h ago` : `${Math.round(age / 24)}d ago`;
  lines.push(`Resuming from previous session (${ageLabel}, ran on ${handoff.provider || 'unknown'}):`);

  if (handoff.task) lines.push(`  Task: ${handoff.task}`);
  if (handoff.resumeHint) lines.push(`  Next: ${handoff.resumeHint}`);

  if (handoff.progress?.filesChanged?.length) {
    const shown = handoff.progress.filesChanged.slice(0, caps.hasNativeCompaction ? 5 : 10);
    lines.push(`  Changed: ${shown.join(', ')}`);
  }

  if (handoff.unresolved?.length) {
    lines.push(`  Unresolved: ${handoff.unresolved.join('; ')}`);
  }

  // Codex gets extra context since it has no native session memory
  if (!caps.hasNativeCompaction && handoff.progress?.decisions?.length) {
    lines.push(`  Prior routing: ${handoff.progress.decisions.map(d => `${d.provider}/${d.model}`).join(', ')}`);
  }

  if (handoff.routing?.failedProviders?.length) {
    lines.push(`  Note: ${handoff.routing.failedProviders.join(', ')} failed last session`);
  }

  return lines.join('\n');
}

// ── Specialist/plugin injection (provider-aware) ────────────────────────────

/**
 * Build a capability hint block for the target provider.
 */
export function buildCapabilityHint(provider: string, prompt: string, cwd?: string): string | null {
  if (provider === 'claude') {
    return null; // Handled by dispatch.mjs specialist injection
  }

  // Codex: try to match plugins
  try {
    // Dynamic require for optional dependency
    const { matchPluginsForTask } = require('./replit.mjs') as { matchPluginsForTask: (prompt: string, arg2: undefined, cwd?: string) => Array<{ plugin: { id: string } }> };
    const matched = matchPluginsForTask(prompt, undefined, cwd);
    if (matched.length > 0) {
      const names = matched.slice(0, 3).map(m => m.plugin.id).join(', ');
      return `[Available Codex plugins: ${names}. Consider using matching plugins for direct API access.]`;
    }
  } catch { /* non-fatal */ }

  return null;
}

// ── Context budget tracking (provider-aware) ────────────────────────────────

export interface ContextBudget {
  provider: string;
  maxTokens: number;
  usedTokens: number;
  remainingTokens: number;
  utilizationPct: number;
  compactionRisk: 'critical' | 'high' | 'medium' | 'low';
  hasNativeCompaction: boolean;
  action: string;
}

/**
 * Estimate remaining context budget for a provider.
 */
export function estimateContextBudget(provider: string, usedTokens: number): ContextBudget {
  const caps = getProviderCaps(provider);
  const remaining = caps.maxContextTokens - usedTokens;

  return {
    provider,
    maxTokens: caps.maxContextTokens,
    usedTokens,
    remainingTokens: Math.max(0, remaining),
    utilizationPct: Math.round((usedTokens / caps.maxContextTokens) * 100),
    compactionRisk: remaining < 20_000 ? 'critical' : remaining < 50_000 ? 'high' : remaining < 100_000 ? 'medium' : 'low',
    hasNativeCompaction: caps.hasNativeCompaction,
    action: caps.hasNativeCompaction
      ? (remaining < 20_000 ? 'survival-kit-injected' : 'none')
      : (remaining < 30_000 ? 'manual-handoff-recommended' : 'none'),
  };
}

// ── Cross-provider compatibility helpers ────────────────────────────────────

/**
 * Get the opposite provider for cross-review.
 */
export function getReviewProvider(workProvider: string, availableProviders?: string[]): string {
  const opposite = workProvider === 'claude' ? 'openai' : 'claude';
  if (availableProviders?.includes(opposite)) return opposite;
  return workProvider;
}

/**
 * Check if both providers are available for true dual-brain operation.
 */
export function isDualProviderAvailable(profile: { providers?: { claude?: { enabled?: boolean }; openai?: { enabled?: boolean; plan?: string } } } | null | undefined): { claude: boolean; openai: boolean; dual: boolean } {
  const claude = profile?.providers?.claude?.enabled !== false;
  const openai = !!(profile?.providers?.openai?.enabled && profile?.providers?.openai?.plan);
  return { claude, openai, dual: claude && openai };
}
