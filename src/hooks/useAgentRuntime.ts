import { message } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getAgentRun, resumeAgentStream, runAgentStream } from '../api/agent';
import type {
  AgentArtifact,
  AgentIntent,
  AgentPageProps,
  AgentRoute,
  AgentRunEvent,
  AgentRunRequest,
  AgentRunSnapshot,
  AgentRunStatus,
  AgentStep,
  AgentStepStatus,
  AgentStreamItem,
} from '../types/agent';

const DEFAULT_PREFERENCES = {
  allowWriteBack: false,
  allowCreatePR: false,
  allowAutoComment: false,
};

function normalizeInitialContext(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeAgentStepStatus(status?: string): AgentStepStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'completed':
    case 'done':
      return 'completed';
    case 'waiting':
      return 'waiting';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return 'pending';
  }
}

function normalizeAgentRunStatus(status?: string): AgentRunStatus {
  switch (status) {
    case 'running':
    case 'waiting_input':
    case 'waiting_confirmation':
    case 'resuming':
    case 'completed':
    case 'failed':
      return status;
    default:
      return 'idle';
  }
}

function normalizeSteps(rawSteps: any[] | null | undefined): AgentStep[] {
  if (!Array.isArray(rawSteps)) return [];
  return rawSteps.map((step, index) => ({
    stepKey: String(step.stepKey ?? `step-${index}`),
    stepLabel: String(step.stepLabel ?? step.stepKey ?? `步骤 ${index + 1}`),
    stepStatus: normalizeAgentStepStatus(step.stepStatus),
    stepIndex: typeof step.stepIndex === 'number' ? step.stepIndex : index,
    stepTotal: typeof step.stepTotal === 'number' ? step.stepTotal : rawSteps.length,
    startedAt: typeof step.startedAt === 'string' ? step.startedAt : null,
    finishedAt: typeof step.finishedAt === 'string' ? step.finishedAt : null,
    durationMs: typeof step.durationMs === 'number' ? step.durationMs : null,
  }));
}

function mergeStepList(prev: AgentStep[], nextSteps: AgentStep[]) {
  const map = new Map(prev.map((step) => [step.stepKey, step]));
  nextSteps.forEach((step) => {
    map.set(step.stepKey, {
      ...map.get(step.stepKey),
      ...step,
    });
  });

  return Array.from(map.values()).sort((a, b) => a.stepIndex - b.stepIndex);
}

function upsertArtifact(prev: AgentArtifact[], artifact: AgentArtifact) {
  const index = prev.findIndex((item) => item.artifactKey === artifact.artifactKey);
  if (index < 0) return [...prev, artifact];
  const next = prev.slice();
  next[index] = { ...next[index], ...artifact };
  return next;
}

function buildAgentContext(
  pathname: string,
  search: string,
  runId: string | null,
  sessionId?: string | null,
) {
  return {
    pagePath: pathname,
    search,
    runId,
    sessionId,
    source: 'agent-page',
  };
}

function topStatusText(status: AgentRunStatus) {
  switch (status) {
    case 'running':
      return '正在分析并执行任务';
    case 'waiting_input':
      return '需要补充信息后继续';
    case 'waiting_confirmation':
      return '已生成草稿，等待确认继续';
    case 'resuming':
      return '正在恢复并继续执行';
    case 'completed':
      return '任务已完成';
    case 'failed':
      return '运行失败';
    default:
      return '等待你输入自然语言任务';
  }
}

