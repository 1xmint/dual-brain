#!/usr/bin/env node
/**
 * playbook.mjs — Playbook loader and executor for the Dual-Brain Orchestrator.
 *
 * Exports:
 *   loadPlaybook(intent, cwd)           → playbook object | null
 *   listPlaybooks(cwd)                  → [{ name, source, stepCount }]
 *   executePlaybook(playbook, context)  → { steps, summary, runId }
 *   createRunArtifact(runId, results, cwd) → artifact path
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { loadProfile } from './profile.js';
import { decideRoute, shouldDualBrain } from './decide.js';
// @ts-ignore - dispatch.mjs not yet migrated
import { dispatch, dispatchDualBrain } from './dispatch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = join(__dirname, '..', 'playbooks');
const GLOBAL_DIR  = join(homedir(), '.config', 'dual-brain', 'playbooks');

// ─── Playbook resolution helpers ─────────────────────────────────────────────

function projectDir(cwd: string) {
  return join(cwd || process.cwd(), '.dualbrain', 'playbooks');
}

function readJson(path: string): any {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function playbookPath(dir: string, intent: string) {
  return join(dir, `${intent}.json`);
}

// ─── Exported: loadPlaybook ───────────────────────────────────────────────────

/**
 * Find and return a playbook matching the given intent.
 * Search order: project-local → global user → built-in.
 * Returns null if no match found.
 * @param {string} intent
 * @param {string} [cwd]
 * @returns {object|null}
 */
export function loadPlaybook(intent: string, cwd?: string) {
  if (!intent) return null;

  const candidates = [
    { dir: projectDir(cwd || process.cwd()), source: 'project' },
    { dir: GLOBAL_DIR,      source: 'global'  },
    { dir: BUILTIN_DIR,     source: 'builtin' },
  ];

  for (const { dir, source } of candidates) {
    const path = playbookPath(dir, intent);
    if (existsSync(path)) {
      const pb = readJson(path);
      if (pb) return { ...pb, _source: source, _path: path };
    }
  }

  return null;
}

// ─── Exported: listPlaybooks ──────────────────────────────────────────────────

/**
 * Return all available playbooks across all sources, deduped (project wins).
 * @param {string} [cwd]
 * @returns {{ name: string, source: string, stepCount: number }[]}
 */
export function listPlaybooks(cwd?: string) {
  const seen = new Map(); // name → entry (first write wins: project > global > builtin)

  const sources = [
    { dir: projectDir(cwd || process.cwd()), source: 'project' },
    { dir: GLOBAL_DIR,      source: 'global'  },
    { dir: BUILTIN_DIR,     source: 'builtin' },
  ];

  for (const { dir, source } of sources) {
    if (!existsSync(dir)) continue;
    let files;
    try { files = readdirSync(dir); } catch { continue; }

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const name = basename(file, '.json');
      if (seen.has(name)) continue; // project-local already registered
      const pb = readJson(join(dir, file));
      if (!pb) continue;
      seen.set(name, {
        name: pb.name ?? name,
        source,
        stepCount: Array.isArray(pb.steps) ? pb.steps.length : 0,
      });
    }
  }

  return [...seen.values()];
}

// ─── Exported: createRunArtifact ─────────────────────────────────────────────

/**
 * Persist a run manifest under .dualbrain/runs/<runId>/manifest.json.
 * @param {string} runId
 * @param {object[]} results  — step result objects
 * @param {string} [cwd]
 * @returns {string} path to the manifest file
 */
export function createRunArtifact(runId: string, results: any[], cwd?: string) {
  const dir = join(cwd || process.cwd(), '.dualbrain', 'runs', runId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'manifest.json');
  const manifest = {
    runId,
    createdAt: new Date().toISOString(),
    stepCount: results.length,
    steps: results,
  };
  writeFileSync(path, JSON.stringify(manifest, null, 2));
  return path;
}

// ─── Step prompt builder ──────────────────────────────────────────────────────

