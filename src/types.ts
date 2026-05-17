/**
 * Core shared types for the dual-brain orchestrator.
 * These represent the data shapes flowing through the pipeline.
 */

// ─── Providers & Models ─────────────────────────────────────────────────────

export type Provider = 'claude' | 'openai';

export type Tier = 'search' | 'execute' | 'think' | 'review';

export type Risk = 'low' | 'medium' | 'high' | 'critical';

export type Complexity = 'simple' | 'moderate' | 'complex';

export type LatencyTier = 'fast' | 'medium' | 'slow';

export type CostTier = 'cheap' | 'moderate' | 'expensive';

// ─── Model Profiles ─────────────────────────────────────────────────────────

export interface ModelTraits {
  [key: string]: number;
  reasoningDepth: number;
  codeGeneration: number;
  codeReview: number;
  editPrecision: number;
  architecture: number;
  instructionFollowing: number;
  structuredOutput: number;
  steerability: number;
  refactoring: number;
  testGeneration: number;
  documentation: number;
}

export interface ModelLanguages {
  [key: string]: number;
  systems: number;
  scripting: number;
  markup: number;
  niche: number;
}

export interface ModelOps {
  latencyTier: LatencyTier;
  costTier: CostTier;
  contextDegradation: number;
  parameterSensitive: boolean;
}

export type Modality = 'text' | 'vision';

export type ToolUse = 'native' | 'function-calling' | 'none';

export type Autonomy = 'agent-loop' | 'single-turn' | 'multi-turn';

export interface ModelProfile {
  id: string;
  name: string;
  provider: Provider;
  tier: number;
  contextWindow: number;
  maxOutput: number;
  supportedModes: string[];
  toolUse: ToolUse;
  autonomy: Autonomy;
  multimodal: Modality[];
  traits: ModelTraits;
  languages: ModelLanguages;
  ops: ModelOps;
  quirks: string[];
}

// ─── Routing & Dispatch ─────────────────────────────────────────────────────

export interface DispatchDecision {
  provider: Provider;
  model: string;
  effort: string;
  tier: Tier;
  dualBrain: boolean;
  degradedDualBrain?: boolean;
  challengerModel?: string | null;
  workStyle: string;
  modes: string[];
  sandbox: boolean;
  explanation: string;
  _advisorOverride?: {
    from: string;
    to: string;
    reason: string;
    explored: boolean;
  } | null;
}

export interface RoutingState {
  provider: Provider;
  model: string;
  tier: Tier;
  risk: Risk;
  complexity: Complexity;
  intent: string;
  effort: string;
  dualBrain: boolean;
  healthScores: Record<Provider, number>;
}

// ─── Task Outcomes ──────────────────────────────────────────────────────────

export interface TokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface TaskOutcome {
  success: boolean;
  status?: 'complete' | 'partial' | 'failed';
  tier: Tier;
  durationMs: number;
  filesChanged?: string[] | number;
  tokensUsed?: TokenUsage;
  error?: string;
  stderr?: string;
  stdout?: string;
  output?: string;
  quality?: number;
  score?: number;
}

// ─── Signal Scoring ─────────────────────────────────────────────────────────

export interface SignalScore {
  name: string;
  value: number | null;
  weight: number;
}

export interface CompositeScore {
  score: number;
  signals: SignalScore[];
  confidence: number;
}

// ─── Failure Classification & Retry ─────────────────────────────────────────

export type FailureType =
  | 'rate-limit'
  | 'timeout'
  | 'context-overflow'
  | 'specification'
  | 'capability'
  | 'unknown';

export interface FailureClassification {
  type: FailureType;
  confidence: number;
  retryable: boolean;
}

export type RetryStrategyName =
  | 'escalate'
  | 'wait-retry'
  | 'compress'
  | 'split'
  | 'give-up';

export interface RetryStrategy {
  strategy: RetryStrategyName;
  reason: string;
  newDecision?: DispatchDecision;
}

// ─── Handoffs ───────────────────────────────────────────────────────────────

export type HandoffStage = 'think' | 'thinker' | 'work' | 'worker' | 'review' | 'reviewer' | 'head';

export type HandoffType = 'think-to-work' | 'work-to-review' | 'review-to-head';

export interface HandoffContract {
  fromStage: HandoffStage;
  toStage: HandoffStage;
  runId: string;
  createdAt: string;
  data: HandoffData;
}

export type HandoffData = ThinkToWorkData | WorkToReviewData | ReviewToHeadData;

export interface ThinkToWorkData {
  objective: string;
  files: string[];
  criteria: string[];
  context?: string;
  confidence?: number;
}

export interface WorkToReviewData {
  filesChanged: string[];
  objective: string;
  diff?: string;
  criteria?: string | string[];
  testsRun?: string;
}

export interface ReviewToHeadData {
  pass: boolean;
  findings?: string[];
  recommendation?: string;
  severity?: string;
}

// ─── Detection (input to routing) ──────────────────────────────────────────

export interface TaskDetection {
  intent: string;
  risk: Risk;
  complexity: Complexity;
  effort: string;
  tier: Tier;
  designImpact?: boolean;
}

// ─── Health ─────────────────────────────────────────────────────────────────

export interface ProviderHealth {
  score: number;
  cooldownUntil?: number;
  lastError?: string;
  degraded?: boolean;
}

// ─── Failover ───────────────────────────────────────────────────────────────

export interface FailoverOption {
  provider: Provider;
  model: string;
  plan: string;
  label: string;
}
