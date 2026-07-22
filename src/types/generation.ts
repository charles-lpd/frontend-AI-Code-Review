export type GenerationModuleKey = 'image' | 'video';

export type GenerationRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type GenerationStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'waiting'
  | 'skipped';

export interface GenerationRunStep {
  stepKey: string;
  stepLabel: string;
  stepStatus: GenerationStepStatus;
  stepIndex: number;
  stepTotal: number;
  durationMs?: number;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface GenerationRunArtifact {
  id: string;
  artifactKey: string;
  fileUrl: string;
  fileName?: string;
  storageKey?: string;
  previewUrl?: string;
  mimeType: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  title?: string;
  createdAt?: string;
  text?: string;
  providerAssetId?: string;
  artifactType?: 'image' | 'video' | string;
}

export interface GenerationRunSnapshot {
  runId: string;
  status: GenerationRunStatus;
  currentStep?: string;
  prompt: string;
  request?: unknown;
  negativePrompt?: string;
  stylePreset?: string;
  aspectRatio?: string;
  sizePreset?: string;
  count?: number;
  durationPreset?: string;
  resolutionPreset?: string;
  motionPreset?: string;
  provider?: string;
  model?: string;
  providerJobId?: string | null;
  progress?: number;
  errorMessage?: string;
  steps: GenerationRunStep[];
  artifacts: GenerationRunArtifact[];
  warnings?: string[];
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  moduleKey?: GenerationModuleKey;
}

export interface GenerationRunSummary {
  runId: string;
  moduleKey: GenerationModuleKey;
  createdAt: string;
  updatedAt: string;
  status: GenerationRunStatus;
  promptSummary: string;
  artifactCount: number;
  durationMs?: number;
  title?: string;
  provider?: string;
  model?: string;
  progress?: number;
}

export interface GenerationRunListItem {
  runId: string;
  status: GenerationRunStatus | string;
  currentStep?: string | null;
  prompt: string;
  negativePrompt?: string | null;
  stylePreset?: string | null;
  aspectRatio?: string | null;
  sizePreset?: string | null;
  count?: number | null;
  durationPreset?: string | null;
  resolutionPreset?: string | null;
  motionPreset?: string | null;
  provider?: string | null;
  model?: string | null;
  providerJobId?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  artifactCount?: number;
}

export interface GenerationRunEvent {
  type?: string;
  runId?: string;
  status?: GenerationRunStatus | string;
  currentStep?: string;
  prompt?: string;
  text?: string;
  warning?: string;
  error?: string | { message?: string };
  provider?: string;
  model?: string;
  providerJobId?: string | null;
  progress?: number;
  stepKey?: string;
  stepLabel?: string;
  stepStatus?: GenerationStepStatus | string;
  stepIndex?: number;
  stepTotal?: number;
  durationMs?: number;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  artifactKey?: string;
  artifactType?: 'image' | 'video' | string;
  fileUrl?: string;
  previewUrl?: string;
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  title?: string;
  data?: unknown;
  done?: boolean;
  ts?: number;
  [key: string]: unknown;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  stylePreset?: string;
  aspectRatio?: string;
  sizePreset?: string;
  count: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  stylePreset?: string;
  aspectRatio?: string;
  durationPreset?: string;
  resolutionPreset?: string;
  motionPreset?: string;
}

export interface GenerationHistoryItem {
  runId: string;
  moduleKey: GenerationModuleKey;
  createdAt: string;
  updatedAt: string;
  status: GenerationRunStatus;
  promptSummary: string;
  artifactCount: number;
  durationMs?: number;
  title?: string;
  provider?: string;
  model?: string;
  progress?: number;
}
