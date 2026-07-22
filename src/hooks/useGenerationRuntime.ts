import { message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BACKEND_API_BASE_URL } from '../constants';
import { consumeNdjsonStream } from '../services/ndjsonStream';
import {
  loadGenerationCache,
  removeGenerationHistoryItem,
  removeGenerationSnapshot,
  saveGenerationCache,
  upsertGenerationHistory,
  upsertGenerationSnapshot,
} from '../services/generationStore';
import type {
  GenerationHistoryItem,
  GenerationModuleKey,
  GenerationRunArtifact,
  GenerationRunListItem,
  GenerationRunEvent,
  GenerationRunSnapshot,
  GenerationRunStep,
  GenerationRunStatus,
} from '../types/generation';

interface GenerationRuntimeConfig<TPayload> {
  moduleKey: GenerationModuleKey;
  routeBase: string;
  stepTemplates: Array<Pick<
    GenerationRunStep,
    'stepKey' | 'stepLabel' | 'stepIndex' | 'stepTotal'
  >>;
  summarizePayload: (payload: TPayload) => string;
  startRun: (payload: TPayload, signal?: AbortSignal) => Promise<Response>;
  listRuns?: () => Promise<GenerationRunListItem[]>;
  getRun: (runId: string) => Promise<GenerationRunSnapshot>;
  getArtifactFile: (artifactId: string) => Promise<Blob>;
  deleteRun: (runId: string) => Promise<void>;
  cancelRun?: (runId: string) => Promise<void>;
}

interface GenerationRuntimeState {
  runId: string | null;
  status: GenerationRunStatus;
  currentStep: string | null;
  prompt: string;
  provider: string | null;
  model: string | null;
  providerJobId: string | null;
  progress: number | null;
  errorMessage: string | null;
  steps: GenerationRunStep[];
  artifacts: GenerationRunArtifact[];
  artifactPreviewUrls: Record<string, string>;
  warnings: string[];
  history: GenerationHistoryItem[];
  currentSnapshot: GenerationRunSnapshot | null;
  isStreaming: boolean;
  isRestoring: boolean;
  isDeleting: boolean;
}

