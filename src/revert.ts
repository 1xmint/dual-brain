// revert.ts — Undo recent auto-adjustments and applied recommendations
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

interface ChangeRecord {
  id: string;
  timestamp: string;
  type: 'auto' | 'recommendation' | 'manual';
  category: string;
  description: string;
  previousValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reverted: boolean;
}

function dbDir(cwd?: string): string { return join(cwd || process.cwd(), '.dualbrain'); }
function changesPath(cwd?: string): string { return join(dbDir(cwd), 'changes.jsonl'); }
function configPath(cwd?: string): string { return join(dbDir(cwd), 'config.json'); }

function genId(): string { return 'chg_' + Math.random().toString(36).slice(2, 9); }

function readChanges(cwd?: string): ChangeRecord[] {
  try {
    if (!existsSync(changesPath(cwd))) return [];
    return readFileSync(changesPath(cwd), 'utf8')
      .split('\n').filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

function writeChanges(records: ChangeRecord[], cwd?: string): void {
  try {
    mkdirSync(dbDir(cwd), { recursive: true });
    writeFileSync(changesPath(cwd), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  } catch {}
}

function applyRevert(changeRecord: ChangeRecord, cwd?: string): void {
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(readFileSync(configPath(cwd), 'utf8')); } catch {}
  Object.assign(config, changeRecord.previousValue);
  writeFileSync(configPath(cwd), JSON.stringify(config, null, 2) + '\n');
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatChange(change: ChangeRecord): string {
  const badge = change.type === 'auto' ? '(auto)' : change.type === 'recommendation' ? '(rec)' : '(manual)';
  return `${relativeTime(change.timestamp).padEnd(8)} ${change.description}  ${badge}`;
}

export function recordChange(params: { type: string; category: string; description: string; previousValue: Record<string, unknown>; newValue: Record<string, unknown> }, cwd?: string): ChangeRecord | null {
  try {
    mkdirSync(dbDir(cwd), { recursive: true });
    const record: ChangeRecord = {
      id: genId(),
      timestamp: new Date().toISOString(),
      type: params.type as ChangeRecord['type'],
      category: params.category,
      description: params.description,
      previousValue: params.previousValue,
      newValue: params.newValue,
      reverted: false,
    };
    writeFileSync(changesPath(cwd), JSON.stringify(record) + '\n', { flag: 'a' });
    return record;
  } catch { return null; }
}

export function getRecentChanges(cwd?: string, limit = 10): ChangeRecord[] {
  try {
    return readChanges(cwd)
      .filter(r => !r.reverted)
      .reverse()
      .slice(0, limit);
  } catch { return []; }
}

export function revertChange(changeId: string, cwd?: string): { success: boolean; description: string } {
  try {
    const records = readChanges(cwd);
    const idx = records.findIndex(r => r.id === changeId);
    if (idx === -1) return { success: false, description: 'Change not found' };
    const record = records[idx];
    if (record.reverted) return { success: false, description: 'Already reverted' };
    applyRevert(record, cwd);
    records[idx] = { ...record, reverted: true };
    writeChanges(records, cwd);
    return { success: true, description: record.description };
  } catch (e: unknown) { return { success: false, description: (e as Error).message }; }
}

export function revertAll(since: string | null, cwd?: string): { success: boolean; count: number; error?: string } {
  try {
    const records = readChanges(cwd);
    const cutoff = since ? new Date(since).getTime() : 0;
    let count = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.reverted && new Date(r.timestamp).getTime() >= cutoff) {
        applyRevert(r, cwd);
        records[i] = { ...r, reverted: true };
        count++;
      }
    }
    writeChanges(records, cwd);
    return { success: true, count };
  } catch (e: unknown) { return { success: false, count: 0, error: (e as Error).message }; }
}

export async function runRevert(cwd?: string): Promise<void> {
  const changes = getRecentChanges(cwd, 10);
  const W = 59;
  const border = '─'.repeat(W - 2);
  const pad = (s: string) => '│ ' + s.padEnd(W - 4) + ' │';

  console.log(`╭${border}╮`);
  console.log(pad('Recent Changes'));
  console.log(pad(''));
  if (!changes.length) {
    console.log(pad('  No recent changes to revert.'));
  } else {
    changes.forEach((ch, i) => console.log(pad(`  [${i + 1}] ${formatChange(ch)}`)));
  }
  console.log(pad(''));
  console.log(pad('  [number] revert   [a] revert all   [q] quit'));
  console.log(pad(''));
  console.log(`╰${border}╯`);

  if (!changes.length) return;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(res => rl.question('> ', res));
  rl.close();

  const input = answer.trim().toLowerCase();
  if (input === 'q' || input === '') return;
  if (input === 'a') {
    const confirm = await new Promise<string>(res => {
      const r2 = createInterface({ input: process.stdin, output: process.stdout });
      r2.question(`Revert all ${changes.length} changes? (y/N) `, ans => { r2.close(); res(ans); });
    });
    if (confirm.trim().toLowerCase() === 'y') {
      const result = revertAll(null, cwd);
      console.log(result.success ? `Reverted ${result.count} changes.` : `Error: ${result.error}`);
    }
    return;
  }
  const n = parseInt(input, 10);
  if (!isNaN(n) && n >= 1 && n <= changes.length) {
    const target = changes[n - 1];
    const result = revertChange(target.id, cwd);
    console.log(result.success ? `Reverted: ${result.description}` : `Error: ${result.description}`);
  } else {
    console.log('Invalid selection.');
  }
}
