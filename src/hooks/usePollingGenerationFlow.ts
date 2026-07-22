import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GenerationRunArtifact,
  GenerationRunSnapshot,
  GenerationRunStatus,
  GenerationRunStep,
} from '../types/generation';

const POLL_INTERVAL_MS = 3000;

type GenerationPromptPayload = {
  prompt: string;
};

interface PollingGenerationFlowConfig<TPayload extends GenerationPromptPayload> {
  preset: Omit<TPayload, 'prompt'>;
  stepTemplates: Array<Pick<
    GenerationRunStep,
    'stepKey' | 'stepLabel' | 'stepIndex' | 'stepTotal'
  >>;
  startRun: (payload: TPayload) => Promise<Response>;
  getRun: (runId: string) => Promise<GenerationRunSnapshot>;
  getArtifactFile: (artifactId: string) => Promise<Blob>;
  defaultArtifactMimeType: string;
  startErrorMessage: string;
  pollErrorMessage: string;
}

function normalizeRunStatus(status?: string): GenerationRunStatus {
  switch (status) {
    case 'queued':
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled':
    case 'rejected':
      return status;
    case 'completed':
    case 'success':
    case 'done':
    case 'finished':
      return 'succeeded';
    default:
      return 'idle';
  }
}

function normalizeStepStatus(status?: string): GenerationRunStep['stepStatus'] {
  switch (status) {
    case 'running':
    case 'completed':
    case 'failed':
    case 'waiting':
    case 'skipped':
      return status;
    case 'done':
    case 'success':
      return 'completed';
    default:
      return 'pending';
  }
}

function normalizeSnapshot(
  raw: GenerationRunSnapshot,
  defaultArtifactMimeType: string,
): GenerationRunSnapshot {
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((step, index) => ({
          stepKey: String(step.stepKey ?? `step-${index + 1}`),
          stepLabel: String(step.stepLabel ?? step.stepKey ?? `步骤 ${index + 1}`),
          stepStatus: normalizeStepStatus(String(step.stepStatus ?? 'pending')),
          stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : index + 1,
          stepTotal:
            typeof step.stepTotal === 'number' ? step.stepTotal : raw.steps.length,
          durationMs:
            typeof step.durationMs === 'number' ? step.durationMs : undefined,
          message: typeof step.message === 'string' ? step.message : undefined,
          startedAt: typeof step.startedAt === 'string' ? step.startedAt : undefined,
          finishedAt: typeof step.finishedAt === 'string' ? step.finishedAt : undefined,
        }))
        .sort((a, b) => a.stepIndex - b.stepIndex)
    : [];

  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts.map((artifact, index) => {
        const artifactKey = String(artifact.artifactKey ?? artifact.id ?? `artifact_${index + 1}`);
        return {
          id: String(artifact.id ?? artifactKey),
          artifactKey,
          fileUrl: String(artifact.fileUrl ?? ''),
          fileName:
            typeof artifact.fileName === 'string' ? artifact.fileName : undefined,
          storageKey:
            typeof artifact.storageKey === 'string' ? artifact.storageKey : undefined,
          previewUrl:
            typeof artifact.previewUrl === 'string' ? artifact.previewUrl : undefined,
          mimeType: String(artifact.mimeType ?? defaultArtifactMimeType),
          fileSize:
            typeof artifact.fileSize === 'number' ? artifact.fileSize : undefined,
          width: typeof artifact.width === 'number' ? artifact.width : undefined,
          height: typeof artifact.height === 'number' ? artifact.height : undefined,
          durationSeconds:
            typeof artifact.durationSeconds === 'number'
              ? artifact.durationSeconds
              : undefined,
          title: typeof artifact.title === 'string' ? artifact.title : undefined,
          createdAt:
            typeof artifact.createdAt === 'string' ? artifact.createdAt : undefined,
          artifactType:
            typeof artifact.artifactType === 'string' ? artifact.artifactType : undefined,
        };
      })
    : [];

  return {
    ...raw,
    status: normalizeRunStatus(String(raw.status)),
    currentStep: typeof raw.currentStep === 'string' ? raw.currentStep : undefined,
    steps,
    artifacts,
  };
}

function createSeedSteps(
  templates: PollingGenerationFlowConfig<GenerationPromptPayload>['stepTemplates'],
): GenerationRunStep[] {
  return templates.map((step) => ({
    ...step,
    stepStatus: 'pending',
  }));
}

function readRunIdFromNdjsonLine(line: string, fallbackErrorMessage: string) {
  const text = line.trim();
  if (!text) return null;

  let event: { type?: string; runId?: string; error?: string; text?: string };
  try {
    event = JSON.parse(text);
  } catch {
    return null;
  }

  if (event.type === 'error') {
    throw new Error(event.error || event.text || fallbackErrorMessage);
  }

  return typeof event.runId === 'string' && event.runId ? event.runId : null;
}

async function readRunIdAndDrain(
  response: Response,
  fallbackErrorMessage: string,
  onRunId: (runId: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('任务启动响应为空');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let hasRunId = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const runId = readRunIdFromNdjsonLine(line, fallbackErrorMessage);
      if (runId && !hasRunId) {
        hasRunId = true;
        onRunId(runId);
      }
    }
  }

  if (!hasRunId && buffer.trim()) {
    const runId = readRunIdFromNdjsonLine(buffer, fallbackErrorMessage);
    if (runId) onRunId(runId);
  }
}

