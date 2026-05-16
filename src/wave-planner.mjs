// Wave Planner — Layer 2 cognitive loop
// Takes HEAD's deliberation output and produces structured wave-based execution plans.

const TIER_COST = {
  search:  { tokens: 5000,  time: '~10s' },
  execute: { tokens: 20000, time: '~45s' },
  think:   { tokens: 15000, time: '~30s' },
  review:  { tokens: 10000, time: '~20s' },
};

let waveCounter = 0;
function nextWaveId() { return `w-${Date.now().toString(36)}-${++waveCounter}`; }

/** Plan waves from HEAD's deliberation output. */
export function planWaves(deliberation, context = {}) {
  const { situation = {}, uncertainties = [], result = {} } = deliberation;
  const { files = [], priorDebriefs = [], diagnosticPatterns = [] } = context;
  const depth = result.depth || 'light';

  const blockers = uncertainties.filter(u => u.confidence < 0.3);
  const hasFragile = situation.risk === 'high' || situation.risk === 'critical';
  const largeScope = situation.scope === 'large';
  const priorBlockers = priorDebriefs.filter(d => d.blockers?.length);

  const waves = [];
  const contingencies = [];

  // Determine wave structure based on depth
  if (depth === 'reflexive' || depth === 'light') {
    waves.push(makeSingleWave(result, situation, files));
  } else if (depth === 'full') {
    if (blockers.length) {
      waves.push(makeReconWave(blockers, situation, files, priorBlockers));
    }
    waves.push(makeImplementWave(result, situation, files, largeScope, waves));
    if (hasFragile) {
      waves.push(makeVerifyWave(situation, files, waves));
    }
  } else if (depth === 'deep') {
    // Always start with recon for deep
    waves.push(makeReconWave(
      blockers.length ? blockers : uncertainties,
      situation, files, priorBlockers
    ));
    // Plan wave
    waves.push({
      id: nextWaveId(),
      phase: 'synthesize',
      agents: [{
        tier: 'think',
        objective: `Synthesize recon findings into implementation plan for: ${result.action || situation.taskShape || 'task'}`,
        scope: files.slice(0, 10),
      }],
      dependsOn: [waves[0].id],
      gateCondition: 'recon wave completed without escalation',
      parallel: false,
    });
    // Implement wave
    waves.push(makeImplementWave(result, situation, files, largeScope, waves));
    // Verify wave
    waves.push(makeVerifyWave(situation, files, waves));
  }

  // Force recon-first if blockers exist and first wave isn't recon
  if (blockers.length && waves.length && waves[0].phase !== 'recon') {
    const reconWave = makeReconWave(blockers, situation, files, priorBlockers);
    waves.forEach(w => { if (!w.dependsOn.length) w.dependsOn.push(reconWave.id); });
    waves.unshift(reconWave);
  }

  // Build contingencies
  if (largeScope) {
    contingencies.push({
      trigger: 'if wave 1 finds scope is larger than expected',
      response: 'add-wave',
      details: 'Split implementation into additional parallel waves by file group',
    });
  }
  if (hasFragile) {
    contingencies.push({
      trigger: 'if implementation wave introduces regressions',
      response: 'retry-different',
      details: 'Re-approach with smaller incremental changes',
    });
  }
  if (blockers.length) {
    contingencies.push({
      trigger: 'if recon cannot resolve uncertainty',
      response: 'escalate',
      details: 'Ask user for clarification before proceeding',
    });
  }

  const agentCount = waves.reduce((n, w) => n + w.agents.length, 0);
  const dominantTier = agentCount <= 1 ? (waves[0]?.agents[0]?.tier || 'search')
    : waves.flatMap(w => w.agents.map(a => a.tier))
      .sort((a, b) => TIER_COST[b].tokens - TIER_COST[a].tokens)[0];

  return {
    waves,
    rationale: buildRationale(depth, blockers, hasFragile, largeScope),
    estimatedCost: { waves: waves.length, agents: agentCount, tier: dominantTier },
    contingencies,
  };
}

/** Decide if the remaining plan is still valid after a wave debrief. */
export function shouldReplan(currentPlan, newDebrief) {
  if (!newDebrief) return false;
  if (newDebrief.scopeChange === 'larger' || newDebrief.scopeChange === 'different') return true;
  if (newDebrief.pivotReason) return true;
  if (newDebrief.confidence !== undefined && newDebrief.confidence < 0.4) return true;

  // Check if blockers intersect with upcoming wave objectives
  if (newDebrief.blockers?.length) {
    const remaining = currentPlan.waves.filter(w => !w.completed);
    for (const w of remaining) {
      for (const agent of w.agents) {
        for (const blocker of newDebrief.blockers) {
          const bLower = (typeof blocker === 'string' ? blocker : blocker.description || '').toLowerCase();
          if (bLower && agent.objective.toLowerCase().includes(bLower.split(' ')[0])) return true;
        }
      }
    }
  }
  return false;
}

