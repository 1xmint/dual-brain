import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'from',
  'in', 'on', 'for', 'with', 'and', 'or', 'but', 'not', 'this', 'that', 'it',
]);

function outcomesDir(cwd) {
  return join(cwd, '.dualbrain', 'outcomes');
}

function todayFile(cwd) {
  const date = new Date().toISOString().slice(0, 10);
  return join(outcomesDir(cwd), `outcomes-${date}.jsonl`);
}

function ensureDir(cwd) {
  mkdirSync(outcomesDir(cwd), { recursive: true });
}

function readOutcomeFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      });
  } catch {
    return [];
  }
}

function last7DaysFiles(cwd) {
  const dir = outcomesDir(cwd);
  const files = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const f = join(dir, `outcomes-${d}.jsonl`);
    if (existsSync(f)) files.push(f);
  }
  return files;
}

export function computeRoutingScore(plan, result, verification) {
  let score = 3;
  if (result.success && result.duration < 60_000) score += 1;
  if (verification.filesVerified && verification.testsPassed === true) score += 1;
  if (result.error) score -= 1;
  if (result.duration > 180_000) score -= 1;
  if ((plan.challengerPolicy === 'none' || !plan.challengerPolicy) && !result.success) score -= 2;
  return Math.max(1, Math.min(5, score));
}

export function generateLessons(plan, result, verification) {
  const lessons = [];
  const noChallenger = !plan.challengerPolicy || plan.challengerPolicy === 'none';

  if (noChallenger && !result.success) {
    lessons.push('Task failed without challenger — consider escalating similar tasks');
  }

  if (
    plan.reasoningDepth === 'ultra' &&
    result.duration < 60_000 &&
    (plan.complexity === 'simple' || plan.complexity === 'low')
  ) {
    lessons.push('Ultra reasoning unnecessary — task completed quickly at low complexity');
  }

  if (!result.success) {
    const keywords = (plan.prompt || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 4)
      .join(' ');
    if (keywords) {
      lessons.push(`Prior failure pattern: ${keywords} on ${plan.tier}`);
    }
  }

  if (!noChallenger && result.success && verification.filesVerified) {
    lessons.push(`Challenger caught issues — keep challenger policy for ${plan.risk} risk`);
  }

  return lessons;
}

export async function recordOutcome(plan, result, verification, cwd) {
  try {
    ensureDir(cwd);

    const routingScore = computeRoutingScore(plan, result, verification);
    const lessons = generateLessons(plan, result, verification);

    const record = {
      id: randomUUID(),
      timestamp: Date.now(),
      prompt: plan.prompt ?? '',
      tier: plan.tier ?? '',
      primaryModel: plan.primaryModel ?? '',
      reasoningDepth: plan.reasoningDepth ?? '',
      challengerPolicy: plan.challengerPolicy ?? 'none',
      risk: plan.risk ?? '',
      result: {
        success: result.success ?? false,
        filesChanged: result.filesChanged ?? [],
        duration: result.duration ?? 0,
        error: result.error ?? null,
      },
      verification: {
        filesVerified: verification.filesVerified ?? false,
        testsRun: verification.testsRun ?? false,
        testsPassed: verification.testsPassed ?? null,
      },
      routingScore,
      lessons,
    };

    appendFileSync(todayFile(cwd), JSON.stringify(record) + '\n', 'utf8');
    return record;
  } catch {
    return null;
  }
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

function promptOverlap(a, b) {
  const wordsA = new Set(tokenize(a));
  const wordsB = tokenize(b);
  return wordsB.filter(w => wordsA.has(w)).length;
}

function fileOverlap(filesA = [], filesB = []) {
  const setA = new Set(filesA.map(f => f.split('/').pop()));
  return filesB.map(f => f.split('/').pop()).filter(f => setA.has(f)).length;
}

export async function getRelevantOutcomes(prompt, files = [], cwd, options = {}) {
  try {
    const allFiles = last7DaysFiles(cwd);
    const outcomes = allFiles.flatMap(readOutcomeFile);

    const scored = outcomes.map(o => {
      let score = promptOverlap(prompt, o.prompt);
      score += fileOverlap(files, o.result?.filesChanged ?? []);
      return { o, score };
    });

    return scored
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ o, score }) => ({
        id: o.id,
        timestamp: o.timestamp,
        prompt: o.prompt,
        success: o.result?.success ?? false,
        routingScore: o.routingScore,
        lessons: o.lessons,
        relevanceScore: score,
      }));
  } catch {
    return [];
  }
}

export async function getOutcomeStats(cwd, days = 7) {
  try {
    const allFiles = last7DaysFiles(cwd).slice(0, days);
    const outcomes = allFiles.flatMap(readOutcomeFile);

    if (outcomes.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgRoutingScore: 0,
        avgDuration: 0,
        challengerHelpRate: 0,
        topLessons: [],
        modelBreakdown: {},
      };
    }

    const totalTasks = outcomes.length;
    const successes = outcomes.filter(o => o.result?.success).length;
    const successRate = successes / totalTasks;

    const avgRoutingScore =
      outcomes.reduce((sum, o) => sum + (o.routingScore ?? 3), 0) / totalTasks;

    const avgDuration =
      outcomes.reduce((sum, o) => sum + (o.result?.duration ?? 0), 0) / totalTasks;

    const challengerUsed = outcomes.filter(
      o => o.challengerPolicy && o.challengerPolicy !== 'none'
    );
    const challengerHelped = challengerUsed.filter(o => o.result?.success);
    const challengerHelpRate =
      challengerUsed.length > 0 ? challengerHelped.length / challengerUsed.length : 0;

    const lessonCounts = {};
    for (const o of outcomes) {
      for (const lesson of o.lessons ?? []) {
        lessonCounts[lesson] = (lessonCounts[lesson] ?? 0) + 1;
      }
    }
    const topLessons = Object.entries(lessonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([lesson]) => lesson);

    const modelBreakdown = {};
    for (const o of outcomes) {
      const model = o.primaryModel;
      if (!model) continue;
      if (!modelBreakdown[model]) modelBreakdown[model] = { count: 0, successCount: 0 };
      modelBreakdown[model].count += 1;
      if (o.result?.success) modelBreakdown[model].successCount += 1;
    }
    for (const model of Object.keys(modelBreakdown)) {
      const { count, successCount } = modelBreakdown[model];
      modelBreakdown[model].successRate = count > 0 ? successCount / count : 0;
      delete modelBreakdown[model].successCount;
    }

    return {
      totalTasks,
      successRate,
      avgRoutingScore,
      avgDuration,
      challengerHelpRate,
      topLessons,
      modelBreakdown,
    };
  } catch {
    return {
      totalTasks: 0,
      successRate: 0,
      avgRoutingScore: 0,
      avgDuration: 0,
      challengerHelpRate: 0,
      topLessons: [],
      modelBreakdown: {},
    };
  }
}
