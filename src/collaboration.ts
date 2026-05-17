import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Finding {
  agentId: string;
  type: string;
  content: string;
  confidence: number;
  timestamp: number;
}

export interface Decision {
  agentId: string;
  decision: string;
  rationale: string;
  timestamp: number;
}

export interface Warning {
  agentId: string;
  severity: string;
  message: string;
  timestamp: number;
}

export interface Blackboard {
  findings: Finding[];
  files: Set<string> | string[];
  decisions: Decision[];
  warnings: Warning[];
  context: Record<string, unknown>;
}

export interface Agent {
  id: string;
  role: string;
  provider: string;
  model: string | null;
  status: 'registered' | 'running' | 'completed' | 'failed';
  startedAt: number | null;
  completedAt: number | null;
  result: unknown;
  summary: string | null;
}

export interface CollaborationEvent {
  type: string;
  agentId: string;
  data: unknown;
  timestamp: number;
}

export interface ChainStage {
  index: number;
  role: string;
  tier: string;
  promptTemplate: (session: CollaborationSession) => string;
  provider: string;
  model: string | null;
  dependsOn: number[];
}

export interface CollaborationSession {
  id: string;
  objective: string;
  created: number;
  status: string;
  blackboard: Blackboard;
  agents: Agent[];
  events: CollaborationEvent[];
  chain: ChainStage[] | null;
  currentStage: number;
  crossReview: boolean;
}

export interface SynthesisResult {
  sessionId: string;
  objective: string;
  status: string;
  agents: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  summaries: Array<{
    role: string;
    provider: string;
    model: string | null;
    summary: string | null;
    durationMs: number;
  }>;
  findings: number;
  decisions: Decision[];
  warnings: Warning[];
  filesAffected: string[];
  totalDurationMs: number;
  eventCount: number;
}

export interface CrossReviewResult {
  prompt: string;
  provider: string;
  model: string | null;
  tier: string;
}

// ── Blackboard: shared state across collaborating agents ────────────────────

/**
 * Create a fresh collaboration session.
 */
export function createSession(taskId: string | null, objective: string, opts: { chain?: ChainStage[] | null; crossReview?: boolean } = {}): CollaborationSession {
  return {
    id: taskId || Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    objective,
    created: Date.now(),
    status: 'active',

    blackboard: {
      findings: [],
      files: new Set<string>(),
      decisions: [],
      warnings: [],
      context: {},
    },

    agents: [],
    events: [],
    chain: opts.chain || null,
    currentStage: 0,
    crossReview: opts.crossReview ?? false,
  };
}

// ── Blackboard operations ───────────────────────────────────────────────────

export function addFinding(session: CollaborationSession, agentId: string, type: string, content: string, confidence = 0.8): void {
  session.blackboard.findings.push({
    agentId, type, content, confidence, timestamp: Date.now(),
  });
  _emitEvent(session, 'finding', agentId, { type, content, confidence });
}

export function addDecision(session: CollaborationSession, agentId: string, decision: string, rationale: string): void {
  session.blackboard.decisions.push({
    agentId, decision, rationale, timestamp: Date.now(),
  });
  _emitEvent(session, 'decision', agentId, { decision, rationale });
}

export function addWarning(session: CollaborationSession, agentId: string, severity: string, message: string): void {
  session.blackboard.warnings.push({
    agentId, severity, message, timestamp: Date.now(),
  });
  _emitEvent(session, 'warning', agentId, { severity, message });
}

export function setContext(session: CollaborationSession, key: string, value: unknown, agentId = 'head'): void {
  session.blackboard.context[key] = value;
  _emitEvent(session, 'context-set', agentId, { key });
}

export function trackFile(session: CollaborationSession, filePath: string, agentId: string): void {
  if (session.blackboard.files instanceof Set) {
    session.blackboard.files.add(filePath);
  } else {
    if (!Array.isArray(session.blackboard.files)) session.blackboard.files = [];
    if (!session.blackboard.files.includes(filePath)) session.blackboard.files.push(filePath);
  }
  _emitEvent(session, 'file-tracked', agentId, { filePath });
}

// ── Agent lifecycle ─────────────────────────────────────────────────────────

