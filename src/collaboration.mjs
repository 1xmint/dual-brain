import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Blackboard: shared state across collaborating agents ────────────────────

/**
 * Create a fresh collaboration session.
 * All agents in a multi-agent task share this blackboard.
 */
export function createSession(taskId, objective, opts = {}) {
  return {
    id: taskId || Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    objective,
    created: Date.now(),
    status: 'active',

    // Shared knowledge — agents write findings here, others read them
    blackboard: {
      findings: [],       // { agentId, type, content, confidence, timestamp }
      files: new Set(),   // files discovered or changed (serialized as array)
      decisions: [],      // { agentId, decision, rationale, timestamp }
      warnings: [],       // { agentId, severity, message, timestamp }
      context: {},        // arbitrary key-value context any agent can set
    },

    // Agent tracking
    agents: [],           // { id, role, provider, model, status, startedAt, completedAt, result }

    // Event log — HEAD reads this to know what happened
    events: [],           // { type, agentId, data, timestamp }

    // Chain configuration
    chain: opts.chain || null,  // ordered list of stages if chained execution
    currentStage: 0,

    // Cross-review config
    crossReview: opts.crossReview ?? false,
  };
}

// ── Blackboard operations ───────────────────────────────────────────────────

export function addFinding(session, agentId, type, content, confidence = 0.8) {
  session.blackboard.findings.push({
    agentId, type, content, confidence, timestamp: Date.now(),
  });
  _emitEvent(session, 'finding', agentId, { type, content, confidence });
}

export function addDecision(session, agentId, decision, rationale) {
  session.blackboard.decisions.push({
    agentId, decision, rationale, timestamp: Date.now(),
  });
  _emitEvent(session, 'decision', agentId, { decision, rationale });
}

export function addWarning(session, agentId, severity, message) {
  session.blackboard.warnings.push({
    agentId, severity, message, timestamp: Date.now(),
  });
  _emitEvent(session, 'warning', agentId, { severity, message });
}

export function setContext(session, key, value, agentId = 'head') {
  session.blackboard.context[key] = value;
  _emitEvent(session, 'context-set', agentId, { key });
}

export function trackFile(session, filePath, agentId) {
  if (typeof session.blackboard.files === 'object' && session.blackboard.files instanceof Set) {
    session.blackboard.files.add(filePath);
  } else {
    if (!Array.isArray(session.blackboard.files)) session.blackboard.files = [];
    if (!session.blackboard.files.includes(filePath)) session.blackboard.files.push(filePath);
  }
  _emitEvent(session, 'file-tracked', agentId, { filePath });
}

// ── Agent lifecycle ─────────────────────────────────────────────────────────

export function registerAgent(session, agentId, role, provider, model) {
  const agent = {
    id: agentId,
    role,
    provider,
    model,
    status: 'registered',
    startedAt: null,
    completedAt: null,
    result: null,
    summary: null,
  };
  session.agents.push(agent);
  _emitEvent(session, 'agent-registered', agentId, { role, provider, model });
  return agent;
}

export function startAgent(session, agentId) {
  const agent = session.agents.find(a => a.id === agentId);
  if (agent) {
    agent.status = 'running';
    agent.startedAt = Date.now();
    _emitEvent(session, 'agent-started', agentId, {});
  }
}

export function completeAgent(session, agentId, result, summary) {
  const agent = session.agents.find(a => a.id === agentId);
  if (agent) {
    agent.status = result?.error ? 'failed' : 'completed';
    agent.completedAt = Date.now();
    agent.result = result;
    agent.summary = summary || _extractSummary(result);
    _emitEvent(session, 'agent-completed', agentId, {
      status: agent.status,
      durationMs: agent.completedAt - agent.startedAt,
      summary: agent.summary,
    });
  }
}

// ── Context builder: what an agent sees from prior agents ───────────────────

/**
 * Build a context injection string for the next agent in the collaboration.
 * Contains: blackboard findings, decisions, warnings, and prior agent summaries.
 * Token-budgeted to stay compact.
 */
