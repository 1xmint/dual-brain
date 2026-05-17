// think-engine.mjs — Adaptive thinking ladder: recall → triage → tier decision.
// Replaces fixed "always dual-brain" with knowledge preflight + heuristic classification.
// Zero network calls. All matching is keyword-based.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DOCS_DIR = '.dual-brain';
const DECISIONS_FILE = 'decisions.jsonl';

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','it','its','be','as','are','was','were','been','has',
  'have','had','do','does','did','will','would','could','should','may',
  'might','shall','can','this','that','these','those','i','we','you',
  'he','she','they','my','our','your','his','her','their','what','how',
  'when','where','why','which','who','all','any','more','most','also',
  'not','no','so','if','then','than','into','up','out','about','just',
  'after','before','between','through','during','each','get','use',
]);

const HARD_ESCALATION_KEYWORDS = [
  'auth','credential','secret','token','security','migration','billing',
  'payment','deploy production','delete','drop','force push','routing logic',
  'dispatcher','pipeline gate',
];

const TIER_TOKENS = {
  recall: 0,
  quick: 2000,
  standard: 8000,
  deep: 20000,
  ultra: 50000,
};

const TIER_COST = {
  recall: 'zero',
  quick: 'minimal',
  standard: 'moderate',
  deep: 'significant',
  ultra: 'heavy',
};

