export type AgentRunStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'waiting_confirmation'
  | 'resuming'
  | 'completed'
  | 'failed';

export type AgentIntent =
  | 'code_review'
  | 'doc_rewrite'
  | 'readme_generation'
  | 'code_fix'
  | 'mixed_task'
  | 'need_clarification';

export type AgentRoute =
  | 'code_review'
  | 'doc_rewrite'
  | 'mixed_task'
  | 'need_clarification';

export type AgentStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting'
  | 'skipped';

export interface AgentStep {
  stepKey: string;
  stepLabel: string;
  stepStatus: AgentStepStatus;
  stepIndex: number;
  stepTotal: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AgentArtifact {
  id: string;
  artifactType: string;
  artifactKey: string;
  text: string | null;
  data: unknown;
  filePath: string | null;
  url: string | null;
  mimeType: string | null;
  createdAt: string;
}

export interface AgentRunSnapshot {
  runId: string;
  threadId: string;
  status: AgentRunStatus | string;
  intent: AgentIntent | null;
  route: AgentRoute | null;
  targetType: string | null;
  target: Record<string, unknown> | null;
  currentStep: string | null;
  summary: string | null;
  summaryContext: string | null;
  finalSummary: string | null;
  reviewPlan: Record<string, unknown> | null;
  actions: Record<string, unknown>[] | null;
  questions: string[] | null;
  answers: Record<string, unknown> | null;
  contextJson: Record<string, unknown> | null;
  preferencesJson: Record<string, unknown> | null;
  generatedFix: string | null;
  generatedDocument: string | null;
  branchName: string | null;
  commitMessage: string | null;
  pullRequestUrl: string | null;
  latestCheckpointId: string | null;
  errorMessage: string | null;
  steps: AgentStep[];
  artifacts: AgentArtifact[];
  latestCheckpoint: Record<string, unknown> | null;
}

export interface AgentRunEvent {
  type: string;
  runId?: string;
  phase?: string;
  text?: string;
  stepKey?: string;
  stepLabel?: string;
  stepStatus?: AgentStepStatus;
  stepIndex?: number;
  stepTotal?: number;
  intent?: AgentIntent | string;
  route?: AgentRoute | string;
  summary?: string;
  questions?: string[];
  artifactKey?: string;
  artifactType?: string;
  data?: unknown;
  createdAt?: number;
  status?: AgentRunStatus | string;
  done?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface AgentStreamItem {
  id: string;
  type:
    | 'run_created'
    | 'plan_ready'
    | 'need_clarification'
    | 'step_update'
    | 'tool_start'
    | 'artifact_created'
    | 'waiting_resume'
    | 'finished'
    | 'error'
    | 'heartbeat'
    | string;
  text?: string;
  stepKey?: string;
  stepLabel?: string;
  intent?: string;
  route?: string;
  summary?: string;
  questions?: string[];
  data?: unknown;
  createdAt: number;
}

export interface AgentRunRequest {
  message?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  context?: unknown;
  preferences?: {
    allowWriteBack?: boolean;
    allowCreatePR?: boolean;
    allowAutoComment?: boolean;
  };
}

export interface AgentResumeRequest extends AgentRunRequest {
  confirmed?: boolean;
  answers?: Record<string, unknown>;
}

export interface AgentPageProps {
  initialRunId?: string | null;
  initialMessage?: string;
  initialContext?: unknown;
  initialPreferences?: {
    allowWriteBack?: boolean;
    allowCreatePR?: boolean;
    allowAutoComment?: boolean;
  };
  sessionId?: string;
}

export interface AgentPageState {
  runId: string | null;
  status: AgentRunStatus | 'idle';
  intent: AgentIntent | null;
  route: AgentRoute | null;
  currentStep: string | null;
  summary: string | null;
  finalSummary: string | null;
  questions: string[];
  answers: Record<string, unknown>;
  steps: AgentStep[];
  artifacts: AgentArtifact[];
  streamItems: AgentStreamItem[];
  errorMessage: string | null;
  isStreaming: boolean;
  isNeedInput: boolean;
  isWaitingConfirm: boolean;
  isResuming: boolean;
  inputValue: string;
  confirmPreferences: {
    allowWriteBack: boolean;
    allowCreatePR: boolean;
    allowAutoComment: boolean;
  };
}

export interface AgentHeaderProps {
  runId: string | null;
  status: AgentRunStatus | 'idle';
  intent: AgentIntent | null;
  route: AgentRoute | null;
  currentStep: string | null;
  summary: string | null;
  onCopyRunId?: () => void;
  onReset?: () => void;
}

export interface AgentTimelineProps {
  steps: AgentStep[];
  currentStep: string | null;
  onStepClick?: (stepKey: string) => void;
}

export interface AgentStepItemProps {
  step: AgentStep;
  isActive: boolean;
  isExpanded: boolean;
  onClick?: () => void;
}

export interface AgentStreamPanelProps {
  items: AgentStreamItem[];
  isStreaming: boolean;
  onRetry?: () => void;
}

export interface AgentStreamMessageProps {
  item: AgentStreamItem;
}

export interface AgentArtifactPanelProps {
  artifacts: AgentArtifact[];
  summary: string | null;
  finalSummary: string | null;
  branchName: string | null;
  commitMessage: string | null;
  pullRequestUrl: string | null;
  generatedDocument: string | null;
  generatedFix: string | null;
}

export interface AgentArtifactCardProps {
  title: string;
  content?: string | null;
  data?: unknown;
  url?: string | null;
  filePath?: string | null;
  onCopy?: () => void;
  onOpen?: () => void;
}

export interface AgentInputBarProps {
  status: AgentRunStatus | 'idle';
  mode: 'new' | 'clarify' | 'confirm' | 'resume' | 'disabled';
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export interface AgentClarificationCardProps {
  questions: string[];
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
}

export interface AgentConfirmCardProps {
  title: string;
  description?: string;
  summary?: string;
  allowWriteBack: boolean;
  allowCreatePR: boolean;
  allowAutoComment: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onToggleWriteBack?: (value: boolean) => void;
  onToggleCreatePR?: (value: boolean) => void;
  onToggleAutoComment?: (value: boolean) => void;
}

export interface AgentErrorCardProps {
  title?: string;
  message: string;
  detail?: unknown;
  onRetry?: () => void;
  onRecover?: () => void;
}

export interface AgentRunMetaPanelProps {
  runId: string | null;
  status: AgentRunStatus | 'idle';
  intent: AgentIntent | null;
  route: AgentRoute | null;
  target: {
    owner?: string | null;
    repo?: string | null;
    branch?: string | null;
    filePath?: string | null;
    pullNumber?: number | null;
    sha?: string | null;
  };
  latestCheckpointId?: string | null;
}

export interface AgentStepDetailDrawerProps {
  open: boolean;
  step: AgentStep | null;
  inputJson?: unknown;
  outputJson?: unknown;
  onClose: () => void;
}
