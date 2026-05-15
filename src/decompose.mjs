#!/usr/bin/env node
/**
 * decompose.mjs — Task graph decomposition for the Dual-Brain Orchestrator HEAD.
 *
 * Splits complex prompts into a dependency-aware task graph using heuristic
 * analysis. Pure data — returns a plan, does NOT spawn agents.
 *
 * Exports: decompose, isSimpleTask, taskGraphToWaves
 */

import { detectTask, classifyIntent, extractPaths } from './detect.mjs';
import { loadPlaybook } from './playbook.mjs';

// ─── Role inference ───────────────────────────────────────────────────────────

/**
 * Map a tier + intent to the appropriate agent role.
 * @param {string} tier
 * @param {string} intent
 * @returns {'researcher'|'implementer'|'reviewer'|'verifier'}
 */
function inferRole(tier, intent) {
  if (tier === 'search') return 'researcher';
  if (tier === 'think') {
    if (intent === 'review') return 'reviewer';
    return 'researcher'; // architect/planner stays researcher (read-only)
  }
  // execute tier
  if (intent === 'test') return 'verifier';
  if (intent === 'review') return 'reviewer';
  return 'implementer';
}

// ─── Conjunction splitter ─────────────────────────────────────────────────────

const CONJUNCTIONS = /\s+(?:and(?:\s+also)?|then|also|plus|after\s+that|additionally|as\s+well\s+as)\s+/i;

/**
 * Split a prompt on natural-language conjunctions into clauses.
 * @param {string} prompt
 * @returns {string[]}
 */
function splitClauses(prompt) {
  const parts = prompt.split(CONJUNCTIONS).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [prompt];
}

// ─── File ownership inference ─────────────────────────────────────────────────

/**
 * Extract file globs from a clause, falling back to intent-based heuristics.
 * @param {string} clause
 * @param {string} intent
 * @param {string[]} contextFiles  — file paths provided in decompose context
 * @returns {string[]}
 */
function inferOwnership(clause, intent, contextFiles = []) {
  const readOnly = ['search', 'explain', 'compare', 'review'];
  if (readOnly.includes(intent)) return []; // read-only roles own nothing

  // Paths mentioned explicitly in the clause
  const mentioned = extractPaths(clause);
  if (mentioned.length > 0) return mentioned;

  // Paths from context that relate to this clause (simple keyword match)
  const clauseLower = clause.toLowerCase();
  const related = contextFiles.filter(f => {
    const base = f.split('/').pop() ?? '';
    return clauseLower.includes(base.replace(/\.[^.]+$/, ''));
  });
  if (related.length > 0) return related;

  // Structural heuristics by intent
  if (intent === 'test')     return ['**/*.test.*', '**/*.spec.*'];
  if (intent === 'document') return ['**/*.md'];
  if (intent === 'format')   return ['**/*'];

  return [];
}

// ─── Dependency ordering ──────────────────────────────────────────────────────

const ROLE_ORDER = { researcher: 0, reviewer: 1, implementer: 2, verifier: 3 };

/**
 * Build dependency graph: earlier-role tasks must complete before later-role tasks.
 * @param {{ id: string, role: string }[]} tasks
 * @returns {{ [taskId: string]: string[] }}  task id → list of dependent task ids
 */
function buildDependencies(tasks) {
  const deps = {};
  for (const task of tasks) {
    deps[task.id] = [];
  }

  // Each task depends on all tasks with a strictly lower role rank
  for (let i = 0; i < tasks.length; i++) {
    for (let j = 0; j < i; j++) {
      if (ROLE_ORDER[tasks[j].role] < ROLE_ORDER[tasks[i].role]) {
        deps[tasks[i].id].push(tasks[j].id);
      }
    }
  }

  return deps;
}

// ─── Exported: taskGraphToWaves ───────────────────────────────────────────────

/**
 * Topological sort: group tasks into dependency layers (waves).
 * Tasks with no unmet dependencies form the earliest wave.
 * @param {{ id: string, dependsOn: string[] }[]} tasks
 * @returns {string[][]}  each element is an array of task IDs in that wave
 */
export function taskGraphToWaves(tasks) {
  const remaining = new Set(tasks.map(t => t.id));
  const satisfied = new Set();
  const waves = [];

  while (remaining.size > 0) {
    const wave = [];
    for (const task of tasks) {
      if (!remaining.has(task.id)) continue;
      const allDepsSatisfied = task.dependsOn.every(dep => satisfied.has(dep));
      if (allDepsSatisfied) wave.push(task.id);
    }

    if (wave.length === 0) {
      // Cycle or unresolvable — dump remaining tasks into one last wave
      waves.push([...remaining]);
      break;
    }

    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      satisfied.add(id);
    }
  }

  return waves;
}

// ─── Exported: isSimpleTask ───────────────────────────────────────────────────

/**
 * Returns true if the detection indicates a trivial or simple task that does
 * not need decomposition.
 * @param {{ complexity: string }} detection
 * @returns {boolean}
 */
export function isSimpleTask(detection) {
  return detection.complexity === 'trivial' || detection.complexity === 'simple';
}

// ─── Playbook → task graph ────────────────────────────────────────────────────