function revokePreviewUrls(urls: Record<string, string>) {
  for (const url of Object.values(urls)) {
    URL.revokeObjectURL(url);
  }
}

export function usePollingGenerationFlow<TPayload extends GenerationPromptPayload>(
  config: PollingGenerationFlowConfig<TPayload>,
) {
  const [runId, setRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationRunStatus>('idle');
  const [currentSnapshot, setCurrentSnapshot] = useState<GenerationRunSnapshot | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationRunStep[]>([]);
  const [artifacts, setArtifacts] = useState<GenerationRunArtifact[]>([]);
  const [artifactPreviewUrls, setArtifactPreviewUrls] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const previewUrlsRef = useRef<Record<string, string>>({});
  const loadedArtifactIdsRef = useRef<Set<string>>(new Set());

  const isTaskActive = isStarting || isPolling || ['queued', 'running'].includes(status);
  const visibleArtifacts = useMemo(
    () => artifacts.filter((artifact) => Boolean(artifactPreviewUrls[artifact.artifactKey])),
    [artifactPreviewUrls, artifacts],
  );

  const clearError = useCallback(() => setErrorMessage(null), []);

  const resetRunState = useCallback(() => {
    revokePreviewUrls(previewUrlsRef.current);
    previewUrlsRef.current = {};
    loadedArtifactIdsRef.current.clear();
    setRunId(null);
    setStatus('queued');
    setCurrentSnapshot(null);
    setCurrentStep(config.stepTemplates[0]?.stepKey ?? null);
    setSteps(createSeedSteps(config.stepTemplates));
    setArtifacts([]);
    setArtifactPreviewUrls({});
    setErrorMessage(null);
  }, [config.stepTemplates]);

  const refreshRun = useCallback(async (nextRunId: string) => {
    const snapshot = normalizeSnapshot(
      await config.getRun(nextRunId),
      config.defaultArtifactMimeType,
    );
    setCurrentSnapshot(snapshot);
    setRunId(snapshot.runId);
    setStatus(snapshot.status);
    setCurrentStep(snapshot.currentStep ?? null);
    setSteps(snapshot.steps);
    setArtifacts(snapshot.artifacts);
    setErrorMessage(snapshot.errorMessage ?? null);
    return snapshot;
  }, [config]);

  const submit = useCallback(
    async (prompt: string) => {
      resetRunState();
      setIsStarting(true);

      try {
        const response = await config.startRun({
          ...config.preset,
          prompt,
        } as TPayload);

        void readRunIdAndDrain(response, config.startErrorMessage, (nextRunId) => {
          setRunId(nextRunId);
          void refreshRun(nextRunId).catch(() => undefined);
        }).catch((error: any) => {
          setErrorMessage(error?.message || config.startErrorMessage);
          setStatus('failed');
        });
      } catch (error: any) {
        setErrorMessage(error?.message || config.startErrorMessage);
        setStatus('failed');
      } finally {
        setIsStarting(false);
      }
    },
    [config, refreshRun, resetRunState],
  );

  useEffect(() => {
    if (!runId || !['queued', 'running'].includes(status)) return;

    let cancelled = false;
    setIsPolling(true);

    const poll = async () => {
      try {
        const snapshot = await refreshRun(runId);
        if (!cancelled && !['queued', 'running'].includes(snapshot.status)) {
          setIsPolling(false);
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorMessage(error?.message || config.pollErrorMessage);
          setStatus('failed');
          setIsPolling(false);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setIsPolling(false);
    };
  }, [config.pollErrorMessage, refreshRun, runId, status]);

  useEffect(() => {
    if (status !== 'succeeded' || artifacts.length === 0) return;

    let cancelled = false;

    const loadFiles = async () => {
      const results = await Promise.all(
        artifacts.map(async (artifact) => {
          if (loadedArtifactIdsRef.current.has(artifact.id)) return null;
          try {
            const blob = await config.getArtifactFile(artifact.id);
            return {
              artifact,
              url: URL.createObjectURL(blob),
            };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        for (const result of results) {
          if (result) URL.revokeObjectURL(result.url);
        }
        return;
      }

      const nextUrls = { ...previewUrlsRef.current };
      let changed = false;

      for (const result of results) {
        if (!result) continue;
        loadedArtifactIdsRef.current.add(result.artifact.id);
        nextUrls[result.artifact.artifactKey] = result.url;
        changed = true;
      }

      if (changed) {
        previewUrlsRef.current = nextUrls;
        setArtifactPreviewUrls(nextUrls);
      }
    };

    void loadFiles();

    return () => {
      cancelled = true;
    };
  }, [artifacts, config, status]);

  useEffect(
    () => () => {
      revokePreviewUrls(previewUrlsRef.current);
      previewUrlsRef.current = {};
      loadedArtifactIdsRef.current.clear();
    },
    [],
  );

  return {
    state: {
      runId,
      status,
      currentSnapshot,
      currentStep,
      steps,
      artifactPreviewUrls,
      visibleArtifacts,
      errorMessage,
      isTaskActive,
    },
    actions: {
      submit,
      clearError,
      refreshRun,
    },
  };
}