export function useAgentRuntime(props: AgentPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { runId: routeRunId } = useParams<{ runId?: string }>();

  const initialRunId = props.initialRunId ?? routeRunId ?? null;
  const initialPreferences = {
    ...DEFAULT_PREFERENCES,
    ...props.initialPreferences,
  };

  const [prompt, setPrompt] = useState(props.initialMessage ?? '');
  const [reply, setReply] = useState('');
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [status, setStatus] = useState<AgentRunStatus>('idle');
  const [intent, setIntent] = useState<AgentIntent | null>(null);
  const [route, setRoute] = useState<AgentRoute | null>(null);
  const [target, setTarget] = useState<Record<string, unknown> | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryContext, setSummaryContext] = useState<string | null>(null);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);
  const [reviewPlan, setReviewPlan] = useState<Record<string, unknown> | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [contextJson, setContextJson] = useState<Record<string, unknown> | null>(
    () => normalizeInitialContext(props.initialContext),
  );
  const [preferences, setPreferences] = useState(initialPreferences);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [streamItems, setStreamItems] = useState<AgentStreamItem[]>([]);
  const [generatedFix, setGeneratedFix] = useState<string | null>(null);
  const [generatedDocument, setGeneratedDocument] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
  const [latestCheckpointId, setLatestCheckpointId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStepKey, setSelectedStepKey] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const hydratedRunIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentRunId = runId ?? routeRunId ?? null;
  const runSessionId = props.sessionId ?? null;

  const displayedStepKey = useMemo(
    () => selectedStepKey ?? currentStep,
    [currentStep, selectedStepKey],
  );

  const agentTarget = useMemo(
    () => ({
      owner: target?.owner as string | undefined,
      repo: target?.repo as string | undefined,
      branch: target?.branch as string | undefined,
      filePath: target?.filePath as string | undefined,
      pullNumber: target?.pullNumber as number | undefined,
      sha: target?.sha as string | undefined,
    }),
    [target],
  );

  const activeMode = useMemo<'new' | 'clarify' | 'confirm' | 'resume' | 'disabled'>(() => {
    if (status === 'waiting_input') return 'clarify';
    if (status === 'waiting_confirmation') return 'confirm';
    if (status === 'resuming' || status === 'running') return 'disabled';
    return 'new';
  }, [status]);

  const inputValue = useMemo(
    () => (status === 'waiting_input' || status === 'waiting_confirmation' ? reply : prompt),
    [prompt, reply, status],
  );

  const inputPlaceholder = useMemo(() => {
    if (status === 'waiting_input') return '请补充后继续...';
    if (status === 'waiting_confirmation') return '可选补充说明，然后点击继续执行';
    return '例如：帮我审查这个仓库，顺便生成 README 草稿';
  }, [status]);

  const topText = useMemo(() => topStatusText(status), [status]);

  const syncRunIdToUrl = useCallback(
    (nextRunId: string | null) => {
      if (nextRunId === routeRunId) return;
      if (nextRunId) {
        navigate(`/agent/${nextRunId}`, { replace: true });
      } else {
        navigate('/agent', { replace: true });
      }
    },
    [navigate, routeRunId],
  );

  const appendStreamItem = useCallback((item: AgentStreamItem) => {
    setStreamItems((prev) => [...prev.slice(-149), item]);
  }, []);

  const applySnapshot = useCallback(
    (snapshot: AgentRunSnapshot, options?: { silent?: boolean; replaceStream?: boolean }) => {
      setRunId(snapshot.runId);
      syncRunIdToUrl(snapshot.runId);
      setStatus(normalizeAgentRunStatus(snapshot.status));
      setIntent(snapshot.intent);
      setRoute(snapshot.route);
      setTarget(snapshot.target);
      setCurrentStep(snapshot.currentStep);
      setSummary(snapshot.summary);
      setSummaryContext(snapshot.summaryContext);
      setFinalSummary(snapshot.finalSummary);
      setReviewPlan(snapshot.reviewPlan);
      setQuestions(snapshot.questions ?? []);
      setAnswers(snapshot.answers ?? {});
      setContextJson(snapshot.contextJson ?? null);
      setPreferences({
        allowWriteBack:
          snapshot.preferencesJson?.allowWriteBack !== undefined
            ? Boolean(snapshot.preferencesJson.allowWriteBack)
            : DEFAULT_PREFERENCES.allowWriteBack,
        allowCreatePR:
          snapshot.preferencesJson?.allowCreatePR !== undefined
            ? Boolean(snapshot.preferencesJson.allowCreatePR)
            : DEFAULT_PREFERENCES.allowCreatePR,
        allowAutoComment:
          snapshot.preferencesJson?.allowAutoComment !== undefined
            ? Boolean(snapshot.preferencesJson.allowAutoComment)
            : DEFAULT_PREFERENCES.allowAutoComment,
      });
      setSteps(normalizeSteps(snapshot.steps));
      setArtifacts(Array.isArray(snapshot.artifacts) ? snapshot.artifacts : []);
      setGeneratedFix(snapshot.generatedFix);
      setGeneratedDocument(snapshot.generatedDocument);
      setBranchName(snapshot.branchName);
      setCommitMessage(snapshot.commitMessage);
      setPullRequestUrl(snapshot.pullRequestUrl);
      setLatestCheckpointId(snapshot.latestCheckpointId);
      setErrorMessage(snapshot.errorMessage);
      if (!options?.replaceStream) {
        setStreamItems((prev) =>
          prev.length > 0
            ? prev
            : [
                {
                  id: crypto.randomUUID(),
                  type: 'restore',
                  text: options?.silent ? undefined : '已恢复 Agent 运行快照。',
                  createdAt: Date.now(),
                },
              ],
        );
      }
      hydratedRunIdRef.current = snapshot.runId;
      if (snapshot.runId !== currentRunId) {
        setSelectedStepKey(null);
      }
      if (snapshot.steps?.length && !selectedStepKey) {
        setSelectedStepKey(snapshot.steps[0]?.stepKey ?? null);
      }
    },
    [currentRunId, selectedStepKey, syncRunIdToUrl],
  );

  const refreshSnapshot = useCallback(
    async (targetRunId: string) => {
      const snapshot = await getAgentRun(targetRunId);
      applySnapshot(snapshot, { replaceStream: true, silent: true });
      return snapshot;
    },
    [applySnapshot],
  );

  const refreshSnapshotWithRetry = useCallback(
    async (targetRunId: string) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const snapshot = await refreshSnapshot(targetRunId);
        const hasFinalOutputs =
          snapshot.status !== 'completed' ||
          Boolean(snapshot.finalSummary) ||
          Boolean(snapshot.generatedDocument) ||
          Boolean(snapshot.generatedFix) ||
          Boolean(snapshot.pullRequestUrl) ||
          Boolean(snapshot.branchName) ||
          (Array.isArray(snapshot.artifacts) && snapshot.artifacts.length > 0);
        if (hasFinalOutputs) return snapshot;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
      return null;
    },
    [refreshSnapshot],
  );

  const addEventCard = useCallback(
    (event: AgentRunEvent) => {
      appendStreamItem({
        id: crypto.randomUUID(),
        type: event.type,
        text: event.text,
        stepKey: event.stepKey,
        stepLabel: event.stepLabel,
        intent: event.intent,
        route: event.route,
        summary: event.summary,
        questions: event.questions,
        data: event.data,
        createdAt: event.createdAt || Date.now(),
      });

      if (event.runId) {
        setRunId(event.runId);
        syncRunIdToUrl(event.runId);
      }
      if (event.intent) setIntent(event.intent as AgentIntent);
      if (event.route) setRoute(event.route as AgentRoute);
      if (event.summary) setSummary(event.summary);
      if (event.stepKey) setCurrentStep(event.stepKey);

      const payload = event.data;
      if (payload && typeof payload === 'object') {
        const anyPayload = payload as Record<string, any>;
        if (anyPayload.plan) setReviewPlan(anyPayload.plan);
        if (Array.isArray(anyPayload.steps)) {
          setSteps((prev) => mergeStepList(prev, normalizeSteps(anyPayload.steps)));
        }
        if (Array.isArray(anyPayload.artifacts)) {
          setArtifacts(() =>
            anyPayload.artifacts.reduce(
              (acc: AgentArtifact[], artifact: AgentArtifact) => upsertArtifact(acc, artifact),
              [],
            ),
          );
        }
        if (anyPayload.questions) {
          setQuestions(Array.isArray(anyPayload.questions) ? anyPayload.questions : []);
        }
        if (anyPayload.summaryContext) setSummaryContext(anyPayload.summaryContext);
        if (anyPayload.finalSummary) setFinalSummary(anyPayload.finalSummary);
        if (anyPayload.generatedFix) setGeneratedFix(anyPayload.generatedFix);
        if (anyPayload.generatedDocument) setGeneratedDocument(anyPayload.generatedDocument);
        if (anyPayload.branchName) setBranchName(anyPayload.branchName);
        if (anyPayload.commitMessage) setCommitMessage(anyPayload.commitMessage);
        if (anyPayload.pullRequestUrl) setPullRequestUrl(anyPayload.pullRequestUrl);
        if (anyPayload.latestCheckpointId) setLatestCheckpointId(anyPayload.latestCheckpointId);
        if (anyPayload.target) setTarget(anyPayload.target);
        if (anyPayload.contextJson) setContextJson(anyPayload.contextJson);
        if (anyPayload.preferencesJson) {
          setPreferences((prev) => ({
            allowWriteBack: anyPayload.preferencesJson.allowWriteBack ?? prev.allowWriteBack,
            allowCreatePR: anyPayload.preferencesJson.allowCreatePR ?? prev.allowCreatePR,
            allowAutoComment:
              anyPayload.preferencesJson.allowAutoComment ?? prev.allowAutoComment,
          }));
        }
      }

      switch (event.type) {
        case 'run_created':
          setStatus('running');
          break;
        case 'plan_ready':
          setStatus(event.questions?.length ? 'waiting_input' : 'running');
          if (event.questions?.length) setQuestions(event.questions);
          break;
        case 'need_clarification':
          setStatus('waiting_input');
          if (event.questions?.length) setQuestions(event.questions);
          break;
        case 'step_update':
          setStatus('running');
          if (event.stepKey) setCurrentStep(event.stepKey);
          if (event.stepKey) {
            setSteps((prev) =>
              prev.map((step) =>
                step.stepKey === event.stepKey
                  ? {
                      ...step,
                      stepStatus: normalizeAgentStepStatus(event.stepStatus ?? 'running'),
                      stepLabel: event.stepLabel ?? step.stepLabel,
                    }
                  : step,
              ),
            );
          }
          break;
        case 'tool_start':
          setStatus('running');
          break;
        case 'artifact_created':
          if (event.data && typeof event.data === 'object') {
            const artifactData = event.data as Record<string, any>;
            const artifact: AgentArtifact = {
              id: String(artifactData.id ?? crypto.randomUUID()),
              artifactType: String(event.artifactType ?? artifactData.artifactType ?? 'artifact'),
              artifactKey: String(event.artifactKey ?? artifactData.artifactKey ?? crypto.randomUUID()),
              text:
                typeof artifactData.text === 'string'
                  ? artifactData.text
                  : typeof event.text === 'string'
                    ? event.text
                    : null,
              data: artifactData.data ?? artifactData,
              filePath: typeof artifactData.filePath === 'string' ? artifactData.filePath : null,
              url: typeof artifactData.url === 'string' ? artifactData.url : null,
              mimeType:
                typeof artifactData.mimeType === 'string' ? artifactData.mimeType : null,
              createdAt: String(artifactData.createdAt ?? new Date().toISOString()),
            };
            setArtifacts((prev) => upsertArtifact(prev, artifact));
          }
          break;
        case 'waiting_resume':
          setStatus('waiting_confirmation');
          break;
        case 'finished':
          setStatus('completed');
          if (event.summary) setSummary(event.summary);
          if (event.data && typeof event.data === 'object') {
            const snapshotLike = event.data as Record<string, any>;
            if (snapshotLike.generatedFix) setGeneratedFix(snapshotLike.generatedFix);
            if (snapshotLike.generatedDocument) setGeneratedDocument(snapshotLike.generatedDocument);
            if (snapshotLike.branchName) setBranchName(snapshotLike.branchName);
            if (snapshotLike.commitMessage) setCommitMessage(snapshotLike.commitMessage);
            if (snapshotLike.pullRequestUrl) setPullRequestUrl(snapshotLike.pullRequestUrl);
            if (snapshotLike.latestCheckpointId) setLatestCheckpointId(snapshotLike.latestCheckpointId);
            if (snapshotLike.finalSummary) setFinalSummary(snapshotLike.finalSummary);
            if (Array.isArray(snapshotLike.artifacts)) {
              setArtifacts(snapshotLike.artifacts);
            }
          }
          break;
        case 'error':
          setStatus('failed');
          setErrorMessage(event.error || event.text || 'Agent 执行失败');
          break;
        default:
          break;
      }
    },
    [appendStreamItem, syncRunIdToUrl],
  );

  const readNdjsonResponse = useCallback(
    async (response: Response) => {
      let responseRunId = response.headers.get('X-Run-Id') || runId || null;

      if (responseRunId) {
        setRunId(responseRunId);
        syncRunIdToUrl(responseRunId);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('未获取到流式响应');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex < 0) break;
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;

          try {
            const event = JSON.parse(line) as AgentRunEvent;
            if (event.type !== 'heartbeat') {
              if (event.runId) {
                responseRunId = event.runId;
                setRunId(event.runId);
                syncRunIdToUrl(event.runId);
              }
              addEventCard(event);
              if (event.runId) responseRunId = event.runId;
              if (event.done) return responseRunId;
            }
          } catch (error) {
            console.warn('Invalid NDJSON line:', line, error);
          }
        }
      }

      const tail = buffer.trim();
      if (tail) {
        const event = JSON.parse(tail) as AgentRunEvent;
        if (event.type !== 'heartbeat') {
          if (event.runId) {
            responseRunId = event.runId;
            setRunId(event.runId);
            syncRunIdToUrl(event.runId);
          }
          addEventCard(event);
        }
      }

      return responseRunId;
    },
    [addEventCard, runId, syncRunIdToUrl],
  );

  const restoreRun = useCallback(
    async (targetRunId: string) => {
      setErrorMessage(null);
      try {
        const snapshot = await getAgentRun(targetRunId);
        applySnapshot(snapshot, { replaceStream: true });
      } catch (error: any) {
        setStatus('failed');
        setErrorMessage(error.message || '恢复 Agent 运行失败');
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    if (!routeRunId) {
      if (hydratedRunIdRef.current) {
        setRunId(null);
        setStatus('idle');
        setIntent(null);
        setRoute(null);
        setTarget(null);
        setCurrentStep(null);
        setSummary(null);
        setSummaryContext(null);
        setFinalSummary(null);
        setReviewPlan(null);
        setQuestions([]);
        setAnswers({});
        setContextJson(null);
        setSteps([]);
        setArtifacts([]);
        setStreamItems([]);
        setGeneratedFix(null);
        setGeneratedDocument(null);
        setBranchName(null);
        setCommitMessage(null);
        setPullRequestUrl(null);
        setLatestCheckpointId(null);
        setErrorMessage(null);
        setSelectedStepKey(null);
        hydratedRunIdRef.current = null;
      }
      return;
    }

    if (hydratedRunIdRef.current === routeRunId) return;
    void restoreRun(routeRunId);
  }, [restoreRun, routeRunId]);

  useEffect(() => {
    if (!currentRunId || isStreaming) return;
    if (!['running', 'waiting_input', 'waiting_confirmation', 'resuming'].includes(status)) return;

    const timer = window.setInterval(() => {
      void refreshSnapshot(currentRunId).catch(() => {});
    }, 6000);

    return () => window.clearInterval(timer);
  }, [currentRunId, isStreaming, refreshSnapshot, status]);

  const submitMessage = useCallback(async () => {
    const text = prompt.trim() || reply.trim();
    if (!text) {
      message.warning('请先输入任务或补充内容');
      return;
    }

    const payloadBase: AgentRunRequest = {
      message: text,
      context: buildAgentContext(location.pathname, location.search, currentRunId, runSessionId),
      preferences,
    };

    if (status === 'waiting_input') {
      if (!currentRunId) {
        message.error('缺少 runId，无法继续');
        return;
      }
      setIsStreaming(true);
      setErrorMessage(null);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await resumeAgentStream(
          currentRunId,
          {
            ...payloadBase,
            confirmed: false,
            answers: {
              response: text,
              questions,
            },
          },
          controller.signal,
        );
        const nextRunId = await readNdjsonResponse(response);
        if (nextRunId) {
          await refreshSnapshotWithRetry(nextRunId).catch(() => {});
        }
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setStatus('failed');
          setErrorMessage(error.message || '提交回答失败');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
      setReply('');
      return;
    }

    if (status === 'waiting_confirmation') {
      if (!currentRunId) {
        message.error('缺少 runId，无法继续');
        return;
      }
      setIsStreaming(true);
      setErrorMessage(null);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await resumeAgentStream(
          currentRunId,
          {
            ...payloadBase,
            confirmed: true,
          },
          controller.signal,
        );
        const nextRunId = await readNdjsonResponse(response);
        const targetRunId = nextRunId || currentRunId;
        await refreshSnapshotWithRetry(targetRunId).catch(() => {});
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setStatus('failed');
          setErrorMessage(error.message || '继续执行失败');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
      return;
    }

    if (status === 'running' || status === 'resuming') {
      message.info('当前正在执行，请等待流程结束后再输入。');
      return;
    }

    setIsStreaming(true);
    setErrorMessage(null);
    setQuestions([]);
    setAnswers({});
    setStreamItems([]);
    setArtifacts([]);
    setSteps([]);
    setSummary(null);
    setSummaryContext(null);
    setFinalSummary(null);
    setReviewPlan(null);
    setGeneratedFix(null);
    setGeneratedDocument(null);
    setBranchName(null);
    setCommitMessage(null);
    setPullRequestUrl(null);
    setLatestCheckpointId(null);
    setCurrentStep(null);
    setIntent(null);
    setRoute(null);
    setTarget(null);
    setSelectedStepKey(null);
    setAnswers({});

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await runAgentStream(payloadBase, controller.signal);
      const nextRunId = await readNdjsonResponse(response);
      if (nextRunId) {
        await refreshSnapshotWithRetry(nextRunId).catch(() => {});
      }
      setPrompt('');
      setReply('');
    } catch (error: any) {
      if (!controller.signal.aborted) {
        setStatus('failed');
        setErrorMessage(error.message || 'Agent 运行失败');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    currentRunId,
    location.pathname,
    location.search,
    preferences,
    prompt,
    questions,
    readNdjsonResponse,
    refreshSnapshotWithRetry,
    reply,
    runSessionId,
    status,
  ]);

  const resetToFresh = useCallback(() => {
    abortRef.current?.abort();
    navigate('/agent', { replace: true });
    setRunId(null);
    setPrompt('');
    setReply('');
    setStatus('idle');
    setIntent(null);
    setRoute(null);
    setTarget(null);
    setCurrentStep(null);
    setSummary(null);
    setSummaryContext(null);
    setFinalSummary(null);
    setReviewPlan(null);
    setQuestions([]);
    setAnswers({});
    setContextJson(null);
    setSteps([]);
    setArtifacts([]);
    setStreamItems([]);
    setGeneratedFix(null);
    setGeneratedDocument(null);
    setBranchName(null);
    setCommitMessage(null);
    setPullRequestUrl(null);
    setLatestCheckpointId(null);
    setErrorMessage(null);
    setSelectedStepKey(null);
    hydratedRunIdRef.current = null;
  }, [navigate]);

  const copyRunId = useCallback(async () => {
    if (!currentRunId) return;
    await navigator.clipboard.writeText(currentRunId);
    message.success('runId 已复制');
  }, [currentRunId]);

  const handleStepClick = useCallback((stepKey: string) => {
    setSelectedStepKey(stepKey);
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      if (status === 'waiting_input' || status === 'waiting_confirmation') {
        setReply(value);
      } else {
        setPrompt(value);
      }
    },
    [status],
  );

  const handleClarificationChange = useCallback((value: string) => {
    setReply(value);
  }, []);

  const handleConfirmToggleWriteBack = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, allowWriteBack: value }));
  }, []);

  const handleConfirmToggleCreatePR = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, allowCreatePR: value }));
  }, []);

  const handleConfirmToggleAutoComment = useCallback((value: boolean) => {
    setPreferences((prev) => ({ ...prev, allowAutoComment: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    void submitMessage();
  }, [submitMessage]);

  const handleRecover = useCallback(() => {
    if (!currentRunId) return;
    void restoreRun(currentRunId);
  }, [currentRunId, restoreRun]);

  return {
    state: {
      runId: currentRunId,
      status,
      intent,
      route,
      currentStep,
      summary,
      summaryContext,
      finalSummary,
      questions,
      answers,
      steps,
      artifacts,
      streamItems,
      errorMessage,
      isStreaming,
      isNeedInput: status === 'waiting_input',
      isWaitingConfirm: status === 'waiting_confirmation',
      isResuming: status === 'resuming',
      inputValue,
      confirmPreferences: preferences,
      currentTarget: agentTarget,
      generatedFix,
      generatedDocument,
      branchName,
      commitMessage,
      pullRequestUrl,
      latestCheckpointId,
      reviewPlan,
      contextJson,
      selectedStepKey,
      displayedStepKey,
      topStatusText: topText,
      activeMode,
      inputPlaceholder,
    },
    actions: {
      handleStepClick,
      handleInputChange,
      handleClarificationChange,
      handleConfirmToggleWriteBack,
      handleConfirmToggleCreatePR,
      handleConfirmToggleAutoComment,
      handleSubmit,
      handleRecover,
      resetToFresh,
      copyRunId,
      setPrompt,
      setReply,
      setPreferences,
      setSelectedStepKey,
    },
  };
}
