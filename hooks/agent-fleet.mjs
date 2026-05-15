#!/usr/bin/env node
/**
 * agent-fleet.mjs — Agent type taxonomy for the dual-brain orchestrator.
 *
 * Defines the full fleet of specialized agent types, their capabilities,
 * prompt templates, and dispatch configs. The head agent (Opus) uses this
 * to select and configure subagents — it never implements anything itself.
 *
 * Exports: AGENT_TYPES, dispatchFleetAgent, getAgentRecommendation
 * CLI:     node hooks/agent-fleet.mjs --list
 *          node hooks/agent-fleet.mjs --recommend "refactor the auth module"
 */

// ─── Agent Type Definitions ───────────────────────────────────────────────────

const AGENT_TYPES = {

  brainstorm: {
    name:           'brainstorm',
    description:    'Creative ideation, architecture exploration, "what if" scenarios. Generates options with pros/cons/effort, not decisions.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  120_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'opus', openai: 'gpt-5.5' },
    preferredProvider: 'claude',
    outputFormat: {
      ideas: [{ title: 'string', summary: 'string', pros: ['string'], cons: ['string'], effort: 'low|medium|high', risk: 'low|medium|high|critical' }],
      recommended: 'title of top pick',
      open_questions: ['string'],
    },
    promptTemplate: (payload) => `
You are a creative brainstorming agent. Your role is to generate a rich set of ideas, approaches, and architectural options for the task below. You are NOT making a final decision — that is the head agent's job.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools.
- Do NOT implement anything. Think, explore, propose.
- Be creative. Include unconventional approaches alongside safe ones.
- For each idea, state realistic pros, cons, effort, and risk.

TASK:
${payload.task}

${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.files?.length ? `RELEVANT FILES:\n${payload.files.join('\n')}\n` : ''}
${payload.constraints ? `CONSTRAINTS FROM HEAD AGENT:\n${payload.constraints}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.brainstorm.outputFormat, null, 2)}
`.trim(),
  },

  research: {
    name:           'research',
    description:    'Deep codebase exploration: find patterns, understand architecture, trace dependencies. Returns findings with file refs and confidence.',
    tier:           'search',
    readOnly:       true,
    maxDurationMs:  180_000,
    defaultEffort:  { claude: 'medium', openai: 'medium' },
    defaultModel:   { claude: 'sonnet', openai: 'gpt-5.4' },
    preferredProvider: 'claude',
    outputFormat: {
      findings: [{ summary: 'string', files: ['path:line'], confidence: 'low|medium|high', detail: 'string' }],
      architecture_notes: 'string',
      dependencies_found: ['string'],
      gaps: ['string — what could not be determined'],
    },
    promptTemplate: (payload) => `
You are a research agent specializing in deep codebase exploration. Your job is to thoroughly investigate the codebase, trace relationships, and surface findings with precise file references.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Read-only.
- Cite every finding with a specific file path and line number where possible.
- Rate your confidence in each finding (low/medium/high).
- Note any gaps — things you could not determine from the code alone.

RESEARCH QUESTION:
${payload.task}

${payload.files?.length ? `START WITH THESE FILES:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `BACKGROUND:\n${payload.context}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.research.outputFormat, null, 2)}
`.trim(),
  },

  analyst: {
    name:           'analyst',
    description:    'Data analysis, benchmark interpretation, cost modeling, trade-off analysis. Returns structured analysis with numbers and recommendations.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  120_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'opus', openai: 'gpt-5.5' },
    preferredProvider: 'claude',
    outputFormat: {
      summary: 'string',
      data_points: [{ label: 'string', value: 'string|number', unit: 'string', interpretation: 'string' }],
      trade_offs: [{ option: 'string', benefit: 'string', cost: 'string', verdict: 'string' }],
      recommendation: 'string',
      confidence: 'low|medium|high',
      caveats: ['string'],
    },
    promptTemplate: (payload) => `
You are an analyst agent. Your job is to analyze data, interpret benchmarks, model costs, and produce rigorous trade-off analysis. You deal in numbers and evidence, not opinions.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Read-only.
- Ground every claim in data. State assumptions explicitly.
- Quantify wherever possible. Avoid vague language.
- Rate your confidence and list caveats.