/** Produce a new plan incorporating what was learned. Preserves completed waves. */
export function replan(currentPlan, waveSummary, originalDeliberation) {
  const completed = currentPlan.waves.filter(w => w.completed);
  const context = {
    files: waveSummary.filesDiscovered || [],
    priorDebriefs: [waveSummary],
    diagnosticPatterns: waveSummary.patterns || [],
  };

  // Merge learning into deliberation
  const updated = { ...originalDeliberation };
  if (waveSummary.scopeChange === 'larger') {
    updated.situation = { ...updated.situation, scope: 'large' };
  }
  if (waveSummary.confidence !== undefined) {
    updated.result = { ...updated.result, confidence: waveSummary.confidence };
  }
  if (waveSummary.newUncertainties) {
    updated.uncertainties = [
      ...(updated.uncertainties || []),
      ...waveSummary.newUncertainties,
    ];
  }

  const newPlan = planWaves(updated, context);

  // Preserve completed waves at the front
  newPlan.waves = [...completed, ...newPlan.waves];
  newPlan.rationale = `Replanned after wave debrief: ${waveSummary.pivotReason || waveSummary.scopeChange || 'confidence drop'}. ${newPlan.rationale}`;
  return newPlan;
}

/** Rough cost estimate for a single wave. */
export function estimateWaveCost(wave) {
  let tokens = 0;
  for (const agent of wave.agents) {
    tokens += TIER_COST[agent.tier]?.tokens || 10000;
  }
  // Time: parallel agents overlap, sequential add up
  const times = wave.agents.map(a => parseInt(TIER_COST[a.tier]?.time) || 20);
  const seconds = wave.parallel ? Math.max(...times) : times.reduce((s, t) => s + t, 0);
  return { tokens, time: `~${seconds}s` };
}

function makeSingleWave(result, situation, files) {
  const tier = mapActionToTier(result.action);
  return {
    id: nextWaveId(),
    phase: tier === 'search' ? 'recon' : 'implement',
    agents: [{
      tier,
      objective: situation.explicitAsk || situation.raw || (typeof result.action === 'string' ? result.action : result.action?.mode) || 'execute task',
      scope: files.slice(0, 5),
    }],
    dependsOn: [],
    parallel: false,
  };
}

function makeReconWave(uncertainties, situation, files, priorBlockers) {
  const avoidApproaches = priorBlockers.flatMap(d =>
    d.blockers?.map(b => typeof b === 'string' ? b : b.approach) || []
  );

  const agents = uncertainties.slice(0, 3).map(u => {
    const spec = {
      tier: 'search',
      objective: `Resolve uncertainty: ${u.claim || u.description || 'unknown'}`,
      scope: files.slice(0, 5),
    };
    if (u.wouldChangeIf) {
      spec.conditionalPivot = { if: u.wouldChangeIf, then: 'report finding and stop' };
    }
    return spec;
  });

  // If no uncertainties provided, add a general recon agent
  if (!agents.length) {
    agents.push({
      tier: 'search',
      objective: `Explore scope and structure for: ${situation.taskShape || 'task'}`,
      scope: files.slice(0, 5),
    });
  }

  // Annotate agents to avoid prior failed approaches
  if (avoidApproaches.length) {
    for (const agent of agents) {
      agent.objective += ` (avoid: ${avoidApproaches.join(', ')})`;
    }
  }

  return {
    id: nextWaveId(),
    phase: 'recon',
    agents,
    dependsOn: [],
    gateCondition: undefined,
    parallel: agents.length > 1,
  };
}

function makeImplementWave(result, situation, files, largeScope, existingWaves) {
  const dependsOn = existingWaves.length ? [existingWaves[existingWaves.length - 1].id] : [];
  const agents = [];

  if (largeScope && files.length > 3) {
    // Split into parallel agents by file group
    const groupSize = Math.ceil(files.length / 3);
    for (let i = 0; i < files.length; i += groupSize) {
      agents.push({
        tier: 'execute',
        objective: result.action || `Implement changes in file group ${Math.floor(i / groupSize) + 1}`,
        scope: files.slice(i, i + groupSize),
      });
    }
  } else {
    agents.push({
      tier: 'execute',
      objective: result.action || situation.taskShape || 'implement changes',
      scope: files.slice(0, 10),
    });
  }

  return {
    id: nextWaveId(),
    phase: 'implement',
    agents,
    dependsOn,
    gateCondition: existingWaves.length ? 'prior wave completed successfully' : undefined,
    parallel: agents.length > 1,
  };
}

function makeVerifyWave(situation, files, existingWaves) {
  const dependsOn = existingWaves.length ? [existingWaves[existingWaves.length - 1].id] : [];
  return {
    id: nextWaveId(),
    phase: 'verify',
    agents: [{
      tier: 'review',
      objective: `Verify changes are correct and safe${situation.risk === 'critical' ? ' — critical risk area' : ''}`,
      scope: files.slice(0, 10),
    }],
    dependsOn,
    gateCondition: 'implementation wave completed',
    parallel: false,
  };
}

function mapActionToTier(action) {
  if (!action) return 'execute';
  const a = (typeof action === 'string' ? action : `${action.type || ''} ${action.mode || ''}`).toLowerCase();
  if (a.includes('search') || a.includes('find') || a.includes('look') || a.includes('explore')) return 'search';
  if (a.includes('review') || a.includes('check') || a.includes('verify')) return 'review';
  if (a.includes('think') || a.includes('plan') || a.includes('design') || a.includes('architect')) return 'think';
  return 'execute';
}

function buildRationale(depth, blockers, hasFragile, largeScope) {
  const parts = [`Depth: ${depth}.`];
  if (blockers.length) parts.push(`${blockers.length} blocker(s) require recon first.`);
  if (hasFragile) parts.push('High-risk area — verification wave added.');
  if (largeScope) parts.push('Large scope — parallel agents where possible.');
  return parts.join(' ');
}
