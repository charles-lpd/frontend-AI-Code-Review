import { createTextStreamRuntime } from '@/services/textStreamRuntime';
import { useChatScroll } from '@/hooks/useChatScroll';
import { useWorkspaceSidebar } from '@/hooks/useWorkspaceSidebar';
import { WorkspaceSessionRow, WorkspaceSidebar, WorkspaceConfirmCard, WorkspaceEmpty } from '@/components/workspace/workspace';
import { Button } from '@/ui/button';
import { Badge } from '@/ui/badge';
import { WorkspaceHeader, WorkspaceMessages, WorkspaceComposer, WorkspaceError } from '@/components/workspace/workspace';
import { Textarea } from '@/ui/textarea';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { toast as messageApi } from 'sonner';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  PanelLeft,
  RefreshCcw,
  Square,
  Sparkles,
  Send,
} from 'lucide-react';
import ConnectGithub from '../components/ConnectGithub';
import MessageItem from '../components/chat/MessageItem/MessageItem';
import { chatCodeReview, confirmCodeReview, getCodeReviewMessages, getCodeReviewRun, replyCodeReview } from '../api/codeReview';
import { consumeCodeReviewStream } from '../services/codeReviewStream';
import { useAuth } from '../hooks/useAuth';
import { useCodeReviewStore } from '../store/useCodeReviewStore';
import type {
  CodeReviewChatRequest,
  CodeReviewConfirmAction,
  CodeReviewConversationContext,
  CodeReviewMessage,
  CodeReviewRunSnapshot,
  CodeReviewRunStatus,
  CodeReviewStreamChunk,
  CodeReviewTask,
  ReviewStep,
} from '../types/codeReview';
import './CodeReview.css';
import './Home.css';
import '../components/chat/ChatPanel.css';


type ReviewDimensionResult = {
  name?: string;
  title?: string;
  summary?: string;
  content?: string;
  ok?: boolean;
  [key: string]: unknown;
};





function statusLabel(status?: string) {
  switch (status) {
    case 'understanding':
      return '理解中';
    case 'waiting_clarification':
      return '等待补充';
    case 'ready_to_review':
    case 'ready_to_start':
      return '准备就绪';
    case 'reviewing':
    case 'running':
      return '审查中';
    case 'waiting_confirmation':
      return '等待确认';
    case 'executing_followup':
    case 'resuming':
      return '继续执行';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'planning':
      return '规划中';
    case 'idle':
      return '待开始';
    default:
      return status || '未知';
  }
}

function normalizeTaskFromTarget(target?: Record<string, unknown>): Partial<CodeReviewTask> {
  if (!target) return {};

  return {
    reviewType:
      typeof target.type === 'string'
        ? (target.type as CodeReviewTask['reviewType'])
        : typeof target.reviewType === 'string'
          ? (target.reviewType as CodeReviewTask['reviewType'])
          : undefined,
    owner: typeof target.owner === 'string' ? target.owner : undefined,
    repo: typeof target.repo === 'string' ? target.repo : undefined,
    branch: typeof target.branch === 'string' ? target.branch : undefined,
    filePath: typeof target.filePath === 'string' ? target.filePath : undefined,
    pullNumber:
      typeof target.pullNumber === 'number'
        ? target.pullNumber
        : typeof target.pullNumber === 'string'
          ? Number.parseInt(target.pullNumber, 10)
          : undefined,
    sha: typeof target.sha === 'string' ? target.sha : undefined,
  };
}

function buildContext(task?: Partial<CodeReviewTask> | null): CodeReviewConversationContext | undefined {
  if (!task) return undefined;

  const context: CodeReviewConversationContext = {};
  if (task.owner) context.owner = task.owner;
  if (task.repo) context.repo = task.repo;
  if (task.branch !== undefined) context.branch = task.branch ?? null;
  if (task.filePath !== undefined) context.filePath = task.filePath ?? null;
  if (task.pullNumber !== undefined) context.pullNumber = task.pullNumber ?? null;
  if (task.sha !== undefined) context.sha = task.sha ?? null;
  if (task.reviewType) context.pageType = task.reviewType;

  return Object.keys(context).length > 0 ? context : undefined;
}

function getMessageTitle(messageItem: CodeReviewMessage): string {
  if (messageItem.role === 'user') return '你';
  if (messageItem.messageType === 'question') return '助手追问';
  if (messageItem.messageType === 'summary') return '审查总结';
  if (messageItem.messageType === 'error') return '错误';
  if (messageItem.messageType === 'action') return '执行动作';
  if (messageItem.messageType === 'status') return '系统状态';
  return '助手';
}

interface ReviewSessionNavProps {
  conversations: ReturnType<typeof useCodeReviewStore.getState>['conversations'];
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  activeReviewId: string | null;
  onDesktopToggle: () => void;
  onMobileClose: () => void;
  onNewReview: () => void;
  onRemove: (reviewId: string) => void;
  mobileTriggerRef: import('react').RefObject<HTMLButtonElement | null>;
}