ANALYSIS REQUEST:
${payload.task}

${payload.data ? `INPUT DATA:\n${payload.data}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.files?.length ? `RELEVANT FILES:\n${payload.files.join('\n')}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.analyst.outputFormat, null, 2)}
`.trim(),
  },

  planner: {
    name:           'planner',
    description:    'Break down work into tasks, estimate effort, identify dependencies, design implementation order. Returns a task list with dependency graph.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  90_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'opus', openai: 'gpt-5.5' },
    preferredProvider: 'claude',
    outputFormat: {
      tasks: [{
        id: 'string',
        title: 'string',
        description: 'string',
        tier: 'search|execute|think',
        agentType: 'research|worker|reviewer|tester|documenter|specialist',
        effort: 'trivial|simple|moderate|complex',
        risk: 'low|medium|high|critical',
        dependsOn: ['task_id'],
        files: ['path'],
        acceptanceCriteria: ['string'],
      }],
      waves: [{ wave: 'number', taskIds: ['string'], rationale: 'string' }],
      totalEffortEstimate: 'string',
      risks: ['string'],
      open_questions: ['string'],
    },
    promptTemplate: (payload) => `
You are a planning agent. Your job is to decompose a body of work into well-defined tasks, organize them into dependency-ordered waves, and produce acceptance criteria for each task. Planners do not implement — they plan.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Read-only.
- Every task must have clear acceptance criteria.
- Identify dependencies explicitly — tasks that share files are NOT safe to parallelize.
- Assign each task to a specific agent type from the fleet.
- Group independent tasks into the same wave; dependent tasks into later waves.

WORK TO PLAN:
${payload.task}

${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.files?.length ? `FILES IN SCOPE:\n${payload.files.join('\n')}\n` : ''}
${payload.constraints ? `CONSTRAINTS:\n${payload.constraints}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.planner.outputFormat, null, 2)}
`.trim(),
  },

  reviewer: {
    name:           'reviewer',
    description:    'Code review, security audit, quality assessment. Returns issues with severity, location, and fix suggestions.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  180_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'opus', openai: 'gpt-5.5' },
    preferredProvider: 'claude',
    outputFormat: {
      verdict: 'pass|issues_found|blocking',
      issues: [{
        severity: 'info|warning|error|critical',
        category: 'correctness|security|performance|style|maintainability',
        file: 'string',
        line: 'number|null',
        description: 'string',
        suggestion: 'string',
      }],
      summary: 'string',
      must_fix_before_merge: ['issue description'],
      nice_to_fix: ['issue description'],
    },
    promptTemplate: (payload) => `
You are a code reviewer agent. Your job is to perform a thorough, actionable review of the code diff or files provided. Flag real issues — not style nitpicks unless they indicate deeper problems.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Read-only.
- For every issue, give the file path, approximate line, severity, and a concrete fix suggestion.
- Categorize: correctness, security, performance, style, maintainability.
- Security issues are always "critical" severity.
- Be honest: if the code is clean, say so.

${payload.diff ? `DIFF TO REVIEW:\n${payload.diff}\n` : ''}
${payload.files?.length ? `FILES TO REVIEW:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT / PR DESCRIPTION:\n${payload.context}\n` : ''}
${payload.task ? `SPECIFIC FOCUS:\n${payload.task}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.reviewer.outputFormat, null, 2)}
`.trim(),
  },

  worker: {
    name:           'worker',
    description:    'Implementation: file edits, test writing, feature building. Not read-only. Returns files changed, tests run, edge cases handled.',
    tier:           'execute',
    readOnly:       false,
    maxDurationMs:  300_000,
    defaultEffort:  { claude: 'medium', openai: 'medium' },
    defaultModel:   { claude: 'sonnet', openai: 'gpt-5.3-codex' },
    preferredProvider: 'openai',
    outputFormat: {
      files_changed: [{ path: 'string', action: 'created|modified|deleted', summary: 'string' }],
      tests_run: [{ name: 'string', result: 'pass|fail|skip', detail: 'string' }],
      edge_cases_handled: ['string'],
      edge_cases_not_handled: ['string'],
      notes: 'string',
    },
    promptTemplate: (payload) => `
You are a worker agent responsible for implementation. Execute the task below precisely, following the acceptance criteria. Write clean, minimal code — do not gold-plate.

