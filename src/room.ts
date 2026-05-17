/**
 * room.ts — File-based communication layer for the dual-brain agent hierarchy.
 *
 * A "room" is a project-level workspace where HEAD, managers, and workers
 * communicate through structured JSON files. Each room lives at
 * `.dual-brain/rooms/{roomId}/` and provides typed read/write operations
 * for plans, insights, decisions, user input, and per-worker state.
 *
 * All writes use atomic primitives from integrity.ts.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWriteJson, readJsonSafe } from './integrity.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Room {
  id: string;
  path: string;
  meta: RoomMeta;
}

export interface RoomMeta {
  roomId: string;
  created: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  taskDescription: string;
  depth: 'direct' | 'managed' | 'supervised';
}

export interface RoomPlan {
  waves: Wave[];
  estimatedCost: number;
  estimatedDuration: string;
}

export interface Wave {
  id: string;
  tasks: WaveTask[];
  dependsOn: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface WaveTask {
  id: string;
  description: string;
  assignedModel?: string;
  tier: number;
  files: string[];
}

export interface RoomInsight {
  timestamp: string;
  content: string;
  confidence: number;
  source: 'analysis' | 'debate' | 'observation';
}

export interface UserInput {
  timestamp: string;
  message: string;
  intent?: string;
}

export interface RoomDecision {
  timestamp: string;
  action: 'go' | 'stop' | 'change' | 'cancel';
  details?: string;
}

export interface WorkerAssignment {
  taskId: string;
  description: string;
  model: string;
  tier: number;
  files: string[];
  acceptanceCriteria: string[];
  constraints: string[];
}

export interface WorkerResult {
  taskId: string;
  status: 'success' | 'partial' | 'failed';
  filesChanged: string[];
  output: string;
  durationMs: number;
  tokensUsed?: number;
}

export type WorkerStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RoomSummary {
  id: string;
  status: RoomMeta['status'];
  taskDescription: string;
  created: string;
  workerCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const ROOMS_DIR = '.dual-brain/rooms';

function roomsRoot(cwd?: string): string {
  return join(cwd || process.cwd(), ROOMS_DIR);
}

function roomPath(roomId: string, cwd?: string): string {
  return join(roomsRoot(cwd), roomId);
}

function workerDir(roomId: string, workerId: string, cwd?: string): string {
  return join(roomPath(roomId, cwd), 'workers', workerId);
}

/**
 * Generate a short, readable room ID: slugified prefix + 4 random hex chars.
 */
function generateRoomId(taskDescription: string): string {
  const slug = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const rand = randomBytes(2).toString('hex');
  return `${slug || 'room'}-${rand}`;
}

// ─── Room lifecycle ────────────────────────────────────────────────────────

export function createRoom(taskDescription: string, cwd?: string): Room {
  const id = generateRoomId(taskDescription);
  const rp = roomPath(id, cwd);

  mkdirSync(join(rp, 'workers'), { recursive: true });

  const meta: RoomMeta = {
    roomId: id,
    created: new Date().toISOString(),
    status: 'active',
    taskDescription,
    depth: 'direct',
  };

  atomicWriteJson(join(rp, 'meta.json'), meta);

  return { id, path: rp, meta };
}

export function getRoom(roomId: string, cwd?: string): Room | null {
  const rp = roomPath(roomId, cwd);
  const meta = readJsonSafe(join(rp, 'meta.json')) as RoomMeta | null;
  if (!meta) return null;
  return { id: roomId, path: rp, meta };
}

export function listRooms(cwd?: string): RoomSummary[] {
  const root = roomsRoot(cwd);
  if (!existsSync(root)) return [];

  const entries = readdirSync(root, { withFileTypes: true });
  const summaries: RoomSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readJsonSafe(join(root, entry.name, 'meta.json')) as RoomMeta | null;
    if (!meta) continue;

    let workerCount = 0;
    const wDir = join(root, entry.name, 'workers');
    if (existsSync(wDir)) {
      workerCount = readdirSync(wDir, { withFileTypes: true })
        .filter((d: { isDirectory(): boolean }) => d.isDirectory()).length;
    }

    summaries.push({
      id: entry.name,
      status: meta.status,
      taskDescription: meta.taskDescription,
      created: meta.created,
      workerCount,
    });
  }

  return summaries;
}

export function closeRoom(roomId: string, cwd?: string): void {
  const rp = roomPath(roomId, cwd);
  const metaPath = join(rp, 'meta.json');
  const meta = readJsonSafe(metaPath) as RoomMeta | null;
  if (!meta) return;

  meta.status = 'completed';
  atomicWriteJson(metaPath, meta);
}

// ─── Plan ──────────────────────────────────────────────────────────────────

export function writePlan(roomId: string, plan: RoomPlan, cwd?: string): void {
  atomicWriteJson(join(roomPath(roomId, cwd), 'plan.json'), plan);
}

export function readPlan(roomId: string, cwd?: string): RoomPlan | null {
  return readJsonSafe(join(roomPath(roomId, cwd), 'plan.json')) as RoomPlan | null;
}