export function buildAgentContext(session, forAgentId, maxTokens = 2000) {
  const lines = [];
  const charBudget = maxTokens * 4;

  lines.push('[COLLABORATION CONTEXT]');

  // Prior agent summaries (most valuable — what others already did)
  const completedAgents = session.agents.filter(a => a.status === 'completed' && a.id !== forAgentId);
  if (completedAgents.length > 0) {
    lines.push('');
    lines.push('Prior work:');
    for (const a of completedAgents) {
      const duration = a.completedAt - a.startedAt;
      const durationLabel = duration > 60000 ? `${Math.round(duration / 60000)}m` : `${Math.round(duration / 1000)}s`;
      lines.push(`- ${a.role} (${a.provider}/${a.model}, ${durationLabel}): ${(a.summary || 'completed').slice(0, 200)}`);
    }
  }

  // Key findings (high confidence first)
  const findings = [...session.blackboard.findings]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
  if (findings.length > 0) {
    lines.push('');
    lines.push('Findings:');
    for (const f of findings) {
      lines.push(`- [${f.type}] ${f.content.slice(0, 150)}`);
    }
  }

  // Decisions made
  if (session.blackboard.decisions.length > 0) {
    lines.push('');
    lines.push('Decisions:');
    for (const d of session.blackboard.decisions.slice(-5)) {
      lines.push(`- ${d.decision}: ${d.rationale.slice(0, 100)}`);
    }
  }

  // Active warnings
  const activeWarnings = session.blackboard.warnings.filter(w => w.severity === 'high' || w.severity === 'critical');
  if (activeWarnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of activeWarnings) {
      lines.push(`- [${w.severity}] ${w.message.slice(0, 120)}`);
    }
  }

  // Files touched
  const files = session.blackboard.files instanceof Set
    ? [...session.blackboard.files]
    : (Array.isArray(session.blackboard.files) ? session.blackboard.files : []);
  if (files.length > 0) {
    lines.push('');
    lines.push(`Files in play: ${files.slice(0, 15).join(', ')}${files.length > 15 ? ` (+${files.length - 15} more)` : ''}`);
  }

  lines.push('[/COLLABORATION CONTEXT]');

  let result = lines.join('\n');
  if (result.length > charBudget) {
    result = result.slice(0, charBudget - 20) + '\n[...truncated]';
  }
  return result;
}

// ── Chain execution: ordered multi-stage pipelines ──────────────────────────

/**
 * Define a chain of agent stages.
 * Each stage runs after the previous completes, with full blackboard access.
 *
 * @param {Array<{ role: string, tier: string, promptTemplate: Function, provider?: string, model?: string }>} stages
 */
export function defineChain(stages) {
  return stages.map((s, i) => ({
    index: i,
    role: s.role,
    tier: s.tier || 'execute',
    promptTemplate: s.promptTemplate,
    provider: s.provider || 'claude',
    model: s.model || null,
    dependsOn: i > 0 ? [i - 1] : [],
  }));
}

/**
 * Get the next stage to execute in a chain.
 * Returns null when all stages are complete or if dependencies aren't met.
 */
export function getNextStage(session) {
  if (!session.chain) return null;

  const stage = session.chain[session.currentStage];
  if (!stage) return null;

  // Check dependencies
  for (const depIdx of stage.dependsOn || []) {
    const depAgent = session.agents.find(a => a.role === session.chain[depIdx]?.role);
    if (!depAgent || depAgent.status !== 'completed') return null;
  }

  return stage;
}

/**
 * Advance the chain to the next stage.
 */
export function advanceChain(session) {
  session.currentStage++;
  return session.currentStage < (session.chain?.length || 0);
}

/**
 * Build the prompt for a chain stage, injecting collaboration context.
 */
export function buildChainPrompt(session, stage) {
  const context = buildAgentContext(session, `chain-${stage.index}`);
  const basePrompt = stage.promptTemplate(session);
  return `${context}\n\n${basePrompt}`;
}

// ── Cross-review: opposite provider reviews the work ────────────────────────

/**
 * Build a cross-review prompt for an agent's output.
 * Symmetric: works in both directions (Claude→OpenAI and OpenAI→Claude).
 * Falls back to same-provider review with a different model if the opposite
 * provider isn't available.
 *
 * @param {object} session
 * @param {string} agentId
 * @param {string[]} [availableProviders]  Which providers are online
 */
