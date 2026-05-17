// User calibration module — tracks specificity, corrections, and autonomy signals
// to adapt dual-brain behavior to any user from vague vibe-coder to precise expert.

const FILE_REF_RE = /(?:src\/|\.mjs|\.tsx?|\.jsx?|\.json|\.ya?ml|\.sh|line\s+\d+|\bL\d+\b)/i;
const TECH_TERM_RE = /\b(?:regex|middleware|api|endpoint|refactor|migration|schema|auth(?:entication)?|jwt|token|hook|dispatch|pipeline|module|function|class|interface|type|import|export|async|await|promise|callback|handler|router|controller|service|repository|factory|singleton|decorator|mixin|proxy|guard|interceptor|serializer|validator|transformer|adapter|facade|strategy|observer|subscriber|emitter|stream|buffer|cache|queue|worker|thread|mutex|semaphore|socket|websocket|http|grpc|graphql|rest|orm|sql|nosql|index|query|transaction|migration|seed|fixture|mock|stub|spy|assertion|coverage|lint|typecheck|bundle|compile|transpile|minify|tree.shake|dead.code|chunk|lazy.load|ssr|csr|hydrat)\b/i;
const VAGUE_RE = /\b(?:idk|just|make\s+it|fix\s+it|whatever|vibes?|better|nicer|faster|cleaner|improve|help|do\s+it|yeah|sure|ok|okay|hmm|uh|er|um)\b/i;
const AUTONOMY_HIGH_RE = /\b(?:just\s+do\s+it|go(?:\s+ahead)?|build\s+it|ship\s+it|run\s+it|execute|do\s+it|proceed|continue|carry\s+on|handle\s+it|take\s+care|make\s+it\s+happen|yolo)\b/i;
const QUESTION_RE = /\?|^(?:how|what|why|when|where|which|should|can|could|would|is|are|do|does|did|will|won't|don't)\b/i;
const CORRECTION_RE = /^(?:no[,.]?|not\s|wrong|stop|don't|that'?s?\s+not|i\s+said|i\s+meant)\b|(?:\binstead\b|\brather\b|\bactually\b)/i;

interface AnalysisResult {
  specificity: number;
  signals: {
    hasFileRefs: boolean;
    hasTechTerms: boolean;
    hasExactInstructions: boolean;
    isVague: boolean;
    wordCount: number;
  };
}

export function analyzeInput(input: string | null | undefined): AnalysisResult {
  const text = (input || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const hasFileRefs = FILE_REF_RE.test(text);
  const hasTechTerms = TECH_TERM_RE.test(text);
  const hasExactInstructions = /\b(?:step\s+\d|first[,\s]|then[,\s]|finally[,\s]|specifically|exactly|must|should\s+(?:use|call|return|handle)|(?:use|call|return|throw|emit|dispatch)\s+\w)/i.test(text);
  const isVague = VAGUE_RE.test(text.toLowerCase()) || wordCount <= 3;

  let specificity: number;
  if (hasFileRefs || /\bline\s*\d+\b|\bL\d+\b/i.test(text) || (hasTechTerms && hasExactInstructions)) {
    specificity = 5;
  } else if (hasTechTerms && wordCount >= 6) {
    specificity = 4;
  } else if (!isVague && wordCount >= 8) {
    specificity = 3;
  } else if (wordCount >= 4 && !isVague) {
    specificity = 2;
  } else {
    specificity = 1;
  }

  return {
    specificity,
    signals: {
      hasFileRefs,
      hasTechTerms,
      hasExactInstructions,
      isVague,
      wordCount
    }
  };
}

export function detectCorrection(input: string | null | undefined): boolean {
  return CORRECTION_RE.test((input || '').trim());
}

function clamp(value: number, min = 1, max = 5): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function detectAutonomySignal(input: string | null | undefined): number | null {
  const text = (input || '').trim();
  if (AUTONOMY_HIGH_RE.test(text)) return 5;
  if (QUESTION_RE.test(text)) return 2;
  return null;
}

export interface Calibration {
  specificity?: number;
  corrections?: number;
  autonomy?: number;
  interactions?: number;
  lastUpdated?: string;
}

export function updateCalibration(calibration: Calibration, input: string, correction = false): Calibration {
  const { specificity: newSpec } = analyzeInput(input);
  const autonomySignal = detectAutonomySignal(input);

  const prev = {
    specificity: calibration.specificity ?? 3,
    corrections: calibration.corrections ?? 3,
    autonomy: calibration.autonomy ?? 3,
    interactions: calibration.interactions ?? 0
  };

  const specificity = round1(clamp(prev.specificity * 0.7 + newSpec * 0.3));

  const corrections = round1(clamp(
    correction ? prev.corrections - 0.3 : prev.corrections + 0.1
  ));

  let autonomy = prev.autonomy;
  if (autonomySignal !== null) {
    autonomy = round1(clamp(prev.autonomy * 0.7 + autonomySignal * 0.3));
  }

  return {
    specificity,
    corrections,
    autonomy,
    interactions: prev.interactions + 1,
    lastUpdated: new Date().toISOString()
  };
}

interface Adaptation {
  clarifyBeforeActing: boolean;
  explainReasoning: boolean;
  suggestNextSteps: boolean;
  askForApproval: boolean;
  autoExecute: boolean;
  responseStyle: 'terse' | 'normal' | 'detailed';
  userLevel: 'advanced' | 'intermediate' | 'beginner';
}

export function getAdaptation(calibration: Calibration): Adaptation {
  const s = calibration.specificity ?? 3;
  const c = calibration.corrections ?? 3;
  const a = calibration.autonomy ?? 3;

  const clarifyBeforeActing = s < 2.5 || c > 3;
  const explainReasoning = a < 3;
  const suggestNextSteps = a < 4;
  const askForApproval = c < 2.5;
  const autoExecute = a > 4 && c > 3.5;

  let responseStyle: 'terse' | 'normal' | 'detailed';
  const combined = (s + c + a) / 3;
  if (combined >= 4) {
    responseStyle = 'terse';
  } else if (combined >= 2.5) {
    responseStyle = 'normal';
  } else {
    responseStyle = 'detailed';
  }

  let userLevel: 'advanced' | 'intermediate' | 'beginner';
  if (s >= 4) {
    userLevel = 'advanced';
  } else if (s >= 2.5) {
    userLevel = 'intermediate';
  } else {
    userLevel = 'beginner';
  }

  return {
    clarifyBeforeActing,
    explainReasoning,
    suggestNextSteps,
    askForApproval,
    autoExecute,
    responseStyle,
    userLevel
  };
}

export function formatCalibration(calibration: Calibration): string {
  const { userLevel, responseStyle } = getAdaptation(calibration);
  const s = calibration.specificity ?? 3;
  const c = calibration.corrections ?? 3;
  const a = calibration.autonomy ?? 3;

  const autonomyLabel = a >= 4 ? 'high autonomy' : a >= 2.5 ? 'normal autonomy' : 'low autonomy';
  const trustLabel = c >= 4 ? 'high trust' : c >= 2.5 ? 'good trust' : 'low trust';

  return `User: ${userLevel} · ${autonomyLabel} · ${trustLabel}\n      (specificity: ${s}, corrections: ${c}, autonomy: ${a})`;
}