export function registerAgent(session: CollaborationSession, agentId: string, role: string, provider: string, model: string): Agent {
  const agent: Agent = {
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

export function startAgent(session: CollaborationSession, agentId: string): void {
  const agent = session.agents.find(a => a.id === agentId);
  if (agent) {
    agent.status = 'running';
    agent.startedAt = Date.now();
    _emitEvent(session, 'agent-started', agentId, {});
  }
}

export function completeAgent(session: CollaborationSession, agentId: string, result: unknown, summary?: string): void {
  const agent = session.agents.find(a => a.id === agentId);
  if (agent) {
    agent.status = (result as { error?: unknown })?.error ? 'failed' : 'completed';
    agent.completedAt = Date.now();
    agent.result = result;
    agent.summary = summary || _extractSummary(result);
    _emitEvent(session, 'agent-completed', agentId, {
      status: agent.status,
      durationMs: agent.completedAt - (agent.startedAt || 0),
      summary: agent.summary,
    });
  }
}

// ── Context builder ───────────────────────────────────────────────────────

/**
 * Build a context injection string for the next agent in the collaboration.
 */
export function buildAgentContext(session: CollaborationSession, forAgentId: string, maxTokens = 2000): string {
  const lines: string[] = [];
  const charBudget = maxTokens * 4;

  lines.push('[COLLABORATION CONTEXT]');

  const completedAgents = session.agents.filter(a => a.status === 'completed' && a.id !== forAgentId);
  if (completedAgents.length > 0) {
    lines.push('');
    lines.push('Prior work:');
    for (const a of completedAgents) {
      const duration = (a.completedAt || 0) - (a.startedAt || 0);
      const durationLabel = duration > 60000 ? `${Math.round(duration / 60000)}m` : `${Math.round(duration / 1000)}s`;
      lines.push(`- ${a.role} (${a.provider}/${a.model}, ${durationLabel}): ${(a.summary || 'completed').slice(0, 200)}`);
    }
  }

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

  if (session.blackboard.decisions.length > 0) {
    lines.push('');
    lines.push('Decisions:');
    for (const d of session.blackboard.decisions.slice(-5)) {
      lines.push(`- ${d.decision}: ${d.rationale.slice(0, 100)}`);
    }
  }

  const activeWarnings = session.blackboard.warnings.filter(w => w.severity === 'high' || w.severity === 'critical');
  if (activeWarnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of activeWarnings) {
      lines.push(`- [${w.severity}] ${w.message.slice(0, 120)}`);
    }
  }

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

// ── Chain execution ──────────────────────────────────────────────────────

export function defineChain(stages: Array<{ role: string; tier?: string; promptTemplate: (session: CollaborationSession) => string; provider?: string; model?: string | null }>): ChainStage[] {
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

export function getNextStage(session: CollaborationSession): ChainStage | null {
  if (!session.chain) return null;

  const stage = session.chain[session.currentStage];
  if (!stage) return null;

  for (const depIdx of stage.dependsOn || []) {
    const depAgent = session.agents.find(a => a.role === session.chain![depIdx]?.role);
    if (!depAgent || depAgent.status !== 'completed') return null;
  }

  return stage;
}

export function advanceChain(session: CollaborationSession): boolean {
  session.currentStage++;
  return session.currentStage < (session.chain?.length || 0);
}

export function buildChainPrompt(session: CollaborationSession, stage: ChainStage): string {
  const context = buildAgentContext(session, `chain-${stage.index}`);
  const basePrompt = stage.promptTemplate(session);
  return `${context}\n\n${basePrompt}`;
}

// ── Cross-review ────────────────────────────────────────────────────────

export function buildCrossReviewPrompt(session: CollaborationSession, agentId: string, availableProviders?: string[]): CrossReviewResult | null {
  const agent = session.agents.find(a => a.id === agentId);
  if (!agent || !agent.result) return null;

  const opposite = agent.provider === 'claude' ? 'openai' : 'claude';
  const reviewProvider = (!availableProviders || availableProviders.includes(opposite))
    ? opposite
    : agent.provider;

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

// ── HEAD observation ──────────────────────────────────────────────────────

export function synthesize(session: CollaborationSession): SynthesisResult {
  const completed = session.agents.filter(a => a.status === 'completed');
  const failed = session.agents.filter(a => a.status === 'failed');
  const running = session.agents.filter(a => a.status === 'running');

  const totalDuration = completed.reduce((sum, a) => sum + ((a.completedAt || 0) - (a.startedAt || 0)), 0);

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
      durationMs: (a.completedAt || 0) - (a.startedAt || 0),
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

export function planCodeReviewChain(objective: string, scope: string[], opts: { planProvider?: string; planModel?: string; codeProvider?: string; codeModel?: string; reviewProvider?: string; reviewModel?: string } = {}): ChainStage[] {
  return defineChain([
    {
      role: 'planner',
      tier: 'think',
      provider: opts.planProvider || 'claude',
      model: opts.planModel || 'opus',
      promptTemplate: () => {
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

export function researchSynthesizePattern(question: string, sources: string[], opts: { altProvider?: string; researchModel?: string; synthProvider?: string; synthModel?: string } = {}): ChainStage[] {
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

export function dualReviewPattern(files: string[], context: string, opts: { claudeModel?: string; openaiModel?: string; reconcileModel?: string } = {}): ChainStage[] {
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

export function saveSession(session: CollaborationSession, cwd?: string): void {
  const dir = join(cwd || process.cwd(), '.dual-brain', 'collaborations');
  mkdirSync(dir, { recursive: true });

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

export function loadSession(sessionId: string, cwd?: string): CollaborationSession | null {
  const path = join(cwd || process.cwd(), '.dual-brain', 'collaborations', `${sessionId}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    data.blackboard.files = new Set(data.blackboard.files || []);
    return data as CollaborationSession;
  } catch {
    return null;
  }
}

// ── Event bus (internal) ────────────────────────────────────────────────────

function _emitEvent(session: CollaborationSession, type: string, agentId: string, data: unknown): void {
  session.events.push({ type, agentId, data, timestamp: Date.now() });
}

function _extractSummary(result: unknown): string | null {
  if (!result) return null;
  if (typeof result === 'string') return result.slice(0, 300);
  if ((result as { summary?: unknown }).summary) return String((result as { summary: unknown }).summary).slice(0, 300);
  if ((result as { rawOutput?: unknown }).rawOutput) return String((result as { rawOutput: unknown }).rawOutput).slice(0, 300);
  return null;
}

// ── Event log persistence (append-only JSONL) ───────────────────────────────

export function persistEvents(session: CollaborationSession, cwd?: string): void {
  const dir = join(cwd || process.cwd(), '.dual-brain', 'collaborations');
  mkdirSync(dir, { recursive: true });
  const logPath = join(dir, `${session.id}.events.jsonl`);
  for (const event of session.events) {
    appendFileSync(logPath, JSON.stringify(event) + '\n');
  }
}