export function buildCrossReviewPrompt(session, agentId, availableProviders) {
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent || !agent.result) return null;

  // Symmetric provider swap — respects availability
  const opposite = agent.provider === 'claude' ? 'openai' : 'claude';
  const reviewProvider = (!availableProviders || availableProviders.includes(opposite))
    ? opposite
    : agent.provider;

  // When same-provider review, use a different model tier
  const sameProvider = reviewProvider === agent.provider;
  const reviewModel = sameProvider
    ? (agent.model === 'opus' ? 'sonnet' : 'opus')
    : null;

  const prompt = [
    `Review the following work by ${agent.provider}/${agent.model} (${agent.role}):`,
    '',
    `Objective: ${session.objective}`,
    '',
    `Result summary: ${(agent.summary || '').slice(0, 500)}`,
    '',
    'Check for:',
    '- Correctness: does the output match the objective?',
    '- Missed edge cases or risks',
    '- Anything the next agent should know',
    '',
    'Be concise. Return: assessment (pass/flag/fail), key concerns, and suggestions.',
    sameProvider ? '\nNote: You are reviewing work done by the same provider but a different model. Be especially critical.' : '',
  ].join('\n');

  return { prompt, provider: reviewProvider, model: reviewModel, tier: 'search' };
}

// ── HEAD observation: synthesize what happened ──────────────────────────────

/**
 * Generate a compact summary of the collaboration session for HEAD.
 * HEAD uses this to understand what happened without reading raw outputs.
 */
export function synthesize(session) {
  const completed = session.agents.filter(a => a.status === 'completed');
  const failed = session.agents.filter(a => a.status === 'failed');
  const running = session.agents.filter(a => a.status === 'running');

  const totalDuration = completed.reduce((sum, a) => sum + (a.completedAt - a.startedAt), 0);

  const files = session.blackboard.files instanceof Set
    ? [...session.blackboard.files]
    : (Array.isArray(session.blackboard.files) ? session.blackboard.files : []);

  return {
    sessionId: session.id,
    objective: session.objective,
    status: failed.length > 0 ? 'partial' : running.length > 0 ? 'in-progress' : 'complete',
    agents: {
      total: session.agents.length,
      completed: completed.length,
      failed: failed.length,
      running: running.length,
    },
    summaries: completed.map(a => ({
      role: a.role,
      provider: a.provider,
      model: a.model,
      summary: a.summary,
      durationMs: a.completedAt - a.startedAt,
    })),
    findings: session.blackboard.findings.length,
    decisions: session.blackboard.decisions,
    warnings: session.blackboard.warnings.filter(w => w.severity !== 'low'),
    filesAffected: files,
    totalDurationMs: totalDuration,
    eventCount: session.events.length,
  };
}

// ── Preset collaboration patterns ───────────────────────────────────────────

/**
 * Plan-Code-Review: the Devin-style self-review loop.
 * 1. Plan agent outlines the approach
 * 2. Code agent implements
 * 3. Review agent checks the work
 * 4. If review fails, code agent gets another pass with review feedback
 */
export function planCodeReviewChain(objective, scope, opts = {}) {
  return defineChain([
    {
      role: 'planner',
      tier: 'think',
      provider: opts.planProvider || 'claude',
      model: opts.planModel || 'opus',
      promptTemplate: (session) => {
        return [
          `Plan the implementation for: ${objective}`,
          '',
          `Scope: ${scope.join(', ')}`,
          '',
          'Return: step-by-step plan, files to modify, risks, and acceptance criteria.',
          'Do NOT implement — only plan.',
        ].join('\n');
      },
    },
    {
      role: 'implementer',
      tier: 'execute',
      provider: opts.codeProvider || 'claude',
      model: opts.codeModel || 'sonnet',
      promptTemplate: (session) => {
        const planAgent = session.agents.find(a => a.role === 'planner');
        const plan = planAgent?.summary || 'No plan available — use best judgment.';
        return [
          `Implement: ${objective}`,
          '',
          `Plan: ${plan}`,
          '',
          `Scope: ${scope.join(', ')}`,
          '',
          'Follow the plan exactly. Report files changed and tests run.',
        ].join('\n');
      },
    },
    {
      role: 'reviewer',
      tier: 'review',
      provider: opts.reviewProvider || (opts.codeProvider === 'claude' ? 'openai' : 'claude'),
      model: opts.reviewModel || null,
      promptTemplate: (session) => {
        const implAgent = session.agents.find(a => a.role === 'implementer');
        return [
          `Review the implementation of: ${objective}`,
          '',
          `What was done: ${implAgent?.summary || 'unknown'}`,
          '',
          `Scope: ${scope.join(', ')}`,
          '',
          'Check: correctness, edge cases, security, test coverage, architectural drift.',
          'Return: pass/fail, findings with severity, and fixes needed.',
        ].join('\n');
      },
    },
  ]);
}