function buildStepPrompt(step: any, priorOutputs: any[], basePrompt: string) {
  const parts = [];

  if (basePrompt) parts.push(`Context: ${basePrompt}`);

  if (priorOutputs.length > 0) {
    parts.push('Prior step results:');
    for (const prior of priorOutputs) {
      parts.push(`  [${prior.stepId}] ${prior.summary ?? '(no output)'}`);
    }
  }

  parts.push(`\nCurrent task — ${step.title}: ${step.goal}`);

  if (step.output?.kind) {
    parts.push(`Expected output format: ${step.output.kind}`);
  }

  return parts.join('\n');
}

// ─── Exported: executePlaybook ────────────────────────────────────────────────

/**
 * Execute all steps in a playbook sequentially, feeding prior outputs forward.
 * @param {object} playbook
 * @param {{ profile?: object, prompt?: string, files?: string[], cwd?: string, dryRun?: boolean, verbose?: boolean }} context
 * @returns {Promise<{ steps: object[], summary: string, runId: string }>}
 */
export async function executePlaybook(playbook: any, context: { profile?: any; prompt?: string; files?: string[]; cwd?: string; dryRun?: boolean; verbose?: boolean } = {}) {
  const {
    prompt = '',
    files  = [],
    cwd    = process.cwd(),
    dryRun = false,
    verbose = false,
  } = context;

  let { profile } = context;
  if (!profile) {
    try { profile = await loadProfile(cwd); } catch { profile = {}; }
  }

  const runId      = randomUUID();
  const steps      = playbook.steps ?? [];
  const results    = [];
  const priorOuts  = [];

  if (verbose) {
    console.log(`[playbook] Starting "${playbook.name}" — ${steps.length} steps (runId: ${runId})`);
  }

  for (const step of steps) {
    const stepPrompt = buildStepPrompt(step, priorOuts, prompt);

    // Build synthetic detection that respects the step's declared tier
    const detection = {
      intent:     step.tier === 'think'  ? 'architecture'
                : step.tier === 'search' ? 'search'
                : 'edit',
      tier:       step.tier ?? 'execute',
      risk:       'medium',
      complexity: 'moderate',
      effort:     'medium',
    };

    // Force dual-brain if step declares consensus:true OR risk warrants it
    const forceDual = step.consensus === true || shouldDualBrain(detection, profile);
    const decision  = decideRoute({ profile, detection, cwd });
    if (forceDual) decision.dualBrain = true;

    if (verbose) {
      const mode = forceDual ? 'dual-brain' : `${decision.provider}/${decision.model}`;
      console.log(`[playbook] Step "${step.id}" → ${mode} (${decision.tier})`);
    }

    // Gate: log and continue (blocking gates are a future concern)
    if (step.gate) {
      console.log(`[playbook] Gate "${step.gate}" — checking (non-blocking in this version)`);
    }

    let result;
    try {
      if (forceDual) {
        result = await dispatchDualBrain({ decision, prompt: stepPrompt, files, cwd, dryRun });
        result = {
          status:   result.consensus === 'both-failed' ? 'failed' : 'completed',
          summary:  result.claude?.summary ?? result.openai?.summary ?? '(dual-brain)',
          dualBrain: result,
        };
      } else {
        result = await dispatch({ decision, prompt: stepPrompt, files, cwd, dryRun });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result = { status: 'error', summary: msg, error: msg };
    }

    const stepResult = {
      stepId:   step.id,
      title:    step.title,
      tier:     step.tier ?? 'execute',
      dualBrain: forceDual,
      status:   result.status,
      summary:  result.summary ?? null,
      error:    result.error ?? null,
    };

    results.push(stepResult);
    priorOuts.push({ stepId: step.id, summary: result.summary });

    if (verbose) {
      console.log(`[playbook]   → ${stepResult.status}: ${stepResult.summary ?? stepResult.error}`);
    }
  }

  const passed  = results.filter(r => r.status === 'completed' || r.status === 'dry-run').length;
  const failed  = results.filter(r => r.status === 'failed' || r.status === 'error').length;
  const summary = `Playbook "${playbook.name}" finished: ${passed}/${steps.length} steps passed${failed ? `, ${failed} failed` : ''}.`;

  if (!dryRun) {
    try { createRunArtifact(runId, results, cwd); } catch {}
  }

  return { steps: results, summary, runId };
}
