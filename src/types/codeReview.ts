export type CodeReviewTargetType = 'repo' | 'pr' | 'commit';

export type ReviewStepKey =
  | 'plan'
  | 'fetch'
  | 'review'
  | 'summary'
  | 'waiting'
  | 'resume'
  | 'writeback'
  | 'pr';

export type ReviewStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'completed'
  | 'waiting'
  | 'failed';

export interface ReviewStep {
  stepKey: ReviewStepKey;
  stepLabel: string;
  stepStatus: ReviewStepStatus;
  stepIndex: number;
  stepTotal: number;
}

export type CodeReviewRunStatus =
  | 'idle'
  | 'planning'
  | 'need_clarification'
  | 'ready_to_start'
  | 'reviewing'
  | 'waiting_confirmation'
  | 'resuming'
  | 'completed'
  | 'failed';

export interface CodeReviewRequest {
  reviewType: CodeReviewTargetType;
  owner: string;
  repo: string;
  branch?: string;
  filePath?: string;
  pullNumber?: number;
  sha?: string;
  applyChanges?: boolean;
  createPR?: boolean;
  autoComment?: boolean;
}

export interface CodeReviewPlannerTask extends Partial<CodeReviewRequest> {
  [key: string]: unknown;
}

export interface CodeReviewPlanResponse {
  status: 'ready' | 'need_clarification' | string;
  summary?: string;
  task?: CodeReviewPlannerTask;
  questions?: string[];
  missingFields?: string[];
  userId?: string;
  canExecute?: boolean;
}

export interface CodeReviewPlan {
  goal?: string;
  summary?: string;
  focus?: string[] | string;
  dimensions?: string[] | Array<{ name?: string; description?: string }>;
  steps?: string[] | Array<{ title?: string; detail?: string }>;
  autoComment?: boolean;
  applyChanges?: boolean;
  createPR?: boolean;
  [key: string]: unknown;
}

export interface CodeReviewGraphEvent {
  graphNode?: string;
  graphStatus?: 'pending' | 'running' | 'success' | 'failed' | string;
  duration?: number;
  text?: string;
  [key: string]: unknown;
}

export interface CodeReviewDimensionResult {
  name?: string;
  title?: string;
  summary?: string;
  content?: string;
  ok?: boolean;
  [key: string]: unknown;
}

export interface CodeReviewRunSnapshot {
  reviewId: string;
  threadId: string;
  status: string;
  currentStep: string;
  currentStepKey?: ReviewStepKey | null;
  currentStepLabel?: string | null;
  currentStepStatus?: ReviewStepStatus | null;
  stepIndex?: number | null;
  stepTotal?: number | null;
  task: {
    reviewType: CodeReviewTargetType;
    owner: string;
    repo: string;
    branch?: string | null;
    filePath?: string | null;
    pullNumber?: number | null;
    sha?: string | null;
    applyChanges?: boolean;
    createPR?: boolean;
    autoComment?: boolean;
  };
  steps?: ReviewStep[] | null;
  summaryContext: string | null;
  finalSummary: string | null;
  reviewPlan: CodeReviewPlan | null;
  dimensionResults: CodeReviewDimensionResult[] | null;
  generatedFix: string | null;
  modificationBranch: string | null;
  pullRequestUrl: string | null;
  latestCheckpointId: string | null;
}

export interface CodeReviewStreamTypedChunk {
  type:
    | 'status'
    | 'plan'
    | 'graph_event'
    | 'dimension_start'
    | 'dimension_header'
    | 'dimension_chunk'
    | 'dimension_done'
    | 'summary_header'
    | 'summary_chunk'
    | 'summary_done'
    | 'comment_status'
    | 'final';
  text?: string;
  reviewId?: string;
  reviewPlan?: CodeReviewPlan;
  graphNode?: string;
  graphStatus?: CodeReviewGraphEvent['graphStatus'];
  stepKey?: ReviewStepKey;
  stepLabel?: string;
  stepStatus?: ReviewStepStatus;
  stepIndex?: number;
  stepTotal?: number;
  graphMethod?: string;
  graphNamespace?: string;
  graphData?: unknown;
  duration?: number;
  ok?: boolean;
  phase?:
    | 'fetch'
    | 'review'
    | 'summary'
    | 'comment'
    | 'final'
    | 'graph'
    | string;
  dimension?: string;
  commentStatus?: string;
  runStatus?: CodeReviewRunStatus | 'running' | 'resuming' | string;
  step?: string;
  [key: string]: unknown;
}

export interface CodeReviewStreamDoneChunk {
  done: true;
  reviewId?: string;
}

export interface CodeReviewStreamErrorChunk {
  error: string;
  reviewId?: string;
}

export type CodeReviewStreamChunk =
  | CodeReviewStreamTypedChunk
  | CodeReviewStreamDoneChunk
  | CodeReviewStreamErrorChunk;
