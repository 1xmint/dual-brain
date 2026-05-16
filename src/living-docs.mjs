// living-docs.mjs — Living document system for .dualbrain/.
// Manages project.json, vision.md, roadmap.md, state.md, actions.jsonl, decisions.jsonl, checkpoints.jsonl.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const DIR = '.dualbrain';

function docsDir(cwd = process.cwd()) {
  return join(cwd, DIR);
}

function ensureDir(cwd) {
  mkdirSync(docsDir(cwd), { recursive: true });
}

function filePath(name, cwd) {
  return join(docsDir(cwd), name);
}

function readFileSafe(name, cwd, fallback = '') {
  try {
    return readFileSync(filePath(name, cwd), 'utf8');
  } catch {
    return fallback;
  }
}

function readJsonSafe(name, cwd, fallback = {}) {
  try {
    return JSON.parse(readFileSync(filePath(name, cwd), 'utf8'));
  } catch {
    return fallback;
  }
}

function readPackageJson(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function gitExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

export function initLivingDocs(cwd = process.cwd()) {
  const dir = docsDir(cwd);
  const existed = existsSync(dir);
  ensureDir(cwd);

  const pkg = readPackageJson(cwd);

  if (!existsSync(filePath('project.json', cwd))) {
    const project = {
      name: pkg.name ?? '',
      version: pkg.version ?? '0.0.1',
      created: new Date().toISOString(),
      workStyle: 'balanced',
      userCalibration: { specificity: 3, corrections: 3, autonomy: 3 },
      team: [],
      providers: {},
    };
    writeFileSync(filePath('project.json', cwd), JSON.stringify(project, null, 2));
  }

  if (!existsSync(filePath('vision.md', cwd))) {
    writeFileSync(filePath('vision.md', cwd), '# Vision\n\n_Not yet defined. Type your vision and HEAD will maintain this document._\n');
  }

  if (!existsSync(filePath('roadmap.md', cwd))) {
    writeFileSync(filePath('roadmap.md', cwd), '# Roadmap\n\n_No roadmap yet. As you work, HEAD will build this from your actions._\n');
  }

  if (!existsSync(filePath('state.md', cwd))) {
    writeFileSync(filePath('state.md', cwd), '# Current State\n\n_Fresh project. No history yet._\n');
  }

  for (const log of ['actions.jsonl', 'decisions.jsonl', 'checkpoints.jsonl']) {
    if (!existsSync(filePath(log, cwd))) {
      writeFileSync(filePath(log, cwd), '');
    }
  }

  return { created: !existed, path: dir };
}

export function appendAction(action, cwd = process.cwd()) {
  ensureDir(cwd);
  const entry = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type: 'task',
    intent: '',
    status: 'started',
    owner: 'head',
    files: [],
    proof: null,
    cost: null,
    result: null,
    ...action,
  };
  appendFileSync(filePath('actions.jsonl', cwd), JSON.stringify(entry) + '\n');
  return entry;
}

export function appendDecision(decision, cwd = process.cwd()) {
  ensureDir(cwd);
  const entry = {
    id: `dec_${Date.now()}`,
    timestamp: new Date().toISOString(),
    question: '',
    decision: '',
    reasoning: '',
    participants: [],
    supersedes: null,
    ...decision,
  };
  appendFileSync(filePath('decisions.jsonl', cwd), JSON.stringify(entry) + '\n');
  return entry;
}

export function createCheckpoint(summary, cwd = process.cwd()) {
  ensureDir(cwd);
  const gitRef = gitExec('git rev-parse HEAD', cwd) ?? 'unknown';
  const branch = gitExec('git rev-parse --abbrev-ref HEAD', cwd) ?? 'unknown';
  const stateSnapshot = readFileSafe('state.md', cwd, '');
  const entry = {
    id: `cp_${Date.now()}`,
    timestamp: new Date().toISOString(),
    gitRef,
    branch,
    summary,
    stateSnapshot,
  };
  appendFileSync(filePath('checkpoints.jsonl', cwd), JSON.stringify(entry) + '\n');
  return entry;
}

export function updateState(newContent, cwd = process.cwd()) {
  ensureDir(cwd);
  writeFileSync(filePath('state.md', cwd), newContent);
}

export function updateRoadmap(newContent, cwd = process.cwd()) {
  ensureDir(cwd);
  writeFileSync(filePath('roadmap.md', cwd), newContent);
}

export function updateVision(newContent, cwd = process.cwd()) {
  ensureDir(cwd);
  const prev = readFileSafe('vision.md', cwd, '');
  writeFileSync(filePath('vision.md', cwd), newContent);
  if (prev !== newContent) {
    appendDecision({
      question: 'What is the project vision?',
      decision: newContent.slice(0, 200),
      reasoning: 'Vision document updated.',
      participants: ['head'],
      supersedes: null,
    }, cwd);
  }
}

export function getProjectState(cwd = process.cwd()) {
  const project = readJsonSafe('project.json', cwd, {});
  const state = readFileSafe('state.md', cwd, '');
  const actions = getRecentActions(cwd, 20);
  const decisions = readLastLines('decisions.jsonl', cwd, 5);
  const checkpoints = readLastLines('checkpoints.jsonl', cwd, 1);
  return {
    project,
    state,
    recentActions: actions,
    recentDecisions: decisions,
    lastCheckpoint: checkpoints[0] ?? null,
  };
}

function readLastLines(name, cwd, n) {
  const raw = readFileSafe(name, cwd, '');
  const lines = raw.split('\n').filter(l => l.trim());
  return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function getRecentActions(cwd = process.cwd(), limit = 20) {
  return readLastLines('actions.jsonl', cwd, limit);
}

export function getOpenTasks(cwd = process.cwd()) {
  const raw = readFileSafe('actions.jsonl', cwd, '');
  const lines = raw.split('\n').filter(l => l.trim());
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return entries.filter(e => e.status === 'started' || e.status === 'blocked');
}

export function updateProject(updates, cwd = process.cwd()) {
  ensureDir(cwd);
  const current = readJsonSafe('project.json', cwd, {});
  const merged = { ...current, ...updates };
  writeFileSync(filePath('project.json', cwd), JSON.stringify(merged, null, 2));
  return merged;
}
