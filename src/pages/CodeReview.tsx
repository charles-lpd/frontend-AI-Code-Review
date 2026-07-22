import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  Loader2,
  Play,
  RefreshCcw,
  Square,
  Sparkles,
} from 'lucide-react';
import ConnectGithub from '../components/ConnectGithub';
import {
  continueCodeReviewStream,
  getCodeReviewRun,
  planCodeReview,
  startCodeReviewStream,
} from '../api/codeReview';
import { useAuth } from '../hooks/useAuth';
import type {
  CodeReviewDimensionResult,
  CodeReviewPlan,
  CodeReviewPlanResponse,
  CodeReviewPlannerTask,
  CodeReviewRequest,
  CodeReviewRunSnapshot,
  CodeReviewRunStatus,
  CodeReviewStreamChunk,
  CodeReviewStreamTypedChunk,
  ReviewStep,
  ReviewStepKey,
  ReviewStepStatus,
} from '../types/codeReview';
import './CodeReview.css';

const PRODUCT_STEP_DEFS: Array<Pick<ReviewStep, 'stepKey' | 'stepLabel'>> = [
  { stepKey: 'plan', stepLabel: '生成计划' },
  { stepKey: 'fetch', stepLabel: '拉取代码' },
  { stepKey: 'review', stepLabel: '审查分析' },
  { stepKey: 'summary', stepLabel: '生成总结' },
  { stepKey: 'waiting', stepLabel: '等待确认' },
  { stepKey: 'resume', stepLabel: '继续执行' },
  { stepKey: 'writeback', stepLabel: '写回代码' },
  { stepKey: 'pr', stepLabel: '创建 PR / 评论' },
];

function createInitialSteps(): ReviewStep[] {
  return PRODUCT_STEP_DEFS.map((step, index) => ({
    ...step,
    stepStatus: 'pending',
    stepIndex: index,
    stepTotal: PRODUCT_STEP_DEFS.length,
  }));
}

function statusLabel(status?: string) {
  switch (status) {
    case 'running':
    case 'execute':
    case 'reviewing':
    case 'resuming':
      return '运行中';
    case 'success':
    case 'finished':
    case 'completed':
      return '已结束';
    case 'failed':
    case 'error':
      return '失败';
    case 'pending':
      return '等待中';
    case 'update':
      return '更新中';
    case 'waiting_confirmation':
      return '待确认';
    case 'ready_to_start':
      return '可启动';
    case 'need_clarification':
      return '需补充';
    case 'planning':
      return '规划中';
    case 'idle':
      return '待开始';
    default:
      return status || '未知';
  }
}

function statusClass(status?: string) {
  switch (status) {
    case 'running':
    case 'execute':
    case 'reviewing':
    case 'resuming':
      return 'code-review-page__node-status--running';
    case 'success':
    case 'finished':
    case 'completed':
      return 'code-review-page__node-status--success';
    case 'failed':
    case 'error':
      return 'code-review-page__node-status--failed';
    case 'waiting_confirmation':
    case 'pending':
    case 'update':
    case 'info':
      return 'code-review-page__node-status--pending';
    default:
      return 'code-review-page__node-status--idle';
  }
}

function stepStatusLabel(status?: ReviewStepStatus) {
  switch (status) {
    case 'running':
      return '进行中';
    case 'done':
    case 'completed':
      return '已完成';
    case 'waiting':
      return '等待';
    case 'failed':
      return '失败';
    default:
      return '待开始';
  }
}

function stepStatusClass(status?: ReviewStepStatus) {
  switch (status) {
    case 'running':
      return 'code-review-page__step-badge--running';
    case 'done':
    case 'completed':
      return 'code-review-page__step-badge--done';
    case 'waiting':
      return 'code-review-page__step-badge--waiting';
    case 'failed':
      return 'code-review-page__step-badge--failed';
    default:
      return 'code-review-page__step-badge--pending';
  }
}

function isSseHeartbeat(block: string) {
  return block.trim().startsWith(':');
}

