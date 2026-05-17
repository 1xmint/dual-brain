// prompt-intel.mjs — Layer 3 prompt analysis, enrichment, risk detection, and intervention routing.
// Pure functions only. No I/O, no exec. Caller provides projectBrief and calibration.

const INTENT_PATTERNS = {
  fix:      /\b(?:fix|bug|broken|error|crash|failing|fails|wrong|issue|problem|broken|not\s+working|doesn't\s+work|doesn't\s+work)\b/i,
  feature:  /\b(?:add|create|build|implement|new|introduce|support|enable)\b/i,
  refactor: /\b(?:refactor|clean\s+up|reorganize|simplify|extract|restructure|dedup|consolidate|move)\b/i,
  review:   /\b(?:review|check|audit|look\s+at|examine|inspect|assess|evaluate)\b/i,
  ship:     /\b(?:ship|deploy|publish|release|push|merge|go\s+live|launch)\b/i,
  explore:  /\b(?:what|how|why|where|find|search|explain|show\s+me|tell\s+me|list|which)\b/i,
  test:     /\b(?:test|spec|coverage|assert|jest|mocha|vitest|unit\s+test|integration)\b/i,
  docs:     /\b(?:doc|readme|comment|jsdoc|document|explain|annotate)\b/i,
  deploy:   /\b(?:deploy|provision|infrastructure|ci|cd|pipeline|k8s|kubernetes|docker)\b/i,
};

const RISK_PATTERNS = [
  { type: 'destructive',  severity: 'block', re: /\b(?:delete\s+all|remove\s+all|drop\s+all|wipe|destroy|rm\s+-rf|truncate\s+all|nuke)\b/i, detail: 'Prompt contains mass-destructive operation' },
  { type: 'force_push',   severity: 'block', re: /(?:force\s+push|--force|-f\s+origin|reset\s+--hard)/i,                                      detail: 'Prompt implies forced git operation' },
  { type: 'secret',       severity: 'warn',  re: /\b(?:api\s+key|access\s+token|secret\s+key|\.env|private\s+key|bearer\s+token)\b/i,         detail: 'Touches secret or credential material' },
  { type: 'auth',         severity: 'warn',  re: /\b(?:auth(?:entication)?|login|logout|password|credential|jwt|oauth|session\s+token)\b/i,    detail: 'Touches authentication code' },
  { type: 'deploy',       severity: 'warn',  re: /\b(?:ship\s+to|deploy\s+to|release\s+to|push\s+to\s+prod)\b/i,                              detail: 'Targets a deployment action' },
  { type: 'data_loss',    severity: 'warn',  re: /\b(?:drop\s+table|alter\s+table|schema\s+migration|migrate\s+data|database\s+reset)\b/i,     detail: 'Touches schema or migration — data loss risk' },
  { type: 'production',   severity: 'warn',  re: /\b(?:production|prod\b|live\s+environment|live\s+site)\b/i,                                  detail: 'References production environment' },
];

const FILE_REF_RE   = /(?:src\/|\.mjs|\.tsx?|\.jsx?|\.json|\.ya?ml|\.sh|line\s+\d+|\bL\d+\b)/i;
const FUNC_REF_RE   = /\b\w+\((?:\)|[^)]{0,40}\))/;
const STEP_RE       = /\b(?:step\s+\d|first[,\s]|then[,\s]|finally[,\s]|must|should\s+(?:use|call|return|handle))\b/i;
const CRITERIA_RE   = /\b(?:accept(?:ance)?\s+criteria|definition\s+of\s+done|constraints?|requirements?|must\s+(?:not|be|have)|should\s+not)\b/i;

function clamp(v: number, min = 1, max = 5): number {
  return Math.min(max, Math.max(min, v));
}

function scoreSpecificity(prompt: string): number {
  const hasFile  = FILE_REF_RE.test(prompt);
  const hasFunc  = FUNC_REF_RE.test(prompt);
  const hasLine  = /\bL\d+\b|\bline\s+\d+/i.test(prompt);
  const words    = prompt.trim().split(/\s+/).length;

  if (hasFile && (hasFunc || hasLine)) return 5;
  if (hasFile || hasFunc) return 4;
  if (words >= 10) return 3;
  if (words >= 5)  return 2;
  return 1;
}