/**
 * Research-Synthesize: multiple agents research in parallel, one synthesizes.
 */
export function researchSynthesizePattern(question, sources, opts = {}) {
  const researchStages = sources.map((source, i) => ({
    role: `researcher-${i}`,
    tier: 'search',
    provider: i % 2 === 0 ? 'claude' : (opts.altProvider || 'claude'),
    model: opts.researchModel || 'haiku',
    promptTemplate: () => `Research: ${question}\nFocus on: ${source}\nReturn: key findings, file references, confidence level.`,
  }));

  return defineChain([
    ...researchStages,
    {
      role: 'synthesizer',
      tier: 'think',
      provider: opts.synthProvider || 'claude',
      model: opts.synthModel || 'sonnet',
      promptTemplate: (session) => {
        const researchFindings = session.agents
          .filter(a => a.role.startsWith('researcher-') && a.status === 'completed')
          .map(a => `[${a.role}]: ${a.summary || 'no findings'}`)
          .join('\n');
        return [
          `Synthesize research on: ${question}`,
          '',
          'Research findings:',
          researchFindings,
          '',
          'Combine findings into a coherent answer. Note disagreements between sources.',
          'Return: synthesis, confidence level, remaining unknowns.',
        ].join('\n');
      },
    },
  ]);
}

/**
 * Dual-Review: two providers independently review, then a third reconciles.
 */
export function dualReviewPattern(files, context, opts = {}) {
  return defineChain([
    {
      role: 'reviewer-claude',
      tier: 'review',
      provider: 'claude',
      model: opts.claudeModel || 'sonnet',
      promptTemplate: () => `Review these files: ${files.join(', ')}\nContext: ${context}\nReturn: findings with severity and line references.`,
    },
    {
      role: 'reviewer-openai',
      tier: 'review',
      provider: 'openai',
      model: opts.openaiModel || 'gpt-4o',
      promptTemplate: () => `Review these files: ${files.join(', ')}\nContext: ${context}\nReturn: findings with severity and line references.`,
    },
    {
      role: 'reconciler',
      tier: 'think',
      provider: 'claude',
      model: opts.reconcileModel || 'opus',
      promptTemplate: (session) => {
        const reviews = session.agents
          .filter(a => a.role.startsWith('reviewer-') && a.status === 'completed')
          .map(a => `[${a.provider}]: ${a.summary || 'no findings'}`)
          .join('\n\n');
        return [
          'Reconcile two independent code reviews:',
          '',
          reviews,
          '',
          'Identify: agreements (high confidence), disagreements (need resolution), and missed items.',
          'Return: final consolidated review with severity ratings.',
        ].join('\n');
      },
    },
  ]);
}

// ── Persistence ─────────────────────────────────────────────────────────────

export function saveSession(session, cwd) {
  const dir = join(cwd || process.cwd(), '.dual-brain', 'collaborations');
  mkdirSync(dir, { recursive: true });

  // Convert Set to Array for JSON serialization
  const serializable = {
    ...session,
    blackboard: {
      ...session.blackboard,
      files: session.blackboard.files instanceof Set
        ? [...session.blackboard.files]
        : session.blackboard.files,
    },
  };

  writeFileSync(join(dir, `${session.id}.json`), JSON.stringify(serializable, null, 2));
}

export function loadSession(sessionId, cwd) {
  const path = join(cwd || process.cwd(), '.dual-brain', 'collaborations', `${sessionId}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.blackboard.files = new Set(data.blackboard.files || []);
    return data;
  } catch {
    return null;
  }
}

// ── Event bus (internal) ────────────────────────────────────────────────────

function _emitEvent(session, type, agentId, data) {
  session.events.push({ type, agentId, data, timestamp: Date.now() });
}

function _extractSummary(result) {
  if (!result) return null;
  if (typeof result === 'string') return result.slice(0, 300);
  if (result.summary) return String(result.summary).slice(0, 300);
  if (result.rawOutput) return String(result.rawOutput).slice(0, 300);
  return null;
}

// ── Event log persistence (append-only JSONL) ───────────────────────────────

export function persistEvents(session, cwd) {
  const dir = join(cwd || process.cwd(), '.dual-brain', 'collaborations');
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, `${session.id}.events.jsonl`);
  for (const event of session.events) {
    appendFileSync(logPath, JSON.stringify(event) + '\n');
  }
}