/**
 * Convert a loaded playbook's steps into a task graph.
 * @param {object} playbook
 * @param {string[]} contextFiles
 * @returns {{ id, title, goal, tier, role, owns, dependsOn, consensus, risk }[]}
 */
function playbookToTasks(playbook, contextFiles = []) {
  const steps = playbook.steps ?? [];
  const tasks = steps.map(step => {
    const tier = step.tier ?? 'execute';
    const intent = tier === 'think' ? 'architecture' : tier === 'search' ? 'search' : 'edit';
    const role = inferRole(tier, intent);
    return {
      id:        step.id,
      title:     step.title,
      goal:      step.goal,
      tier,
      role,
      owns:      inferOwnership(step.goal, intent, contextFiles),
      dependsOn: [], // will be filled below
      consensus: step.consensus === true,
      risk:      'medium',
    };
  });

  // Each task depends on the immediately prior task (sequential playbook flow)
  for (let i = 1; i < tasks.length; i++) {
    tasks[i].dependsOn = [tasks[i - 1].id];
  }

  return tasks;
}

// ─── Heuristic task graph from clause splitting ───────────────────────────────

/**
 * Build a task graph from clause-split sub-prompts via independent detection.
 * @param {string[]} clauses
 * @param {string[]} files
 * @returns {{ id, title, goal, tier, role, owns, dependsOn, consensus, risk }[]}
 */
function clausesToTasks(clauses, files = []) {
  const raw = clauses.map((clause, idx) => {
    const detection = detectTask({ prompt: clause, files });
    const { intent, tier, risk } = detection;
    const role = inferRole(tier, intent);
    return {
      id:        `task-${idx + 1}`,
      title:     clause.length > 60 ? clause.slice(0, 57) + '...' : clause,
      goal:      clause,
      tier,
      role,
      owns:      inferOwnership(clause, intent, files),
      dependsOn: [], // placeholder
      consensus: risk === 'critical' || (risk === 'high' && tier === 'think'),
      risk,
    };
  });

  // Build dependency graph and fill in dependsOn
  const deps = buildDependencies(raw);
  for (const task of raw) {
    task.dependsOn = deps[task.id];
  }

  return raw;
}

// ─── Exported: decompose ──────────────────────────────────────────────────────

/**
 * Decompose a prompt into a dependency-aware task graph.
 * Pure data — returns a plan, does NOT spawn agents.
 *
 * @param {string} prompt
 * @param {{ files?: string[], cwd?: string, repo?: object, profile?: object }} [context]
 * @returns {{
 *   tasks: object[],
 *   waves: string[][],
 *   confidence: 'high'|'medium'|'low',
 *   needsResearch: boolean,
 *   parallelizable: boolean,
 * }}
 */
export function decompose(prompt, context = {}) {
  const { files = [], cwd } = context;

  // 1. Classify the full prompt
  const detection = detectTask({ prompt, files });

  // 2. Trivial/simple → single-task graph
  if (isSimpleTask(detection)) {
    const { intent, tier, risk } = detection;
    const role = inferRole(tier, intent);
    const task = {
      id:        'task-1',
      title:     prompt.length > 60 ? prompt.slice(0, 57) + '...' : prompt,
      goal:      prompt,
      tier,
      role,
      owns:      inferOwnership(prompt, intent, files),
      dependsOn: [],
      consensus: false,
      risk,
    };
    return {
      tasks:          [task],
      waves:          [['task-1']],
      confidence:     'high',
      needsResearch:  false,
      parallelizable: false,
    };
  }

  // 3. Try to match a playbook
  const playbook = loadPlaybook(detection.intent, cwd);
  if (playbook) {
    const tasks = playbookToTasks(playbook, files);
    const waves = taskGraphToWaves(tasks);
    return {
      tasks,
      waves,
      confidence:     'high',
      needsResearch:  false,
      parallelizable: waves.some(w => w.length > 1),
    };
  }

  // 4. Heuristic clause splitting
  const clauses = splitClauses(prompt);
  const hasResearch = files.length === 0 && detection.complexity !== 'trivial';

  // If splitting didn't help (single clause), add a research task prefix for complex tasks
  let allClauses = clauses;
  if (clauses.length === 1 && hasResearch) {
    allClauses = [`Research: find all files and context relevant to: ${prompt}`, ...clauses];
  }

  const tasks = clausesToTasks(allClauses, files);
  const waves = taskGraphToWaves(tasks);

  // Confidence: medium if we split cleanly (>1 clause), low if ambiguous
  const confidence = clauses.length > 1 ? 'medium' : 'low';

  return {
    tasks,
    waves,
    confidence,
    needsResearch:  hasResearch,
    parallelizable: waves.some(w => w.length > 1),
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const prompt = args.find(a => !a.startsWith('--')) || '';

  if (!prompt) {
    console.error('Usage: node src/decompose.mjs "task description" [--files a,b]');
    process.exit(1);
  }

  const filesFlag = args.find(a => a.startsWith('--files=')) ||
    (args.includes('--files') ? args[args.indexOf('--files') + 1] : null);
  const files = filesFlag
    ? filesFlag.replace(/^--files=/, '').split(',').map(f => f.trim()).filter(Boolean)
    : [];

  const result = decompose(prompt, { files });
  console.log(JSON.stringify(result, null, 2));
}