function scoreActionability(prompt: string): number {
  const hasStep    = STEP_RE.test(prompt);
  const hasVerb    = /\b(?:fix|add|remove|refactor|create|update|write|delete|move|rename|replace|ensure|make)\b/i.test(prompt);
  const hasOutcome = /\b(?:so\s+that|in\s+order\s+to|result(?:ing)?\s+in|should\s+(?:return|output|produce|show))\b/i.test(prompt);
  const words      = prompt.trim().split(/\s+/).length;

  if (hasStep && hasVerb) return 5;
  if (hasOutcome && hasVerb) return 4;
  if (hasVerb && words >= 6) return 3;
  if (hasVerb) return 2;
  return 1;
}

function scoreSafety(risks: Array<{ severity: string; type: string }>): number {
  if (risks.some(r => r.severity === 'block')) return 1;
  if (risks.some(r => r.type === 'auth' || r.type === 'secret' || r.type === 'production')) return 2;
  if (risks.some(r => r.type === 'deploy' || r.type === 'data_loss')) return 3;
  if (risks.length > 0) return 4;
  return 5;
}

function scoreCompleteness(prompt: string): number {
  const hasCriteria = CRITERIA_RE.test(prompt);
  const hasContext  = /\b(?:because|since|currently|right\s+now|the\s+issue\s+is|error\s+is|it\s+(?:crashes|fails|returns))\b/i.test(prompt);
  const hasScope    = FILE_REF_RE.test(prompt);
  const words       = prompt.trim().split(/\s+/).length;

  if (hasCriteria && hasContext && hasScope) return 5;
  if ((hasCriteria || hasContext) && hasScope) return 4;
  if (hasContext || (hasScope && words >= 8)) return 3;
  if (words >= 6) return 2;
  return 1;
}

function detectIntent(prompt: string): { type: string; confidence: number; keywords: string[] } {
  const counts: Record<string, number> = {};
  for (const [type, re] of Object.entries(INTENT_PATTERNS)) {
    const matches = prompt.match(new RegExp(re.source, 'gi')) ?? [];
    if (matches.length > 0) counts[type] = matches.length;
  }

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return { type: 'unknown', confidence: 0, keywords: [] };
  }

  const [topType, topCount] = entries[0];
  const totalMatches = Object.values(counts).reduce((s: number, n: number) => s + n, 0);
  const confidence = Math.min(1, (topCount as number) / Math.max(totalMatches, 1) * (entries.length === 1 ? 1.5 : 1));

  const patternRe = INTENT_PATTERNS[topType as keyof typeof INTENT_PATTERNS];
  const allWords = prompt.match(new RegExp(patternRe.source, 'gi')) ?? [];
  const keywords = [...new Set(allWords.map(w => w.toLowerCase().trim()))].slice(0, 5);

  return { type: topType, confidence: Math.round(confidence * 100) / 100, keywords };
}

function detectRisks(prompt: string): Array<{ type: string; severity: string; detail: string }> {
  const found = [];
  for (const { type, severity, re, detail } of RISK_PATTERNS) {
    if (re.test(prompt)) {
      found.push({ type, severity, detail });
    }
  }
  return found;
}

function findMissingInfo(prompt: string, intent: { type: string }, specificity: number, completeness: number): string[] {
  const missing = [];

  if (intent.type === 'fix') {
    if (!/error|exception|crash|fail|wrong|issue/i.test(prompt)) missing.push('error description or failure symptom');
    if (!FILE_REF_RE.test(prompt)) missing.push('affected file or component');
    if (!/repro|reproduce|steps|trigger|when\s+I/i.test(prompt)) missing.push('reproduction steps');
  }

  if (intent.type === 'feature') {
    if (!FILE_REF_RE.test(prompt)) missing.push('target file or module to add feature to');
    if (!/user\s+(?:can|should|will)|should\s+(?:allow|enable|support)/i.test(prompt)) missing.push('user-facing outcome');
  }

  if (intent.type === 'refactor' && !FILE_REF_RE.test(prompt)) {
    missing.push('which file or function to refactor');
  }

  if (specificity < 2) missing.push('file name or component reference');
  if (completeness < 2) missing.push('context about current behavior');

  return [...new Set(missing)].slice(0, 3);
}

