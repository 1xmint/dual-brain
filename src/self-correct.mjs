// self-correct.mjs — Failure analysis and retry strategy selection

const MODEL_TIER = { 'haiku': 1, 'sonnet': 2, 'opus': 3 };
const TIER_MODEL = { 1: 'haiku', 2: 'sonnet', 3: 'opus' };
const MAX_ATTEMPTS = 3;

function modelTier(model = '') {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 1;
  if (m.includes('opus')) return 3;
  return 2; // sonnet default
}

function matchesAny(text, keywords) {
  const t = text.toLowerCase();
  return keywords.some(k => t.includes(k));
}

// Export 1: classifyFailure(result)
export function classifyFailure(result) {
  try {
    const err = String(result?.error || result?.stderr || '');
    const out = String(result?.output || result?.stdout || '');
    const combined = err + ' ' + out;
    const duration = result?.durationMs ?? 0;
    const timeoutThreshold = result?.timeoutMs ?? 60_000;

    if (matchesAny(combined, ['rate limit', 'ratelimit', '429', 'quota exceeded', 'capacity'])) {
      return { type: 'rate-limit', confidence: 0.95, retryable: true };
    }
    if (matchesAny(combined, ['timeout', 'timed out']) || duration > timeoutThreshold) {
      return { type: 'timeout', confidence: 0.9, retryable: true };
    }
    if (matchesAny(combined, ['context length', 'token limit', 'too long', 'maximum context', 'context window'])) {
      return { type: 'context-overflow', confidence: 0.9, retryable: true };
    }
    if (matchesAny(combined, ['ambiguous', 'unclear', 'did you mean', 'which one', 'could you clarify', 'please clarify'])) {
      return { type: 'specification', confidence: 0.85, retryable: false };
    }
    if (matchesAny(combined, ['unable to', "i don't know how", 'beyond my', 'cannot complete', 'incomplete'])) {
      return { type: 'capability', confidence: 0.8, retryable: true };
    }
    // Heuristic: low quality output without explicit error signals capability gap
    const quality = result?.quality ?? result?.score ?? null;
    if (quality !== null && quality < 0.5) {
      return { type: 'capability', confidence: 0.7, retryable: true };
    }

    return { type: 'unknown', confidence: 0.5, retryable: true };
  } catch {
    return { type: 'unknown', confidence: 0, retryable: true };
  }
}

// Export 2: selectStrategy(failure, originalDecision, attemptNumber)
export function selectStrategy(failure, originalDecision, attemptNumber) {
  try {
    if (!failure.retryable) {
      return { strategy: 'give-up', reason: `failure type '${failure.type}' requires user input` };
    }
    if (attemptNumber >= MAX_ATTEMPTS) {
      return { strategy: 'give-up', reason: `max attempts (${MAX_ATTEMPTS}) reached` };
    }

    const tier = modelTier(originalDecision?.model);

    if (attemptNumber === 1) {
      switch (failure.type) {
        case 'capability':
          if (tier >= 3) return { strategy: 'split', newDecision: originalDecision, reason: 'already at max tier; decompose task' };
          return { strategy: 'escalate', newDecision: originalDecision, reason: 'model lacked capability; escalating tier' };
        case 'timeout':
          return { strategy: 'wait-retry', newDecision: originalDecision, reason: 'timed out; retrying with delay' };
        case 'rate-limit':
          return { strategy: 'wait-retry', newDecision: originalDecision, reason: 'rate limited; retrying after delay' };
        case 'context-overflow':
          return { strategy: 'compress', newDecision: originalDecision, reason: 'context too large; compressing' };
        case 'specification':
          return { strategy: 'give-up', reason: 'ambiguous specification; user clarification needed' };
        default: // unknown
          if (tier >= 3) return { strategy: 'split', newDecision: originalDecision, reason: 'unknown failure at max tier; decomposing' };
          return { strategy: 'escalate', newDecision: originalDecision, reason: 'unknown failure; escalating as precaution' };
      }
    }

    if (attemptNumber === 2) {
      if (tier >= 3) {
        return { strategy: 'split', newDecision: originalDecision, reason: 'max tier reached; splitting task' };
      }
      return { strategy: 'escalate', newDecision: originalDecision, reason: 'retry failed; escalating one final tier' };
    }

    return { strategy: 'give-up', reason: 'exhausted retry budget' };
  } catch {
    return { strategy: 'give-up', reason: 'internal error in strategy selection' };
  }
}

// Export 3: buildRetryDecision(originalDecision, strategy, failure)
export function buildRetryDecision(originalDecision, strategy, failure) {
  try {
    const base = {
      ...originalDecision,
      _retryAttempt: (originalDecision?._retryAttempt ?? 0) + 1,
      _retryReason: failure.type,
      _retryStrategy: strategy,
    };

    switch (strategy) {
      case 'escalate': {
        const tier = modelTier(originalDecision?.model);
        const nextTier = Math.min(tier + 1, 3);
        return { ...base, model: TIER_MODEL[nextTier] };
      }
      case 'compress':
        return { ...base, _contextBudget: 0.5 };
      case 'wait-retry':
        return { ...base, _delayMs: 5000 };
      case 'rethink':
        return { ...base, tier: 'think', _retryAsThink: true };
      case 'split':
        return { ...base, _shouldDecompose: true };
      default:
        return base;
    }
  } catch {
    return { ...originalDecision, _retryAttempt: 1, _retryReason: 'error', _retryStrategy: strategy };
  }
}

// Export 4: shouldRetry(result, originalDecision, attemptNumber)
export function shouldRetry(result, originalDecision, attemptNumber = 1) {
  try {
    const failure = classifyFailure(result);
    const { strategy, newDecision, reason } = selectStrategy(failure, originalDecision, attemptNumber);

    if (strategy === 'give-up') {
      return { retry: false, reason, strategy };
    }

    const decision = buildRetryDecision(newDecision ?? originalDecision, strategy, failure);
    return { retry: true, decision, reason, strategy };
  } catch {
    return { retry: false, reason: 'internal error in shouldRetry', strategy: 'give-up' };
  }
}
