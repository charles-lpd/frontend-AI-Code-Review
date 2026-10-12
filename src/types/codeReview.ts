export type CodeReviewTargetType = 'repo' | 'pr' | 'commit';

export type ReviewStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting'
  | 'skipped'
  | 'done';

export interface ReviewStep {
  stepKey: string;
  stepLabel: string;
  stepStatus: ReviewStepStatus;
  stepIndex: number;
  stepTotal: number;
  durationMs?: number;
  message?: string;
}

export type CodeReviewRunStatus =
  | 'idle'
  | 'understanding'
  | 'waiting_clarification'
  | 'ready_to_review'
  | 'reviewing'
  | 'waiting_confirmation'
  | 'executing_followup'
  | 'resuming'
  | 'completed'
  | 'failed'
  | 'planning'
  | 'ready_to_start'
  | string;

export type CodeReviewMessageRole = 'user' | 'assistant' | 'system';

export type CodeReviewMessageType =
  | 'text'
  | 'status'
  | 'question'
  | 'summary'
  | 'error'
  | 'action';

export interface CodeReviewMessage {
  id: string;
  reviewId: string;
  role: CodeReviewMessageRole;
  messageType: CodeReviewMessageType;
  content: string;
  dataJson: Record<string, unknown> | null;
  createdAt: string | number;
}

export interface CodeReviewConversationContext {
  owner?: string;
  repo?: string;
  branch?: string | null;
  filePath?: string | null;
  pullNumber?: number | null;
  sha?: string | null;
  pageType?: CodeReviewTargetType | string | null;
  [key: string]: unknown;
}

export interface CodeReviewChatRequest {
  message: string;
  reviewId?: string | null;
  context?: CodeReviewConversationContext;
}

export interface CodeReviewReplyRequest {
  message: string;
  context?: CodeReviewConversationContext;
}

export interface CodeReviewConfirmAction {
  applyChanges?: boolean;
  createPR?: boolean;
  autoComment?: boolean;
}

export interface CodeReviewConfirmRequest {
  confirmed: true;
  action?: CodeReviewConfirmAction;
}

export interface CodeReviewMessagesResponse {
  reviewId: string;
  messages: CodeReviewMessage[];
}

export interface CodeReviewConversationSummary {
  reviewId: string;
  title: string;
  status: CodeReviewRunStatus;
  updatedAt: number;
  lastMessage: string | null;
  task: {
    reviewType: CodeReviewTargetType | null;
    owner: string | null;
    repo: string | null;
    branch: string | null;
    filePath: string | null;
    pullNumber: number | null;
    sha: string | null;
    applyChanges: boolean;
    createPR: boolean;
    autoComment: boolean;
  };
}

export interface CodeReviewTask {
  reviewType?: CodeReviewTargetType;
  owner?: string;
  repo?: string;
  branch?: string | null;
  filePath?: string | null;
  pullNumber?: number | null;
  sha?: string | null;
  applyChanges?: boolean;
  createPR?: boolean;
  autoComment?: boolean;
  planConfirmed?: boolean;
}

export interface CodeReviewRunSnapshot {
  reviewId: string;
  threadId: string;
  status: CodeReviewRunStatus;
  intent?: string | null;
  currentStep: string;
  steps: ReviewStep[];
  waitingReason?: string | null;
  lastUserMessage?: string | null;
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
  summary?: string | null;
  summaryContext: string | null;
  finalSummary: string | null;
  questions: string[] | null;
  missingFields: string[] | null;
  answers?: unknown;
  contextJson?: Record<string, unknown> | null;
  reviewPlan: unknown;
  dimensionResults: unknown;
  generatedFix: string | null;
  modificationBranch: string | null;
  pullRequestUrl: string | null;
  latestCheckpointId: string | null;
  canReply?: boolean;
  canConfirm?: boolean;
  currentStepKey?: string | null;
  currentStepLabel?: string | null;
  currentStepStatus?: ReviewStepStatus | null;
  stepIndex?: number | null;
  stepTotal?: number | null;
}

export interface CodeReviewStreamMetaEvent {
  type: 'meta';
  reviewId?: string;
  status?: CodeReviewRunStatus;
  ts?: number;
}

export interface CodeReviewStreamStatusEvent {
  type: 'status';
  reviewId?: string;
  phase?: 'understand' | 'fetch' | 'review' | 'summary' | 'resume' | 'comment' | 'final' | string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamHeartbeatEvent {
  type: 'heartbeat';
  ts?: number;
}

export interface CodeReviewStreamNeedClarificationEvent {
  type: 'need_clarification';
  reviewId?: string;
  questions: string[];
  missingFields?: string[];
  ts?: number;
}

export interface CodeReviewStreamPlanReadyEvent {
  type: 'plan_ready';
  reviewId?: string;
  intent?: string;
  reviewType?: CodeReviewTargetType;
  target?: Record<string, unknown>;
  ts?: number;
}

export interface CodeReviewStreamStepUpdateEvent {
  type: 'step_update';
  reviewId?: string;
  stepKey: string;
  stepLabel: string;
  stepStatus: ReviewStepStatus;
  stepIndex?: number;
  stepTotal?: number;
  ts?: number;
}

export interface CodeReviewStreamReviewChunkEvent {
  type: 'review_chunk';
  reviewId?: string;
  phase?: 'review' | string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamReviewSummaryEvent {
  type: 'review_summary';
  reviewId?: string;
  phase?: 'summary' | string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamWaitingConfirmationEvent {
  type: 'waiting_confirmation';
  reviewId?: string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamFinishedEvent {
  type: 'finished';
  reviewId?: string;
  status?: CodeReviewRunStatus;
  generatedFix?: string | null;
  modificationBranch?: string | null;
  pullRequestUrl?: string | null;
  ts?: number;
}

export interface CodeReviewStreamErrorEvent {
  type: 'error';
  reviewId?: string;
  phase?: string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamTextEvent {
  type: 'text';
  reviewId?: string;
  text: string;
  ts?: number;
}

export interface CodeReviewStreamAgentStatusEvent {
  type: 'agent_status';
  reviewId?: string;
  event:
    | 'agent_started'
    | 'model_started'
    | 'model_finished'
    | 'tool_started'
    | 'tool_finished'
    | 'agent_finished'
    | 'error';
  stepKey: string;
  stepLabel: string;
  stepStatus: ReviewStepStatus;
  stepIndex: number;
  stepTotal: number;
  durationMs?: number;
  message?: string;
  ts?: number;
}

export interface CodeReviewStreamWarningEvent {
  type: 'warning';
  reviewId?: string;
  warning: string;
  text?: string;
  ts?: number;
}

export type CodeReviewStreamChunk =
  | CodeReviewStreamMetaEvent
  | CodeReviewStreamStatusEvent
  | CodeReviewStreamHeartbeatEvent
  | CodeReviewStreamNeedClarificationEvent
  | CodeReviewStreamPlanReadyEvent
  | CodeReviewStreamStepUpdateEvent
  | CodeReviewStreamReviewChunkEvent
  | CodeReviewStreamReviewSummaryEvent
  | CodeReviewStreamWaitingConfirmationEvent
  | CodeReviewStreamFinishedEvent
  | CodeReviewStreamErrorEvent
  | CodeReviewStreamTextEvent
  | CodeReviewStreamAgentStatusEvent
  | CodeReviewStreamWarningEvent
  | { done: true; reviewId?: string; ts?: number }
  | { error: string; reviewId?: string; ts?: number };