function toPlanPayloadMessages(messages: PlanConversationMessage[]) {
  return messages.map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

function mapRunStatus(status?: string): CodeReviewRunStatus {
  switch (status) {
    case 'planning':
    case 'need_clarification':
    case 'ready_to_start':
    case 'reviewing':
    case 'waiting_confirmation':
    case 'resuming':
    case 'completed':
    case 'failed':
      return status;
    case 'running':
      return 'reviewing';
    default:
      return 'idle';
  }
}

function mapInternalStepToProductStep(
  step?: string,
): ReviewStepKey | undefined {
  switch (step) {
    case 'resolveAuth':
    case 'resolveTarget':
    case 'planReview':
      return 'plan';
    case 'fetchContext':
      return 'fetch';
    case 'reviewDimensions':
    case 'reflectFindings':
      return 'review';
    case 'followUp':
    case 'summarize':
      return 'summary';
    case 'pauseForConfirmation':
      return 'waiting';
    case 'generateFix':
      return 'resume';
    case 'writeBack':
      return 'writeback';
    case 'comment':
      return 'pr';
    default:
      return undefined;
  }
}

function mapPhaseToProductStep(
  phase?: string,
): ReviewStepKey | undefined {
  switch (phase) {
    case 'fetch':
      return 'fetch';
    case 'review':
      return 'review';
    case 'summary':
      return 'summary';
    case 'comment':
      return 'pr';
    case 'final':
      return 'summary';
    case 'graph':
      return undefined;
    default:
      return undefined;
  }
}

function mapGraphStatusToStepStatus(
  graphStatus?: string,
): ReviewStepStatus {
  switch (graphStatus) {
    case 'running':
    case 'execute':
      return 'running';
    case 'success':
    case 'finished':
      return 'done';
    case 'waiting':
      return 'waiting';
    case 'failed':
    case 'error':
      return 'failed';
    case 'update':
    case 'info':
    default:
      return 'running';
  }
}

function mapRunStatusToStepStatus(
  runStatus?: string,
): ReviewStepStatus | undefined {
  switch (runStatus) {
    case 'running':
    case 'resuming':
      return 'running';
    case 'waiting_confirmation':
      return 'waiting';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return undefined;
  }
}

function describeTask(
  task?: CodeReviewPlanResponse['task'] | CodeReviewRunSnapshot['task'] | null,
) {
  if (!task) return '等待生成审查任务';

  return [
    task.reviewType || 'repo',
    task.owner && task.repo ? `${task.owner}/${task.repo}` : null,
    task.branch ? `@ ${task.branch}` : null,
    task.filePath ? task.filePath : null,
    task.pullNumber ? `PR #${task.pullNumber}` : null,
    task.sha ? task.sha : null,
  ]
    .filter(Boolean)
    .join(' / ');
}

function getDimensionTitle(result: CodeReviewDimensionResult, index: number) {
  return result.title || result.name || result.summary || `维度 ${index + 1}`;
}

function normalizeSnapshotTask(
  snapshot: CodeReviewRunSnapshot,
): CodeReviewPlannerTask {
  return {
    reviewType: snapshot.task.reviewType,
    owner: snapshot.task.owner,
    repo: snapshot.task.repo,
    branch: snapshot.task.branch ?? undefined,
    filePath: snapshot.task.filePath ?? undefined,
    pullNumber: snapshot.task.pullNumber ?? undefined,
    sha: snapshot.task.sha ?? undefined,
    applyChanges: snapshot.task.applyChanges,
    createPR: snapshot.task.createPR,
    autoComment: snapshot.task.autoComment,
  };
}

function mergeStepProgress(
  prev: ReviewStep[],
  stepKey: ReviewStepKey,
  nextStatus: ReviewStepStatus,
) {
  const next = prev.map((step) => ({ ...step }));
  const index = next.findIndex((step) => step.stepKey === stepKey);
  if (index < 0) return prev;

  if (nextStatus === 'running' || nextStatus === 'waiting' || nextStatus === 'completed') {
    for (let i = 0; i < index; i += 1) {
      if (next[i].stepStatus !== 'failed') {
        next[i].stepStatus = nextStatus === 'completed' ? 'completed' : 'done';
      }
    }
  }

  next[index].stepStatus = nextStatus;

  if (nextStatus === 'failed') {
    return next;
  }

  if ((nextStatus === 'done' || nextStatus === 'completed') && index + 1 < next.length) {
    for (let i = index + 1; i < next.length; i += 1) {
      if (next[i].stepStatus === 'running') {
        next[i].stepStatus = 'pending';
      }
    }
  }

  return next;
}

function buildStepsFromSnapshot(snapshot: CodeReviewRunSnapshot): ReviewStep[] {
  if (snapshot.steps?.length) {
    return snapshot.steps.map((step, index) => ({
      ...step,
      stepIndex: step.stepIndex ?? index,
      stepTotal: step.stepTotal ?? snapshot.steps!.length,
    }));
  }

  const next = createInitialSteps();
  const currentStepKey =
    snapshot.currentStepKey ??
    mapInternalStepToProductStep(snapshot.currentStep) ??
    (snapshot.status === 'waiting_confirmation'
      ? 'waiting'
      : snapshot.status === 'completed'
        ? 'pr'
        : snapshot.status === 'failed'
          ? 'review'
          : 'plan');
  const currentStatus =
    snapshot.currentStepStatus ??
    mapRunStatusToStepStatus(snapshot.status) ??
    'done';
  const index = next.findIndex((step) => step.stepKey === currentStepKey);

  if (index >= 0) {
    if (currentStatus === 'running' || currentStatus === 'waiting' || currentStatus === 'completed') {
      for (let i = 0; i < index; i += 1) {
        next[i].stepStatus = currentStatus === 'completed' ? 'completed' : 'done';
      }
    }
    next[index].stepStatus = currentStatus;
    if (currentStatus === 'done' || currentStatus === 'completed' || snapshot.status === 'completed') {
      for (let i = 0; i < next.length; i += 1) {
        if (next[i].stepStatus === 'pending') {
          next[i].stepStatus = 'completed';
        }
      }
    }
  }

  return next;
}

type PlanConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function createFallbackStepTitle(stepKey?: ReviewStepKey | null) {
  switch (stepKey) {
    case 'plan':
      return '生成计划';
    case 'fetch':
      return '拉取代码';
    case 'review':
      return '审查分析';
    case 'summary':
      return '生成总结';
    case 'waiting':
      return '等待确认';
    case 'resume':
      return '继续执行';
    case 'writeback':
      return '写回代码';
    case 'pr':
      return '创建 PR / 评论';
    default:
      return '等待通过 reviewId 获取步骤';
  }
}

function safePanelKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export default function CodeReview() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeStateReviewId =
    (location.state as { reviewId?: string } | null)?.reviewId ?? null;
  const initialReviewId = useMemo(
    () => new URLSearchParams(location.search).get('reviewId') ?? routeStateReviewId,
    [location.search, routeStateReviewId],
  );
  const [messageApi, contextHolder] = message.useMessage();
  const [prompt, setPrompt] = useState('');
  const [clarificationAnswer, setClarificationAnswer] = useState('');
  const [planConversation, setPlanConversation] = useState<
    PlanConversationMessage[]
  >([]);
  const [planResponse, setPlanResponse] =
    useState<CodeReviewPlanResponse | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [reviewId, setReviewId] = useState<string | null>(initialReviewId);
  const [reviewStatus, setReviewStatus] =
    useState<CodeReviewRunStatus>('idle');
  const [reviewSteps, setReviewSteps] = useState<ReviewStep[] | null>(null);
  const [currentStepKey, setCurrentStepKey] = useState<ReviewStepKey>('plan');
  const [logs, setLogs] = useState<{ id: string; kind: string; text: string; createdAt: number }[]>([]);
  const [finalText, setFinalText] = useState('');
  const [summaryContext, setSummaryContext] = useState('');
  const [reviewPlan, setReviewPlan] = useState<CodeReviewPlan | null>(null);
  const [dimensionResults, setDimensionResults] = useState<
    CodeReviewDimensionResult[]
  >([]);
  const [generatedFix, setGeneratedFix] = useState<string | null>(null);
  const [modificationBranch, setModificationBranch] = useState<string | null>(
    null,
  );
  const [pullRequestUrl, setPullRequestUrl] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState('等待开始');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({
    summary: true,
    execution: true,
    plan: true,
  });
  const abortRef = useRef<AbortController | null>(null);
  const hydratedReviewIdRef = useRef<string | null>(null);

  const activeTask = planResponse?.task ?? null;
  const queryReviewId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('reviewId');
  }, [location.search]);

  const currentStep = useMemo(
    () => reviewSteps?.find((step) => step.stepKey === currentStepKey) ?? null,
    [currentStepKey, reviewSteps],
  );

  const addLog = useCallback((kind: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLogs((prev) => [
      ...prev.slice(-79),
      {
        id: crypto.randomUUID(),
        kind,
        text: trimmed,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  const isPanelOpen = useCallback(
    (key: string) => Boolean(openPanels[key]),
    [openPanels],
  );

  const togglePanel = useCallback((key: string) => {
    setOpenPanels((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const syncReviewIdToUrl = useCallback(
    (nextReviewId: string | null) => {
      const params = new URLSearchParams(location.search);
      if (nextReviewId) {
        params.set('reviewId', nextReviewId);
      } else {
        params.delete('reviewId');
      }

      const search = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : '',
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const hydrateReviewSnapshot = useCallback(
    (
      snapshot: CodeReviewRunSnapshot,
      options?: { keepPlanResponse?: boolean; silent?: boolean },
    ) => {
      setReviewId(snapshot.reviewId);
      syncReviewIdToUrl(snapshot.reviewId);
      setReviewStatus(mapRunStatus(snapshot.status));
      setCurrentStatus(
        snapshot.currentStepLabel ||
          snapshot.currentStep ||
          statusLabel(snapshot.status),
      );
      setReviewPlan(snapshot.reviewPlan);
      setDimensionResults(snapshot.dimensionResults ?? []);
      setGeneratedFix(snapshot.generatedFix);
      setModificationBranch(snapshot.modificationBranch);
      setPullRequestUrl(snapshot.pullRequestUrl);
      setSummaryContext(snapshot.summaryContext ?? '');
      setFinalText(snapshot.finalSummary ?? '');
      setReviewSteps(buildStepsFromSnapshot(snapshot));
      setCurrentStepKey(
        snapshot.currentStepKey ??
          mapInternalStepToProductStep(snapshot.currentStep) ??
          'plan',
      );

      if (!options?.keepPlanResponse) {
        setPlanResponse((prev) => ({
          status: 'ready',
          summary: prev?.summary || '已恢复审查任务。',
          task: normalizeSnapshotTask(snapshot),
          questions: prev?.questions ?? [],
          missingFields: prev?.missingFields ?? [],
          userId: prev?.userId,
          canExecute: true,
        }));
      }

      hydratedReviewIdRef.current = snapshot.reviewId;

      if (!options?.silent) {
        addLog('restore', `已恢复审查任务 ${snapshot.reviewId}`);
      }
    },
    [addLog, syncReviewIdToUrl],
  );

  const refreshReviewSnapshot = useCallback(
    async (targetReviewId: string, options?: { silent?: boolean }) => {
      const snapshot = await getCodeReviewRun(targetReviewId);
      hydrateReviewSnapshot(snapshot, {
        keepPlanResponse: true,
        silent: options?.silent ?? false,
      });
      return snapshot;
    },
    [hydrateReviewSnapshot],
  );

  const refreshReviewSnapshotWithRetry = useCallback(
    async (targetReviewId: string, options?: { silent?: boolean }) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const snapshot = await refreshReviewSnapshot(targetReviewId, options);
          const hasCompletedOutputs =
            snapshot.status !== 'completed' ||
            Boolean(snapshot.generatedFix) ||
            Boolean(snapshot.modificationBranch) ||
            Boolean(snapshot.pullRequestUrl);

          if (hasCompletedOutputs) {
            return snapshot;
          }

          if (attempt < 2) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, 350);
            });
          }
        } catch (error) {
          if (attempt < 2) {
            await new Promise((resolve) => {
              window.setTimeout(resolve, 350);
            });
            continue;
          }
          throw error;
        }
      }

      return null;
    },
    [refreshReviewSnapshot],
  );

  const setStepProgress = useCallback(
    (
      stepKey: ReviewStepKey,
      stepStatus: ReviewStepStatus,
      statusText?: string,
    ) => {
      setReviewSteps((prev) =>
        prev ? mergeStepProgress(prev, stepKey, stepStatus) : prev,
      );
      setCurrentStepKey(stepKey);
      if (statusText) {
        setCurrentStatus(statusText);
      }
    },
    [],
  );

  const resetExecutionState = useCallback(() => {
    setReviewSteps(null);
    setCurrentStepKey('plan');
    setLogs([]);
    setFinalText('');
    setSummaryContext('');
    setReviewPlan(null);
    setDimensionResults([]);
    setGeneratedFix(null);
    setModificationBranch(null);
    setPullRequestUrl(null);
    setCurrentStatus('等待开始');
    setStreamError(null);
  }, []);

  const resetAll = useCallback(() => {
    abortRef.current?.abort();
    setPrompt('');
    setClarificationAnswer('');
    setPlanConversation([]);
    setPlanResponse(null);
    setQuestions([]);
    setReviewId(null);
    setReviewStatus('idle');
    setPlannerError(null);
    setIsPlanning(false);
    setIsStreaming(false);
    setIsRestoring(false);
    hydratedReviewIdRef.current = null;
    resetExecutionState();
    syncReviewIdToUrl(null);
  }, [resetExecutionState, syncReviewIdToUrl]);

  const applyGraphEvent = useCallback(
    (event: CodeReviewStreamTypedChunk) => {
      const stepKey =
        event.stepKey ??
        mapInternalStepToProductStep(event.graphNode) ??
        mapPhaseToProductStep(event.phase);
      if (!stepKey) return;

      const nextStatus =
        event.stepStatus ??
        mapGraphStatusToStepStatus(event.graphStatus) ??
        mapRunStatusToStepStatus(event.runStatus) ??
        'running';
      setStepProgress(stepKey, nextStatus, event.text);
    },
    [setStepProgress],
  );

  const consumeSse = useCallback(
    async (response: Response) => {
      const headerReviewId = response.headers.get('X-Review-Id');
      let activeReviewId = headerReviewId;
      if (headerReviewId) {
        setReviewId(headerReviewId);
        syncReviewIdToUrl(headerReviewId);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('未获取到流式响应');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          boundaryIndex = buffer.indexOf('\n\n');

          if (!rawEvent.trim() || isSseHeartbeat(rawEvent)) continue;

          const dataLine = rawEvent
            .split('\n')
            .find((line) => line.startsWith('data:'));
          if (!dataLine) continue;

          const payloadText = dataLine.replace(/^data:\s*/, '').trim();
          let chunk: CodeReviewStreamChunk | null = null;

          try {
            chunk = JSON.parse(payloadText) as CodeReviewStreamChunk;
          } catch {
            continue;
          }

          if (!chunk) continue;

          if ('error' in chunk && typeof chunk.error === 'string' && chunk.error) {
            throw new Error(chunk.error);
          }

          if ('done' in chunk && chunk.done) {
            return;
          }

          if ('type' in chunk) {
            const typedChunk = chunk as CodeReviewStreamTypedChunk;
            if (typedChunk.reviewId) {
              activeReviewId = typedChunk.reviewId;
              setReviewId(typedChunk.reviewId);
              syncReviewIdToUrl(typedChunk.reviewId);
            }
            if (typedChunk.runStatus) {
              const mappedStatus = mapRunStatus(typedChunk.runStatus);
              if (mappedStatus !== 'idle') {
                setReviewStatus(mappedStatus);
              }
            }
            if (typedChunk.stepKey && typedChunk.stepStatus) {
              setStepProgress(
                typedChunk.stepKey,
                typedChunk.stepStatus,
                typedChunk.text,
              );
            }

            switch (typedChunk.type) {
              case 'plan':
                if (typedChunk.reviewPlan) {
                  setReviewPlan(typedChunk.reviewPlan);
                  setStepProgress('plan', 'done', typedChunk.text || '计划已生成');
                  addLog('plan', '收到审查计划。');
                }
                break;
              case 'graph_event':
                applyGraphEvent(typedChunk);
                if (typedChunk.text) addLog('graph', typedChunk.text);
                break;
              case 'status': {
                const stepKey =
                  typedChunk.stepKey ??
                  mapPhaseToProductStep(typedChunk.phase) ??
                  mapInternalStepToProductStep(typedChunk.step);
                const nextStatus =
                  typedChunk.stepStatus ??
                  mapRunStatusToStepStatus(typedChunk.runStatus) ??
                  (typedChunk.phase === 'final' ? 'done' : 'running');
                if (stepKey) {
                  setStepProgress(stepKey, nextStatus, typedChunk.text);
                }
                if (typedChunk.text) {
                  addLog('status', typedChunk.text);
                  setCurrentStatus(typedChunk.text);
                }
                break;
              }
              case 'dimension_start':
              case 'dimension_header':
              case 'dimension_chunk':
              case 'dimension_done':
                setStepProgress('review', 'running', typedChunk.text || '审查分析中');
                if (typedChunk.text) {
                  addLog(typedChunk.type, typedChunk.text);
                }
                break;
              case 'summary_header':
              case 'summary_chunk':
              case 'summary_done':
                setStepProgress('summary', 'running', typedChunk.text || '生成总结中');
                if (typedChunk.text) {
                  addLog(typedChunk.type, typedChunk.text);
                  setSummaryContext((prev) => `${prev}${typedChunk.text}`);
                }
                if (typedChunk.type === 'summary_done') {
                  setStepProgress('summary', 'done', typedChunk.text || '总结已完成');
                }
                break;
              case 'comment_status':
                setStepProgress('pr', 'running', typedChunk.text || '创建 PR / 评论中');
                if (typedChunk.text) {
                  addLog('comment_status', typedChunk.text);
                }
                break;
              case 'final':
                if (typedChunk.text) {
                  setFinalText((prev) => `${prev}${typedChunk.text}`);
                  addLog('final', typedChunk.text);
                }
                if (typedChunk.runStatus === 'waiting_confirmation') {
                  setReviewStatus('waiting_confirmation');
                  setStepProgress('waiting', 'waiting', '等待用户确认');
                  setCurrentStatus('首轮审查已完成，等待确认继续执行');
                } else if (typedChunk.runStatus === 'completed') {
                  setReviewStatus('completed');
                  setReviewSteps((prev) =>
                    prev ? prev.map((step) => ({ ...step, stepStatus: 'done' })) : prev,
                  );
                  setCurrentStepKey('pr');
                  setCurrentStatus('审查完成');
                } else if (typedChunk.runStatus === 'resuming') {
                  setReviewStatus('resuming');
                } else if (typedChunk.text) {
                  setCurrentStatus(typedChunk.text);
                }
                break;
              default:
                break;
            }
          }
        }
      }

      return activeReviewId;
    },
    [addLog, applyGraphEvent, setStepProgress, syncReviewIdToUrl],
  );

  const restoreReview = useCallback(
    async (targetReviewId: string) => {
      setIsRestoring(true);
      setStreamError(null);
      setPlannerError(null);

      try {
        const snapshot = await getCodeReviewRun(targetReviewId);
        hydrateReviewSnapshot(snapshot);
      } catch (err: any) {
        const errorMessage = err.message || '恢复审查失败';
        setReviewStatus('failed');
        setStreamError(errorMessage);
        if (hydratedReviewIdRef.current === targetReviewId) {
          hydratedReviewIdRef.current = null;
        }
      } finally {
        setIsRestoring(false);
      }
    },
    [hydrateReviewSnapshot],
  );

  useEffect(() => {
    const effectiveReviewId = queryReviewId ?? routeStateReviewId;
    if (!isAuthenticated || !effectiveReviewId || reviewStatus === 'planning') {
      return;
    }

    if (hydratedReviewIdRef.current === effectiveReviewId) {
      return;
    }

    void restoreReview(effectiveReviewId);
  }, [
    isAuthenticated,
    queryReviewId,
    routeStateReviewId,
    restoreReview,
    reviewStatus,
  ]);

  useEffect(() => {
    const effectiveReviewId = reviewId;
    const shouldPoll =
      Boolean(effectiveReviewId) &&
      ['reviewing', 'waiting_confirmation', 'resuming'].includes(reviewStatus);

    if (!shouldPoll || !effectiveReviewId) {
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const snapshot = await getCodeReviewRun(effectiveReviewId);
        if (cancelled) return;
        hydrateReviewSnapshot(snapshot, {
          keepPlanResponse: true,
          silent: true,
        });
      } catch {
        // polling should stay silent; stream/restore already surface errors
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hydrateReviewSnapshot, reviewId, reviewStatus]);

  const planReview = useCallback(
    async (
      messageText: string,
      conversationOverride?: PlanConversationMessage[],
    ) => {
      const text = messageText.trim();
      if (!text) {
        messageApi.error('请先输入审查需求');
        return;
      }

      setIsPlanning(true);
      setReviewStatus('planning');
      setPlannerError(null);
      setStreamError(null);
      resetExecutionState();

      const conversation =
        conversationOverride ?? [
          ...planConversation,
          {
            role: 'user' as const,
            content: text,
          },
        ];

      try {
        const response = await planCodeReview({
          message: text,
          messages: toPlanPayloadMessages(conversation),
          history: toPlanPayloadMessages(planConversation),
        });

        setPlanConversation(conversation);
        setPlanResponse(response);
        setQuestions(response.questions ?? []);
        setCurrentStatus(response.summary || '审查计划已生成');
        setReviewSteps(null);
        setCurrentStepKey('plan');

        if (response.status === 'ready') {
          setReviewStatus('ready_to_start');
          messageApi.success(response.summary || '审查计划已生成');
        } else {
          setReviewStatus('need_clarification');
          messageApi.warning(response.summary || '当前审查意图还需要补充信息');
        }
      } catch (err: any) {
        const errorMessage = err.message || '生成计划失败';
        setPlannerError(errorMessage);
        setReviewStatus('failed');
        messageApi.error(errorMessage);
      } finally {
        setIsPlanning(false);
      }
    },
    [messageApi, planConversation, resetExecutionState],
  );

  const continuePlanReview = useCallback(async () => {
    const answer = clarificationAnswer.trim();
    if (!answer) {
      messageApi.error('请先补充信息');
      return;
    }

    const conversation = [
      ...planConversation,
      {
        role: 'assistant' as const,
        content: questions.join('\n'),
      },
      {
        role: 'user' as const,
        content: answer,
      },
    ];

    setClarificationAnswer('');
    await planReview(answer, conversation);
  }, [clarificationAnswer, messageApi, planConversation, planReview, questions]);

  const startReview = useCallback(async () => {
    if (!planResponse || planResponse.status !== 'ready' || !activeTask) {
      messageApi.warning('请先生成可执行计划。');
      return;
    }

    const payload: CodeReviewRequest = {
      reviewType: activeTask.reviewType ?? 'repo',
      owner: activeTask.owner ?? '',
      repo: activeTask.repo ?? '',
      branch: activeTask.branch,
      filePath: activeTask.filePath,
      pullNumber: activeTask.pullNumber,
      sha: activeTask.sha,
      applyChanges: activeTask.applyChanges,
      createPR: activeTask.createPR,
      autoComment: activeTask.autoComment,
    };

    setIsStreaming(true);
    setReviewStatus('reviewing');
    setStreamError(null);
    setCurrentStatus('正在启动审查...');
    resetExecutionState();
    setStepProgress('fetch', 'running', '正在拉取代码...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await startCodeReviewStream(payload, controller.signal);
      const streamedReviewId = await consumeSse(response);

      if (streamedReviewId) {
        await refreshReviewSnapshot(streamedReviewId, { silent: true }).catch(
          () => {},
        );
      }

      setReviewStatus((prev) =>
        prev === 'completed' || prev === 'waiting_confirmation'
          ? prev
          : 'waiting_confirmation',
      );
      setCurrentStatus((prev) =>
        prev === '审查完成' ? prev : '首轮审查已结束',
      );
    } catch (err: any) {
      if (controller.signal.aborted) {
        messageApi.info('已停止审查');
        setCurrentStatus('已停止');
      } else {
        const errorMessage = err.message || '审查请求失败';
        setStreamError(errorMessage);
        setReviewStatus('failed');
        messageApi.error(errorMessage);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    activeTask,
    consumeSse,
    messageApi,
    planResponse,
    resetExecutionState,
    refreshReviewSnapshot,
    setStepProgress,
  ]);

  const resumeReview = useCallback(async () => {
    if (!reviewId) {
      messageApi.error('缺少 reviewId，无法继续执行');
      return;
    }

    setIsStreaming(true);
    setReviewStatus('resuming');
    setStreamError(null);
    setCurrentStatus('正在继续执行...');
    setStepProgress('resume', 'running', '正在继续执行...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await continueCodeReviewStream(
        reviewId,
        {
          reviewId,
          resume: { confirmed: true },
        },
        controller.signal,
      );
      const streamedReviewId = await consumeSse(response);
      const snapshotReviewId = streamedReviewId || reviewId;
      await refreshReviewSnapshotWithRetry(snapshotReviewId, { silent: true });
      setReviewStatus((prev) => (prev === 'failed' ? prev : 'completed'));
      setCurrentStatus('审查完成');
    } catch (err: any) {
      if (controller.signal.aborted) {
        messageApi.info('已停止继续执行');
        setCurrentStatus('已停止');
      } else {
        const errorMessage = err.message || '继续执行失败';
        setStreamError(errorMessage);
        setReviewStatus('failed');
        messageApi.error(errorMessage);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [
    consumeSse,
    messageApi,
    refreshReviewSnapshotWithRetry,
    reviewId,
    setStepProgress,
  ]);

  const recentLogs = useMemo(() => logs.slice(-20), [logs]);
  const isReviewLocked = useMemo(
    () =>
      reviewStatus === 'reviewing' ||
      reviewStatus === 'waiting_confirmation' ||
      reviewStatus === 'resuming' ||
      reviewStatus === 'completed',
    [reviewStatus],
  );
  const executionEntries = useMemo(
    () =>
      [
        generatedFix
          ? {
              key: 'generatedFix',
              title: '生成修复',
              value: generatedFix,
            }
          : null,
        modificationBranch
          ? {
              key: 'modificationBranch',
              title: '修改分支',
              value: modificationBranch,
            }
          : null,
        pullRequestUrl
          ? {
              key: 'pullRequestUrl',
              title: 'Pull Request',
              value: pullRequestUrl,
              isLink: true,
            }
          : null,
        finalText
          ? {
              key: 'finalText',
              title: '最终结论',
              value: finalText,
            }
          : null,
      ].filter(Boolean) as Array<{
      key: string;
      title: string;
      value: string;
      isLink?: boolean;
    }>,
    [finalText, generatedFix, modificationBranch, pullRequestUrl],
  );

  const dimensionEntries = useMemo(
    () =>
      dimensionResults.map((result, index) => {
        const title = getDimensionTitle(result, index);
        return {
          key: `${title}-${index}`,
          title,
          value: result.content || result.summary || '后端未返回详细内容。',
        };
      }),
    [dimensionResults],
  );

  const reviewPlanEntries = useMemo(
    () =>
      reviewPlan
        ? [
            reviewPlan.summary
              ? { key: 'plan-summary', title: '计划摘要', value: reviewPlan.summary }
              : null,
            reviewPlan.goal
              ? { key: 'plan-goal', title: '目标', value: reviewPlan.goal }
              : null,
          ].filter(Boolean) as Array<{
            key: string;
            title: string;
            value: string;
          }>
        : [],
    [reviewPlan],
  );

  const canContinue =
    reviewStatus === 'waiting_confirmation' && Boolean(reviewId) && !isStreaming;
  const canStart =
    reviewStatus === 'ready_to_start' &&
    planResponse?.status === 'ready' &&
    !isStreaming;

  if (!isAuthenticated) {
    return <ConnectGithub />;
  }

  return (
    <div className="code-review-page">
      {contextHolder}
      <div className="code-review-page__hero">
        <div>
          <div className="code-review-page__eyebrow">
            <Sparkles size={14} />
            <span>GitHub 审查工作台</span>
          </div>
          <h1 className="code-review-page__title">产品化审查步骤流</h1>
          <p className="code-review-page__subtitle">
            前端展示面向用户的审查步骤，不再直接暴露内部 LangGraph 节点名。
            页面刷新后可通过 `reviewId` 恢复当前进度。
          </p>
        </div>
        <div className="code-review-page__hero-actions">
          <Link to="/" className="code-review-page__ghost-button">
            返回聊天
          </Link>
          <button
            type="button"
            className="code-review-page__ghost-button"
            onClick={() => abortRef.current?.abort()}
            disabled={!isStreaming}
          >
            <Square size={16} />
            停止
          </button>
        </div>
      </div>

      <div className="code-review-page__layout">
        <section className="code-review-page__panel code-review-page__panel--intent">
          <div className="code-review-page__panel-head">
            <div>
              <h2>审查意图</h2>
              <p>输入自然语言后，后端先生成计划，再启动两段式审查流程。</p>
            </div>
            <span
              className={`code-review-page__panel-badge ${statusClass(reviewStatus)}`}
            >
              {statusLabel(reviewStatus)}
            </span>
          </div>

          <div className="code-review-page__section code-review-page__section--plan">
            <div className="code-review-page__section-title">自然语言</div>
              <textarea
                className="code-review-page__prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：帮我审查 charles-lpd/ts-node 的 src/index.ts，重点看错误处理和边界条件。"
                disabled={isReviewLocked}
              />
            <div className="code-review-page__hint">
              此步骤仅生成计划，不会修改仓库。确认后才会进入审查和写回阶段。
            </div>
            <div className="code-review-page__section-actions">
              <button
                type="button"
                className="code-review-page__primary"
                onClick={() => void planReview(prompt)}
                disabled={isPlanning || !prompt.trim() || isStreaming || isReviewLocked}
              >
                {isPlanning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                <span>{isPlanning ? '规划中...' : '生成计划'}</span>
              </button>
              <button
                type="button"
                className="code-review-page__secondary"
                onClick={resetAll}
                disabled={isPlanning || isStreaming || isReviewLocked}
              >
                清空
              </button>
            </div>
            {plannerError && (
              <div className="code-review-page__alert code-review-page__alert--error">
                <AlertCircle size={16} />
                <span>{plannerError}</span>
              </div>
            )}
          </div>

          {reviewId && (
            <div className="code-review-page__card">
              <div className="code-review-page__card-title">当前审查</div>
              <div className="code-review-page__card-text">
                <p>Review ID: {reviewId}</p>
                <p>任务: {describeTask(activeTask)}</p>
              </div>
            </div>
          )}

          {planResponse && (
            <div className="code-review-page__card">
              <div className="code-review-page__card-title">计划确认</div>
              <div className="code-review-page__card-text">
                <p>状态: {planResponse.status}</p>
                {planResponse.summary && <p>摘要: {planResponse.summary}</p>}
                {planResponse.missingFields?.length ? (
                  <p>缺失字段: {planResponse.missingFields.join('，')}</p>
                ) : null}
                <p>任务: {describeTask(activeTask)}</p>
                <p>可执行: {planResponse.canExecute ? '是' : '否'}</p>
              </div>
              {canStart && (
                <div className="code-review-page__section-actions">
                  <button
                    type="button"
                    className="code-review-page__primary"
                    onClick={() => void startReview()}
                    disabled={!canStart}
                  >
                    {isStreaming ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    <span>开始审查</span>
                  </button>
                  <button
                    type="button"
                    className="code-review-page__secondary"
                    onClick={() => setPlanResponse(null)}
                    disabled={isStreaming || isReviewLocked}
                  >
                    <RefreshCcw size={16} />
                    收起计划
                  </button>
                </div>
              )}
            </div>
          )}

          {reviewStatus === 'need_clarification' && (
            <div className="code-review-page__card">
              <div className="code-review-page__card-title">追问问题</div>
              <div className="code-review-page__card-text">
                {questions.length > 0 ? (
                  questions.map((question) => <p key={question}>{question}</p>)
                ) : (
                  <p>后端正在请求更多信息。</p>
                )}
              </div>
              <textarea
                className="code-review-page__prompt code-review-page__prompt--compact"
                rows={3}
                value={clarificationAnswer}
                onChange={(e) => setClarificationAnswer(e.target.value)}
                placeholder="补充分支、PR 编号、文件路径等信息后继续。"
                disabled={isStreaming || isReviewLocked}
              />
              <div className="code-review-page__section-actions">
                <button
                  type="button"
                  className="code-review-page__primary"
                  onClick={() => void continuePlanReview()}
                  disabled={isPlanning || !clarificationAnswer.trim() || isStreaming || isReviewLocked}
                >
                  {isPlanning ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>{isPlanning ? '补充中...' : '补充后重新规划'}</span>
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="code-review-page__panel code-review-page__panel--right">
          <div className="code-review-page__panel-head">
            <div>
              <h2>当前步骤 / 确认模块</h2>
              <p>{currentStatus}</p>
            </div>
            <span className="code-review-page__panel-badge code-review-page__panel-badge--muted">
              {isRestoring ? '恢复中' : statusLabel(reviewStatus)}
            </span>
          </div>

          {reviewStatus === 'waiting_confirmation' ? (
            <div className="code-review-page__card code-review-page__card--stage">
              <div className="code-review-page__card-title">执行确认</div>
              <div className="code-review-page__card-text">
                <p>首轮审查已结束，当前可以继续执行后半段流程。</p>
              </div>
              {canContinue && (
                <div className="code-review-page__section-actions">
                  <button
                    type="button"
                    className="code-review-page__primary"
                    onClick={() => void resumeReview()}
                  >
                    <Play size={16} />
                    <span>继续执行</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="code-review-page__card code-review-page__card--stage">
              <div className="code-review-page__timeline-head">
                <h3>当前步骤</h3>
                <span>{currentStep?.stepLabel ?? createFallbackStepTitle(currentStepKey)}</span>
              </div>
              <div className="code-review-page__step-focus">
                <div className="code-review-page__step-focus-title">
                  {currentStep?.stepLabel ?? createFallbackStepTitle(currentStepKey)}
                </div>
                <div className="code-review-page__step-focus-text">
                  {reviewStatus === 'completed'
                    ? '审查已结束，执行结果已移至下方。'
                    : currentStatus}
                </div>
              </div>
            </div>
          )}

          {reviewSteps && reviewId && reviewSteps.length > 0 ? (
            <div className="code-review-page__card">
              <div className="code-review-page__card-title">产品化步骤</div>
              <div className="code-review-page__step-list code-review-page__step-list--scroll">
                {reviewSteps.map((step) => (
                  <div
                    key={step.stepKey}
                    className={`code-review-page__step-item${
                      step.stepKey === currentStep?.stepKey
                        ? ' code-review-page__step-item--active'
                        : ''
                    }`}
                  >
                    <div className="code-review-page__step-main">
                      <div className="code-review-page__step-title-row">
                        <span className="code-review-page__step-index">
                          {String(step.stepIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="code-review-page__step-label">
                          {step.stepLabel}
                        </span>
                      </div>
                      <div className="code-review-page__step-subtitle">
                        {step.stepKey === currentStep?.stepKey
                          ? currentStatus
                          : step.stepStatus === 'done' || step.stepStatus === 'completed'
                            ? '已完成'
                            : step.stepStatus === 'waiting'
                              ? '等待用户确认'
                              : '等待开始'}
                      </div>
                    </div>
                    <span
                      className={`code-review-page__step-badge ${stepStatusClass(step.stepStatus)}`}
                    >
                      {stepStatusLabel(step.stepStatus)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="code-review-page__card">
              <div className="code-review-page__card-title">产品化步骤</div>
              <div className="code-review-page__empty">
                {reviewId
                  ? isRestoring
                    ? '正在通过 reviewId 加载步骤列表。'
                    : '已拿到 reviewId，等待后端返回步骤列表。'
                  : '等待 reviewId 后展示步骤列表。'}
              </div>
            </div>
          )}

          {streamError && (
            <div className="code-review-page__alert code-review-page__alert--error">
              <AlertCircle size={16} />
              <span>{streamError}</span>
            </div>
          )}
        </section>
      </div>

      <div className="code-review-page__bottom">
        <section className="code-review-page__panel code-review-page__panel--wide">
          <button
            type="button"
            className="code-review-page__collapse-header"
            onClick={() => togglePanel('summary')}
            aria-expanded={isPanelOpen('summary')}
          >
            <div className="code-review-page__panel-head code-review-page__panel-head--compact">
              <div>
                <h2>审查摘要</h2>
                <p>{reviewStatus === 'completed' ? '最终结果' : '阶段结果'}</p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`code-review-page__collapse-icon${
                isPanelOpen('summary') ? ' code-review-page__collapse-icon--open' : ''
              }`}
            />
          </button>
          <div
            className={`code-review-page__collapse-panel${
              isPanelOpen('summary') ? ' code-review-page__collapse-panel--open' : ''
            }`}
          >
            <div className="code-review-page__collapse-panel-body">
              {summaryContext || finalText ? (
                <div className="code-review-page__final">
                  {summaryContext || finalText}
                </div>
              ) : (
                <div className="code-review-page__empty">
                  {isRestoring ? '正在恢复审查摘要。' : '等待摘要生成。'}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="code-review-page__panel code-review-page__panel--wide">
          <button
            type="button"
            className="code-review-page__collapse-header"
            onClick={() => togglePanel('execution')}
            aria-expanded={isPanelOpen('execution')}
          >
            <div className="code-review-page__panel-head code-review-page__panel-head--compact">
              <div>
                <h2>执行结果</h2>
                <p>{reviewStatus === 'completed' ? '已结束' : '等待中'}</p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`code-review-page__collapse-icon${
                isPanelOpen('execution') ? ' code-review-page__collapse-icon--open' : ''
              }`}
            />
          </button>
          <div
            className={`code-review-page__collapse-panel${
              isPanelOpen('execution') ? ' code-review-page__collapse-panel--open' : ''
            }`}
          >
            <div className="code-review-page__collapse-panel-body">
              <div className="code-review-page__result-list code-review-page__result-list--stack">
                {executionEntries.length > 0 ? (
                  executionEntries.map((entry) => {
                    const panelKey = `execution:${safePanelKey(entry.key)}`;
                    const expanded = isPanelOpen(panelKey);
                    return (
                      <div
                        key={entry.key}
                        className="code-review-page__result-item code-review-page__result-item--collapsible"
                      >
                        <button
                          type="button"
                          className="code-review-page__collapse-header code-review-page__collapse-header--inner"
                          onClick={() => togglePanel(panelKey)}
                          aria-expanded={expanded}
                        >
                          <div className="code-review-page__result-title">
                            {entry.title}
                          </div>
                          <ChevronDown
                            size={16}
                            className={`code-review-page__collapse-icon code-review-page__collapse-icon--small${
                              expanded ? ' code-review-page__collapse-icon--open' : ''
                            }`}
                          />
                        </button>
                        <div
                          className={`code-review-page__collapse-panel code-review-page__collapse-panel--inner${
                            expanded ? ' code-review-page__collapse-panel--open' : ''
                          }`}
                        >
                          <div className="code-review-page__collapse-panel-body">
                            {entry.isLink ? (
                              <a
                                className="code-review-page__result-link"
                                href={entry.value}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span>{entry.value}</span>
                                <ExternalLink size={14} />
                              </a>
                            ) : (
                              <div className="code-review-page__result-text">
                                {entry.value}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="code-review-page__empty">
                    {reviewStatus === 'completed'
                      ? '等待执行结果恢复。'
                      : '等待执行完成后展示。'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="code-review-page__panel code-review-page__panel--wide">
          <button
            type="button"
            className="code-review-page__collapse-header"
            onClick={() => togglePanel('plan')}
            aria-expanded={isPanelOpen('plan')}
          >
            <div className="code-review-page__panel-head code-review-page__panel-head--compact">
              <div>
                <h2>计划与维度</h2>
                <p>{dimensionResults.length} 个维度</p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`code-review-page__collapse-icon${
                isPanelOpen('plan') ? ' code-review-page__collapse-icon--open' : ''
              }`}
            />
          </button>
          <div
            className={`code-review-page__collapse-panel${
              isPanelOpen('plan') ? ' code-review-page__collapse-panel--open' : ''
            }`}
          >
            <div className="code-review-page__collapse-panel-body">
              <div className="code-review-page__result-list code-review-page__result-list--stack">
                {reviewPlanEntries.length > 0 && (
                  <div className="code-review-page__result-item code-review-page__result-item--collapsible">
                    <button
                      type="button"
                      className="code-review-page__collapse-header code-review-page__collapse-header--inner"
                      onClick={() => togglePanel('plan:overview')}
                      aria-expanded={isPanelOpen('plan:overview')}
                    >
                      <div className="code-review-page__result-title">计划概览</div>
                      <ChevronDown
                        size={16}
                        className={`code-review-page__collapse-icon code-review-page__collapse-icon--small${
                          isPanelOpen('plan:overview')
                            ? ' code-review-page__collapse-icon--open'
                            : ''
                        }`}
                      />
                    </button>
                    <div
                      className={`code-review-page__collapse-panel code-review-page__collapse-panel--inner${
                        isPanelOpen('plan:overview')
                          ? ' code-review-page__collapse-panel--open'
                          : ''
                      }`}
                    >
                      <div className="code-review-page__collapse-panel-body">
                        <div className="code-review-page__result-list code-review-page__result-list--stack">
                          {reviewPlanEntries.map((entry) => (
                            <div key={entry.key} className="code-review-page__result-item">
                              <div className="code-review-page__result-title">
                                {entry.title}
                              </div>
                              <div className="code-review-page__result-text">
                                {entry.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {dimensionEntries.length > 0 ? (
                  dimensionEntries.map((entry) => {
                    const panelKey = `dimension:${safePanelKey(entry.key)}`;
                    const expanded = isPanelOpen(panelKey);
                    return (
                      <div
                        key={entry.key}
                        className="code-review-page__result-item code-review-page__result-item--collapsible"
                      >
                        <button
                          type="button"
                          className="code-review-page__collapse-header code-review-page__collapse-header--inner"
                          onClick={() => togglePanel(panelKey)}
                          aria-expanded={expanded}
                        >
                          <div className="code-review-page__result-title">
                            {entry.title}
                          </div>
                          <ChevronDown
                            size={16}
                            className={`code-review-page__collapse-icon code-review-page__collapse-icon--small${
                              expanded ? ' code-review-page__collapse-icon--open' : ''
                            }`}
                          />
                        </button>
                        <div
                          className={`code-review-page__collapse-panel code-review-page__collapse-panel--inner${
                            expanded ? ' code-review-page__collapse-panel--open' : ''
                          }`}
                        >
                          <div className="code-review-page__collapse-panel-body">
                            <div className="code-review-page__result-text">
                              {entry.value}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="code-review-page__empty">等待维度审查结果。</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="code-review-page__panel code-review-page__panel--wide code-review-page__panel--log">
        <div className="code-review-page__panel-head">
          <div>
            <h2>流式日志</h2>
            <p>{recentLogs.length} 条</p>
          </div>
        </div>
        <div className="code-review-page__log-list code-review-page__log-list--wide">
          {recentLogs.length === 0 ? (
            <div className="code-review-page__empty">等待 SSE 输出。</div>
          ) : (
            recentLogs.map((log) => (
              <div key={log.id} className="code-review-page__log-item">
                <span className="code-review-page__log-kind">{log.kind}</span>
                <span className="code-review-page__log-text">{log.text}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
