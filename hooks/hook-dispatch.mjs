#!/usr/bin/env node
/**
 * hook-dispatch.mjs — Single entry point for the HEAD to dispatch work.
 *
 * Classifies the task, checks budget, decides if a strategist is needed,
 * then launches the appropriate agent and returns a compressed result.
 *
 * CLI: node hooks/hook-dispatch.mjs --task "..." [--files a.js,b.js]
 *      [--tier execute|think|search] [--force-provider claude|openai]
 *      [--dry-run] [--pipeline]
 *
 * Exports: dispatch
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { classifyTask, selectModelEffort } from './task-classifier.mjs';
import { chooseProvider, getProviderStatus } from './budget-balancer.mjs';
import { recordDecision, getInsights } from './decision-ledger.mjs';

let getAgentRecommendation = null;
try {
  ({ getAgentRecommendation } = await import('./agent-fleet.mjs'));
} catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────

const UNCERTAINTY_MARKERS = /\b(maybe|not sure|could be|might need|possibly|unclear|unsure|not certain)\b/i;

const TIER_DURATION = { search: '~15s', execute: '~45s', think: '~90s' };

// ─── Strategist check ─────────────────────────────────────────────────────────

function needsStrategist(taskProfile, files, description) {
  const { risk, complexity } = taskProfile;
  if (risk === 'critical') return { needed: true, reason: 'critical risk requires strategic review' };
  if (complexity === 'complex' && risk === 'high') return { needed: true, reason: 'complex + high-risk task' };
  if (UNCERTAINTY_MARKERS.test(description)) return { needed: true, reason: 'uncertainty markers detected in description' };
  if (files.length > 5) return { needed: true, reason: `${files.length} files exceed 5-file threshold` };

  // Check decision ledger failure rate for similar tasks
  try {
    const insights = getInsights();
    const taskType = taskProfile.intent;
    const patterns = insights.task_patterns?.[taskType];
    if (patterns) {
      for (const [, stats] of Object.entries(patterns)) {
        if (stats.total >= 5) {
          const failRate = 1 - (stats.success / stats.total);
          if (failRate > 0.3) {
            return { needed: true, reason: `${Math.round(failRate * 100)}% failure rate for ${taskType} tasks in ledger` };
          }
        }
      }
    }
  } catch {}

  return { needed: false, reason: null };
}

// ─── Strategist (heuristic-only, no LLM call) ────────────────────────────────

function getStrategistWarnings(taskProfile) {
  const warnings = [];
  if (taskProfile.risk === 'critical') warnings.push('Critical risk — validate with dual-brain review');
  if (taskProfile.complexity === 'complex') warnings.push('Complex task — consider decomposing');
  if (taskProfile.intent === 'security') warnings.push('Security-sensitive — require review before merge');
  return warnings;
}

// ─── Core dispatch ────────────────────────────────────────────────────────────

async function dispatch(options = {}) {
  const {
    task: description,
    files = [],
    tier: forceTier = null,
    forceProvider = null,
    dryRun = false,
    pipeline = false,
  } = options;

  if (!description) throw new Error('--task is required');

  const taskId = randomBytes(4).toString('hex');

  // 1. Classify
  const taskProfile = classifyTask(description, { files });
  const tier = forceTier || (
    taskProfile.intent === 'search' || taskProfile.intent === 'explain' ? 'search'
      : taskProfile.intent === 'architecture' || taskProfile.intent === 'security' || taskProfile.intent === 'planning' ? 'think'
        : 'execute'
  );

  // 2. Budget check
  const budgetRec = chooseProvider({ tier, contextCoupling: forceProvider === 'claude' ? 'high' : 'low' });
  const provider = forceProvider || budgetRec.provider;
  const status = getProviderStatus();
  const providerPressure = status[provider]?.[tier]?.effectivePressure ?? 0;
  const modelRec = selectModelEffort(taskProfile, { budgetPressure: providerPressure });
  const model = provider === 'claude' ? modelRec.claude.model : modelRec.openai.model;
  const effort = provider === 'claude' ? (modelRec.claude.effort || taskProfile.effort) : modelRec.openai.effort;

  // 3. Risk check (heuristic only, no LLM cost)
  const strategistCheck = needsStrategist(taskProfile, files, description);
  const warnings = strategistCheck.needed ? getStrategistWarnings(taskProfile) : [];

  // 4. Pipeline mode
  if (pipeline) {
    const pipelineRec = getAgentRecommendation
      ? getAgentRecommendation(description, taskProfile.risk, taskProfile.complexity)
      : { pipeline: [tier === 'think' ? 'planner' : 'worker'], rationale: 'direct dispatch', preset: null };

    return {
      dispatched: false,
      dryRun: true,
      pipeline: true,
      taskId,
      recommendation: taskProfile,
      steps: pipelineRec.pipeline,
      rationale: pipelineRec.rationale,
      provider,
      model,
      strategistNeeded: strategistCheck.needed,
      reason: pipelineRec.rationale,
    };
  }

  // 5. Dry-run
  if (dryRun) {
    return {
      dispatched: false,
      dryRun: true,
      taskId,
      recommendation: taskProfile,
      provider,
      model,
      tier,
      effort,
      strategistNeeded: strategistCheck.needed,
      reason: strategistCheck.needed
        ? strategistCheck.reason
        : `${taskProfile.risk} risk, ${taskProfile.complexity} task → direct dispatch via ${provider}/${model}`,
    };
  }

  // 6. Build prompt for worker agent
  const workerPrompt = [
    warnings.length ? `Warnings: ${warnings.join('; ')}` : null,
    `Task: ${description}`,
    files.length ? `Files in scope: ${files.join(', ')}` : null,
    `Risk: ${taskProfile.risk} | Complexity: ${taskProfile.complexity} | Tier: ${tier}`,
    `Return a concise JSON result: { "done": bool, "filesChanged": [], "notes": "..." }`,
  ].filter(Boolean).join('\n');

  // 8. Dispatch to provider
  let agentResult = null;

  if (provider === 'claude') {
    const claudeModelId = model === 'opus' ? 'claude-opus-4-5'
      : model === 'haiku' ? 'claude-haiku-4-5'
        : 'claude-sonnet-4-5';
    const result = spawnSync(
      'claude',
      ['--model', claudeModelId, '--print', '-p', workerPrompt],
      { encoding: 'utf8', timeout: 120_000 },
    );
    agentResult = result.status === 0 ? result.stdout?.trim() : `exit ${result.status}: ${result.stderr?.trim()}`;
  } else {
    try {
      const { dispatchGptTask } = await import('./gpt-work-dispatcher.mjs');
      const gptResult = await dispatchGptTask({ task: workerPrompt, model, tier, files });
      agentResult = typeof gptResult === 'object' ? JSON.stringify(gptResult) : String(gptResult);
    } catch (err) {
      agentResult = `gpt dispatch error: ${err.message}`;
    }
  }

  // 9. Record decision
  const decisionId = recordDecision({
    task_type: taskProfile.intent,
    provider,
    tier,
    model,
    effort,
    reason: budgetRec.reason,
    followed: true,
  });

  const estimatedDuration = TIER_DURATION[tier] || '~60s';

  return {
    dispatched: true,
    taskId,
    decisionId,
    provider,
    model,
    tier,
    effort,
    warnings,
    reason: strategistCheck.needed
      ? `${strategistCheck.reason} — dispatched with warnings via ${provider}/${model}`
      : `${taskProfile.risk} risk, ${taskProfile.complexity} ${taskProfile.intent} → direct dispatch`,
    estimatedDuration,
    agentResult: agentResult?.slice(0, 500), // truncate for head context
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);

  function flag(name) {
    const i = args.indexOf(name);
    return i !== -1 ? (args[i + 1] ?? true) : null;
  }
  function flagVal(name) {
    const explicit = args.find(a => a.startsWith(`${name}=`));
    if (explicit) return explicit.slice(name.length + 1);
    return flag(name);
  }

  const task = flagVal('--task') || args.find(a => !a.startsWith('--'));
  const filesArg = flagVal('--files');
  const files = filesArg ? String(filesArg).split(',').map(f => f.trim()) : [];

  if (!task) {
    console.error('Usage: node hooks/hook-dispatch.mjs --task "description" [--files a.js,b.js] [--tier execute|think|search] [--force-provider claude|openai] [--dry-run] [--pipeline]');
    process.exit(1);
  }

  try {
    const result = await dispatch({
      task,
      files,
      tier: flagVal('--tier') || null,
      forceProvider: flagVal('--force-provider') || null,
      dryRun: args.includes('--dry-run'),
      pipeline: args.includes('--pipeline'),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('dispatch error:', err.message);
    process.exit(1);
  }
}

export { dispatch };
