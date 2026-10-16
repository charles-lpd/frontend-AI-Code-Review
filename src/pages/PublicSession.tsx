import { createTextStreamRuntime } from '@/services/textStreamRuntime';
import { useChatScroll } from '@/hooks/useChatScroll';
import { Card } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { ConfirmAction } from '@/components/confirm-action';
import { Textarea } from '@/ui/textarea';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Empty } from '@/ui/empty';
import { toast as messageApi } from 'sonner';
import { Link, useParams } from 'react-router-dom';
import {
  Bot,
  RefreshCcw,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import MessageItem from '../components/chat/MessageItem/MessageItem';
import { ApiError, sendPublicChatStream } from '../api/index';
import { sessionApi } from '../api/sessions';
import { consumeKnowledgeChatStream } from '../services/knowledgeAgentStream';
import { useChatStore } from '../store/useChatStore';
import type { PublicChatMessage, PublicSessionInfo } from '../types/chat';
import './PublicSession.css';

export default function PublicSession() {
  const { id } = useParams();
  const sessionId = id ?? '';
  const [sessionInfo, setSessionInfo] = useState<PublicSessionInfo | null>(
    null,
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [refreshingKnowledge, setRefreshingKnowledge] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const runtimeRef = useRef<ReturnType<typeof createTextStreamRuntime> | null>(null);
  const { showLatest, scrollToLatest } = useChatScroll(listRef, sessionId, messages);
  const activeSessionRef = useRef(sessionId);
  activeSessionRef.current = sessionId;
  const setPublicSessionCache = useChatStore(
    (s) => s.setPublicSessionCache,
  );
  const clearPublicSessionCache = useChatStore(
    (s) => s.clearPublicSessionCache,
  );

  useEffect(() => () => {
    abortRef.current?.abort();
    runtimeRef.current?.finish();
    runtimeRef.current = null;
    abortRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    setIsStreaming(false);
    const cachedSession = useChatStore.getState().publicSessionCache[sessionId];
    if (!cachedSession) {
      setMessages([]);
      setSessionInfo(null);
      setWarning(null);
      return;
    }

    setMessages(cachedSession.messages ?? []);
    setSessionInfo(cachedSession.sessionInfo ?? null);
    setWarning(cachedSession.sessionInfo?.warning ?? null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setStreamError(null);
      try {
        const detail = await sessionApi.getPublicDetail(sessionId);
        if (cancelled) return;
        const nextDetail = {
          ...detail,
          cachedAt: Date.now(),
        };
        setSessionInfo(nextDetail);
        setWarning(nextDetail.warning);
        setPublicSessionCache(sessionId, {
          sessionInfo: nextDetail,
          messages: useChatStore.getState().publicSessionCache[sessionId]?.messages ?? [],
          lastActiveAt: Date.now(),
        });
      } catch (err: any) {
        if (cancelled) return;
        setSessionInfo(null);
        setStreamError(err.message || '公开会话加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, setPublicSessionCache]);


  useEffect(() => {
    if (isStreaming) return;
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
  }, [inputValue, isStreaming]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const refreshPublicSession = useCallback(
    async (silent = false) => {
      if (!sessionId) return;
      if (!silent) setRefreshingKnowledge(true);
      try {
        const detail = await sessionApi.getPublicDetail(sessionId);
        const nextDetail = {
          ...detail,
          cachedAt: Date.now(),
        };
        setSessionInfo(nextDetail);
        setWarning(nextDetail.warning);
        setPublicSessionCache(sessionId, {
          sessionInfo: nextDetail,
          messages: useChatStore.getState().publicSessionCache[sessionId]?.messages ?? [],
          lastActiveAt: Date.now(),
        });
      } catch (err: any) {
        if (!silent) {
          messageApi.error(err.message || '刷新公开会话失败');
        }
      } finally {
        if (!silent) setRefreshingKnowledge(false);
      }
    },
    [messageApi, sessionId, setPublicSessionCache],
  );

  const handleSend = useCallback(async () => {
    if (!sessionId || !inputValue.trim() || isStreaming) return;

    scrollToLatest();
    const now = Date.now();
    const userMessage: PublicChatMessage = {
      id: `user-${now}`,
      role: 'user',
      content: inputValue.trim(),
      createdAt: now,
      status: 'done',
    };
    const assistantId = `assistant-${now}`;
    const assistantMessage: PublicChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: now,
      status: 'streaming',
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setInputValue('');
    setIsStreaming(true);
    setStreamError(null);
    setPublicSessionCache(sessionId, {
      sessionInfo: sessionInfo ?? undefined,
      messages: nextMessages,
      lastActiveAt: Date.now(),
    });

    const controller = new AbortController();
    abortRef.current = controller;

    const isCurrent = () => abortRef.current === controller && activeSessionRef.current === sessionId;
    let finalWarning: string | null = null;
    let finalStatus: PublicChatMessage['status'] = 'streaming';
    const runtime = createTextStreamRuntime({
      identity: { scope: 'public-chat', conversationId: sessionId, requestId: crypto.randomUUID() },
      key: `public-chat:${sessionId}:${assistantId}`,
      onCheckpoint: (snapshot, terminal) => {
        const updated = nextMessages.map<PublicChatMessage>(item => item.id === assistantId ? {
          ...item, content: snapshot.content, metadata: snapshot.metadata,
          warning: finalWarning ?? undefined, status: terminal ? (finalStatus === 'streaming' ? 'done' : finalStatus) : 'streaming',
        } : item);
        // Persist the old conversation on cancellation, but never publish it into a new page.
        setPublicSessionCache(sessionId, {
          sessionInfo: useChatStore.getState().publicSessionCache[sessionId]?.sessionInfo ?? sessionInfo ?? undefined,
          messages: updated, lastActiveAt: Date.now(),
        });
        if (isCurrent()) setMessages(updated);
      },
    });
    runtimeRef.current = runtime;
    try {
      const response = await sendPublicChatStream(
        sessionId,
        [...messages, userMessage].filter(item => item.role === 'user' || item.role === 'assistant')
          .slice(-20).map(({ role, content }) => ({ role, content })),
        controller.signal,
      );
      const finalState = await consumeKnowledgeChatStream(response, {
        signal: controller.signal,
        onWarning: nextWarning => { finalWarning = nextWarning; if (isCurrent()) setWarning(nextWarning); },
        onState: (state, replaced) => { if (isCurrent()) runtime.receive({ content: state.answer, metadata: { knowledgeAgent: state } }, replaced); },
      });
      if (!isCurrent()) return;
      finalStatus = 'done';
      runtime.finish({ content: finalState.answer, metadata: { knowledgeAgent: finalState } });
    } catch (err: unknown) {
      if (!isCurrent()) return;
      if (controller.signal.aborted) {
        finalStatus = 'done';
        messageApi.info('已停止生成');
      } else {
        finalStatus = 'error';
        if (err instanceof ApiError && err.code === 'RATE_LIMITED') setRetryAfterSeconds(err.retryAfterSeconds ?? 60);
        const errorMessage = err instanceof Error ? err.message : '公开聊天失败';
        setStreamError(errorMessage);
        messageApi.error(errorMessage);
      }
    } finally {
      runtime.finish();
      if (isCurrent()) {
        setIsStreaming(false);
        abortRef.current = null;
        runtimeRef.current = null;
      }
    }
  }, [inputValue, isStreaming, messageApi, messages, sessionId, sessionInfo, setPublicSessionCache]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = event.nativeEvent as KeyboardEvent<HTMLTextAreaElement>['nativeEvent'] & {
        isComposing?: boolean;
      };
      if (event.key === 'Enter' && !event.shiftKey && !nativeEvent.isComposing) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const publicReadiness = sessionInfo?.manageConfig.knowledgeReadiness;
  const knowledgeUnavailable =
    publicReadiness === 'indexing' || publicReadiness === 'failed';
  const canSend =
    inputValue.trim().length > 0 &&
    !isStreaming &&
    !warning &&
    !knowledgeUnavailable &&
    retryAfterSeconds === 0;
  const headerTitle = sessionInfo?.title ?? '公开客服';
  const messagesHistory = useMemo(() => messages, [messages]);

  if (loading) {
    return (
      <div className="public-session-page public-session-page--center">
        加载中...
      </div>
    );
  }

  if (!sessionInfo) {
    return (
      <div className="public-session-page public-session-page--center">

        <Empty description={streamError || '公开会话不存在'} />
      </div>
    );
  }

  return (
    <div className="public-session-page">

      <div className="public-session-page__header">
        <div className="public-session-page__header-main">
          <h1>公开会话</h1>
          <Link to="/" className="public-session-page__link">
            返回对话
          </Link>
        </div>
      </div>

      <Card className="public-session-page__card">
        <div className="public-session-page__card-head">
          <div>
            <div className="public-session-page__title-row">
              <h2 className="public-session-page__title">{headerTitle}</h2>
              <Badge className="public-session-page__status">
                {warning
                  ? '配置提醒'
                  : isStreaming
                    ? '助手正在思考...'
                    : '在线'}
              </Badge>
            </div>
            <div className="public-session-page__subtitle">
              公开访问仅使用知识库回答；聊天记录会缓存到本地。
            </div>
          </div>
          <div className="public-session-page__actions">
            <Button variant="outline"
              type="button"
              className="public-session-page__action"
              onClick={() => void refreshPublicSession()}
              disabled={refreshingKnowledge}
            >
              <RefreshCcw size={16} />
              {refreshingKnowledge ? '刷新中...' : '刷新状态'}
            </Button>
            <ConfirmAction title="确定要清空当前公开会话的本地聊天记录吗？" onConfirm={() => {
              setMessages([]);
              clearPublicSessionCache(sessionId);
            }}><Button variant="outline"
              type="button"
              className="public-session-page__action public-session-page__action--danger"
              disabled={isStreaming}
            >
              <Trash2 size={16} />
              清空
            </Button></ConfirmAction>
          </div>
        </div>

        {warning && (
          <div className="public-session-page__warning" role="alert">
            <span>{warning}</span>
          </div>
        )}

        {!warning && publicReadiness === 'mixed' && (
          <div className="public-session-page__warning" role="status">
            <span>部分资料仍在处理或索引失败，当前仅使用已就绪资料回答。</span>
          </div>
        )}

        <div className="public-session-page__messages" ref={listRef}>
          {messagesHistory.length === 0 ? (
            <div className="public-session-page__empty">
              <Bot size={48} className="public-session-page__empty-icon" />
              <h2>有什么我可以帮你的吗？</h2>
              <p>发送消息开始公开问答，聊天记录会缓存到 sessionStore。</p>
            </div>
          ) : (
            messagesHistory.map((item) => (
              <div
                className="public-session-page__message"
                key={item.id ?? `${item.role}-${item.createdAt}`}
              >
                {item.warning && (
                  <div
                    className="public-session-page__message-warning"
                    role="alert"
                  >
                    <span>系统提醒：{item.warning}</span>
                  </div>
                )}
                <MessageItem
                  streamKey={`public-chat:${sessionId}:${item.id}`}
                  role={item.role}
                  content={
                    item.content ||
                    (item.status === 'streaming' && !item.metadata?.knowledgeAgent
                      ? '...'
                      : '')
                  }
                  metadata={item.metadata}
                />
              </div>
            ))
          )}
        </div>

        {showLatest && <Button variant="outline" onClick={scrollToLatest}>回到最新</Button>}
        {streamError && (
          <div className="public-session-page__error" role="alert">
            <span>{streamError}</span>
            <Button variant="outline" type="button" onClick={() => setStreamError(null)}>
              关闭
            </Button>
          </div>
        )}

        <div className="public-session-page__footer">
          <div className="public-session-page__controls">
            {isStreaming && (
              <Button variant="outline"
                type="button"
                className="public-session-page__stop"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={14} fill="currentColor" />
                停止生成
              </Button>
            )}
          </div>
          <form
            className="public-session-page__form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <Textarea
              ref={inputRef}
              className="public-session-page__input"
              rows={1}
              placeholder={
                warning
                  ? '当前会话配置不完整，暂不可提问'
                  : publicReadiness === 'indexing'
                    ? '知识库正在建立索引，请稍后再试'
                    : publicReadiness === 'failed'
                      ? '知识库索引失败，暂不可提问'
                      : retryAfterSeconds > 0
                        ? `请求过于频繁，请 ${retryAfterSeconds} 秒后重试`
                        : '输入消息，Enter 发送，Shift+Enter 换行'
              }
              maxLength={10_000}
              value={inputValue}
              disabled={isStreaming || retryAfterSeconds > 0}
              onChange={(event) => {
                const value = event.target.value;
                setInputValue(value);
                event.target.style.height = 'auto';
                event.target.style.height = `${Math.min(
                  event.target.scrollHeight,
                  200,
                )}px`;
              }}
              onCompositionStart={(event) => {
                event.currentTarget.dataset.composing = 'true';
              }}
              onCompositionEnd={(event) => {
                event.currentTarget.dataset.composing = 'false';
                event.currentTarget.style.height = 'auto';
                event.currentTarget.style.height = `${Math.min(
                  event.currentTarget.scrollHeight,
                  200,
                )}px`;
              }}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" className="public-session-page__send" disabled={!canSend}>
              <Send size={20} />
            </Button>
          </form>
        </div>
      </Card>

    </div>
  );
}