export function normalizeIntent(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function decisionsPath(cwd: string): string {
  return join(cwd, DOCS_DIR, DECISIONS_FILE);
}

function readDecisions(cwd: string): Record<string, unknown>[] {
  const path = decisionsPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    return raw
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getFreshness(timestamp: string | undefined): string {
  if (!timestamp) return 'stale';
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 7) return 'current';
  if (ageDays < 30) return 'aging';
  return 'stale';
}

function keywordOverlap(kwA: string[], kwB: string[]): number {
  if (!kwA.length || !kwB.length) return 0;
  const setA = new Set(kwA);
  const matches = kwB.filter((w: string) => setA.has(w)).length;
  return matches / Math.max(kwA.length, kwB.length);
}

function getApplicability(relevance: number, freshness: string): string | null {
  if (relevance > 0.8 && freshness === 'current') return 'exact_reuse';
  if (relevance > 0.8 && freshness === 'aging') return 'reuse_with_validation';
  if (relevance > 0.8 && freshness === 'stale') return 'stale';
  if (relevance >= 0.4) return 'related_precedent';
  return null;
}

export function lookupDecision(intent: string, tags: string[] = [], cwd: string = process.cwd()) {
  const queryKw = normalizeIntent(intent);
  const queryTags = tags.map((t: string) => t.toLowerCase());
  const decisions = readDecisions(cwd);

  const candidates = [];
  for (const dec of decisions) {
    const decKw = (dec.normalizedIntent as string)
      ? (dec.normalizedIntent as string).split(' ').filter(Boolean)
      : normalizeIntent((dec.question as string) || (dec.decision as string) || '');

    let relevance = keywordOverlap(queryKw, decKw);

    const decTags = ((dec.tags || []) as string[]).map((t: string) => t.toLowerCase());
    const tagMatch = queryTags.some(t => decTags.includes(t));
    if (tagMatch) relevance = Math.min(1, relevance + 0.15);

    if (relevance < 0.4) continue;

    const freshness = getFreshness(dec.timestamp as string | undefined);
    const applicability = getApplicability(relevance, freshness);
    if (!applicability) continue;

    candidates.push({ decision: dec, relevance, freshness, applicability });
  }

  candidates.sort((a, b) => b.relevance - a.relevance);

  const highRelevance = candidates.filter(c => c.relevance > 0.8);
  let recommendation = 'new_thinking_needed';

  if (highRelevance.length > 1) {
    const decisions_set = highRelevance.map(c =>
      normalizeIntent(typeof c.decision.decision === 'string' ? c.decision.decision : JSON.stringify(c.decision.decision)).join(' ')
    );
    const pairOverlap = keywordOverlap(
      normalizeIntent(decisions_set[0]),
      normalizeIntent(decisions_set[1])
    );
    if (pairOverlap < 0.3) {
      for (const c of highRelevance) c.applicability = 'conflicting';
      recommendation = 'new_thinking_needed';
    } else if (candidates[0]?.applicability === 'exact_reuse') {
      recommendation = 'reuse';
    } else {
      recommendation = 'validate';
    }
  } else if (candidates[0]?.applicability === 'exact_reuse') {
    recommendation = 'reuse';
  } else if (candidates[0]?.applicability === 'reuse_with_validation') {
    recommendation = 'validate';
  } else if (candidates.length > 0) {
    recommendation = 'new_thinking_needed';
  }

  return {
    found: candidates.length > 0,
    candidates: candidates.slice(0, 5),
    recommendation,
  };
}

function detectRisk(question: string): string {
  const q = question.toLowerCase();
  const critical = ['auth','credential','secret','token','security','billing','payment','force push','drop table','delete production'];
  const high = ['migration','deploy production','routing logic','dispatcher','pipeline gate','delete','drop'];
  const low = ['readme','doc','comment','explain','list','show','what is','how does'];

  if (critical.some(k => q.includes(k))) return 'critical';
  if (high.some(k => q.includes(k))) return 'high';
  if (low.some(k => q.includes(k))) return 'low';
  return 'medium';
}

function detectComplexity(question: string): string {
  const wordCount = question.trim().split(/\s+/).length;
  const hasMultiStep = /and then|then also|first.*then|step \d|multiple|several|across|all/i.test(question);
  const hasComparison = /vs|versus|compare|difference|between|trade.?off/i.test(question);

  if (wordCount > 80 || (hasMultiStep && hasComparison)) return 'complex';
  if (wordCount > 30 || hasMultiStep || hasComparison) return 'moderate';
  return 'simple';
}

function detectNovelty(preflight: { found: boolean; recommendation?: string; candidates?: Array<{ applicability: string }> } | null | undefined): string {
  if (!preflight || !preflight.found) return 'novel';
  if (preflight.recommendation === 'reuse') return 'known';
  if (preflight.candidates?.some((c: { applicability: string }) => c.applicability === 'related_precedent' || c.applicability === 'reuse_with_validation')) {
    return 'variation';
  }
  return 'novel';
}

function hasHardEscalation(question: string): boolean {
  const q = question.toLowerCase();
  return HARD_ESCALATION_KEYWORDS.some(k => q.includes(k));
}

export function triageQuestion(question: string, projectBrief: unknown, preflight: { found: boolean; recommendation?: string; candidates?: Array<{ applicability: string }> } | null | undefined) {
  const risk = detectRisk(question);
  const complexity = detectComplexity(question);
  const novelty = detectNovelty(preflight);
  const hardEscalation = hasHardEscalation(question);

  let recommendedTier;
  let reason;

  if (preflight?.recommendation === 'reuse') {
    recommendedTier = 'recall';
    reason = 'exact match found in decision log';
  } else if (hardEscalation || risk === 'critical') {
    recommendedTier = 'ultra';
    reason = hardEscalation
      ? `hard escalation keyword detected`
      : 'critical risk requires maximum deliberation';
  } else if (preflight?.candidates?.some((c: { applicability: string }) => c.applicability === 'conflicting')) {
    recommendedTier = 'ultra';
    reason = 'conflicting prior decisions require reconciliation';
  } else if (risk === 'high' && (novelty === 'novel' || complexity === 'complex')) {
    recommendedTier = 'deep';
    reason = `high risk + ${novelty === 'novel' ? 'novel question' : 'complex scope'}`;
  } else if (novelty === 'novel' && (risk === 'medium' || complexity === 'complex')) {
    recommendedTier = 'standard';
    reason = 'novel question with non-trivial risk or complexity';
  } else if (novelty === 'variation' && risk === 'low') {
    recommendedTier = 'quick';
    reason = 'similar precedent found, low risk variation';
  } else if ((preflight?.candidates?.length ?? 0) > 0 && novelty !== 'novel') {
    recommendedTier = 'quick';
    reason = 'related precedent available, minor adaptation needed';
  } else if (novelty === 'novel' && risk === 'low' && complexity === 'simple') {
    recommendedTier = 'quick';
    reason = 'novel but simple and low risk';
  } else {
    recommendedTier = 'standard';
    reason = 'default tier for unclassified novel questions';
  }

  const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const tierRank = { recall: 0, quick: 1, standard: 2, deep: 3, ultra: 4 };
  const minTierForRisk = { low: 'recall', medium: 'quick', high: 'deep', critical: 'ultra' };
  const riskFloor = minTierForRisk[risk as keyof typeof minTierForRisk] ?? 'quick';
  if (tierRank[recommendedTier as keyof typeof tierRank] < tierRank[riskFloor as keyof typeof tierRank]) {
    recommendedTier = riskFloor;
    reason += ` (escalated to ${riskFloor} by risk floor)`;
  }

  const confidenceBase = novelty === 'known' ? 0.9
    : novelty === 'variation' ? 0.75
    : 0.6;
  const confidence = Math.max(0.3, confidenceBase - (risk === 'critical' ? 0.2 : 0));

  const estimatedTokens = TIER_TOKENS[recommendedTier as keyof typeof TIER_TOKENS] ?? 0;

  return {
    novelty,
    risk,
    complexity,
    confidence,
    recommendedTier,
    reason,
    estimatedTokens,
    hardEscalation,
  };
}

export async function think(question: string, options: Record<string, unknown> = {}, cwd: string = process.cwd()) {
  const result: {
    question: string;
    startedAt: number;
    tier: string | null;
    phases: Record<string, unknown>[];
    answer: unknown;
    tokensUsed: number;
    cost: string;
    fromCache: boolean;
    decision: unknown;
  } = {
    question,
    startedAt: Date.now(),
    tier: null,
    phases: [],
    answer: null,
    tokensUsed: 0,
    cost: 'minimal',
    fromCache: false,
    decision: null,
  };

  if (!options.skipRecall) {
    const preflight = lookupDecision(question, (options.tags as string[]) || [], cwd);
    result.phases.push({ phase: 'recall', ...preflight });

    if (preflight.recommendation === 'reuse' && preflight.candidates[0]) {
      result.tier = 'recall';
      result.answer = preflight.candidates[0].decision;
      result.fromCache = true;
      result.cost = 'zero';
      result.tokensUsed = 0;
      return result;
    }
  }

  const recallPhase = result.phases[0] ?? null;
  const triage = triageQuestion(question, options.projectBrief, recallPhase as { found: boolean; recommendation?: string; candidates?: Array<{ applicability: string }> } | null);
  result.phases.push({ phase: 'triage', ...triage });
  result.tier = (options.forceLevel as string) || triage.recommendedTier;

  result.tokensUsed = TIER_TOKENS[result.tier as keyof typeof TIER_TOKENS] ?? triage.estimatedTokens;
  result.cost = TIER_COST[result.tier as keyof typeof TIER_COST] ?? 'moderate';

  return result;
}

export function persistDecision(question: string, answer: unknown, tier: string, options: Record<string, unknown> = {}, cwd: string = process.cwd()) {
  const dir = join(cwd, DOCS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const kw = normalizeIntent(question);
  const normalizedIntent = kw.join(' ');

  const answerText = typeof answer === 'string' ? answer : JSON.stringify(answer);
  const sentences = answerText.match(/[^.!?]+[.!?]+/g) ?? [];
  const rationale = sentences.slice(0, 3).map(s => s.trim()).filter(Boolean);

  const autoTags = [];
  const q = question.toLowerCase();
  if (/auth|security|credential|secret|token/.test(q)) autoTags.push('security');
  if (/migration|migrate|upgrade/.test(q)) autoTags.push('migration');
  if (/architecture|design|structure|pattern/.test(q)) autoTags.push('architecture');
  if (/test|spec|coverage/.test(q)) autoTags.push('testing');
  if (/deploy|release|publish|production/.test(q)) autoTags.push('deployment');
  if (/routing|dispatch|pipeline/.test(q)) autoTags.push('routing');

  const tags = [...new Set([...((options.tags as string[]) || []), ...autoTags])];

  const contextSpecific = /this session|right now|current branch|today|temporary|one.?off/i.test(answerText);
  const reusable = !contextSpecific;

  const tokensUsed = (options.tokensUsed as number) ?? TIER_TOKENS[tier as keyof typeof TIER_TOKENS] ?? 0;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const confScore = (options.confidence as string | number) ?? (
    tier === 'ultra' || tier === 'deep' ? 'high'
    : tier === 'standard' ? 'medium'
    : 'low'
  );

  const entry = {
    id: `dec_${Date.now()}`,
    timestamp: now.toISOString(),
    question,
    normalizedIntent,
    decision: answerText,
    rationale,
    tags,
    confidence: typeof confScore === 'string' ? confScore : (confScore > 0.7 ? 'high' : confScore > 0.4 ? 'medium' : 'low'),
    tier,
    tokensUsed,
    expiresAt,
    reusable,
  };

  appendFileSync(join(dir, DECISIONS_FILE), JSON.stringify(entry) + '\n');
  return entry;
}

export function getThinkingStats(cwd: string = process.cwd()) {
  const decisions = readDecisions(cwd);
  if (!decisions.length) {
    return {
      totalDecisions: 0,
      cacheHits: 0,
      cacheHitRate: 0,
      tierDistribution: { recall: 0, quick: 0, standard: 0, deep: 0, ultra: 0 },
      totalTokensSaved: 0,
      avgTier: 'none',
    };
  }

  const tierDist = { recall: 0, quick: 0, standard: 0, deep: 0, ultra: 0 };
  let cacheHits = 0;
  let totalTokensSaved = 0;
  const tierCounts: Record<string, number> = {};

  for (const dec of decisions) {
    const t = (dec.tier ?? 'standard') as string;
    if (tierDist[t as keyof typeof tierDist] !== undefined) tierDist[t as keyof typeof tierDist]++;
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;

    if (t === 'recall') {
      cacheHits++;
      totalTokensSaved += TIER_TOKENS.standard;
    }
  }

  const cacheHitRate = decisions.length > 0 ? cacheHits / decisions.length : 0;

  let maxCount = 0;
  let avgTier = 'standard';
  for (const [tier, count] of Object.entries(tierCounts)) {
    if ((count as number) > maxCount) { maxCount = count as number; avgTier = tier; }
  }

  return {
    totalDecisions: decisions.length,
    cacheHits,
    cacheHitRate: Math.round(cacheHitRate * 1000) / 1000,
    tierDistribution: tierDist,
    totalTokensSaved,
    avgTier,
  };
}

export function formatThinkResult(result: Record<string, unknown>) {
  const tier = result.tier as string | null;
  const phases = result.phases as Array<Record<string, unknown>> | undefined;
  const cost = result.cost as string | undefined;
  const fromCache = result.fromCache as boolean | undefined;
  const tokensUsed = result.tokensUsed as number;

  const tierLabel = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unknown';
  const tokenStr = tokensUsed > 0 ? `${(tokensUsed / 1000).toFixed(0)}K tokens estimated` : 'zero tokens';

  const lines = [`THINKING: ${tierLabel} tier (${tokenStr})`];

  for (const phase of phases ?? []) {
    if (phase.phase === 'recall') {
      const count = (phase.candidates as unknown[] | undefined)?.length ?? 0;
      const found = count > 0
        ? `${count} related precedent${count === 1 ? '' : 's'} found`
        : 'no prior decisions found';
      lines.push(`  Phase 1: Recall — ${found}`);
    } else if (phase.phase === 'triage') {
      lines.push(`  Phase 2: Triage — ${phase.novelty ?? 'novel'} question, ${phase.risk ?? 'medium'} risk`);
    }
  }

  lines.push(`  Cost: ${cost ?? 'unknown'}`);
  if (fromCache) lines.push('  Source: decision cache (no model call needed)');

  return lines.join('\n');
}