TASK:
${payload.task}

${payload.acceptanceCriteria?.length ? `ACCEPTANCE CRITERIA:\n${payload.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n` : ''}
${payload.files?.length ? `FILES IN SCOPE:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.constraints ? `CONSTRAINTS:\n${payload.constraints}\n` : ''}

After completing work, respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.worker.outputFormat, null, 2)}
`.trim(),
  },

  debugger: {
    name:           'debugger',
    description:    'Investigate failures, trace bugs, diagnose issues. Read-only investigation with root cause analysis and fix recommendation.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  240_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'sonnet', openai: 'gpt-5.4' },
    preferredProvider: 'claude',
    outputFormat: {
      root_cause: 'string',
      reproduction_steps: ['string'],
      affected_files: [{ path: 'string', line: 'number|null', issue: 'string' }],
      hypothesis: 'string',
      fix_recommendation: 'string',
      fix_complexity: 'trivial|simple|moderate|complex',
      confidence: 'low|medium|high',
      dead_ends: ['string — things that looked relevant but were not'],
    },
    promptTemplate: (payload) => `
You are a debugger agent. Your job is to investigate failures, trace bugs, and produce a precise root cause analysis with a clear fix recommendation. Think like a detective: follow the evidence, discard red herrings, state your confidence.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Investigation only.
- Document dead ends — what you ruled out and why.
- State reproduction steps if you can determine them.
- Rate your confidence in the root cause.

ISSUE TO INVESTIGATE:
${payload.task}

${payload.errorOutput ? `ERROR OUTPUT / STACK TRACE:\n${payload.errorOutput}\n` : ''}
${payload.files?.length ? `FILES TO INVESTIGATE:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.debugger.outputFormat, null, 2)}
`.trim(),
  },

  documenter: {
    name:           'documenter',
    description:    'Write docs, update READMEs, generate API docs. Limited to documentation files. Returns docs written/updated.',
    tier:           'execute',
    readOnly:       false,
    maxDurationMs:  180_000,
    defaultEffort:  { claude: 'medium', openai: 'low' },
    defaultModel:   { claude: 'sonnet', openai: 'gpt-4.1' },
    preferredProvider: 'openai',
    allowedFilePatterns: ['*.md', '*.mdx', '*.txt', '*.rst', 'docs/**', 'README*', 'CHANGELOG*', '*.jsdoc', '*.typedoc'],
    outputFormat: {
      docs_written: [{ path: 'string', type: 'new|updated', summary: 'string' }],
      coverage: 'string — what is now documented',
      gaps: ['string — things that still need docs'],
    },
    promptTemplate: (payload) => `
You are a documentation agent. Write clear, accurate, developer-friendly documentation. Match the existing doc style in the project. Do not invent behavior — document what the code actually does.

