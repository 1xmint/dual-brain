import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Provider capabilities registry ──────────────────────────────────────────

const PROVIDER_CAPS = {
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

export function getProviderCaps(provider) {
  return PROVIDER_CAPS[provider] || PROVIDER_CAPS.claude;
}

// ── Provider-agnostic context injection ─────────────────────────────────────

/**
 * Build a context block that works for any provider.
 * Adapts format based on provider capabilities.
 */
export function buildContextBlock(provider, sections) {
  const caps = getProviderCaps(provider);
  const lines = [];

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

/**
 * Build a compaction survival block tuned for the target provider.
 *
 * Claude: uses tagged blocks that survive automatic context compression.
 * Codex: no native compaction, but we prepend a compact state header that
 *        stays at the top of the context window and serves as a quick-reference
 *        for the model when the conversation gets long.
 */
export function buildSurvivalBlock(provider, state) {
  const caps = getProviderCaps(provider);

  const coreLines = [];
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

/**
 * Generate a handoff receipt that works for both providers.
 * Accounts for Codex's lack of native resume support by writing
 * to a shared .dualbrain/handoffs/ directory that both providers can read.
 */
export function generateProviderHandoff(sessionState, provider) {
  const caps = getProviderCaps(provider);

  const handoff = {
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

  return handoff;
}

/**
 * Build a resume brief from the latest handoff, adapted for the resuming provider.
 * Codex gets a more verbose brief since it has no native session memory.
 */
export function buildProviderResumeBrief(cwd, targetProvider) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'handoffs');
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter(f => f.startsWith('handoff-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;

  let handoff;
  try {
    handoff = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
  } catch {
    return null;
  }

  const age = (Date.now() - Date.parse(handoff.timestamp)) / 3600000;
  if (age > 48) return null;

  const caps = getProviderCaps(targetProvider);
  const lines = [];

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
 * Claude: specialist prompts from agents/specialists/.
 * Codex: plugin hints from matched Codex plugins.
 */
export function buildCapabilityHint(provider, prompt, cwd) {
  if (provider === 'claude') {
    return null; // Handled by dispatch.mjs specialist injection
  }

  // Codex: try to match plugins
  try {
    const { matchPluginsForTask } = require('./replit.mjs');
    const matched = matchPluginsForTask(prompt, undefined, cwd);
    if (matched.length > 0) {
      const names = matched.slice(0, 3).map(m => m.plugin.id).join(', ');
      return `[Available Codex plugins: ${names}. Consider using matching plugins for direct API access.]`;
    }
  } catch {}

  return null;
}

// ── Context budget tracking (provider-aware) ────────────────────────────────

/**
 * Estimate remaining context budget for a provider.
 */
export function estimateContextBudget(provider, usedTokens) {
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
 * Handles the case where the opposite provider isn't available.
 */
export function getReviewProvider(workProvider, availableProviders) {
  const opposite = workProvider === 'claude' ? 'openai' : 'claude';
  if (availableProviders?.includes(opposite)) return opposite;

  // Same-provider review with different model if opposite unavailable
  return workProvider;
}

/**
 * Check if both providers are available for true dual-brain operation.
 */
export function isDualProviderAvailable(profile) {
  const claude = profile?.providers?.claude?.enabled !== false;
  const openai = profile?.providers?.openai?.enabled && profile?.providers?.openai?.plan;
  return { claude, openai, dual: claude && openai };
}