const ReviewSessionNav = memo(function ReviewSessionNav({
  conversations,
  mobileOpen,
  desktopCollapsed,
  activeReviewId,
  onDesktopToggle,
  onMobileClose,
  onNewReview,
  onRemove,
  mobileTriggerRef,
}: ReviewSessionNavProps) {
  return (
    <WorkspaceSidebar mobileTriggerRef={mobileTriggerRef} title="Code Review" newLabel="新审查" mobileOpen={mobileOpen} desktopCollapsed={desktopCollapsed} onDesktopToggle={onDesktopToggle} onMobileClose={onMobileClose} onNew={onNewReview}>
        <ul className="session-nav__list">
          {conversations.map((conversation) => (
            <li key={conversation.reviewId}>
<WorkspaceSessionRow deleteAction={conversations.length > 1 ? (
                  <Button variant="ghost" type="button" className="session-nav__delete" title="删除会话" aria-label={`删除会话：${conversation.title}`} onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemove(conversation.reviewId);
                  }}><span aria-hidden="true">×</span></Button>
                ) : undefined}><NavLink
                to={`/code-review/${conversation.reviewId}`}
                className={({ isActive }) =>
                  `session-nav__item${isActive || conversation.reviewId === activeReviewId ? ' session-nav__item--active' : ''}`
                }
                onClick={onMobileClose}
              >
                <span className="session-nav__title">{conversation.title}</span>
                <Badge className="session-nav__badge">
                  {statusLabel(conversation.status)}
                </Badge>
</NavLink></WorkspaceSessionRow>
            </li>
          ))}
        </ul>
    </WorkspaceSidebar>
  );
});

function formatReviewConversationTitle(
  task?: Partial<CodeReviewTask> | null,
  fallback?: string | null,
) {
  if (task?.owner && task?.repo) {
    const subject = task.filePath
      ? task.filePath
      : task.pullNumber
        ? `PR #${task.pullNumber}`
        : task.sha
          ? `Commit ${task.sha.slice(0, 7)}`
          : task.branch
            ? task.branch
            : '仓库';
    return `${task.owner}/${task.repo} · ${subject}`;
  }

  if (task?.branch) return `审查 ${task.branch}`;

  return fallback || '新建代码审查';
}

function formatReviewConversationSubtitle(
  status: CodeReviewRunStatus,
  currentStep?: ReviewStep | null,
  lastMessage?: string | null,
) {
  if (currentStep?.stepLabel) return currentStep.stepLabel;
  if (lastMessage) return lastMessage;
  return statusLabel(status);
}