interface UseGenerationRuntimeResult<TPayload> {
  state: GenerationRuntimeState;
  actions: {
    submitRun: (payload: TPayload) => Promise<void>;
    refreshRun: (runId?: string | null) => Promise<void>;
    deleteRun: (runId?: string | null) => Promise<void>;
    cancelRun: (runId?: string | null) => Promise<void>;
    retryRun: (runId?: string | null) => Promise<void>;
    retryLastRun: () => Promise<void>;
    resetCurrentRun: () => void;
    clearError: () => void;
  };
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

function buildArtifactFileUrl(moduleKey: GenerationModuleKey, artifactId: string) {
  const apiPath = moduleKey === 'image' ? '/image' : '/video';
  return `${BACKEND_API_BASE_URL}${apiPath}/artifacts/${artifactId}/file`;
}

function buildHistoryItemFromList(
  item: GenerationRunListItem,
  moduleKey: GenerationModuleKey,
): GenerationHistoryItem {
  const createdAt =
    typeof item.createdAt === 'string'
      ? item.createdAt
      : item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : new Date().toISOString();
  const updatedAt =
    typeof item.updatedAt === 'string'
      ? item.updatedAt
      : item.updatedAt instanceof Date
        ? item.updatedAt.toISOString()
        : createdAt;

  return {
    runId: item.runId,
    moduleKey,
    createdAt,
    updatedAt,
    status: normalizeRunStatus(String(item.status)),
    promptSummary: String(item.prompt ?? ''),
    artifactCount: typeof item.artifactCount === 'number' ? item.artifactCount : 0,
    title: undefined,
    provider: typeof item.provider === 'string' ? item.provider : undefined,
    model: typeof item.model === 'string' ? item.model : undefined,
    progress: typeof item.progress === 'number' ? item.progress : undefined,
  };
}

function mergeHistoryLists(
  primary: GenerationHistoryItem[],
  secondary: GenerationHistoryItem[],
) {
  const map = new Map<string, GenerationHistoryItem>();

  for (const item of secondary) {
    map.set(item.runId, item);
  }

  for (const item of primary) {
    map.set(item.runId, {
      ...(map.get(item.runId) ?? item),
      ...item,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function buildRequestFromSnapshot(
  raw: Record<string, any>,
  moduleKey: GenerationModuleKey,
) {
  if (moduleKey === 'image') {
    return {
      prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
      negativePrompt: typeof raw.negativePrompt === 'string' ? raw.negativePrompt : '',
      stylePreset: typeof raw.stylePreset === 'string' ? raw.stylePreset : '',
      aspectRatio: typeof raw.aspectRatio === 'string' ? raw.aspectRatio : '',
      sizePreset: typeof raw.sizePreset === 'string' ? raw.sizePreset : '',
      count: typeof raw.count === 'number' ? raw.count : 1,
    };
  }

  return {
    prompt: typeof raw.prompt === 'string' ? raw.prompt : '',
    negativePrompt: typeof raw.negativePrompt === 'string' ? raw.negativePrompt : '',
    stylePreset: typeof raw.stylePreset === 'string' ? raw.stylePreset : '',
    aspectRatio: typeof raw.aspectRatio === 'string' ? raw.aspectRatio : '',
    durationPreset: typeof raw.durationPreset === 'string' ? raw.durationPreset : '',
    resolutionPreset:
      typeof raw.resolutionPreset === 'string' ? raw.resolutionPreset : '',
    motionPreset: typeof raw.motionPreset === 'string' ? raw.motionPreset : '',
  };
}

function iso(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return undefined;
}

function createSeedSteps(
  templates: GenerationRuntimeConfig<never>['stepTemplates'],
): GenerationRunStep[] {
  return templates.map((step) => ({
    stepKey: step.stepKey,
    stepLabel: step.stepLabel,
    stepStatus: 'pending',
    stepIndex: step.stepIndex,
    stepTotal: step.stepTotal,
  }));
}

function mergeStepList(
  prev: GenerationRunStep[],
  nextStep: GenerationRunStep,
) {
  const map = new Map(prev.map((step) => [step.stepKey, step]));
  map.set(nextStep.stepKey, {
    ...map.get(nextStep.stepKey),
    ...nextStep,
  });
  return Array.from(map.values()).sort((a, b) => a.stepIndex - b.stepIndex);
}

function mergeArtifactList(
  prev: GenerationRunArtifact[],
  nextArtifact: GenerationRunArtifact,
) {
  const map = new Map(prev.map((artifact) => [artifact.artifactKey, artifact]));
  map.set(nextArtifact.artifactKey, {
    ...map.get(nextArtifact.artifactKey),
    ...nextArtifact,
  });
  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

function normalizeArtifact(
  event: GenerationRunEvent,
  moduleKey: GenerationModuleKey,
): GenerationRunArtifact | null {
  const data = event.data && typeof event.data === 'object'
    ? (event.data as Record<string, any>)
    : null;
  const source = data ?? event;
  const artifactKey = String(source.artifactKey ?? source.id ?? crypto.randomUUID());
  const fileUrl =
    source.fileUrl ||
    source.url ||
    buildArtifactFileUrl(moduleKey, String(source.id ?? artifactKey));

  return {
    id: String(source.id ?? artifactKey),
    artifactKey,
    fileUrl: String(fileUrl),
    fileName: typeof source.fileName === 'string' ? source.fileName : undefined,
    storageKey: typeof source.storageKey === 'string' ? source.storageKey : undefined,
    previewUrl: typeof source.previewUrl === 'string' ? source.previewUrl : undefined,
    mimeType: String(source.mimeType ?? 'application/octet-stream'),
    fileSize: typeof source.fileSize === 'number' ? source.fileSize : undefined,
    width: typeof source.width === 'number' ? source.width : undefined,
    height: typeof source.height === 'number' ? source.height : undefined,
    durationSeconds:
      typeof source.durationSeconds === 'number' ? source.durationSeconds : undefined,
    title: typeof source.title === 'string' ? source.title : undefined,
    createdAt:
      iso(source.createdAt) ??
      iso(source.timestamp) ??
      new Date().toISOString(),
    text: typeof source.text === 'string' ? source.text : undefined,
    providerAssetId:
      typeof source.providerAssetId === 'string' ? source.providerAssetId : undefined,
    artifactType:
      typeof source.artifactType === 'string' ? source.artifactType : undefined,
  };
}

function normalizeArtifactList(
  value: unknown,
  moduleKey: GenerationModuleKey,
): GenerationRunArtifact[] {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, any>).artifacts)
      ? (value as Record<string, any>).artifacts
      : value && typeof value === 'object'
        ? [value]
        : [];

  return items
    .map((item: unknown, index: number) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, any>;
      const fileUrl =
        raw.fileUrl ||
        raw.url ||
        raw.previewUrl ||
        buildArtifactFileUrl(
          moduleKey,
          String(raw.id ?? raw.artifactKey ?? `artifact-${index}`),
        );

      const artifactKey = String(raw.artifactKey ?? raw.id ?? `artifact-${index}`);
      return {
        id: String(raw.id ?? artifactKey),
        artifactKey,
        fileUrl: String(fileUrl),
        fileName: typeof raw.fileName === 'string' ? raw.fileName : undefined,
        storageKey: typeof raw.storageKey === 'string' ? raw.storageKey : undefined,
        previewUrl: typeof raw.previewUrl === 'string' ? raw.previewUrl : undefined,
        mimeType: String(raw.mimeType ?? 'application/octet-stream'),
        fileSize: typeof raw.fileSize === 'number' ? raw.fileSize : undefined,
        width: typeof raw.width === 'number' ? raw.width : undefined,
        height: typeof raw.height === 'number' ? raw.height : undefined,
        durationSeconds:
          typeof raw.durationSeconds === 'number' ? raw.durationSeconds : undefined,
        title: typeof raw.title === 'string' ? raw.title : undefined,
        createdAt: iso(raw.createdAt) ?? new Date().toISOString(),
        text: typeof raw.text === 'string' ? raw.text : undefined,
        providerAssetId:
          typeof raw.providerAssetId === 'string' ? raw.providerAssetId : undefined,
        artifactType:
          typeof raw.artifactType === 'string' ? raw.artifactType : undefined,
      } satisfies GenerationRunArtifact;
    })
    .filter(Boolean)
    .map((item: GenerationRunArtifact | null) => item as GenerationRunArtifact);
}

function normalizeStep(event: GenerationRunEvent): GenerationRunStep | null {
  if (!event.stepKey) return null;
  return {
    stepKey: String(event.stepKey),
    stepLabel: String(event.stepLabel ?? event.stepKey),
    stepStatus: normalizeStepStatus(String(event.stepStatus ?? 'pending')),
    stepIndex: typeof event.stepIndex === 'number' ? event.stepIndex : 0,
    stepTotal: typeof event.stepTotal === 'number' ? event.stepTotal : 0,
    durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
    message: typeof event.message === 'string' ? event.message : undefined,
    startedAt: iso(event.startedAt),
    finishedAt: iso(event.finishedAt),
  };
}

function normalizeSnapshot(
  raw: Partial<GenerationRunSnapshot> & { runId: string },
  moduleKey: GenerationModuleKey,
): GenerationRunSnapshot {
  const rawRecord = raw as Record<string, any>;
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((step, index) => ({
          stepKey: String(step.stepKey ?? `step-${index}`),
          stepLabel: String(step.stepLabel ?? step.stepKey ?? `步骤 ${index + 1}`),
          stepStatus: normalizeStepStatus(String(step.stepStatus ?? 'pending')),
          stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : index,
          stepTotal:
            typeof step.stepTotal === 'number' ? step.stepTotal : raw.steps!.length,
          durationMs: typeof step.durationMs === 'number' ? step.durationMs : undefined,
          message: typeof step.message === 'string' ? step.message : undefined,
          startedAt: iso(step.startedAt),
          finishedAt: iso(step.finishedAt),
        }))
        .sort((a, b) => a.stepIndex - b.stepIndex)
    : [];

  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((artifact, index) => {
          const fileUrl =
            artifact.fileUrl ||
            buildArtifactFileUrl(moduleKey, String(artifact.id ?? artifact.artifactKey ?? `artifact-${index}`));
          if (!fileUrl) return null;
          const artifactKey = String(
            artifact.artifactKey ?? artifact.id ?? `artifact-${index}`,
          );
          return {
            id: String(artifact.id ?? artifactKey),
            artifactKey,
            fileUrl: String(fileUrl),
            fileName: typeof artifact.fileName === 'string' ? artifact.fileName : undefined,
            storageKey: typeof artifact.storageKey === 'string' ? artifact.storageKey : undefined,
            previewUrl:
              typeof artifact.previewUrl === 'string' ? artifact.previewUrl : undefined,
            mimeType: String(artifact.mimeType ?? 'application/octet-stream'),
            fileSize:
              typeof artifact.fileSize === 'number' ? artifact.fileSize : undefined,
            width: typeof artifact.width === 'number' ? artifact.width : undefined,
            height: typeof artifact.height === 'number' ? artifact.height : undefined,
            durationSeconds:
              typeof artifact.durationSeconds === 'number'
                ? artifact.durationSeconds
                : undefined,
            title: typeof artifact.title === 'string' ? artifact.title : undefined,
            createdAt: iso(artifact.createdAt) ?? new Date().toISOString(),
            text: typeof artifact.text === 'string' ? artifact.text : undefined,
            providerAssetId:
              typeof artifact.providerAssetId === 'string'
                ? artifact.providerAssetId
                : undefined,
            artifactType:
              typeof artifact.artifactType === 'string'
                ? artifact.artifactType
                : undefined,
          } satisfies GenerationRunArtifact;
        })
        .filter(Boolean)
        .map((item) => item as GenerationRunArtifact)
    : [];

  return {
    runId: String(raw.runId),
    status: normalizeRunStatus(raw.status),
    currentStep: typeof raw.currentStep === 'string' ? raw.currentStep : undefined,
    prompt: String(raw.prompt ?? ''),
    request:
      raw.request !== undefined
        ? raw.request
        : buildRequestFromSnapshot(rawRecord, moduleKey),
    negativePrompt:
      typeof raw.negativePrompt === 'string' ? raw.negativePrompt : undefined,
    stylePreset: typeof raw.stylePreset === 'string' ? raw.stylePreset : undefined,
    aspectRatio: typeof raw.aspectRatio === 'string' ? raw.aspectRatio : undefined,
    sizePreset: typeof raw.sizePreset === 'string' ? raw.sizePreset : undefined,
    count: typeof raw.count === 'number' ? raw.count : undefined,
    durationPreset:
      typeof raw.durationPreset === 'string' ? raw.durationPreset : undefined,
    resolutionPreset:
      typeof raw.resolutionPreset === 'string' ? raw.resolutionPreset : undefined,
    motionPreset: typeof raw.motionPreset === 'string' ? raw.motionPreset : undefined,
    provider: typeof raw.provider === 'string' ? raw.provider : undefined,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    providerJobId:
      typeof raw.providerJobId === 'string' ? raw.providerJobId : null,
    progress: typeof raw.progress === 'number' ? raw.progress : undefined,
    errorMessage:
      typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined,
    steps,
    artifacts,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.map((warning) => String(warning))
      : undefined,
    createdAt: iso(raw.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(raw.updatedAt) ?? new Date().toISOString(),
    title: typeof raw.title === 'string' ? raw.title : undefined,
    moduleKey,
  };
}

function buildHistoryItem(
  snapshot: GenerationRunSnapshot,
  moduleKey: GenerationModuleKey,
  promptSummary: string,
): GenerationHistoryItem {
  return {
    runId: snapshot.runId,
    moduleKey,
    createdAt: snapshot.createdAt ?? new Date().toISOString(),
    updatedAt: snapshot.updatedAt ?? snapshot.createdAt ?? new Date().toISOString(),
    status: snapshot.status,
    promptSummary,
    artifactCount: snapshot.artifacts.length,
    title: snapshot.title,
    provider: snapshot.provider,
    model: snapshot.model,
    progress: snapshot.progress,
  };
}

export function useGenerationRuntime<TPayload>(
  config: GenerationRuntimeConfig<TPayload>,
): UseGenerationRuntimeResult<TPayload> {
  const navigate = useNavigate();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const cache = useMemo(() => loadGenerationCache(config.moduleKey), [config.moduleKey]);

  const [runId, setRunId] = useState<string | null>(
    routeRunId ?? cache.activeRunId ?? null,
  );
  const [status, setStatus] = useState<GenerationRunStatus>('idle');
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [providerJobId, setProviderJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationRunStep[]>([]);
  const [artifacts, setArtifacts] = useState<GenerationRunArtifact[]>([]);
  const [artifactPreviewUrls, setArtifactPreviewUrls] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [history, setHistory] = useState<GenerationHistoryItem[]>(cache.history);
  const [snapshots, setSnapshots] = useState<Record<string, GenerationRunSnapshot>>(
    cache.snapshots,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const hydratedRunIdRef = useRef<string | null>(null);
  const lastPayloadRef = useRef<TPayload | null>(null);
  const currentSnapshotRef = useRef<GenerationRunSnapshot | null>(null);
  const artifactPreviewUrlsRef = useRef<Record<string, string>>({});

  const orderedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [history],
  );

  const currentSnapshot = useMemo(() => {
    if (runId && snapshots[runId]) {
      return snapshots[runId];
    }
    return currentSnapshotRef.current;
  }, [runId, snapshots]);

  useEffect(() => {
    saveGenerationCache(config.moduleKey, {
      history,
      snapshots,
      activeRunId: runId,
    });
  }, [config.moduleKey, history, runId, snapshots]);

  useEffect(() => {
    if (!config.listRuns) return;
    let cancelled = false;

    void config
      .listRuns()
      .then((items) => {
        if (cancelled) return;
        const serverHistory = items.map((item) =>
          buildHistoryItemFromList(item, config.moduleKey),
        );
        setHistory((prev) => mergeHistoryLists(serverHistory, prev));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [config.listRuns, config.moduleKey]);

  useEffect(() => {
    if (status !== 'succeeded') return;

    const previewMap = artifactPreviewUrlsRef.current;
    const nextKeys = new Set(artifacts.map((artifact) => artifact.artifactKey));
    let changed = false;

      for (const [artifactKey, previewUrl] of Object.entries(previewMap)) {
        if (nextKeys.has(artifactKey)) continue;
        if (previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
      delete previewMap[artifactKey];
      changed = true;
    }

    const missingArtifacts = artifacts.filter((artifact) => !previewMap[artifact.artifactKey]);
    if (missingArtifacts.length === 0) {
      if (changed) {
        setArtifactPreviewUrls({ ...previewMap });
      }
      return;
    }

    let cancelled = false;
    const fetchedUrls: string[] = [];

    void Promise.all(
      missingArtifacts.map(async (artifact) => {
        try {
          const blob = await config.getArtifactFile(artifact.id);
          const objectUrl = URL.createObjectURL(blob);
          fetchedUrls.push(objectUrl);
          return {
            artifactKey: artifact.artifactKey,
            url: objectUrl,
          };
        } catch {
          return null;
        }
      }),
    ).then((resolved) => {
      if (cancelled) {
        for (const url of fetchedUrls) {
          URL.revokeObjectURL(url);
        }
        return;
      }

      let didUpdate = false;
      for (const item of resolved) {
        if (!item) continue;
        if (!previewMap[item.artifactKey]) {
          previewMap[item.artifactKey] = item.url;
          didUpdate = true;
        } else if (
          item.url.startsWith('blob:') &&
          item.url !== previewMap[item.artifactKey]
        ) {
          URL.revokeObjectURL(item.url);
        }
      }

      if (didUpdate || changed) {
        const nextMap = { ...previewMap };
        artifactPreviewUrlsRef.current = nextMap;
        setArtifactPreviewUrls(nextMap);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [artifacts, config.getArtifactFile, status]);

  useEffect(
    () => () => {
      for (const previewUrl of Object.values(artifactPreviewUrlsRef.current)) {
        if (previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(previewUrl);
        }
      }
      artifactPreviewUrlsRef.current = {};
    },
    [],
  );

  const commitSnapshot = useCallback(
    (snapshot: GenerationRunSnapshot, promptSummary: string) => {
      currentSnapshotRef.current = snapshot;
      setRunId(snapshot.runId);
      setStatus(snapshot.status);
      setCurrentStep(snapshot.currentStep ?? null);
      setPrompt(snapshot.prompt);
      setProvider(snapshot.provider ?? null);
      setModel(snapshot.model ?? null);
      setProviderJobId(snapshot.providerJobId ?? null);
      setProgress(typeof snapshot.progress === 'number' ? snapshot.progress : null);
      setErrorMessage(snapshot.errorMessage ?? null);
      setSteps(snapshot.steps);
      setArtifacts(snapshot.artifacts);
      setWarnings(snapshot.warnings ?? []);
      setSnapshots((prev) => upsertGenerationSnapshot(prev, snapshot));
      setHistory((prev) =>
        upsertGenerationHistory(
          prev,
          buildHistoryItem(snapshot, config.moduleKey, promptSummary),
        ),
      );
    },
    [config.moduleKey],
  );

  const seedSnapshot = useCallback(
    (nextRunId: string, payload: TPayload) => {
      const promptSummary = config.summarizePayload(payload);
      const now = new Date().toISOString();
      const snapshot = normalizeSnapshot(
        {
          runId: nextRunId,
          status: 'queued',
          currentStep: config.stepTemplates[0]?.stepKey,
          prompt: promptSummary,
          request: payload,
          steps: createSeedSteps(config.stepTemplates),
          artifacts: [],
          warnings: [],
          createdAt: now,
          updatedAt: now,
          title: promptSummary,
          moduleKey: config.moduleKey,
        },
        config.moduleKey,
      );
      commitSnapshot(snapshot, promptSummary);
      hydratedRunIdRef.current = nextRunId;
      navigate(`${config.routeBase}/${nextRunId}`, { replace: true });
    },
    [commitSnapshot, config, navigate],
  );

  const handleEvent = useCallback(
    (event: GenerationRunEvent) => {
      const eventRunId = String(event.runId ?? runId ?? '');
      if (!eventRunId) return;

      const eventData =
        event.data && typeof event.data === 'object'
          ? (event.data as Record<string, any>)
          : null;
      const promptSummary = config.summarizePayload(
        lastPayloadRef.current as TPayload,
      );
      const base =
        currentSnapshotRef.current?.runId === eventRunId
          ? currentSnapshotRef.current
          : snapshots[eventRunId] ?? null;

      const mergedSteps = base?.steps ? base.steps.slice() : [];
      const mergedArtifacts = base?.artifacts ? base.artifacts.slice() : [];
      const nextProvider =
        typeof event.provider === 'string'
          ? event.provider
          : typeof eventData?.provider === 'string'
            ? eventData.provider
            : base?.provider;
      const nextModel =
        typeof event.model === 'string'
          ? event.model
          : typeof eventData?.model === 'string'
            ? eventData.model
            : base?.model;
      const nextProviderJobId =
        typeof event.providerJobId === 'string'
          ? event.providerJobId
          : typeof eventData?.providerJobId === 'string'
            ? eventData.providerJobId
            : base?.providerJobId;
      const nextProgress =
        typeof event.progress === 'number'
          ? event.progress
          : typeof eventData?.progress === 'number'
            ? eventData.progress
            : base?.progress;

      if (event.type === 'meta' || event.type === 'run_created') {
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status: normalizeRunStatus(
              String(event.status ?? eventData?.status ?? base?.status ?? 'running'),
            ),
            currentStep:
              typeof event.currentStep === 'string'
                ? event.currentStep
                : typeof eventData?.currentStep === 'string'
                  ? eventData.currentStep
                  : base?.currentStep,
            prompt:
              typeof event.prompt === 'string'
                ? event.prompt
                : typeof eventData?.prompt === 'string'
                  ? eventData.prompt
                  : base?.prompt ?? promptSummary,
            request:
              eventData?.request !== undefined
                ? eventData.request
                : base?.request ?? lastPayloadRef.current ?? null,
            errorMessage:
              typeof event.error === 'string'
                ? event.error
                : typeof eventData?.errorMessage === 'string'
                  ? eventData.errorMessage
                  : base?.errorMessage,
            steps: Array.isArray(eventData?.steps)
              ? eventData.steps
              : mergedSteps,
            artifacts: Array.isArray(eventData?.artifacts)
              ? eventData.artifacts
              : mergedArtifacts,
            warnings: Array.isArray(eventData?.warnings)
              ? eventData.warnings
              : base?.warnings ?? [],
            createdAt: iso(eventData?.createdAt) ?? base?.createdAt,
            updatedAt: iso(eventData?.updatedAt) ?? new Date().toISOString(),
            title:
              typeof eventData?.title === 'string'
                ? eventData.title
                : base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
        hydratedRunIdRef.current = eventRunId;
        navigate(`${config.routeBase}/${eventRunId}`, { replace: true });
        return;
      }

      if (event.type === 'step_update' || event.type === 'step') {
        const step = normalizeStep(event);
        if (!step) return;
        const nextSteps = mergeStepList(mergedSteps, step);
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status: normalizeRunStatus(
              String(event.status ?? base?.status ?? 'running'),
            ),
            currentStep: step.stepKey,
            prompt: base?.prompt ?? promptSummary,
            request: base?.request ?? lastPayloadRef.current ?? null,
            errorMessage: base?.errorMessage,
            steps: nextSteps,
            artifacts: mergedArtifacts,
            warnings: base?.warnings ?? [],
            createdAt: base?.createdAt,
            updatedAt: new Date().toISOString(),
            title: base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
        return;
      }

      if (event.type === 'artifact_created' || event.type === 'artifact') {
        const eventArtifacts = normalizeArtifactList(eventData ?? event.data, config.moduleKey);
        const artifact =
          eventArtifacts[0] ?? normalizeArtifact(event, config.moduleKey);
        if (!artifact && eventArtifacts.length === 0) return;
        const nextArtifacts = eventArtifacts.length > 0
          ? eventArtifacts
          : artifact
            ? mergeArtifactList(mergedArtifacts, artifact)
            : mergedArtifacts;
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status: normalizeRunStatus(
              String(event.status ?? base?.status ?? 'running'),
            ),
            currentStep: base?.currentStep,
            prompt: base?.prompt ?? promptSummary,
            request: base?.request ?? lastPayloadRef.current ?? null,
            errorMessage: base?.errorMessage,
            steps: mergedSteps,
            artifacts: nextArtifacts,
            warnings: base?.warnings ?? [],
            createdAt: base?.createdAt,
            updatedAt: new Date().toISOString(),
            title: base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
        return;
      }

      if (event.type === 'warning') {
        const warning = typeof event.warning === 'string' ? event.warning : event.text;
        if (warning) {
          setWarnings((prev) => [...prev.slice(-4), warning]);
        }
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status: normalizeRunStatus(
              String(event.status ?? base?.status ?? 'running'),
            ),
            currentStep: base?.currentStep,
            prompt: base?.prompt ?? promptSummary,
            request: base?.request ?? lastPayloadRef.current ?? null,
            errorMessage: base?.errorMessage,
            steps: mergedSteps,
            artifacts: mergedArtifacts,
            warnings: warning ? [...(base?.warnings ?? []), warning] : base?.warnings ?? [],
            createdAt: base?.createdAt,
            updatedAt: new Date().toISOString(),
            title: base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
        return;
      }

      if (event.type === 'error') {
        const errorText =
          typeof event.error === 'string'
            ? event.error
            : event.error && typeof event.error === 'object'
              ? event.error.message
              : undefined;
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status: 'failed',
            currentStep: base?.currentStep,
            prompt: base?.prompt ?? promptSummary,
            request: base?.request ?? lastPayloadRef.current ?? null,
            errorMessage: errorText || event.text || '任务执行失败',
            steps: mergedSteps,
            artifacts: mergedArtifacts,
            warnings: base?.warnings ?? [],
            createdAt: base?.createdAt,
            updatedAt: new Date().toISOString(),
            title: base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
        return;
      }

      if (event.type === 'finished' || event.done) {
        const eventArtifacts = normalizeArtifactList(eventData ?? event.data, config.moduleKey);
        const nextStepKey =
          config.stepTemplates[config.stepTemplates.length - 1]?.stepKey ??
          base?.currentStep;
        const nextSnapshot = normalizeSnapshot(
          {
            runId: eventRunId,
            status:
              base?.status === 'failed' || base?.status === 'cancelled' || base?.status === 'rejected'
                ? base.status
                : 'succeeded',
            currentStep: nextStepKey,
            prompt: base?.prompt ?? promptSummary,
            request: base?.request ?? lastPayloadRef.current ?? null,
            errorMessage: base?.errorMessage,
            steps: mergedSteps,
            artifacts: eventArtifacts.length > 0 ? eventArtifacts : mergedArtifacts,
            warnings: base?.warnings ?? [],
            createdAt: base?.createdAt,
            updatedAt: new Date().toISOString(),
            title: base?.title ?? promptSummary,
            provider: nextProvider ?? undefined,
            model: nextModel ?? undefined,
            providerJobId: nextProviderJobId ?? null,
            progress: typeof nextProgress === 'number' ? nextProgress : undefined,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        commitSnapshot(nextSnapshot, promptSummary);
      }
    },
    [commitSnapshot, config, navigate, runId, snapshots],
  );

  const restoreRun = useCallback(
    async (targetRunId: string) => {
      setIsRestoring(true);
      try {
        const snapshot = await config.getRun(targetRunId);
        const normalized = normalizeSnapshot(
          {
            ...snapshot,
            runId: targetRunId,
            moduleKey: config.moduleKey,
          },
          config.moduleKey,
        );
        const promptSummary = normalized.prompt || normalized.title || targetRunId;
        commitSnapshot(normalized, promptSummary);
        hydratedRunIdRef.current = targetRunId;
        return normalized;
      } catch (error: any) {
        setStatus('failed');
        setErrorMessage(error?.message || '任务恢复失败');
        return null;
      } finally {
        setIsRestoring(false);
      }
    },
    [commitSnapshot, config],
  );

  const submitRun = useCallback(
    async (payload: TPayload) => {
      const promptSummary = config.summarizePayload(payload);
      if (!promptSummary.trim()) {
        message.warning('请先输入任务内容');
        return;
      }

      lastPayloadRef.current = payload;
      setErrorMessage(null);
      setWarnings([]);
      setIsStreaming(true);
      setStatus('queued');
      setCurrentStep(config.stepTemplates[0]?.stepKey ?? null);
      setSteps(createSeedSteps(config.stepTemplates));
      setArtifacts([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await config.startRun(payload, controller.signal);
        const headerRunId =
          response.headers.get('X-Run-Id') ||
          response.headers.get('x-run-id') ||
          null;

      if (headerRunId && headerRunId !== hydratedRunIdRef.current) {
        seedSnapshot(headerRunId, payload);
      }

        await consumeNdjsonStream<GenerationRunEvent>(response, {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'heartbeat') return;
            handleEvent(event);
          },
          onDone: () => {
            setIsStreaming(false);
            abortRef.current = null;
          },
          onRawLineError: (line, error) => {
            console.warn('Invalid NDJSON line:', line, error);
          },
        });
      } catch (error: any) {
        if (controller.signal.aborted) {
          setStatus('cancelled');
          setErrorMessage('任务已取消');
          return;
        }
        setStatus('failed');
        setErrorMessage(error?.message || '任务启动失败');
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [config, handleEvent, seedSnapshot],
  );

  const refreshRun = useCallback(
    async (targetRunId?: string | null) => {
      const nextRunId = targetRunId ?? runId;
      if (!nextRunId) return;
      await restoreRun(nextRunId);
    },
    [restoreRun, runId],
  );

  const deleteRun = useCallback(
    async (targetRunId?: string | null) => {
      const nextRunId = targetRunId ?? runId;
      if (!nextRunId) return;

      setIsDeleting(true);
      try {
        await config.deleteRun(nextRunId);
        setHistory((prev) => removeGenerationHistoryItem(prev, nextRunId));
        setSnapshots((prev) => removeGenerationSnapshot(prev, nextRunId));
        if (nextRunId === runId) {
          currentSnapshotRef.current = null;
          hydratedRunIdRef.current = null;
          setRunId(null);
          setStatus('idle');
          setCurrentStep(null);
          setPrompt('');
          setErrorMessage(null);
          setSteps([]);
          setArtifacts([]);
          setWarnings([]);
          navigate(config.routeBase, { replace: true });
        }
      } catch (error: any) {
        setErrorMessage(error?.message || '删除任务失败');
      } finally {
        setIsDeleting(false);
      }
    },
    [config, navigate, runId],
  );

  const cancelRun = useCallback(
    async (targetRunId?: string | null) => {
      const nextRunId = targetRunId ?? runId;
      if (!nextRunId || !config.cancelRun) return;

      setIsDeleting(true);
      try {
        await config.cancelRun(nextRunId);
        await refreshRun(nextRunId);
      } catch (error: any) {
        setErrorMessage(error?.message || '取消任务失败');
      } finally {
        setIsDeleting(false);
      }
    },
    [config, refreshRun, runId],
  );

  const retryLastRun = useCallback(async () => {
    if (!lastPayloadRef.current) return;
    await submitRun(lastPayloadRef.current);
  }, [submitRun]);

  const retryRun = useCallback(
    async (targetRunId?: string | null) => {
      const nextRunId = targetRunId ?? runId;
      if (!nextRunId) {
        await retryLastRun();
        return;
      }

      const snapshot = snapshots[nextRunId] ?? currentSnapshotRef.current;
      const request = snapshot?.request as TPayload | undefined;
      if (!request) {
        await refreshRun(nextRunId);
        return;
      }
      await submitRun(request);
    },
    [refreshRun, retryLastRun, runId, snapshots, submitRun],
  );

  const resetCurrentRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    currentSnapshotRef.current = null;
    hydratedRunIdRef.current = null;
    setRunId(null);
    setStatus('idle');
    setCurrentStep(null);
    setPrompt('');
    setErrorMessage(null);
    setSteps([]);
    setArtifacts([]);
    setWarnings([]);
    navigate(config.routeBase, { replace: true });
  }, [config.routeBase, navigate]);

  useEffect(() => {
    if (!routeRunId) return;
    if (hydratedRunIdRef.current === routeRunId) return;
    void refreshRun(routeRunId);
  }, [refreshRun, routeRunId]);

  useEffect(() => {
    if (routeRunId || !runId) return;
    if (hydratedRunIdRef.current === runId) return;
    void refreshRun(runId);
  }, [refreshRun, runId, routeRunId]);

  useEffect(() => {
    if (!runId) return;

    if (!['queued', 'running'].includes(status)) return;

    const intervalMs = 6000;
    const timer = window.setInterval(() => {
      void refreshRun(runId).catch(() => undefined);
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshRun, runId, status]);

  return {
    state: {
      runId,
      status,
      currentStep,
      prompt,
      provider,
      model,
      providerJobId,
      progress,
      errorMessage,
      steps,
      artifacts,
      artifactPreviewUrls,
      warnings,
      history: orderedHistory,
      currentSnapshot,
      isStreaming,
      isRestoring,
      isDeleting,
    },
    actions: {
      submitRun,
      refreshRun,
      deleteRun,
      cancelRun,
      retryRun,
      retryLastRun,
      resetCurrentRun,
      clearError: () => setErrorMessage(null),
    },
  };
}
