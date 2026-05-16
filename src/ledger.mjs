// Task ledger: append-only accountability store for HEAD's promises. Every tracked task has a full snapshot per state change.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const LEDGER_PATH = '.dualbrain/ledger.jsonl';

function ledgerPath(cwd) {
  return join(cwd || process.cwd(), LEDGER_PATH);
}

function readAllEntries(cwd) {
  const p = ledgerPath(cwd);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map(line => JSON.parse(line));
}

function appendEntry(entry, cwd) {
  const p = ledgerPath(cwd);
  mkdirSync(join(cwd || process.cwd(), '.dualbrain'), { recursive: true });
  writeFileSync(p, JSON.stringify(entry) + '\n', { flag: 'a' });
}

function getCurrentTasks(cwd) {
  const entries = readAllEntries(cwd);
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return Array.from(map.values());
}

export function createTask(task, cwd) {
  const entry = {
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

export function updateTask(taskId, updates, cwd) {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);

  if (updates.status === 'done') {
    const proof = updates.proof ?? current.proof;
    const result = updates.result ?? current.result;
    if (!proof) throw new Error(`Cannot mark task done without proof: ${taskId}`);
    if (!result) throw new Error(`Cannot mark task done without result: ${taskId}`);
  }

  const updated = {
    ...current,
    ...updates,
    id: taskId,
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function failTask(taskId, reason, cwd) {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);
  const updated = {
    ...current,
    status: 'failed',
    result: reason || 'failed',
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function blockTask(taskId, blocker, cwd) {
  const current = getTask(taskId, cwd);
  if (!current) throw new Error(`Task not found: ${taskId}`);
  const updated = {
    ...current,
    status: 'blocked',
    blockers: [...(current.blockers || []), blocker],
    updated: new Date().toISOString(),
  };
  appendEntry(updated, cwd);
  return updated;
}

export function getTask(taskId, cwd) {
  const entries = readAllEntries(cwd);
  let latest = null;
  for (const entry of entries) {
    if (entry.id === taskId) latest = entry;
  }
  return latest;
}

export function getOpenTasks(cwd) {
  return getCurrentTasks(cwd).filter(t =>
    t.status === 'open' || t.status === 'in_progress' || t.status === 'blocked'
  );
}

export function getTaskHistory(taskId, cwd) {
  return readAllEntries(cwd).filter(e => e.id === taskId);
}

export function getTaskSummary(cwd) {
  const tasks = getCurrentTasks(cwd);
  const summary = { open: 0, inProgress: 0, blocked: 0, done: 0, failed: 0, total: tasks.length };
  for (const t of tasks) {
    if (t.status === 'open') summary.open++;
    else if (t.status === 'in_progress') summary.inProgress++;
    else if (t.status === 'blocked') summary.blocked++;
    else if (t.status === 'done') summary.done++;
    else if (t.status === 'failed') summary.failed++;
  }
  return summary;
}

export function formatTaskList(tasks) {
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

export function reconcile(cwd) {
  const tasks = getCurrentTasks(cwd);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return tasks.filter(t =>
    (t.status === 'open' || t.status === 'in_progress') &&
    new Date(t.updated).getTime() < cutoff
  );
}

export function decompose(taskId, subtasks, cwd) {
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
  const updatedParent = {
    ...parent,
    subtasks: [...(parent.subtasks || []), ...subtaskIds],
    updated: new Date().toISOString(),
  };
  appendEntry(updatedParent, cwd);

  return { parent: updatedParent, subtasks: created };
}