CONSTRAINTS:
- Only modify documentation files (*.md, *.mdx, *.txt, *.rst, docs/**, README*, CHANGELOG*, *.jsdoc).
- Do NOT modify source code files.
- Match existing tone and formatting conventions.
- Accurate > comprehensive. Do not document things you are not sure about.

DOCUMENTATION TASK:
${payload.task}

${payload.files?.length ? `SOURCE FILES TO DOCUMENT:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.existingDocStyle ? `EXISTING DOC STYLE NOTES:\n${payload.existingDocStyle}\n` : ''}

After completing work, respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.documenter.outputFormat, null, 2)}
`.trim(),
  },

  tester: {
    name:           'tester',
    description:    'Write and run tests, verify edge cases, check coverage. Limited to test files. Returns test results and coverage delta.',
    tier:           'execute',
    readOnly:       false,
    maxDurationMs:  300_000,
    defaultEffort:  { claude: 'medium', openai: 'medium' },
    defaultModel:   { claude: 'sonnet', openai: 'gpt-5.4-mini' },
    preferredProvider: 'openai',
    allowedFilePatterns: ['*.test.*', '*.spec.*', '__tests__/**', 'test/**', 'tests/**', '*.test.mjs', '*.test.js', '*.test.ts'],
    outputFormat: {
      tests_written: [{ file: 'string', count: 'number', cases: ['string'] }],
      tests_run: [{ name: 'string', result: 'pass|fail|skip', duration_ms: 'number', error: 'string|null' }],
      coverage: { before: 'string|null', after: 'string|null', delta: 'string|null' },
      edge_cases_covered: ['string'],
      edge_cases_missing: ['string'],
    },
    promptTemplate: (payload) => `
You are a testing agent. Write thorough, focused tests. Prefer testing behavior over implementation details. Cover happy paths, error paths, and edge cases. Run the tests and report results.

CONSTRAINTS:
- Only create or modify test files (*.test.*, *.spec.*, __tests__/**, test/**, tests/**).
- Do NOT modify production source files.
- Tests must be deterministic and independent (no shared mutable state between tests).
- If a test fails, investigate — do not simply delete or skip it.

TESTING TASK:
${payload.task}

${payload.files?.length ? `SOURCE FILES TO TEST:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}
${payload.testFramework ? `TEST FRAMEWORK: ${payload.testFramework}\n` : ''}

After completing work, respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.tester.outputFormat, null, 2)}
`.trim(),
  },

  specialist: {
    name:           'specialist',
    description:    'Domain-specific expert (security, performance, accessibility, i18n, etc). Takes a domain parameter. Returns domain-specific analysis.',
    tier:           'think',
    readOnly:       true,
    maxDurationMs:  180_000,
    defaultEffort:  { claude: 'high', openai: 'high' },
    defaultModel:   { claude: 'opus', openai: 'gpt-5.5' },
    preferredProvider: 'claude',
    outputFormat: {
      domain: 'string',
      summary: 'string',
      findings: [{
        severity: 'info|warning|error|critical',
        area: 'string',
        file: 'string|null',
        line: 'number|null',
        description: 'string',
        recommendation: 'string',
        reference: 'string|null — spec, standard, or CVE if applicable',
      }],
      score: 'number 0-10 (10 = excellent)',
      verdict: 'pass|needs_attention|failing',
      next_steps: ['string'],
    },
    promptTemplate: (payload) => `
You are a specialist agent with deep expertise in ${payload.domain || 'your domain'}. Apply rigorous ${payload.domain || 'domain'}-specific analysis to the code and files provided. Reference standards, specifications, and best practices for the domain.

CONSTRAINTS:
- Do NOT use Edit, Write, or any file-modification tools. Read-only.
- Cite specific standards, specs, or CVEs where applicable.
- Score the subject matter on a 0–10 scale with clear criteria.
- Distinguish between blocking issues and improvement opportunities.

DOMAIN: ${payload.domain || 'unspecified — infer from task'}

ANALYSIS REQUEST:
${payload.task}

${payload.files?.length ? `FILES TO ANALYZE:\n${payload.files.join('\n')}\n` : ''}
${payload.context ? `CONTEXT:\n${payload.context}\n` : ''}

Respond with a JSON object matching this schema exactly:
${JSON.stringify(AGENT_TYPES.specialist.outputFormat, null, 2)}
`.trim(),
  },
};

// ─── Pipeline Presets ─────────────────────────────────────────────────────────
// Common agent pipelines for known task shapes.

const PIPELINE_PRESETS = [
  // More-specific patterns first to prevent early-exit on broad verbs like "add", "write"
  {
    label:    'security-review',
    pattern:  /\b(auth|secret|credential|token|password|encrypt|security|vulnerability)\b/i,
    risk:     ['high', 'critical'],
    pipeline: ['specialist', 'reviewer', 'planner'],
    rationale: 'Security specialist identifies issues, reviewer confirms, planner orders remediation.',
  },
  {
    label:    'ideate-then-plan',
    pattern:  /\b(architect|design|how should|system|approach|strategy)\b/i,
    risk:     ['any'],
    pipeline: ['brainstorm', 'analyst', 'planner'],
    rationale: 'Generate options, analyze trade-offs, produce an ordered task plan.',
  },
  {
    label:    'debug-then-fix',
    pattern:  /\b(debug|investigate|broken|failing|not working|why (is|does|isn't|doesn't))\b/i,
    risk:     ['any'],
    pipeline: ['debugger', 'worker', 'tester'],
    rationale: 'Diagnose root cause, implement fix, verify with regression tests.',
  },
  {
    label:    'audit-and-remediate',
    pattern:  /\b(audit|remediat|fix all|clean up|improve|assess)\b/i,
    risk:     ['any'],
    pipeline: ['research', 'analyst', 'planner', 'worker', 'reviewer'],
    rationale: 'Full audit cycle: discover, analyze, plan, fix, verify.',
  },
  {
    label:    'design-then-build',
    pattern:  /\b(refactor|restructure|redesign|extract|split|consolidate)\b/i,
    risk:     ['medium', 'high'],
    pipeline: ['research', 'planner', 'worker', 'reviewer'],
    rationale: 'Understand current state, plan the change, execute, then review.',
  },
  {
    label:    'document-existing',
    pattern:  /\b(document|readme|jsdoc|api\s*docs|write\s*docs?|add\s*docs?|update\s*docs?|generate\s*docs?)\b/i,
    risk:     ['low', 'medium'],
    pipeline: ['research', 'documenter'],
    rationale: 'Understand the code first, then write accurate docs.',
  },
  {
    label:    'test-coverage',
    pattern:  /\b(test\s+coverage|missing\s+tests?|add\s+tests?\s+for|write\s+tests?\s+for)\b/i,
    risk:     ['low', 'medium'],
    pipeline: ['research', 'tester'],
    rationale: 'Understand what exists, then write targeted tests.',
  },
  {
    label:    'explore-then-build',
    pattern:  /\b(implement|build|add|create|write)\b/i,
    risk:     ['low', 'medium'],
    pipeline: ['research', 'worker', 'tester'],
    rationale: 'Understand the codebase, implement, verify with tests.',
  },
];

// ─── dispatchFleetAgent ───────────────────────────────────────────────────────

/**
 * Build a dispatch config for a fleet agent. Does NOT execute — the orchestrator does.
 *
 * @param {string} type — key from AGENT_TYPES
 * @param {object} payload — task-specific data (task, files, context, domain, etc.)
 * @param {object} [options]
 * @param {string} [options.provider] — force 'claude' or 'openai'
 * @param {number} [options.budgetPressure] — 0–1, influences model downgrade
 * @returns {object} dispatch config
 */
function dispatchFleetAgent(type, payload = {}, options = {}) {
  const agentDef = AGENT_TYPES[type];
  if (!agentDef) {
    const valid = Object.keys(AGENT_TYPES).join(', ');
    throw new Error(`Unknown agent type "${type}". Valid types: ${valid}`);
  }

  const provider = options.provider || agentDef.preferredProvider;
  const budgetPressure = options.budgetPressure ?? 0;

  // Model selection with optional budget downgrade
  let claudeModel = agentDef.defaultModel.claude;
  let openaiModel = agentDef.defaultModel.openai;

  if (budgetPressure > 0.9) {
    // Aggressive downgrade for non-critical agents
    if (claudeModel === 'opus') claudeModel = 'sonnet';
    if (openaiModel === 'gpt-5.5') openaiModel = 'gpt-5.4';
  } else if (budgetPressure > 0.7) {
    if (claudeModel === 'opus' && agentDef.tier !== 'think') claudeModel = 'sonnet';
  }

  const selectedModel = provider === 'claude' ? claudeModel : openaiModel;
  const effort = agentDef.defaultEffort[provider] || 'medium';

  const prompt = agentDef.promptTemplate(payload);

  return {
    agentType:      type,
    provider,
    model:          selectedModel,
    effort,
    tier:           agentDef.tier,
    readOnly:       agentDef.readOnly,
    maxDurationMs:  agentDef.maxDurationMs,
    prompt,
    outputFormat:   agentDef.outputFormat,
    payload,        // pass through for logging/resumability
    ...(agentDef.allowedFilePatterns ? { allowedFilePatterns: agentDef.allowedFilePatterns } : {}),
  };
}

// ─── getAgentRecommendation ───────────────────────────────────────────────────

/**
 * Recommend agent type(s) for a given task profile. Returns a pipeline.
 *
 * @param {string} intent — natural language task description
 * @param {string} [risk] — 'low' | 'medium' | 'high' | 'critical'
 * @param {string} [complexity] — 'trivial' | 'simple' | 'moderate' | 'complex'
 * @returns {{ pipeline: string[], rationale: string, preset: string|null }}
 */
function getAgentRecommendation(intent, risk = 'medium', complexity = 'moderate') {
  // Try pipeline presets first
  for (const preset of PIPELINE_PRESETS) {
    const riskMatch = preset.risk.includes('any') || preset.risk.includes(risk);
    if (preset.pattern.test(intent) && riskMatch) {
      return {
        pipeline:  preset.pipeline,
        rationale: preset.rationale,
        preset:    preset.label,
      };
    }
  }

  // Fallback: derive from risk + complexity
  if (risk === 'critical') {
    return {
      pipeline:  ['specialist', 'reviewer', 'planner', 'worker', 'reviewer'],
      rationale: 'Critical risk: specialist audit, review, plan, implement, re-review.',
      preset:    null,
    };
  }

  if (complexity === 'complex') {
    return {
      pipeline:  ['research', 'planner', 'worker', 'reviewer'],
      rationale: 'Complex task: explore, plan, build, verify.',
      preset:    null,
    };
  }

  if (complexity === 'moderate') {
    return {
      pipeline:  ['research', 'worker', 'tester'],
      rationale: 'Moderate complexity: understand context, implement, verify.',
      preset:    null,
    };
  }

  // Simple / trivial
  return {
    pipeline:  ['worker'],
    rationale: 'Simple task: direct implementation.',
    preset:    null,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('\nAgent Fleet — Available Types\n');
    for (const [key, def] of Object.entries(AGENT_TYPES)) {
      const rw  = def.readOnly ? 'read-only' : 'read/write';
      const dur = `${def.maxDurationMs / 1000}s max`;
      console.log(`  ${key.padEnd(12)} [${def.tier.padEnd(7)}] [${rw.padEnd(10)}] [${dur.padEnd(8)}]`);
      console.log(`               ${def.description}`);
      console.log(`               Claude: ${def.defaultModel.claude}, OpenAI: ${def.defaultModel.openai} (prefers ${def.preferredProvider})\n`);
    }
    process.exit(0);
  }

  const recommendIdx = args.indexOf('--recommend');
  if (recommendIdx !== -1) {
    const utterance = args[recommendIdx + 1] || args.find(a => !a.startsWith('--')) || '';
    if (!utterance) {
      console.error('Usage: node hooks/agent-fleet.mjs --recommend "description"');
      process.exit(1);
    }

    // Basic risk/complexity inference for CLI use
    const RISK_WORDS = /\b(auth|secret|credential|token|password|encrypt|security|vulnerability|billing|migration)\b/i;
    const COMPLEX_WORDS = /\b(refactor|redesign|architect|audit|all|entire|everywhere|across)\b/i;

    const risk = RISK_WORDS.test(utterance) ? 'high' : 'medium';
    const complexity = COMPLEX_WORDS.test(utterance) ? 'complex' : 'moderate';

    const rec = getAgentRecommendation(utterance, risk, complexity);

    console.log('\nAgent Recommendation\n');
    console.log(`Task:       ${utterance}`);
    console.log(`Risk:       ${risk}   Complexity: ${complexity}`);
    console.log(`Preset:     ${rec.preset || '(none — derived from risk/complexity)'}`);
    console.log(`Pipeline:   ${rec.pipeline.join(' → ')}`);
    console.log(`Rationale:  ${rec.rationale}`);
    console.log('\nWave breakdown:');
    rec.pipeline.forEach((agentType, i) => {
      const def = AGENT_TYPES[agentType];
      const rw  = def.readOnly ? 'read-only' : 'read/write';
      console.log(`  Wave ${i + 1}: ${agentType.padEnd(12)} [${def.tier}] [${rw}] — ${def.description}`);
    });
    console.log('');

    process.exit(0);
  }

  // General dispatch preview
  const type = args.find(a => !a.startsWith('--'));
  if (type) {
    const payload = { task: 'CLI preview — no real task provided' };
    try {
      const config = dispatchFleetAgent(type, payload);
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node hooks/agent-fleet.mjs --list');
  console.log('  node hooks/agent-fleet.mjs --recommend "refactor the auth module"');
  console.log('  node hooks/agent-fleet.mjs <agentType>   # preview dispatch config');
  process.exit(0);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export { AGENT_TYPES, PIPELINE_PRESETS, dispatchFleetAgent, getAgentRecommendation };
