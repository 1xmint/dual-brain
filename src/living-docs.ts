// living-docs.mjs — Living document system for .dualbrain/.
// Manages project.json, vision.md, roadmap.md, state.md, actions.jsonl, decisions.jsonl, checkpoints.jsonl.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const DIR = '.dualbrain';

function docsDir(cwd: string = process.cwd()): string {
  return join(cwd, DIR);
}

function ensureDir(cwd: string): void {
  mkdirSync(docsDir(cwd), { recursive: true });
}

function filePath(name: string, cwd: string): string {
  return join(docsDir(cwd), name);
}

function readFileSafe(name: string, cwd: string, fallback = ''): string {
  try {
    return readFileSync(filePath(name, cwd), 'utf8');
  } catch {
    return fallback;
  }
}

function readJsonSafe(name: string, cwd: string, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath(name, cwd), 'utf8'));
  } catch {
    return fallback;
  }
}

function readPackageJson(cwd: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function gitExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return null;
  }
}

export function initLivingDocs(cwd: string = process.cwd()): { created: boolean; path: string } {
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

export function appendAction(action: Record<string, unknown>, cwd: string = process.cwd()): Record<string, unknown> {
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

export function appendDecision(decision: Record<string, unknown>, cwd: string = process.cwd()): Record<string, unknown> {
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

export function createCheckpoint(summary: string, cwd: string = process.cwd()): Record<string, unknown> {
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

export function updateState(newContent: string, cwd: string = process.cwd()): void {
  ensureDir(cwd);
  writeFileSync(filePath('state.md', cwd), newContent);
}

export function updateRoadmap(newContent: string, cwd: string = process.cwd()): void {
  ensureDir(cwd);
  writeFileSync(filePath('roadmap.md', cwd), newContent);
}

export function updateVision(newContent: string, cwd: string = process.cwd()): void {
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

export function getProjectState(cwd: string = process.cwd()): Record<string, unknown> {
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

function readLastLines(name: string, cwd: string, n: number): Record<string, unknown>[] {
  const raw = readFileSafe(name, cwd, '');
  const lines = raw.split('\n').filter(l => l.trim());
  return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function getRecentActions(cwd: string = process.cwd(), limit = 20): Record<string, unknown>[] {
  return readLastLines('actions.jsonl', cwd, limit);
}

export function getOpenTasks(cwd: string = process.cwd()): Record<string, unknown>[] {
  const raw = readFileSafe('actions.jsonl', cwd, '');
  const lines = raw.split('\n').filter(l => l.trim());
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return entries.filter(e => e.status === 'started' || e.status === 'blocked');
}

export function updateProject(updates: Record<string, unknown>, cwd: string = process.cwd()): Record<string, unknown> {
  ensureDir(cwd);
  const current = readJsonSafe('project.json', cwd, {});
  const merged = { ...current, ...updates };
  writeFileSync(filePath('project.json', cwd), JSON.stringify(merged, null, 2));
  return merged;
}