function chooseIntervention(quality: { score: number; completeness: number }, risks: Array<{ severity: string }>, calibration: Record<string, unknown> | undefined): string {
  if (risks.some(r => r.severity === 'block')) return 'block';

  const autonomy    = (calibration?.autonomy as number)    ?? 3;
  const specificity = (calibration?.specificity as number) ?? 3;

  if (quality.score >= 4 && risks.length === 0 && autonomy > 4) return 'pass';
  if (quality.score < 2 && specificity < 3)  return 'confirm_rewrite';
  if (quality.score < 3 && quality.completeness <= 2) return 'clarify_once';
  return 'silent_enrich';
}

export function analyzePrompt(prompt: string, projectBrief: unknown, calibration: Record<string, unknown> | undefined): Record<string, unknown> {
  const risks        = detectRisks(prompt);
  const intent       = detectIntent(prompt);
  const specificity  = scoreSpecificity(prompt);
  const actionability= scoreActionability(prompt);
  const safety       = scoreSafety(risks);
  const completeness = scoreCompleteness(prompt);
  const score        = Math.round(((specificity + actionability + safety + completeness) / 4) * 10) / 10;

  const quality = { score, specificity, actionability, safety, completeness };
  const missingInfo   = findMissingInfo(prompt, intent, specificity, completeness);
  const intervention  = chooseIntervention(quality, risks, calibration);

  return {
    original:     prompt,
    quality,
    intent,
    risks,
    missingInfo,
    intervention,
  };
}

function relevantDirtyFiles(dirtyFiles: string[] | unknown, intent: { type: string }): string[] {
  if (!Array.isArray(dirtyFiles) || dirtyFiles.length === 0) return [];

  const INTENT_HINTS: Record<string, RegExp> = {
    fix:      /\bfix|bug|error\b/i,
    ship:     /.*/,
    review:   /.*/,
    feature:  /src\//i,
    refactor: /src\//i,
    test:     /test|spec/i,
    docs:     /\.md$|readme/i,
  };

  const re = INTENT_HINTS[intent.type] ?? /src\//i;
  return dirtyFiles.filter((f: string) => re.test(f)).slice(0, 4);
}

export function enrichPrompt(prompt: string, projectBrief: Record<string, unknown> | null | undefined, analysis: Record<string, unknown>): string {
  if (!projectBrief) return prompt;

  const lines = [prompt, ''];
  const branch = projectBrief.branch as string | undefined;
  const dirtyFiles = (projectBrief.dirtyFiles ?? []) as string[];
  const recentCommits = (projectBrief.recentCommits ?? []) as string[];
  const aheadOfRemote = (projectBrief.aheadOfRemote ?? 0) as number;
  const recentFailures = (projectBrief.recentFailures ?? []) as Array<Record<string, unknown>>;
  const intent = analysis.intent as { type: string };

  const uncommitted = dirtyFiles.length;
  if (branch || uncommitted > 0) {
    const parts: string[] = [];
    if (branch) parts.push(`${branch} branch`);
    if (uncommitted > 0) parts.push(`${uncommitted} uncommitted file${uncommitted !== 1 ? 's' : ''}`);
    if (aheadOfRemote > 0) parts.push(`${aheadOfRemote} ahead of remote`);
    lines.push(`[Context: ${parts.join(', ')}]`);
  }

  const relFiles = relevantDirtyFiles(dirtyFiles, intent as { type: string });
  if (relFiles.length > 0) {
    lines.push(`[Files: ${relFiles.join(', ')}]`);
  }

  if (recentCommits.length > 0 && ['fix', 'review', 'ship'].includes(intent.type)) {
    lines.push(`[Recent: ${(recentCommits[0] as string).slice(0, 80)}]`);
  }

  if (recentFailures.length > 0) {
    const related = recentFailures.find((f: Record<string, unknown>) => {
      const fp = ((f.prompt as string) ?? '').toLowerCase();
      const pp = prompt.toLowerCase();
      const words = pp.split(/\s+/).filter(w => w.length > 3);
      return words.some(w => fp.includes(w));
    });
    if (related) {
      lines.push(`[Failures: previous attempt failed — ${((related.error as string) ?? 'unknown error').slice(0, 80)}]`);
    }
  }

  return lines.slice(0, lines.length).join('\n');
}