function CodeReviewPageBase() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { reviewId: routeReviewId } = useParams<{ reviewId?: string }>();
  const routeStateReviewId =
    (location.state as { reviewId?: string } | null)?.reviewId ?? null;
  const initialReviewId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return routeReviewId ?? params.get('reviewId') ?? routeStateReviewId ?? null;
  }, [location.search, routeStateReviewId, routeReviewId]);

  const { mobileNavOpen, desktopNavCollapsed, sidebarTransitionEnabled, mobileTriggerRef, handleDesktopToggle, handleMobileOpen, handleMobileClose } = useWorkspaceSidebar('code-review');

  const [draft, setDraft] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(initialReviewId);
  const [reviewStatus, setReviewStatus] = useState<CodeReviewRunStatus>('idle');
  const [statusText, setStatusText] = useState('等待开始');
  const [messages, setMessages] = useState<CodeReviewMessage[]>([]);
  const [stepMap, setStepMap] = useState<Record<string, ReviewStep>>({});
  const [currentStepKey, setCurrentStepKey] = useState<string | null>(null);
  const [currentTask, setCurrentTask] = useState<Partial<CodeReviewTask> | null>(null);
  const [, setCurrentQuestions] = useState<string[]>([]);
  const [, setCurrentMissingFields] = useState<string[]>([]);
  const [, setSummaryContext] = useState('');
  const [, setFinalSummary] = useState('');
  const [, setReviewPlan] = useState<Record<string, unknown> | null>(null);
  const [, setDimensionResults] = useState<ReviewDimensionResult[]>([]);
  const [, setGeneratedFix] = useState<string | null>(null);
  const [, setModificationBranch] = useState<string | null>(null);
  const [, setPullRequestUrl] = useState<string | null>(null);
  const [, setLogs] = useState<{ id: string; kind: string; text: string; createdAt: number }[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [, setIsRestoring] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const reviewConversations = useCodeReviewStore((s) => s.conversations);
  const fetchReviewConversations = useCodeReviewStore((s) => s.fetchConversations);
  const createReviewConversation = useCodeReviewStore((s) => s.createConversation);
  const upsertReviewConversation = useCodeReviewStore((s) => s.upsertConversation);
  const removeReviewConversation = useCodeReviewStore((s) => s.removeConversation);
  const reviewConversationsLoading = useCodeReviewStore((s) => s.isLoading);
  const reviewConversationsFetched = useCodeReviewStore((s) => s.hasFetched);

  const abortRef = useRef<AbortController | null>(null);
  const initializingReviewRef = useRef(false);
  const hydratedReviewIdRef = useRef<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const textRuntimeRef = useRef<ReturnType<typeof createTextStreamRuntime> | null>(null);
  const { showLatest, scrollToLatest } = useChatScroll(messageListRef, reviewId ?? undefined, messages);
  const finishText = useCallback(() => {
    textRuntimeRef.current?.finish();
    textRuntimeRef.current = null;
  }, []);
  useEffect(() => () => { abortRef.current?.abort(); abortRef.current = null; finishText(); }, [finishText]);
  const routeIdentityRef = useRef(initialReviewId);
  useEffect(() => {
    if (routeIdentityRef.current !== initialReviewId && initialReviewId !== hydratedReviewIdRef.current) {
      abortRef.current?.abort(); abortRef.current = null; finishText(); setIsSending(false);
    }
    routeIdentityRef.current = initialReviewId;
  }, [initialReviewId, finishText]);

  const canReply = useMemo(
    () => (reviewId ? snapshotCanReply(reviewStatus) : true),
    [reviewId, reviewStatus],
  );
  const canConfirm = useMemo(() => snapshotCanConfirm(reviewStatus), [reviewStatus]);
  const orderedSteps = useMemo(() => Object.values(stepMap).sort((a, b) => a.stepIndex - b.stepIndex), [stepMap]);
  const currentStep = useMemo(() => {
    if (currentStepKey && stepMap[currentStepKey]) {
      return stepMap[currentStepKey];
    }
    return (
      orderedSteps.find(
        (step) => step.stepStatus === 'running' || step.stepStatus === 'waiting',
      ) ?? orderedSteps[0] ?? null
    );
  }, [currentStepKey, orderedSteps, stepMap]);
  const reviewConversationSubtitle = useMemo(
    () => formatReviewConversationSubtitle(reviewStatus, currentStep, messages.at(-1)?.content ?? statusText),
    [currentStep, messages, reviewStatus, statusText],
  );



  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchReviewConversations(true);
  }, [fetchReviewConversations, isAuthenticated]);

  const orderedReviewConversations = useMemo(
    () => [...reviewConversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [reviewConversations],
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

  const addMessage = useCallback((item: Omit<CodeReviewMessage, 'id' | 'createdAt'>) => {
    finishText();
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...item,
      },
    ]);
  }, [finishText]);

  const normalizeConversationTask = useCallback((task?: Partial<CodeReviewTask> | null) => ({
    reviewType: task?.reviewType ?? null,
    owner: task?.owner ?? null,
    repo: task?.repo ?? null,
    branch: task?.branch ?? null,
    filePath: task?.filePath ?? null,
    pullNumber: task?.pullNumber ?? null,
    sha: task?.sha ?? null,
    applyChanges: Boolean(task?.applyChanges),
    createPR: Boolean(task?.createPR),
    autoComment: Boolean(task?.autoComment),
  }), []);

  const appendAssistantText = useCallback((reviewItemId: string, text: string) => {
    if (!text) return;
    if (!textRuntimeRef.current) {
      const id = crypto.randomUUID();
      const message: CodeReviewMessage = {
        id, reviewId: reviewItemId, role: 'assistant', messageType: 'text',
        content: '', dataJson: null, createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, message]);
      textRuntimeRef.current = createTextStreamRuntime({
        identity: { scope: 'code-review', conversationId: reviewItemId, requestId: crypto.randomUUID() },
        key: `code-review:${id}`,
        onCheckpoint: snapshot => setMessages(prev => prev.map(item => item.id === id ? { ...item, content: snapshot.content } : item)),
      });
    }
    const runtime = textRuntimeRef.current;
    runtime.receive({ content: runtime.received.content + text });
  }, []);

  const syncConversationRecord = useCallback(
    (patch?: {
      reviewId?: string | null;
      status?: CodeReviewRunStatus;
      task?: Partial<CodeReviewTask> | null;
      lastMessage?: string | null;
      title?: string | null;
      currentStep?: ReviewStep | null;
    }) => {
      const nextReviewId = patch?.reviewId ?? reviewId ?? hydratedReviewIdRef.current;
      if (!nextReviewId) return;

      upsertReviewConversation({
        reviewId: nextReviewId,
        title:
          patch?.title ??
          formatReviewConversationTitle(patch?.task ?? currentTask, patch?.lastMessage ?? statusText),
        status: patch?.status ?? reviewStatus,
        updatedAt: Date.now(),
        lastMessage:
          patch?.lastMessage ??
          patch?.currentStep?.message ??
          currentStep?.message ??
          statusText,
        task: normalizeConversationTask(patch?.task ?? currentTask),
      });
    },
    [currentStep?.message, currentTask, normalizeConversationTask, reviewId, reviewStatus, statusText, upsertReviewConversation],
  );

  useEffect(() => {
    syncConversationRecord({
      reviewId,
      status: reviewStatus,
      task: currentTask,
      title: formatReviewConversationTitle(
        currentTask,
        messages.at(-1)?.content || statusText,
      ),
      lastMessage:
        messages.at(-1)?.content ||
        reviewConversationSubtitle ||
        statusText,
      currentStep,
    });
  }, [
    currentStep,
    currentTask,
    messages,
    reviewConversationSubtitle,
    reviewId,
    reviewStatus,
    statusText,
    syncConversationRecord,
  ]);

  const syncReviewIdToUrl = useCallback(
    (nextReviewId: string | null) => {
      const pathname = routeReviewId ? '/code-review' : location.pathname;
      const params = new URLSearchParams(location.search);

      if (nextReviewId) {
        params.set('reviewId', nextReviewId);
      } else {
        params.delete('reviewId');
      }

      navigate(
        {
          pathname: routeReviewId && nextReviewId ? `/code-review/${nextReviewId}` : pathname,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate, routeReviewId],
  );

  const applySnapshot = useCallback(
    (snapshot: CodeReviewRunSnapshot, loadedMessages?: CodeReviewMessage[]) => {
      setReviewId(snapshot.reviewId);
      setReviewStatus(snapshot.status);
      setStatusText(
        snapshot.currentStepLabel ||
          snapshot.summary ||
          snapshot.finalSummary ||
          statusLabel(snapshot.status),
      );
      setCurrentTask(snapshot.task);
      setCurrentQuestions(snapshot.questions ?? []);
      setCurrentMissingFields(snapshot.missingFields ?? []);
      setSummaryContext(snapshot.summaryContext ?? '');
      setFinalSummary(snapshot.finalSummary ?? '');
      setReviewPlan((snapshot.reviewPlan as Record<string, unknown>) ?? null);
      setDimensionResults((snapshot.dimensionResults as ReviewDimensionResult[]) ?? []);
      setGeneratedFix(snapshot.generatedFix ?? null);
      setModificationBranch(snapshot.modificationBranch ?? null);
      setPullRequestUrl(snapshot.pullRequestUrl ?? null);
      setCurrentStepKey(snapshot.currentStepKey ?? snapshot.currentStep ?? null);
      setStepMap(
        Object.fromEntries(
          (snapshot.steps ?? []).map((step) => [step.stepKey, step]),
        ),
      );
      if (loadedMessages) {
        setMessages(
          loadedMessages.filter(
            (item) => !(item.role === 'system' && item.messageType === 'status'),
          ),
        );
      }
      hydratedReviewIdRef.current = snapshot.reviewId;
      syncReviewIdToUrl(snapshot.reviewId);
    },
    [syncReviewIdToUrl],
  );

  const refreshReviewState = useCallback(
    async (targetReviewId: string, options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsRestoring(true);
      }

      try {
        const [snapshot, messageResult] = await Promise.all([
          getCodeReviewRun(targetReviewId),
          getCodeReviewMessages(targetReviewId).catch(() => null),
        ]);
        applySnapshot(snapshot, messageResult?.messages ?? []);
        return snapshot;
      } finally {
        if (!options?.silent) {
          setIsRestoring(false);
        }
      }
    },
    [applySnapshot],
  );

  const refreshReviewStateWithRetry = useCallback(
    async (targetReviewId: string, options?: { silent?: boolean }) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const snapshot = await refreshReviewState(targetReviewId, options);
          const hasCompletedOutputs =
            snapshot.status !== 'completed' ||
            Boolean(snapshot.generatedFix) ||
            Boolean(snapshot.modificationBranch) ||
            Boolean(snapshot.pullRequestUrl);

          if (hasCompletedOutputs) {
            return snapshot;
          }

          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
          }
        } catch (error) {
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            continue;
          }
          throw error;
        }
      }

      return null;
    },
    [refreshReviewState],
  );

  const upsertStep = useCallback(
    (step: ReviewStep) => {
      setStepMap((prev) => ({
        ...prev,
        [step.stepKey]: prev[step.stepKey]
          ? { ...prev[step.stepKey], ...step }
          : step,
      }));
      setCurrentStepKey(step.stepKey);
    },
    [],
  );

  const appendStreamStatus = useCallback(
    (kind: string, text: string) => {
      if (!text.trim()) return;
      addLog(kind, text);
    },
    [addLog],
  );

  const handleStreamEvent = useCallback(
    (chunk: CodeReviewStreamChunk) => {
      if ('done' in chunk && chunk.done) {
        return;
      }

      if (!('type' in chunk)) {
        return;
      }

      const eventReviewId = 'reviewId' in chunk ? chunk.reviewId : undefined;

      if (chunk.type === 'text') {
        const activeReviewId = eventReviewId ?? reviewId ?? hydratedReviewIdRef.current ?? '';
        if (activeReviewId) {
          setReviewId(activeReviewId);
          syncReviewIdToUrl(activeReviewId);
        }
        appendAssistantText(activeReviewId, chunk.text);
        if (!reviewStatus || reviewStatus === 'idle') {
          setReviewStatus('reviewing');
        }
        return;
      }

      if (chunk.type === 'warning') {
        const warningText = chunk.text || chunk.warning;
        setPlannerError(warningText);
        addLog('warning', warningText);
        messageApi.warning(warningText);
        return;
      }

      if (chunk.type === 'agent_status') {
        const activeReviewId = eventReviewId ?? reviewId ?? hydratedReviewIdRef.current ?? '';
        if (activeReviewId) {
          setReviewId(activeReviewId);
          syncReviewIdToUrl(activeReviewId);
        }

        const nextStep: ReviewStep = {
          stepKey: chunk.stepKey,
          stepLabel: chunk.stepLabel,
          stepStatus: chunk.stepStatus,
          stepIndex: chunk.stepIndex,
          stepTotal: chunk.stepTotal,
          durationMs: chunk.durationMs,
          message: chunk.message,
        };
        upsertStep(nextStep);
        setStatusText(chunk.stepLabel || chunk.stepKey);
        addLog(chunk.event, chunk.stepLabel);

        if (chunk.event === 'error' || chunk.stepStatus === 'failed') {
          setReviewStatus('failed');
          setStreamError(chunk.message || chunk.stepLabel || '代码审查失败');
          return;
        }

        if (chunk.stepStatus === 'waiting') {
          if (chunk.stepKey === 'analysis' || chunk.stepKey === 'resolveTarget') {
            setReviewStatus('waiting_clarification');
          } else {
            setReviewStatus('waiting_confirmation');
          }
          return;
        }

        if (chunk.event === 'agent_finished') {
          if (chunk.stepKey === 'agent' || chunk.stepKey === 'pauseForConfirmation') {
            setReviewStatus('waiting_confirmation');
          } else if (reviewStatus !== 'completed') {
            setReviewStatus('reviewing');
          }
          return;
        }

        if (
          chunk.event === 'agent_started' ||
          chunk.event === 'model_started' ||
          chunk.event === 'tool_started'
        ) {
          if (reviewStatus === 'idle' || reviewStatus === 'understanding') {
            setReviewStatus('reviewing');
          }
          return;
        }

        if (chunk.event === 'model_finished' || chunk.event === 'tool_finished') {
          if (reviewStatus === 'understanding') {
            setReviewStatus('reviewing');
          }
          return;
        }
      }

      if ('error' in chunk && typeof chunk.error === 'string') {
        setReviewStatus('failed');
        setStreamError(chunk.error);
        setStatusText(chunk.error);
        addLog('error', chunk.error);
        addMessage({
          reviewId: reviewId ?? hydratedReviewIdRef.current ?? '',
          role: 'assistant',
          messageType: 'error',
          content: chunk.error,
          dataJson: { phase: 'error', reviewId: eventReviewId ?? reviewId ?? null },
        });
        return;
      }

      switch (chunk.type) {
        case 'meta':
          if (eventReviewId) {
            setReviewId(eventReviewId);
            syncReviewIdToUrl(eventReviewId);
          }
          if (chunk.status) {
            setReviewStatus(chunk.status);
          }
          break;
        case 'status':
          setStatusText(chunk.text);
          appendStreamStatus(chunk.phase || 'status', chunk.text);
          break;
        case 'need_clarification':
          setReviewStatus('waiting_clarification');
          setCurrentQuestions(chunk.questions ?? []);
          setCurrentMissingFields(chunk.missingFields ?? []);
          setStatusText(chunk.questions?.[0] || '请补充缺失信息');
          addMessage({
            reviewId: eventReviewId ?? reviewId ?? '',
            role: 'assistant',
            messageType: 'question',
            content: (chunk.questions ?? []).join('\n'),
            dataJson: {
              questions: chunk.questions ?? [],
              missingFields: chunk.missingFields ?? [],
            },
          });
          break;
        case 'plan_ready':
          setReviewStatus('reviewing');
          setCurrentTask((prev) => ({
            ...prev,
            ...normalizeTaskFromTarget(chunk.target),
          }));
          setStatusText('已识别审查目标，开始执行审查');
          break;
        case 'step_update': {
          const nextStep: ReviewStep = {
            stepKey: chunk.stepKey,
            stepLabel: chunk.stepLabel,
            stepStatus: chunk.stepStatus,
            stepIndex: typeof chunk.stepIndex === 'number' ? chunk.stepIndex : 0,
            stepTotal: typeof chunk.stepTotal === 'number' ? chunk.stepTotal : 0,
          };
          upsertStep(nextStep);
          setStatusText(chunk.stepLabel || chunk.stepKey);
          break;
        }
        case 'review_chunk':
          appendStreamStatus(chunk.phase || 'review', chunk.text);
          appendAssistantText(eventReviewId ?? reviewId ?? '', chunk.text);
          break;
        case 'review_summary':
          setSummaryContext((prev) => `${prev}${prev ? '\n' : ''}${chunk.text}`);
          addMessage({
            reviewId: eventReviewId ?? reviewId ?? '',
            role: 'assistant',
            messageType: 'summary',
            content: chunk.text,
            dataJson: { phase: chunk.phase ?? 'summary' },
          });
          break;
        case 'waiting_confirmation':
          setReviewStatus('waiting_confirmation');
          setStatusText(chunk.text);
          addMessage({
            reviewId: eventReviewId ?? reviewId ?? '',
            role: 'assistant',
            messageType: 'action',
            content: chunk.text,
            dataJson: { waiting: true },
          });
          break;
        case 'finished':
          if (chunk.status === 'waiting_clarification') {
            setReviewStatus('waiting_clarification');
          } else if (chunk.status === 'waiting_confirmation') {
            setReviewStatus('waiting_confirmation');
          } else if (chunk.status === 'completed') {
            setReviewStatus('completed');
            setStatusText('审查完成');
          } else if (chunk.status === 'failed') {
            setReviewStatus('failed');
            setStatusText('审查失败');
          }

          if (chunk.generatedFix !== undefined) {
            setGeneratedFix(chunk.generatedFix ?? null);
          }
          if (chunk.modificationBranch !== undefined) {
            setModificationBranch(chunk.modificationBranch ?? null);
          }
          if (chunk.pullRequestUrl !== undefined) {
            setPullRequestUrl(chunk.pullRequestUrl ?? null);
          }
          break;
        default:
          break;
      }
    },
    [addLog, addMessage, appendStreamStatus, reviewId, syncReviewIdToUrl, upsertStep],
  );

  const hydrateReviewFromServer = useCallback(
    async (targetReviewId: string) => {
      setIsRestoring(true);
      setPlannerError(null);
      setStreamError(null);
      try {
        await refreshReviewStateWithRetry(targetReviewId, { silent: true });
      } catch (error: any) {
        const errorMessage = error?.message || '恢复审查失败';
        setReviewStatus('failed');
        setStreamError(errorMessage);
      } finally {
        setIsRestoring(false);
      }
    },
    [refreshReviewStateWithRetry],
  );

  useEffect(() => {
    if (!isAuthenticated || !initialReviewId) return;
    if (hydratedReviewIdRef.current === initialReviewId) return;
    void hydrateReviewFromServer(initialReviewId);
  }, [hydrateReviewFromServer, initialReviewId, isAuthenticated]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !reviewConversationsFetched ||
      reviewConversationsLoading ||
      initializingReviewRef.current
    ) {
      return;
    }

    const sync = async () => {
      const currentConversations = useCodeReviewStore.getState().conversations;

      if (initialReviewId) {
        const exists = currentConversations.some(
          (conversation) => conversation.reviewId === initialReviewId,
        );
        if (exists && hydratedReviewIdRef.current !== initialReviewId) {
          await hydrateReviewFromServer(initialReviewId);
        }
        return;
      }

      if (reviewId) {
        const exists = currentConversations.some(
          (conversation) => conversation.reviewId === reviewId,
        );
        if (exists) {
          return;
        }
      }

      if (currentConversations.length === 0) {
        initializingReviewRef.current = true;
        try {
          const newReviewId = await createReviewConversation();
          hydratedReviewIdRef.current = newReviewId;
          setReviewId(newReviewId);
          syncReviewIdToUrl(newReviewId);
          await hydrateReviewFromServer(newReviewId);
        } catch (error) {
          console.error('初始化代码审查会话失败:', error);
        } finally {
          initializingReviewRef.current = false;
        }
        return;
      }

      const targetReviewId = reviewId ?? currentConversations[0]?.reviewId ?? null;
      if (targetReviewId && targetReviewId !== reviewId) {
        setReviewId(targetReviewId);
        syncReviewIdToUrl(targetReviewId);
        if (hydratedReviewIdRef.current !== targetReviewId) {
          await hydrateReviewFromServer(targetReviewId);
        }
      }
    };

    void sync();
  }, [
    createReviewConversation,
    hydrateReviewFromServer,
    initialReviewId,
    isAuthenticated,
    reviewConversationsFetched,
    reviewConversationsLoading,
    reviewId,
    syncReviewIdToUrl,
  ]);


  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
  }, [draft, isSending]);

  const resetLocalState = useCallback((options?: { keepUrl?: boolean }) => {
    abortRef.current?.abort();
    abortRef.current = null;
    finishText();
    setDraft('');
    setReviewId(null);
    setReviewStatus('idle');
    setStatusText('等待开始');
    setMessages([]);
    setStepMap({});
    setCurrentStepKey(null);
    setCurrentTask(null);
    setCurrentQuestions([]);
    setCurrentMissingFields([]);
    setSummaryContext('');
    setFinalSummary('');
    setReviewPlan(null);
    setDimensionResults([]);
    setGeneratedFix(null);
    setModificationBranch(null);
    setPullRequestUrl(null);
    setLogs([]);
    setIsSending(false);
    setPlannerError(null);
    setStreamError(null);
    hydratedReviewIdRef.current = null;
    if (!options?.keepUrl) {
      syncReviewIdToUrl(null);
    }
  }, [syncReviewIdToUrl, finishText]);

  const handleNewReview = useCallback(async () => {
    if (isSending) {
      abortRef.current?.abort();
      return;
    }

    initializingReviewRef.current = true;
    resetLocalState({ keepUrl: true });

    try {
      const newReviewId = await createReviewConversation();
      hydratedReviewIdRef.current = newReviewId;
      setReviewId(newReviewId);
      syncReviewIdToUrl(newReviewId);
      await hydrateReviewFromServer(newReviewId);
    } catch (error: any) {
      const errorMessage = error?.message || '创建代码审查会话失败';
      setStreamError(errorMessage);
      messageApi.error(errorMessage);
    } finally {
      initializingReviewRef.current = false;
    }
  }, [createReviewConversation, hydrateReviewFromServer, isSending, messageApi, resetLocalState, syncReviewIdToUrl]);

  const handleConfirm = useCallback(
    async (action: CodeReviewConfirmAction) => {
      if (!reviewId) {
        messageApi.error('缺少 reviewId，无法继续执行');
        return;
      }

      if (!canConfirm) {
        messageApi.warning('当前会话不能确认继续执行');
        return;
      }

      scrollToLatest();
      setIsSending(true);
      setPlannerError(null);
      setStreamError(null);
      setStatusText('正在继续处理...');
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await confirmCodeReview(
          reviewId,
          {
            confirmed: true,
            action,
          },
          controller.signal,
        );

        await consumeCodeReviewStream(response, {
          signal: controller.signal,
          onEvent: event => { if (abortRef.current === controller && !controller.signal.aborted) handleStreamEvent(event); },
          onRawLineError: (line, error) => {
            console.warn('Invalid code review SSE frame:', line, error);
          },
        });

        if (abortRef.current !== controller) return;
        finishText();
        await hydrateReviewFromServer(reviewId);
      } catch (error: any) {
        if (abortRef.current !== controller) return;
        if (controller.signal.aborted) {
          messageApi.info('已停止确认请求');
          setStatusText('已停止');
          return;
        }

        const errorMessage = error?.message || '确认执行失败';
        setStreamError(errorMessage);
        setReviewStatus('failed');
        setStatusText(errorMessage);
        messageApi.error(errorMessage);
      } finally {
        if (abortRef.current === controller) {
          finishText();
          setIsSending(false);
          abortRef.current = null;
        }
      }
    },
    [canConfirm, handleStreamEvent, hydrateReviewFromServer, messageApi, reviewId],
  );

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed) {
        messageApi.warning('请输入审查需求');
        return;
      }

      if (isSending) return;
      if (reviewId && !canReply && !canConfirm) {
        messageApi.warning('当前会话暂时不能继续输入，请先完成确认或等待审查结束。');
        return;
      }

      const optimisticMessage: CodeReviewMessage = {
        id: crypto.randomUUID(),
        reviewId: reviewId ?? 'pending',
        role: 'user',
        messageType: 'text',
        content: trimmed,
        dataJson: buildContext(currentTask) ?? null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      setDraft('');
      scrollToLatest();
      setIsSending(true);
      setPlannerError(null);
      setStreamError(null);
      setReviewStatus(reviewId ? reviewStatus : 'understanding');
      setStatusText(reviewId ? '正在发送回复...' : '正在理解你的审查需求...');
      addLog('user', trimmed);

      if (canConfirm) {
        await handleConfirm({ applyChanges: true, createPR: true, autoComment: false });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const payload: CodeReviewChatRequest = {
          message: trimmed,
          reviewId,
          context: buildContext(currentTask),
        };
        const response = reviewId
          ? await replyCodeReview(reviewId, {
              message: trimmed,
              context: buildContext(currentTask),
            }, controller.signal)
          : await chatCodeReview(payload, controller.signal);

        await consumeCodeReviewStream(response, {
          signal: controller.signal,
          onEvent: event => { if (abortRef.current === controller && !controller.signal.aborted) handleStreamEvent(event); },
          onRawLineError: (line, error) => {
            console.warn('Invalid code review SSE frame:', line, error);
          },
        });

        if (abortRef.current !== controller) return;
        finishText();
        const activeReviewId = hydratedReviewIdRef.current ?? reviewId;
        if (activeReviewId) {
          await hydrateReviewFromServer(activeReviewId);
        }
      } catch (error: any) {
        if (abortRef.current !== controller) return;
        if (controller.signal.aborted) {
          messageApi.info('已停止请求');
          setStatusText('已停止');
          return;
        }

        const errorMessage = error?.message || '代码审查请求失败';
        setStreamError(errorMessage);
        setReviewStatus('failed');
        setStatusText(errorMessage);
        addMessage({
          reviewId: reviewId ?? 'pending',
          role: 'assistant',
          messageType: 'error',
          content: errorMessage,
          dataJson: null,
        });
        messageApi.error(errorMessage);
      } finally {
        if (abortRef.current === controller) {
          finishText();
          setIsSending(false);
          abortRef.current = null;
        }
      }
    },
    [addLog, canConfirm, canReply, currentTask, draft, handleConfirm, handleStreamEvent, hydrateReviewFromServer, isSending, messageApi, reviewId, reviewStatus],
  );



  const handleRemoveReviewConversation = useCallback(
    async (targetReviewId: string) => {
      try {
        await removeReviewConversation(targetReviewId);
        const remaining = useCodeReviewStore.getState().conversations;
        if (
          targetReviewId === reviewId ||
          targetReviewId === hydratedReviewIdRef.current
        ) {
          if (remaining.length > 0) {
            const nextReviewId = remaining[0].reviewId;
            setReviewId(nextReviewId);
            syncReviewIdToUrl(nextReviewId);
            await hydrateReviewFromServer(nextReviewId);
          } else {
            initializingReviewRef.current = true;
            try {
              const newReviewId = await createReviewConversation();
              setReviewId(newReviewId);
              syncReviewIdToUrl(newReviewId);
              await hydrateReviewFromServer(newReviewId);
            } finally {
              initializingReviewRef.current = false;
            }
          }
        }
      } catch (error: any) {
        const errorMessage = error?.message || '删除代码审查会话失败';
        messageApi.error(errorMessage);
      }
    },
    [
      createReviewConversation,
      hydrateReviewFromServer,
      messageApi,
      removeReviewConversation,
      reviewId,
      syncReviewIdToUrl,
    ],
  );

  const inputPlaceholder = reviewStatus === 'waiting_clarification'
    ? '补充缺失信息，例如仓库、分支、PR 编号或文件路径'
    : reviewStatus === 'waiting_confirmation'
      ? '输入“继续”即可让我修改代码并创建 PR'
      : reviewId
        ? '继续补充审查信息，或等待后端追问'
        : '用一句自然语言描述你想审查的代码';

  if (!isAuthenticated) {
    return <ConnectGithub />;
  }

  return (
    <div
      className={`home${mobileNavOpen ? ' home--mobile-nav-open' : ''}${desktopNavCollapsed ? ' home--desktop-nav-collapsed' : ''}${sidebarTransitionEnabled ? ' home--sidebar-transition-enabled' : ''}`}
    >

      <ReviewSessionNav
        mobileTriggerRef={mobileTriggerRef}
        conversations={orderedReviewConversations}
        mobileOpen={mobileNavOpen}
        desktopCollapsed={desktopNavCollapsed}
        activeReviewId={reviewId ?? hydratedReviewIdRef.current}
        onDesktopToggle={handleDesktopToggle}
        onMobileClose={handleMobileClose}
        onNewReview={() => void handleNewReview()}
        onRemove={(targetReviewId) => void handleRemoveReviewConversation(targetReviewId)}
      />

      <div className="chat">
        <WorkspaceHeader className="chat__header">
          <div className="chat__header-main">
            <Button variant="ghost"
              type="button"
              ref={mobileTriggerRef}
              aria-expanded={mobileNavOpen}
              aria-controls="workspace-session-sidebar"
              className="chat__sessions-toggle min-[1025px]:hidden"
              onClick={handleMobileOpen}
              aria-label="展开审查会话列表"
            >
              <PanelLeft size={18} />
            </Button>
            <div className="chat__header-info">
              <h1 className="chat__title">代码审查</h1>
              <Badge className="chat__status">
                {statusText || (reviewId ? statusLabel(reviewStatus) : '等待创建对话')}
              </Badge>
            </div>
          </div>
          <div className="chat__header-actions">
            <Button variant="outline"
              type="button"
              className="chat__clear"
              title="清空当前会话"
              disabled={isSending}
              onClick={() => void handleNewReview()}
            >
              <RefreshCcw size={18} />
              <span>新对话</span>
            </Button>
            <Button variant="outline"
              type="button"
              className="chat__clear"
              title="停止"
              disabled={!isSending}
              onClick={() => abortRef.current?.abort()}
            >
              <Square size={18} />
              <span>停止</span>
            </Button>
          </div>
        </WorkspaceHeader>

        {showLatest && <Button variant="outline" onClick={scrollToLatest}>回到最新</Button>}
        <WorkspaceMessages className="chat__messages" ref={messageListRef}>
          {messages.length === 0 && (
            <WorkspaceEmpty icon={<Sparkles size={40} />} title="有什么我可以帮你审查的吗？" description="发送一句自然语言开始代码审查，我会像知识库对话一样跟你来回确认。" />
          )}

          {messages.map((item) => (
            <div className="message-container" key={item.id}>
              <MessageItem
                streamKey={`code-review:${item.id}`}
                role={item.role}
                content={item.content}
                metadata={undefined}
              />
              {item.messageType !== 'text' && (
                <div className="code-review-page__message-tag">
                  {getMessageTitle(item)}
                </div>
              )}
              {item.messageType === 'action' && canConfirm && (
                <WorkspaceConfirmCard className="code-review-page__confirm-card">
                  <div>
                    <strong>等待确认继续</strong>
                    <span>确认后我会进入后续执行阶段；如果当前缺少可写回的文件路径，我会继续追问。</span>
                  </div>
                  <Button
                    type="button"
                    className="code-review-page__confirm-button"
                    disabled={isSending}
                    onClick={() => {
                      void handleConfirm({ applyChanges: true, createPR: true, autoComment: false });
                    }}
                  >
                    <CheckCircle2 size={16} />
                    确认继续
                  </Button>
                </WorkspaceConfirmCard>
              )}
            </div>
          ))}

        </WorkspaceMessages>

        <div className="chat__footer">
          <div className="chat__controls">
            {isSending && (
              <Button variant="outline" className="chat__stop" onClick={() => abortRef.current?.abort()}>
                <Square size={14} fill="currentColor" />
                停止生成
              </Button>
            )}
          </div>
          <WorkspaceComposer className="chat__form" onSubmit={(event) => {
            void handleSubmit(event);
          }}>
            <Textarea
              ref={inputRef}
              className="chat__input"
              rows={1}
              placeholder={inputPlaceholder}
              value={draft}
              disabled={isSending || (!!reviewId && !canReply && !canConfirm)}
              onChange={(event) => {
                const val = event.target.value;
                setDraft(val);
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
              }}
              onCompositionStart={(event) => {
                event.currentTarget.dataset.composing = 'true';
              }}
              onCompositionEnd={(event) => {
                event.currentTarget.dataset.composing = 'false';
              }}
              onKeyDown={(event) => {
                const nativeEvent = event.nativeEvent as unknown as {
                  isComposing?: boolean;
                };
                if (event.key === 'Enter' && !event.shiftKey && !nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <Button
              type="submit"
              className="chat__send"
              disabled={!draft.trim() || isSending || (!!reviewId && !canReply && !canConfirm)}
            >
              <Send size={20} />
            </Button>
          </WorkspaceComposer>
        </div>

        {(plannerError || streamError) && (
          <WorkspaceError className="chat__error" role="alert">
            <AlertCircle size={16} />
            <span>{plannerError || streamError}</span>
          </WorkspaceError>
        )}
      </div>
    </div>
  );
}

function snapshotCanReply(status: CodeReviewRunStatus) {
  if (status === 'waiting_confirmation' || status === 'reviewing' || status === 'executing_followup' || status === 'completed') {
    return false;
  }
  return true;
}

function snapshotCanConfirm(status: CodeReviewRunStatus) {
  return status === 'waiting_confirmation';
}

export default memo(CodeReviewPageBase);
