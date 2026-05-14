#!/usr/bin/env node

import { classifyRisk, extractPaths } from './risk-classifier.mjs';
import { resolveDependencies } from './plan-generator.mjs';
import { dispatchGptTask } from './gpt-work-dispatcher.mjs';
import { getProviderStatus, chooseProvider } from './budget-balancer.mjs';
import { recordDecision, recordOutcome } from './decision-ledger.mjs';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const STATE_DIR = join(ROOT_DIR, '.dualbrain');
const MANIFEST_DIR = join(STATE_DIR, 'manifests');
const CHECKPOINT_DIR = join(STATE_DIR, 'checkpoints');
const MAX_WAVE_PARALLELISM = 4;
const LEVEL_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
const STATUS_ICON = {
  pending: '○',
  running: '◐',
  completed: '✓',
  failed: '✕',
  paused: '⏸',
};
const ASCII_STATUS_ICON = {
  pending: 'o',
  running: '>',
  completed: 'v',
  failed: 'x',
  paused: '=',
};

function ensureStateDirs() {
  mkdirSync(MANIFEST_DIR, { recursive: true });
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

function makeManifestId() {
  return `mf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function uniq(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function trimText(value, max = 120) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function slugify(value) {
  return String(value || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'task';
}

function highestRisk(levels) {
  return (levels || []).reduce((current, level) => {
    return (LEVEL_ORDER[level] ?? 0) > (LEVEL_ORDER[current] ?? 0) ? level : current;
  }, 'low');
}

function statusIcon(status) {
  const icons = process.env.NO_COLOR ? ASCII_STATUS_ICON : STATUS_ICON;
  return icons[status] || icons.pending;
}

function saveManifest(manifest) {
  ensureStateDirs();
  writeFileSync(
    join(MANIFEST_DIR, `${manifest.manifestId}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function loadManifest(manifestId) {
  const path = join(MANIFEST_DIR, `${manifestId}.json`);
  if (!existsSync(path)) {
    throw new Error(`Manifest not found: ${manifestId}`);
  }
  const manifest = safeJsonParse(readFileSync(path, 'utf8'), null);
  if (!manifest) {
    throw new Error(`Manifest is unreadable: ${manifestId}`);
  }
  return manifest;
}

function flattenTasks(manifest) {
  return manifest.waves.flatMap(wave => wave.tasks);
}

function combinedTaskFiles(task) {
  return uniq([...(task.owns || []), ...(task.reads || [])]);
}

function refreshCounts(manifest) {
  const tasks = flattenTasks(manifest);
  manifest.totalWaves = manifest.waves.length;
  manifest.totalTasks = tasks.length;
  manifest.completedWaves = manifest.waves.filter(w => w.status === 'completed').length;
  manifest.completedTasks = tasks.filter(t => t.status === 'completed').length;
  manifest.failedTasks = tasks.filter(t => t.status === 'failed').length;
  return manifest;
}

function getBalanceSnapshot() {
  const status = getProviderStatus();
  const recommendation = chooseProvider({
    tier: 'execute',
    estimatedDurationMs: 300_000,
    contextCoupling: 'medium',
    isolation: 'medium',
  });
  return {
    claude: {
      think: status.claude?.think || null,
      execute: status.claude?.execute || null,
    },
    openai: {
      think: status.openai?.think || null,
      execute: status.openai?.execute || null,
    },
    recommendation: `${recommendation.provider}:${recommendation.model} (${recommendation.reason})`,
  };
}

function padCell(value, width) {
  const text = String(value ?? '');
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function renderTable(headers, rows) {
  const widths = headers.map((header, idx) =>
    Math.max(
      header.length,
      ...rows.map(row => String(row[idx] ?? '').length),
    ),
  );
  const top = `┌${widths.map(w => '─'.repeat(w + 2)).join('┬')}┐`;
  const mid = `├${widths.map(w => '─'.repeat(w + 2)).join('┼')}┤`;
  const bot = `└${widths.map(w => '─'.repeat(w + 2)).join('┴')}┘`;
  const line = cells => `│ ${cells.map((cell, idx) => padCell(cell, widths[idx])).join(' │ ')} │`;
  return [top, line(headers), mid, ...rows.map(line), bot].join('\n');
}

function gitInsideRepo() {
  const proc = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return proc.status === 0 && proc.stdout.trim() === 'true';
}

function gitHead() {
  const proc = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return proc.status === 0 ? proc.stdout.trim() : null;
}

function runCommand(command, args, cwd = ROOT_DIR) {
  const proc = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: proc.status,
    stdout: proc.stdout || '',
    stderr: proc.stderr || '',
  };
}

function printProgress(message) {
  process.stdout.write(`${message}\n`);
}

function normalizeTask(rawTask, index) {
  const description = trimText(rawTask.description || rawTask.title || `Task ${index + 1}`, 220);
  const pathSeed = `${rawTask.title || ''} ${rawTask.description || ''}`;
  const paths = uniq([...(rawTask.files || []), ...extractPaths(pathSeed)]);
  const risk = classifyRisk(paths);
  return {
    taskId: rawTask.taskId || `task-${index + 1}-${slugify(rawTask.title || description)}`,
    description,
    title: rawTask.title || description,
    tier: rawTask.tier || 'execute',
    topic: rawTask.topic || rawTask.title || description,
    dependencies: rawTask.dependencies || [],
    files: paths,
    riskLevel: highestRisk([rawTask.risk, risk.level]),
    riskReason: rawTask.reason || risk.reason || 'no risk rationale',
  };
}

function decomposeIntent(utterance) {
  if (!utterance || !String(utterance).trim()) {
    throw new Error('Utterance is required unless resuming an existing manifest.');
  }

  const proc = spawnSync(
    'node',
    [join(__dirname, 'vibe-router.mjs'), utterance],
    { cwd: ROOT_DIR, encoding: 'utf8' },
  );

  if (proc.status !== 0) {
    throw new Error(trimText(proc.stderr || proc.stdout || 'vibe-router failed', 300));
  }

  const parsed = safeJsonParse(proc.stdout, null);
  if (!parsed || !Array.isArray(parsed.tasks)) {
    throw new Error('vibe-router returned invalid JSON.');
  }

  const tasks = parsed.tasks.map(normalizeTask);
  return {
    utterance,
    createdAt: isoNow(),
    status: 'planned',
    riskLevel: highestRisk(tasks.map(task => task.riskLevel)),
    tasks,
    qualityGates: parsed.quality_gates || [],
    waveRecommendation: parsed.wave_recommendation || 'sequential',
    summary: parsed.summary || '',
  };
}

function pathsConflict(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) return true;
  const aDir = a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : a;
  const bDir = b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : b;
  return Boolean(aDir && aDir === bDir);
}

function buildOwnershipMap(tasks) {
  const byTask = {};
  const fileOwners = {};
  const conflicts = [];

  for (const task of tasks) {
    const owns = task.tier === 'execute' ? uniq(task.files) : [];
    const reads = uniq(task.files);
    byTask[task.taskId] = {
      owns,
      reads,
      conflicts: [],
    };

    for (const file of owns) {
      if (!fileOwners[file]) fileOwners[file] = [];
      fileOwners[file].push(task.taskId);
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const left = tasks[i];
      const right = tasks[j];
      const leftOwns = byTask[left.taskId].owns;
      const rightOwns = byTask[right.taskId].owns;
      const overlap = [];

      for (const leftPath of leftOwns) {
        for (const rightPath of rightOwns) {
          if (pathsConflict(leftPath, rightPath)) {
            overlap.push(leftPath === rightPath ? leftPath : `${leftPath} ~ ${rightPath}`);
          }
        }
      }

      if (overlap.length > 0) {
        const conflict = { taskIds: [left.taskId, right.taskId], paths: uniq(overlap) };
        conflicts.push(conflict);
        byTask[left.taskId].conflicts.push(conflict);
        byTask[right.taskId].conflicts.push(conflict);
      }
    }
  }

  return { byTask, fileOwners, conflicts };
}

function buildDependencyMap(tasks) {
  const ordered = resolveDependencies(tasks.map(task => ({
    title: task.title,
    description: task.description,
    tier: task.tier,
    risk: task.riskLevel,
    files: task.files,
    dependencies: task.dependencies,
    topic: task.topic,
  })));

  const orderedTasks = [];
  const dependencies = new Map();
  const usedTaskIds = new Set();

  for (const item of ordered) {
    const task = tasks.find(candidate =>
      !usedTaskIds.has(candidate.taskId) &&
      candidate.title === item.title &&
      candidate.description === item.description,
    );
    if (!task) continue;
    usedTaskIds.add(task.taskId);
    orderedTasks.push(task);

    const deps = [];
    if (item.dependencies && item.dependencies !== '—') {
      for (const label of String(item.dependencies).split(',').map(entry => entry.trim())) {
        const match = label.match(/^Task\s+(\d+)$/i);
        if (!match) continue;
        const depIdx = Number(match[1]) - 1;
        if (!ordered[depIdx]) continue;
        const dep = tasks.find(candidate =>
          candidate.title === ordered[depIdx].title &&
          candidate.description === ordered[depIdx].description,
        );
        if (dep) deps.push(dep.taskId);
      }
    }
    dependencies.set(task.taskId, uniq([...deps, ...(task.dependencies || []).filter(Boolean)]));
  }

  for (const task of tasks) {
    if (!usedTaskIds.has(task.taskId)) {
      orderedTasks.push(task);
      dependencies.set(task.taskId, uniq(task.dependencies || []));
    }
  }

  return { orderedTasks, dependencies };
}

function initManifestTask(baseTask, waveId, ownership) {
  return {
    taskId: baseTask.taskId,
    description: baseTask.description,
    provider: null,
    model: null,
    tier: baseTask.tier,
    effort: null,
    agentType: null,
    sandbox: null,
    reason: baseTask.riskReason,
    owns: ownership.byTask[baseTask.taskId]?.owns || [],
    reads: ownership.byTask[baseTask.taskId]?.reads || [],
    status: 'pending',
    result: null,
    startedAt: null,
    completedAt: null,
    retryCount: 0,
    durationMs: null,
    riskLevel: baseTask.riskLevel,
    dependencies: baseTask.dependencies || [],
    topic: baseTask.topic,
  };
}

function canAddTaskToWave(candidate, waveTasks, ownership, dependencies) {
  if (waveTasks.length >= MAX_WAVE_PARALLELISM) return false;

  const candidateDeps = dependencies.get(candidate.taskId) || [];
  if (candidateDeps.some(depId => waveTasks.some(task => task.taskId === depId))) return false;

  const candidateOwns = ownership.byTask[candidate.taskId]?.owns || [];
  for (const existing of waveTasks) {
    const existingOwns = ownership.byTask[existing.taskId]?.owns || [];
    for (const left of candidateOwns) {
      for (const right of existingOwns) {
        if (pathsConflict(left, right)) return false;
      }
    }
  }

  return true;
}

function planWaves(tasks, ownership) {
  const { orderedTasks, dependencies } = buildDependencyMap(tasks);
  const taskIndex = new Map(orderedTasks.map((task, idx) => [task.taskId, idx]));
  const pending = [...orderedTasks];
  const completed = new Set();
  const groups = [];

  while (pending.length > 0) {
    const ready = pending.filter(task =>
      (dependencies.get(task.taskId) || []).every(depId => completed.has(depId) || !taskIndex.has(depId)),
    );

    const bucket = [];
    for (const task of ready) {
      if (canAddTaskToWave(task, bucket, ownership, dependencies)) {
        bucket.push(task);
      }
    }

    if (bucket.length === 0) {
      bucket.push(pending[0]);
    }

    groups.push(bucket);
    for (const task of bucket) {
      completed.add(task.taskId);
      const idx = pending.findIndex(candidate => candidate.taskId === task.taskId);
      if (idx >= 0) pending.splice(idx, 1);
    }
  }

  const waves = groups.map((group, index) => {
    const waveId = `wave-${index + 1}`;
    return {
      waveId,
      status: 'pending',
      checkpoint: { commitHash: null, createdAt: null },
      tasks: group.map(task => initManifestTask(task, waveId, ownership)),
    };
  });

  waves.push({
    waveId: `wave-${waves.length + 1}`,
    status: 'pending',
    checkpoint: { commitHash: null, createdAt: null },
    tasks: [{
      taskId: `task-final-review`,
      description: 'Review all completed wave outputs, call out unresolved risks, and verify final coherence.',
      provider: null,
      model: null,
      tier: 'think',
      effort: null,
      agentType: null,
      sandbox: null,
      reason: 'final review wave',
      owns: [],
      reads: uniq(tasks.flatMap(task => ownership.byTask[task.taskId]?.reads || task.files || [])),
      status: 'pending',
      result: null,
      startedAt: null,
      completedAt: null,
      retryCount: 0,
      durationMs: null,
      riskLevel: highestRisk(tasks.map(task => task.riskLevel)),
      dependencies: tasks.map(task => task.taskId),
      topic: 'final-review',
    }],
  });

  return waves;
}

function inferEffort(task) {
  if (task.tier === 'think') return 'high';
  if (task.riskLevel === 'critical' || task.riskLevel === 'high') return 'high';
  if (task.tier === 'search') return 'low';
  return (combinedTaskFiles(task).length <= 1) ? 'medium' : 'high';
}

function inferAgentType(task) {
  if (task.tier === 'search') return 'explorer';
  if (task.tier === 'think') return 'reviewer';
  return 'worker';
}

function inferSandbox(task) {
  return task.tier === 'execute' ? 'danger-full-access' : 'read-only';
}

function estimateDurationMs(task) {
  const fileCount = Math.max(1, combinedTaskFiles(task).length);
  if (task.tier === 'search') return 90_000 + (fileCount * 15_000);
  if (task.tier === 'think') return 240_000 + (fileCount * 20_000);
  return 180_000 + (fileCount * 30_000);
}

function routeTasks(tasks) {
  const status = getProviderStatus();
  return tasks.map(task => {
    const tier = ['search', 'execute', 'think'].includes(task.tier) ? task.tier : 'execute';
    const effort = inferEffort(task);
    const agentType = inferAgentType(task);
    const sandbox = inferSandbox(task);
    const files = combinedTaskFiles(task);
    const contextCoupling = task.tier === 'think' || files.length > 3 ? 'high' : files.length > 1 ? 'medium' : 'low';
    const isolation = (task.owns?.length || 0) <= 1 ? 'high' : (task.owns?.length || 0) <= 3 ? 'medium' : 'low';
    const selected = chooseProvider({
      tier,
      estimatedDurationMs: estimateDurationMs(task),
      contextCoupling,
      isolation,
    });

    let provider = selected.provider;
    let model = selected.model;
    let reason = selected.reason;

    if (provider !== 'openai') {
      provider = 'openai';
      model = tier === 'think' ? 'gpt-5.5' : tier === 'search' ? 'gpt-4.1-mini' : 'gpt-5.4';
      reason = `${selected.provider}:${selected.model} preferred; forced to openai:${model} because dispatchGptTask is GPT-only`;
    }

    const decisionId = recordDecision({
      tier,
      provider,
      model,
      recommended_model: selected.model,
      followed: provider === selected.provider,
      task_type: agentType,
      estimated_duration_ms: estimateDurationMs(task),
      file_count: files.length,
      context_coupling: contextCoupling,
      isolation,
      claude_pressure: status.claude?.[tier]?.pressure ?? null,
      openai_pressure: status.openai?.[tier]?.pressure ?? null,
    });

    return {
      ...task,
      provider,
      model,
      tier,
      effort,
      agentType,
      sandbox,
      reason,
      _decisionId: decisionId,
    };
  });
}

function printDispatchTable(manifest) {
  const rows = manifest.waves.flatMap(wave => wave.tasks.map(task => [
    `${wave.waveId}:${task.taskId}`,
    task.provider || '-',
    task.model || '-',
    task.effort || '-',
    task.agentType || '-',
    trimText(combinedTaskFiles(task).join(', ') || '-', 42),
  ]));

  console.log(`Manifest: ${manifest.manifestId}`);
  console.log(`State: ${manifest.status}  Risk: ${manifest.riskLevel}`);
  console.log(`Balance: ${manifest.balanceSnapshot.recommendation}`);
  console.log(renderTable(
    ['Task', 'Provider', 'Model', 'Effort', 'Agent', 'Files'],
    rows,
  ));
}

function printFinalTable(manifest) {
  const rows = manifest.waves.flatMap(wave => wave.tasks.map(task => [
    `${wave.waveId}:${task.taskId}`,
    task.provider || '-',
    task.model || '-',
    task.durationMs != null ? `${(task.durationMs / 1000).toFixed(1)}s` : '-',
    `${statusIcon(task.status)} ${task.status}`,
    trimText(combinedTaskFiles(task).join(', ') || '-', 42),
  ]));

  console.log(renderTable(
    ['Task', 'Provider', 'Model', 'Duration', 'Status', 'Files'],
    rows,
  ));
}

function gitCheckpoint(manifest, waveId) {
  ensureStateDirs();
  const checkpoint = {
    manifestId: manifest.manifestId,
    waveId,
    createdAt: isoNow(),
    commitHash: null,
    commitStatus: 'skipped',
  };

  if (!gitInsideRepo()) {
    writeFileSync(
      join(CHECKPOINT_DIR, `${manifest.manifestId}-${waveId}.json`),
      `${JSON.stringify(checkpoint, null, 2)}\n`,
      'utf8',
    );
    return checkpoint;
  }

  runCommand('git', ['add', '-A']);
  const commit = runCommand('git', ['commit', '-m', `wave-orchestrator checkpoint ${manifest.manifestId} ${waveId}`]);
  if (commit.status === 0) {
    checkpoint.commitStatus = 'created';
  } else if (/nothing to commit|no changes added/i.test(commit.stdout + commit.stderr)) {
    checkpoint.commitStatus = 'noop';
  } else {
    checkpoint.commitStatus = 'failed';
    checkpoint.error = trimText(commit.stderr || commit.stdout, 300);
  }

  checkpoint.commitHash = gitHead();

  writeFileSync(
    join(CHECKPOINT_DIR, `${manifest.manifestId}-${waveId}.json`),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    'utf8',
  );

  return checkpoint;
}

function loadPackageJson() {
  const path = join(ROOT_DIR, 'package.json');
  if (!existsSync(path)) return null;
  return safeJsonParse(readFileSync(path, 'utf8'), null);
}

function detectTestCommand(manifest, wave) {
  const hasExecute = wave.tasks.some(task => task.tier === 'execute' && task.status === 'completed');
  if (!hasExecute) return null;

  const pkg = loadPackageJson();
  if (pkg?.scripts?.test) {
    return { command: 'npm', args: ['test'] };
  }

  const changedFiles = wave.tasks.flatMap(task => combinedTaskFiles(task));
  const hasNodeTests = changedFiles.some(file => /\.test\.|\.spec\.|tests?\//i.test(file));
  if (hasNodeTests) {
    return { command: 'node', args: ['--test'] };
  }

  return null;
}

function runWaveTests(manifest, wave) {
  const testCommand = detectTestCommand(manifest, wave);
  if (!testCommand) return null;

  printProgress(`${statusIcon('running')} ${wave.waveId} tests: ${testCommand.command} ${testCommand.args.join(' ')}`);
  const startedAt = Date.now();
  const proc = spawnSync(testCommand.command, testCommand.args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const durationMs = Date.now() - startedAt;
  return {
    command: `${testCommand.command} ${testCommand.args.join(' ')}`,
    status: proc.status === 0 ? 'completed' : 'failed',
    durationMs,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: isoNow(),
    stdout: trimText(proc.stdout, 500),
    stderr: trimText(proc.stderr, 500),
  };
}

function buildDispatchPayload(manifest, wave, task) {
  const files = combinedTaskFiles(task);
  return {
    task: [
      task.description,
      `Manifest ID: ${manifest.manifestId}`,
      `Wave ID: ${wave.waveId}`,
      `Task ID: ${task.taskId}`,
      `Reason: ${task.reason}`,
      `Provider: ${task.provider}`,
      `Effort: ${task.effort}`,
      `Agent Type: ${task.agentType}`,
      `Sandbox: ${task.sandbox}`,
    ].join('\n'),
    model: task.model,
    tier: task.tier,
    files,
    timeoutMs: Math.max(120_000, estimateDurationMs(task)),
    constraints: [
      `Owns: ${task.owns.join(', ') || 'none'}`,
      `Reads: ${task.reads.join(', ') || 'none'}`,
      `Status persistence is handled by the orchestrator; summarize changes clearly.`,
    ],
    cwd: ROOT_DIR,
  };
}

function compressResult(result) {
  const duration = result?.durationMs != null ? `${(result.durationMs / 1000).toFixed(1)}s` : null;
  const core = [
    result?.success ? 'success' : 'failure',
    duration,
    result?.model || null,
    trimText(result?.summary || result?.error || (result?.errors || []).join('; ') || 'no summary', 420),
  ].filter(Boolean).join(' | ');
  return trimText(core, 500);
}

async function executeTask(manifest, wave, task) {
  task.status = 'running';
  task.startedAt = isoNow();
  saveManifest(refreshCounts(manifest));
  printProgress(`${statusIcon('running')} ${wave.waveId} ${task.taskId} -> ${task.provider}:${task.model}`);

  const started = Date.now();
  const result = await dispatchGptTask(buildDispatchPayload(manifest, wave, task));
  const durationMs = Date.now() - started;

  task.durationMs = durationMs;
  task.retryCount = result.retryCount || 0;
  task.completedAt = isoNow();
  task.result = {
    success: !!result.success,
    summary: compressResult(result),
    rawSummary: trimText(result.summary || '', 2000),
    error: trimText(result.error || (result.errors || []).join('; '), 800),
    usage: result.usage || null,
    exitCode: result.exitCode ?? null,
    failureType: result.failureType || null,
  };
  task.status = result.success ? 'completed' : 'failed';

  if (task._decisionId) {
    recordOutcome(task._decisionId, {
      actual_duration_ms: durationMs,
      codex_startup_ms: result.startupMs || null,
      success: !!result.success,
      retries: result.retryCount || 0,
      actual_input_tokens: result.usage?.input_tokens || null,
      actual_output_tokens: result.usage?.output_tokens || null,
      files_changed: task.owns || [],
      files_read: task.reads || [],
    });
  }

  printProgress(`${statusIcon(task.status)} ${wave.waveId} ${task.taskId} ${task.status} ${(durationMs / 1000).toFixed(1)}s`);
  saveManifest(refreshCounts(manifest));
  return task;
}

async function executeWave(manifest, waveIdx) {
  const wave = manifest.waves[waveIdx];
  if (!wave) throw new Error(`Wave not found at index ${waveIdx}`);
  if (wave.status === 'completed') return wave;

  wave.status = 'running';
  saveManifest(refreshCounts(manifest));
  printProgress(`\n${statusIcon('running')} Starting ${wave.waveId} (${wave.tasks.length} task${wave.tasks.length === 1 ? '' : 's'})`);

  const runnable = wave.tasks.filter(task => task.status !== 'completed');
  if (runnable.length === 0) {
    wave.status = 'completed';
    saveManifest(refreshCounts(manifest));
    return wave;
  }

  const failures = [];
  await Promise.all(runnable.slice(0, MAX_WAVE_PARALLELISM).map(async task => {
    try {
      await executeTask(manifest, wave, task);
    } catch (error) {
      task.status = 'failed';
      task.completedAt = isoNow();
      task.result = {
        success: false,
        summary: trimText(error.message, 500),
        rawSummary: '',
        error: trimText(error.stack || error.message, 800),
        usage: null,
        exitCode: null,
        failureType: 'orchestrator_error',
      };
      failures.push(error);
      saveManifest(refreshCounts(manifest));
    }
  }));

  const testRun = runWaveTests(manifest, wave);
  if (testRun) {
    wave.testRun = testRun;
    if (testRun.status === 'failed') {
      failures.push(new Error(`Tests failed for ${wave.waveId}`));
    }
  }

  wave.status = failures.length > 0 || wave.tasks.some(task => task.status === 'failed')
    ? 'failed'
    : 'completed';
  saveManifest(refreshCounts(manifest));
  return wave;
}

function buildManifest(plan) {
  const ownership = buildOwnershipMap(plan.tasks);
  const waves = planWaves(plan.tasks, ownership);
  const routedWaves = waves.map(wave => ({
    ...wave,
    tasks: routeTasks(wave.tasks),
  }));
  const manifest = refreshCounts({
    manifestId: makeManifestId(),
    utterance: plan.utterance,
    createdAt: plan.createdAt,
    status: 'planned',
    riskLevel: plan.riskLevel,
    balanceSnapshot: getBalanceSnapshot(),
    waves: routedWaves,
    completedWaves: 0,
    totalWaves: routedWaves.length,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  });
  return manifest;
}

function getResumeWaveIndex(manifest) {
  return manifest.waves.findIndex(wave => wave.status !== 'completed');
}

function verifyResumeState(manifest) {
  if (!gitInsideRepo()) return;
  const currentHead = gitHead();
  const lastCompletedWave = [...manifest.waves].reverse().find(wave => wave.status === 'completed' && wave.checkpoint?.commitHash);
  if (!lastCompletedWave) return;
  if (currentHead !== lastCompletedWave.checkpoint.commitHash) {
    throw new Error(
      `Git HEAD ${currentHead || 'unknown'} does not match last completed checkpoint ${lastCompletedWave.checkpoint.commitHash}. Restore that checkpoint before resuming.`,
    );
  }
}

async function orchestrate(utterance, opts = {}) {
  ensureStateDirs();

  if (opts.show) {
    const manifest = refreshCounts(loadManifest(opts.show));
    printDispatchTable(manifest);
    printFinalTable(manifest);
    return manifest;
  }

  let manifest;
  if (opts.resume) {
    manifest = refreshCounts(loadManifest(opts.resume));
    verifyResumeState(manifest);
    manifest.status = 'running';
    manifest.balanceSnapshot = getBalanceSnapshot();
    saveManifest(manifest);
  } else {
    const plan = decomposeIntent(utterance);
    manifest = buildManifest(plan);
    saveManifest(manifest);
    printDispatchTable(manifest);
    if (opts.dryRun) {
      manifest.status = 'dry-run';
      saveManifest(refreshCounts(manifest));
      return manifest;
    }
  }

  try {
    const startWaveIdx = Math.max(0, getResumeWaveIndex(manifest));
    if (startWaveIdx >= manifest.waves.length) {
      manifest.status = 'completed';
      saveManifest(refreshCounts(manifest));
      printFinalTable(manifest);
      return manifest;
    }

    for (let i = startWaveIdx; i < manifest.waves.length; i++) {
      const wave = manifest.waves[i];
      if (wave.status === 'completed') continue;

      wave.checkpoint = gitCheckpoint(manifest, wave.waveId);
      saveManifest(refreshCounts(manifest));
      await executeWave(manifest, i);

      if (wave.status === 'failed') {
        manifest.status = 'paused';
        saveManifest(refreshCounts(manifest));
        console.error(`Paused after ${wave.waveId}. Resume with: node hooks/wave-orchestrator.mjs --resume ${manifest.manifestId}`);
        printFinalTable(manifest);
        return manifest;
      }
    }

    manifest.status = 'completed';
    saveManifest(refreshCounts(manifest));
    printFinalTable(manifest);
    return manifest;
  } catch (error) {
    manifest.status = 'paused';
    manifest.lastError = trimText(error.stack || error.message, 1200);
    saveManifest(refreshCounts(manifest));
    console.error(trimText(error.message, 400));
    console.error(`Resume with: node hooks/wave-orchestrator.mjs --resume ${manifest.manifestId}`);
    return manifest;
  }
}

function parseCli(argv) {
  const args = [...argv];
  if (args[0] === '--resume') {
    return { resume: args[1] };
  }
  if (args[0] === '--dry-run') {
    return { dryRun: true, utterance: args.slice(1).join(' ') };
  }
  if (args[0] === '--show') {
    return { show: args[1] };
  }
  return { utterance: args.join(' ') };
}

async function main() {
  const args = parseCli(process.argv.slice(2));

  if (args.show) {
    await orchestrate(null, { show: args.show });
    return;
  }
  if (args.resume) {
    await orchestrate(null, { resume: args.resume });
    return;
  }
  if (args.dryRun) {
    if (!args.utterance) {
      console.error('Usage: node hooks/wave-orchestrator.mjs --dry-run "utterance"');
      process.exit(1);
    }
    await orchestrate(args.utterance, { dryRun: true });
    return;
  }
  if (!args.utterance) {
    console.error('Usage: node hooks/wave-orchestrator.mjs "utterance" | --resume ID | --dry-run "utterance" | --show ID');
    process.exit(1);
  }
  await orchestrate(args.utterance);
}

export {
  orchestrate,
  decomposeIntent,
  planWaves,
  buildOwnershipMap,
  compressResult,
  printDispatchTable,
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(error => {
    console.error(trimText(error.stack || error.message, 1200));
    process.exit(1);
  });
}