export function formatRiskWarning(risks: Array<{ severity: string; type: string; detail: string }> | null | undefined): string {
  if (!risks || risks.length === 0) return '';
  const lines = ['⚠️  RISK DETECTED'];
  for (const risk of risks) {
    const icon   = risk.severity === 'block' ? '🔴' : '🟡';
    const suffix = risk.severity === 'block' ? ' (BLOCKED)' : ' (proceed with caution)';
    lines.push(`  ${icon} ${risk.type}: ${risk.detail}${suffix}`);
  }
  return lines.join('\n');
}

export function formatQuality(analysis: Record<string, unknown>): string {
  const quality = analysis.quality as { score: number; specificity: number; actionability: number; safety: number; completeness: number };
  const intent = analysis.intent as { type: string; confidence: number };
  const intervention = analysis.intervention as string;
  const q = quality;
  return `Quality: ${q.score}/5 (specificity:${q.specificity} action:${q.actionability} safety:${q.safety} complete:${q.completeness})\nIntent: ${intent.type} (${intent.confidence}) | Intervention: ${intervention}`;
}

export function suggestImprovement(analysis: Record<string, unknown>): string {
  const intent = analysis.intent as { type: string };
  const missingInfo = analysis.missingInfo as string[];

  const templates: Record<string, string> = {
    fix:      `Fix the [specific function or behavior] in [file path] — it [symptom/error], causing [impact]`,
    feature:  `Add [feature name] to [file/component] — it should [user outcome] when [condition]`,
    refactor: `Refactor [function/module] in [file] to [desired outcome] — keep [what to preserve]`,
    review:   `Review [file or PR] for [concern] — focus on [specific area or risk]`,
    ship:     `Ship [branch/feature] — verify [test status], then merge and publish`,
    explore:  `Explain how [specific mechanism] works in [file/component]`,
    test:     `Write tests for [function/module] in [file] covering [edge cases]`,
    docs:     `Document [function or module] in [file] — cover [params, return, examples]`,
    deploy:   `Deploy [service] to [environment] — confirm [readiness checks]`,
    unknown:  `Describe what you want changed, which file it's in, and what the expected result is`,
  };

  const base = templates[intent.type] ?? templates.unknown;
  const tips  = missingInfo.length > 0
    ? ` (missing: ${missingInfo.join(', ')})`
    : '';

  return `Try: '${base}'${tips}`;
}

export function getTaskTemplate(intentType: string): Record<string, unknown> {
  const templates: Record<string, { needs: string[]; auto_add: string[] }> = {
    fix: {
      needs:    ['error_description', 'affected_files', 'reproduction_steps'],
      auto_add: ['test_expectations', 'rollback_plan'],
    },
    feature: {
      needs:    ['feature_description', 'affected_area'],
      auto_add: ['test_plan', 'acceptance_criteria'],
    },
    refactor: {
      needs:    ['target_code', 'desired_outcome'],
      auto_add: ['test_preservation', 'scope_boundary'],
    },
    review: {
      needs:    ['scope'],
      auto_add: ['recent_changes', 'risk_areas'],
    },
    ship: {
      needs:    ['readiness_check'],
      auto_add: ['test_status', 'git_status', 'uncommitted_changes'],
    },
    explore: {
      needs:    ['topic'],
      auto_add: ['related_files', 'recent_changes'],
    },
    test: {
      needs:    ['target_function', 'test_framework'],
      auto_add: ['edge_cases', 'existing_coverage'],
    },
    docs: {
      needs:    ['target_module'],
      auto_add: ['param_descriptions', 'usage_example'],
    },
    deploy: {
      needs:    ['target_environment', 'service_name'],
      auto_add: ['pre_deploy_checks', 'rollback_plan'],
    },
    unknown: {
      needs:    ['prompt_clarification'],
      auto_add: [],
    },
  };

  return templates[intentType] ?? templates.unknown;
}

export function shouldBlock(analysis: Record<string, unknown>): boolean {
  const risks = analysis.risks as Array<{ severity: string; detail: string }>;
  return risks.some(r => r.severity === 'block');
}

export function getBlockReason(analysis: Record<string, unknown>): string | null {
  const risks = analysis.risks as Array<{ severity: string; detail: string }>;
  const blocking = risks.find(r => r.severity === 'block');
  return blocking ? blocking.detail : null;
}
