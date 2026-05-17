#!/usr/bin/env node
// precompact.mjs — Fires before context compression to persist critical state.
// Ensures HEAD's running narrative, simmer buffer, and loop state survive
// context window compression without loss.

import { persist as persistNarrative, load as loadNarrative } from '../dist/src/narrative.js';
import { active as activeSimmer, prune as pruneSimmer } from '../dist/src/simmer.js';
import { getLoopStatus } from '../dist/src/cognitive-loop.js';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join(process.cwd(), '.dualbrain');
const SURVIVAL_FILE = join(STATE_DIR, 'precompact-survival.json');

async function main() {
  // Read stdin (hook payload) — we don't need it but must consume
  let raw = '';
  try {
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 16 * 1024) break;
    }
  } catch {}

  // Persist narrative (already on disk, but archive a snapshot)
  const narrativeText = persistNarrative();

  // Prune dead simmer items before compression
  pruneSimmer();
  const simmering = activeSimmer();

  // Get loop status for survival kit
  const loopStatus = getLoopStatus();

  // Write survival kit — this can be loaded to reconstruct context after compression
  const survivalKit = {
    timestamp: Date.now(),
    reason: 'precompact',
    narrative: narrativeText.slice(0, 1500),
    simmerCount: simmering.length,
    topSimmer: simmering.slice(0, 5).map(i => ({ idea: i.idea.slice(0, 100), heat: i.heat })),
    loopStatus,
  };

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SURVIVAL_FILE, JSON.stringify(survivalKit, null, 2));

  // Output: no systemMessage needed — this is a persistence hook, not advisory
  process.stdout.write(JSON.stringify({}) + '\n');
  process.exit(0);
}

main();