// ─── Insights ──────────────────────────────────────────────────────────────

export function writeInsights(roomId: string, insights: RoomInsight[], cwd?: string): void {
  atomicWriteJson(join(roomPath(roomId, cwd), 'insights.json'), insights);
}

export function readInsights(roomId: string, cwd?: string): RoomInsight[] {
  const data = readJsonSafe(join(roomPath(roomId, cwd), 'insights.json'));
  if (!data) return [];
  // Handle the wrapper object that atomicWriteJson creates around arrays
  if (Array.isArray(data)) return data;
  return [];
}

// ─── User input ────────────────────────────────────────────────────────────

export function writeUserInput(roomId: string, input: UserInput, cwd?: string): void {
  atomicWriteJson(join(roomPath(roomId, cwd), 'user-input.json'), input);
}

export function readUserInput(roomId: string, cwd?: string): UserInput | null {
  return readJsonSafe(join(roomPath(roomId, cwd), 'user-input.json')) as UserInput | null;
}

// ─── Decisions ─────────────────────────────────────────────────────────────

export function writeDecision(roomId: string, decision: RoomDecision, cwd?: string): void {
  atomicWriteJson(join(roomPath(roomId, cwd), 'decisions.json'), decision);
}

export function readDecision(roomId: string, cwd?: string): RoomDecision | null {
  return readJsonSafe(join(roomPath(roomId, cwd), 'decisions.json')) as RoomDecision | null;
}

// ─── Worker operations ─────────────────────────────────────────────────────

export function assignWorker(roomId: string, workerId: string, assignment: WorkerAssignment, cwd?: string): void {
  const wDir = workerDir(roomId, workerId, cwd);
  mkdirSync(wDir, { recursive: true });
  atomicWriteJson(join(wDir, 'assignment.json'), assignment);
  // Initialize worker status to queued
  atomicWriteJson(join(wDir, 'status.json'), { status: 'queued' as WorkerStatus });
}

export function readWorkerAssignment(roomId: string, workerId: string, cwd?: string): WorkerAssignment | null {
  return readJsonSafe(join(workerDir(roomId, workerId, cwd), 'assignment.json')) as WorkerAssignment | null;
}

export function writeWorkerResult(roomId: string, workerId: string, result: WorkerResult, cwd?: string): void {
  atomicWriteJson(join(workerDir(roomId, workerId, cwd), 'result.json'), result);
}

export function readWorkerResult(roomId: string, workerId: string, cwd?: string): WorkerResult | null {
  return readJsonSafe(join(workerDir(roomId, workerId, cwd), 'result.json')) as WorkerResult | null;
}

export function updateWorkerStatus(roomId: string, workerId: string, status: WorkerStatus, cwd?: string): void {
  const wDir = workerDir(roomId, workerId, cwd);
  mkdirSync(wDir, { recursive: true });
  atomicWriteJson(join(wDir, 'status.json'), { status });
}

export function getWorkerStatuses(roomId: string, cwd?: string): Record<string, WorkerStatus> {
  const wRoot = join(roomPath(roomId, cwd), 'workers');
  if (!existsSync(wRoot)) return {};

  const result: Record<string, WorkerStatus> = {};
  const entries = readdirSync(wRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const statusData = readJsonSafe(join(wRoot, entry.name, 'status.json')) as { status?: WorkerStatus } | null;
    result[entry.name] = statusData?.status || 'queued';
  }

  return result;
}

// ─── Cancellation ──────────────────────────────────────────────────────────

export function writeCancel(roomId: string, cwd?: string): void {
  const rp = roomPath(roomId, cwd);
  atomicWriteJson(join(rp, 'CANCEL'), { cancelled: true, at: new Date().toISOString() });

  // Also update meta status
  const metaPath = join(rp, 'meta.json');
  const meta = readJsonSafe(metaPath) as RoomMeta | null;
  if (meta) {
    meta.status = 'cancelled';
    atomicWriteJson(metaPath, meta);
  }
}

export function isCancelled(roomId: string, cwd?: string): boolean {
  return existsSync(join(roomPath(roomId, cwd), 'CANCEL'));
}

// ─── Cleanup ───────────────────────────────────────────────────────────────

export function cleanupStaleRooms(cwd?: string, maxAgeDays: number = 7): number {
  const root = roomsRoot(cwd);
  if (!existsSync(root)) return 0;

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let removed = 0;

  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const rp = join(root, entry.name);
    const meta = readJsonSafe(join(rp, 'meta.json')) as RoomMeta | null;

    // Only clean up completed or cancelled rooms
    if (!meta || (meta.status !== 'completed' && meta.status !== 'cancelled')) continue;

    const createdAt = new Date(meta.created).getTime();
    if (now - createdAt > maxAgeMs) {
      try {
        rmSync(rp, { recursive: true, force: true });
        removed++;
      } catch {
        // Best effort — skip rooms that can't be removed
      }
    }
  }

  return removed;
}
