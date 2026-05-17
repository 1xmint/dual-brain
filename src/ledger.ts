// Task ledger: append-only accountability store for HEAD's promises. Every tracked task has a full snapshot per state change.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const LEDGER_PATH = '.dualbrain/ledger.jsonl';

type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'failed';

interface TaskEntry {
  id: string;
  created: string;
  updated: string;
  intent: string;
  status: TaskStatus;
  owner: string;
  priority: string;
  blockers: string[];
  proof: string | null;
  subtasks: string[];
  parentTask: string | null;
  files: string[];
  result: string | null;
  cost: unknown;
}

interface CreateTaskInput {
  intent?: string;
  owner?: string;
  priority?: string;
  blockers?: string[];
  proof?: string | null;
  subtasks?: string[];
  parentTask?: string | null;
  files?: string[];
  result?: string | null;
  cost?: unknown;
}

interface TaskSummary {
  open: number;
  inProgress: number;
  blocked: number;
  done: number;
  failed: number;
  total: number;
}

interface SubtaskInput extends CreateTaskInput {
  // inherits from CreateTaskInput
}

function ledgerPath(cwd?: string): string {
  return join(cwd || process.cwd(), LEDGER_PATH);
}

function readAllEntries(cwd?: string): TaskEntry[] {
  const p = ledgerPath(cwd);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map(line => JSON.parse(line) as TaskEntry);
}

function appendEntry(entry: TaskEntry, cwd?: string): void {
  const p = ledgerPath(cwd);
  mkdirSync(join(cwd || process.cwd(), '.dualbrain'), { recursive: true });
  writeFileSync(p, JSON.stringify(entry) + '\n', { flag: 'a' });
}

function getCurrentTasks(cwd?: string): TaskEntry[] {
  const entries = readAllEntries(cwd);
  const map = new Map<string, TaskEntry>();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return Array.from(map.values());
}

export function createTask(task: CreateTaskInput, cwd?: string): TaskEntry {
  const entry: TaskEntry = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    intent: task.intent || '',
    status: 'open',
    owner: task.owner || 'head',
    priority: task.priority || 'medium',
    blockers: task.blockers || [],
    proof: task.proof || null,
    subtasks: task.subtasks || [],
    parentTask: task.parentTask || null,
    files: task.files || [],
    result: task.result || null,
    cost: task.cost || null,
  };
  appendEntry(entry, cwd);
  return entry;
}

export function updateTask(taskId: string, updates: Partial<TaskEntry>, cwd?: string): TaskEntry {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);

  if (updates.status === 'done') {
    const proof = updates.proof ?? current.proof;
    const result = updates.result ?? current.result;
    if (!proof) throw new Error(`Cannot mark task done without proof: ${taskId}`);
    if (!result) throw new Error(`Cannot mark task done without result: ${taskId}`);
  }

  const updated: TaskEntry = {
    ...current,
    ...updates,
    id: taskId,
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function failTask(taskId: string, reason: string, cwd?: string): TaskEntry {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);
  const updated: TaskEntry = {
    ...current,
    status: 'failed',
    result: reason || 'failed',
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function blockTask(taskId: string, blocker: string, cwd?: string): TaskEntry {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);
  const updated: TaskEntry = {
    ...current,
    status: 'blocked',
    blockers: [...(current.blockers || []), blocker],
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function getTask(taskId: string, cwd?: string): TaskEntry | null {
  const entries = readAllEntries(cwd);
  let latest: TaskEntry | null = null;
  for (const entry of entries) {
    if (entry.id === taskId) latest = entry;
  }
  return latest;
}

export function getOpenTasks(cwd?: string): TaskEntry[] {
  return getCurrentTasks(cwd).filter(t =>
    t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked'
  );
}

export function getTaskHistory(taskId: string, cwd?: string): TaskEntry[] {
  return readAllEntries(cwd).filter(e => e.id === taskId);
}

export function getTaskSummary(cwd?: string): TaskSummary {
  const tasks = getCurrentTasks(cwd);
  const summary: TaskSummary = { open: 0, inProgress: 0, blocked: 0, done: 0, failed: 0, total: tasks.length };
  for (const t of tasks) {
    if (t.status === 'open') summary.open++;
    else if (t.status === 'in_progress') summary.inProgress++;
    else if (t.status === 'blocked') summary.blocked++;
    else if (t.status === 'done') summary.done++;
    else if (t.status === 'failed') summary.failed++;
  }
  return summary;
}

export function formatTaskList(tasks: TaskEntry[]): string {
  const all = tasks;
  const open = all.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const blocked = all.filter(t => t.status === 'blocked').length;
  const done = all.filter(t => t.status === 'done').length;

  const lines = [`TASKS (${open} open, ${blocked} blocked, ${done} done)`];

  for (const t of all) {
    const pri = t.priority === 'critical' ? 'crit' : t.priority === 'high' ? 'high' : t.priority === 'low' ? 'low' : 'med';
    const label = t.intent.length > 48 ? t.intent.slice(0, 45) + '...' : t.intent;

    if (t.status === 'done') {
      lines.push(`  ✓ [${pri}]  ${label} (done)`);
    } else if (t.status === 'failed') {
      lines.push(`  ✗ [${pri}]  ${label} (failed)`);
    } else if (t.status === 'blocked') {
      const blockerNote = t.blockers && t.blockers.length ? `: ${t.blockers[t.blockers.length - 1]}` : '';
      lines.push(`  ◌ [${pri}]  ${label} (blocked${blockerNote})`);
    } else {
      lines.push(`  ● [${pri}]  ${label} (${t.status})`);
    }
  }

  return lines.join('\n');
}

export function reconcile(cwd?: string): TaskEntry[] {
  const tasks = getCurrentTasks(cwd);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return tasks.filter(t =>
    (t.status === 'open' || t.status === 'in_progress') &&
    new Date(t.updated).getTime() < cutoff
  );
}

export function decompose(taskId: string, subtasks: SubtaskInput[], cwd?: string): { parent: TaskEntry; subtasks: TaskEntry[] } {
  const parent = getTask(taskId, cwd);
  if (!parent) throw new Error(`Task not found: ${taskId}`);

  const created = subtasks.map(sub =>
    createTask(
      {
        ...sub,
        parentTask: taskId,
        owner: sub.owner || parent.owner,
        priority: sub.priority || parent.priority,
      },
      cwd
    )
  );

  const subtaskIds = created.map(s => s.id);
  const updatedParent: TaskEntry = {
    ...parent,
    subtasks: [...(parent.subtasks || []), ...subtaskIds],
    updated: new Date().toISOString(),
  };
  appendEntry(updatedParent, cwd);

  return { parent: updatedParent, subtasks: created };
}
