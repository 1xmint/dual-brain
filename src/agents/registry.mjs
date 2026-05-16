import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = __dirname;
const SKILLS_DIR = join(AGENTS_DIR, '..', '..', 'skills');

// Agent declarations loaded at startup
let _agents = null;
let _skills = null;

export function getAgents() {
  if (_agents) return _agents;
  _agents = new Map();

  // Load built-in agents
  for (const agent of BUILT_IN_AGENTS) {
    _agents.set(agent.id, agent);
  }

  // Load custom agents from .claude/agents/ if they exist
  const customDir = join(AGENTS_DIR, '..', '..', '.claude', 'agents');
  if (existsSync(customDir)) {
    for (const file of readdirSync(customDir).filter(f => f.endsWith('.md'))) {
      try {
        const content = readFileSync(join(customDir, file), 'utf8');
        const parsed = parseAgentMd(content);
        if (parsed) _agents.set(parsed.id, parsed);
      } catch {}
    }
  }

  return _agents;
}

export function getSkills() {
  if (_skills) return _skills;
  _skills = new Map();

  for (const skill of BUILT_IN_SKILLS) {
    _skills.set(skill.command, skill);
  }

  return _skills;
}

export function matchAgent(intent, risk, taskType) {
  const agents = getAgents();
  const matches = [];

  for (const [id, agent] of agents) {
    let score = 0;
    if (agent.intents && agent.intents.includes(intent)) score += 10;
    if (agent.taskTypes && agent.taskTypes.some(t => taskType.includes(t))) score += 5;
    if (agent.minRisk && riskLevel(risk) >= riskLevel(agent.minRisk)) score += 3;
    if (score > 0) matches.push({ ...agent, score });
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function matchSkill(command) {
  const skills = getSkills();
  const cmd = command.replace(/^\//, '').split(' ')[0].toLowerCase();
  return skills.get(cmd) || null;
}

export function skillToTaskBrief(command, args) {
  const skill = matchSkill(command);
  if (!skill) return null;

  return {
    objective: skill.objective(args),
    scope: skill.scope || [],
    tier: skill.tier,
    model: skill.model,
    risk: skill.risk || 'low',
    acceptanceCriteria: skill.acceptanceCriteria || [],
    agentId: skill.agent,
    cost: skill.cost,
  };
}

function riskLevel(r) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[r] || 0;
}

function parseAgentMd(content) {
  // Parse YAML frontmatter from .claude/agents/*.md
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
  }

  return {
    id: meta.name || 'unknown',
    name: meta.name || 'Unknown Agent',
    tier: meta.tier || 'execute',
    model: meta.model || 'sonnet',
    intents: (meta.intents || '').split(',').map(s => s.trim()),
    taskTypes: (meta.taskTypes || '').split(',').map(s => s.trim()),
    prompt: content.replace(/^---[\s\S]*?---\n/, ''),
  };
}

// ── Built-in Agents ──────────────────────────────────────────────────────

const BUILT_IN_AGENTS = [
  {
    id: 'reviewer',
    name: 'Code Reviewer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['review', 'audit', 'check'],
    taskTypes: ['code-review', 'pr-review', 'diff-review'],
    contract: {
      inputs: ['diff', 'base_branch', 'focus_areas'],
      outputs: ['findings', 'severity', 'suggestions', 'verdict'],
    },
    prompt: `You are a code reviewer. Review the provided diff for: correctness, security issues, performance problems, code style, and test coverage gaps. For each finding, provide: severity (critical/high/medium/low), file and line, description, and suggested fix. Return structured JSON: { "verdict": "approve|request_changes|comment", "findings": [...], "summary": "..." }`,
  },
  {
    id: 'debugger',
    name: 'Debugger',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['debug', 'fix', 'investigate', 'error'],
    taskTypes: ['bug-fix', 'error-investigation', 'crash-analysis'],
    contract: {
      inputs: ['error_message', 'stack_trace', 'reproduction_steps', 'relevant_files'],
      outputs: ['root_cause', 'patch', 'tests', 'confidence'],
    },
    prompt: `You are a debugger. Given an error, stack trace, or bug description: 1) Reproduce or trace the issue, 2) Identify root cause, 3) Implement the fix, 4) Add a regression test. Return: { "root_cause": "...", "files_changed": [...], "tests_added": [...], "confidence": "high|medium|low" }`,
  },
  {
    id: 'test-writer',
    name: 'Test Writer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['test', 'coverage', 'spec'],
    taskTypes: ['test-generation', 'test-coverage', 'fixture-creation'],
    contract: {
      inputs: ['target_file', 'test_framework', 'existing_tests'],
      outputs: ['test_file', 'test_count', 'coverage_areas', 'edge_cases'],
    },
    prompt: `You are a test writer. Given a source file, generate comprehensive tests covering: happy path, edge cases, error conditions, and boundary values. Match the existing test framework and style. Return: { "test_file": "...", "tests": [...], "edge_cases_covered": [...] }`,
  },
  {
    id: 'architect',
    name: 'Architect',
    tier: 'think',
    model: 'opus',
    cost: 'full',
    intents: ['design', 'architect', 'plan', 'structure'],
    taskTypes: ['architecture', 'system-design', 'api-design', 'module-design'],
    contract: {
      inputs: ['goal', 'constraints', 'existing_architecture', 'scale_requirements'],
      outputs: ['design', 'modules', 'interfaces', 'tradeoffs', 'risks'],
    },
    prompt: `You are a software architect. Design the system or module with: clear module boundaries, well-defined interfaces, explicit tradeoffs, and identified risks. Return: { "design": "...", "modules": [...], "interfaces": [...], "tradeoffs": [...], "risks": [...] }`,
  },
  {
    id: 'security',
    name: 'Security Auditor',
    tier: 'execute',
    model: 'sonnet',
    cost: 'full',
    intents: ['security', 'vulnerability', 'owasp', 'secrets'],
    taskTypes: ['security-audit', 'vulnerability-scan', 'secret-detection', 'auth-review'],
    minRisk: 'medium',
    contract: {
      inputs: ['scope', 'diff', 'dependencies', 'config_files'],
      outputs: ['vulnerabilities', 'severity', 'remediation', 'compliance'],
    },
    prompt: `You are a security auditor. Scan for: OWASP Top 10 vulnerabilities, hardcoded secrets, insecure dependencies, auth/authz issues, injection vectors, and data exposure. Return: { "vulnerabilities": [{ "type": "...", "severity": "critical|high|medium|low", "file": "...", "line": N, "remediation": "..." }], "clean": true/false }`,
  },
  {
    id: 'refactor',
    name: 'Refactorer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['refactor', 'cleanup', 'simplify', 'extract'],
    taskTypes: ['refactoring', 'code-cleanup', 'extraction', 'rename'],
    contract: {
      inputs: ['target', 'goal', 'constraints', 'preserve_behavior'],
      outputs: ['patch', 'behavior_preserved', 'tests_updated'],
    },
    prompt: `You are a refactoring specialist. Improve code structure while preserving behavior. Verify with existing tests. Return: { "changes": [...], "behavior_preserved": true, "tests_passing": true }`,
  },
  {
    id: 'docs',
    name: 'Documentation Writer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['document', 'readme', 'api-doc', 'explain'],
    taskTypes: ['documentation', 'readme-update', 'api-docs', 'changelog'],
    contract: {
      inputs: ['files', 'audience', 'format', 'existing_docs'],
      outputs: ['docs_patch', 'sections_updated'],
    },
    prompt: `You are a documentation writer. Generate clear, concise documentation for the specified code. Match existing doc style. Return: { "docs": "...", "sections": [...] }`,
  },
  {
    id: 'researcher',
    name: 'Research Agent',
    tier: 'search',
    model: 'haiku',
    cost: 'cheap',
    intents: ['research', 'lookup', 'find', 'search', 'explore'],
    taskTypes: ['web-search', 'docs-lookup', 'api-exploration', 'codebase-search'],
    contract: {
      inputs: ['query', 'domains', 'freshness_requirement'],
      outputs: ['sources', 'summary', 'references', 'confidence'],
    },
    prompt: `You are a research agent. Find accurate, current information. Cite sources. Distinguish facts from opinions. Return: { "answer": "...", "sources": [...], "confidence": "high|medium|low" }`,
  },
  {
    id: 'performance',
    name: 'Performance Optimizer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    intents: ['optimize', 'performance', 'speed', 'profile', 'bottleneck'],
    taskTypes: ['performance-optimization', 'profiling', 'bottleneck-detection'],
    contract: {
      inputs: ['hot_path', 'metrics', 'budget_ms'],
      outputs: ['bottlenecks', 'optimizations', 'patch', 'expected_improvement'],
    },
    prompt: `You are a performance specialist. Profile, identify bottlenecks, and optimize. Measure before/after. Return: { "bottlenecks": [...], "optimizations": [...], "expected_speedup": "..." }`,
  },
  {
    id: 'devops',
    name: 'DevOps Engineer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'full',
    intents: ['deploy', 'ci', 'docker', 'infrastructure', 'pipeline'],
    taskTypes: ['deployment', 'ci-cd', 'docker', 'infrastructure', 'monitoring'],
    minRisk: 'medium',
    contract: {
      inputs: ['goal', 'environment', 'constraints', 'current_config'],
      outputs: ['config', 'commands', 'risks', 'rollback_plan'],
    },
    prompt: `You are a DevOps engineer. Configure infrastructure, CI/CD, and deployment with: security best practices, rollback plans, and monitoring. Return: { "config_changes": [...], "commands": [...], "risks": [...], "rollback": "..." }`,
  },
];

// ── Built-in Skills ──────────────────────────────────────────────────────

const BUILT_IN_SKILLS = [
  {
    command: 'review',
    agent: 'reviewer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Review current changes or a specific file',
    objective: (args) => args ? `Review changes in ${args}` : 'Review all uncommitted changes',
    acceptanceCriteria: ['All findings include severity and file location', 'Verdict is clear'],
  },
  {
    command: 'debug',
    agent: 'debugger',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Investigate and fix an error',
    objective: (args) => `Debug: ${args || 'investigate recent error'}`,
    acceptanceCriteria: ['Root cause identified', 'Fix implemented', 'Regression test added'],
  },
  {
    command: 'test',
    agent: 'test-writer',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Generate tests for a file',
    objective: (args) => `Generate comprehensive tests for ${args || 'changed files'}`,
    acceptanceCriteria: ['Tests cover happy path and edge cases', 'Tests pass'],
  },
  {
    command: 'plan',
    agent: 'architect',
    tier: 'think',
    model: 'opus',
    cost: 'full',
    description: 'Create an execution plan for a task',
    objective: (args) => `Create execution plan: ${args || 'current task'}`,
    acceptanceCriteria: ['Steps are concrete and ordered', 'Risks identified', 'Acceptance criteria per step'],
  },
  {
    command: 'audit',
    agent: 'security',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Run a security, quality, or dependency audit',
    objective: (args) => `Audit: ${args || 'security scan of current changes'}`,
    acceptanceCriteria: ['All findings include severity', 'Remediation steps provided'],
  },
  {
    command: 'fix',
    agent: 'debugger',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Fix a specific issue',
    objective: (args) => `Fix: ${args}`,
    acceptanceCriteria: ['Issue resolved', 'Tests pass', 'No regressions'],
  },
  {
    command: 'explain',
    agent: 'researcher',
    tier: 'search',
    model: 'haiku',
    cost: 'cheap',
    description: 'Explain how code works',
    objective: (args) => `Explain: ${args || 'current file'}`,
  },
  {
    command: 'refactor',
    agent: 'refactor',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Refactor code for clarity or performance',
    objective: (args) => `Refactor: ${args || 'current file'}`,
    acceptanceCriteria: ['Behavior preserved', 'Tests still pass'],
  },
  {
    command: 'doc',
    agent: 'docs',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Generate or update documentation',
    objective: (args) => `Document: ${args || 'changed files'}`,
  },
  {
    command: 'brainstorm',
    agent: 'architect',
    tier: 'think',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Generate ideas and explore options',
    objective: (args) => `Brainstorm: ${args || 'current challenge'}`,
  },
  {
    command: 'search',
    agent: 'researcher',
    tier: 'search',
    model: 'haiku',
    cost: 'cheap',
    description: 'Search web, docs, or codebase',
    objective: (args) => `Search: ${args}`,
  },
  {
    command: 'status',
    agent: null, // deterministic, no agent needed
    tier: 'free',
    cost: 'free',
    description: 'Show system health and status',
    objective: () => 'Display system status',
  },
  {
    command: 'deploy',
    agent: 'devops',
    tier: 'execute',
    model: 'sonnet',
    cost: 'full',
    risk: 'high',
    description: 'Run deployment workflow',
    objective: (args) => `Deploy: ${args || 'production'}`,
    acceptanceCriteria: ['Deployment successful', 'Health check passes', 'Rollback plan documented'],
  },
  {
    command: 'perf',
    agent: 'performance',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Profile and optimize performance',
    objective: (args) => `Optimize performance: ${args || 'hot paths'}`,
  },
  {
    command: 'release',
    agent: 'docs',
    tier: 'execute',
    model: 'sonnet',
    cost: 'cheap',
    description: 'Generate changelog and release checklist',
    objective: (args) => `Prepare release: ${args || 'current version'}`,
    acceptanceCriteria: ['Changelog generated', 'Version bumped', 'Doctor passes'],
  },
];
