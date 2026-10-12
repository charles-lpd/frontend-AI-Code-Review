import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Empty, message } from 'antd';
import { Link, useParams } from 'react-router-dom';
import {
  Bot,
  RefreshCcw,
  Send,
  Square,
  Trash2,
} from 'lucide-react';
import MessageItem from '../components/chat/MessageItem/MessageItem';
import { sendPublicChatStream } from '../api/index';
import { sessionApi } from '../api/sessions';
import { consumeKnowledgeChatStream } from '../services/knowledgeAgentStream';
import { useChatStore } from '../store/useChatStore';
import type { PublicChatMessage, PublicSessionInfo } from '../types/chat';
import './PublicSession.css';

export default function PublicSession() {
  const { id } = useParams();
  const sessionId = id ?? '';
  const [messageApi, contextHolder] = message.useMessage();
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
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const publicSessionCache = useChatStore((s) => s.publicSessionCache);
  const setPublicSessionCache = useChatStore(
    (s) => s.setPublicSessionCache,
  );
  const clearPublicSessionCache = useChatStore(
    (s) => s.clearPublicSessionCache,
  );

  const cachedSession = publicSessionCache[sessionId];

  useEffect(() => {
    if (!sessionId) return;
    if (!cachedSession) {
      setMessages([]);
      setSessionInfo(null);
      setWarning(null);
      return;
    }

    setMessages(cachedSession.messages ?? []);
    setSessionInfo(cachedSession.sessionInfo ?? null);
    setWarning(cachedSession.sessionInfo?.warning ?? null);
  }, [cachedSession, sessionId]);

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
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    if (isStreaming) return;
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
  }, [inputValue, isStreaming]);

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

    try {
      const response = await sendPublicChatStream(
        sessionId,
        nextMessages.map(({ role, content }) => ({ role, content })),
        controller.signal,
      );

      let finalWarning: string | null = null;
      const finalState = await consumeKnowledgeChatStream(response, {
        signal: controller.signal,
        onWarning: (nextWarning) => {
          finalWarning = nextWarning;
          setWarning(nextWarning);
        },
        onState: (state) => {
          const updatedMessages = nextMessages.map((item) =>
            item.id === assistantId
              ? {
                  ...item,
                  content: state.answer,
                  warning: finalWarning ?? undefined,
                  metadata: { knowledgeAgent: state },
                  status: 'streaming' as const,
                }
              : item,
          );
          setMessages(updatedMessages);
          setPublicSessionCache(sessionId, {
            sessionInfo: sessionInfo ?? undefined,
            messages: updatedMessages,
            lastActiveAt: Date.now(),
          });
        },
      });

      setMessages((currentMessages) => {
        const doneMessages = currentMessages.map((item) =>
          item.id === assistantId
              ? {
                  ...item,
                  content: finalState.answer,
                  warning: finalWarning ?? undefined,
                  metadata: { knowledgeAgent: finalState },
                  status: 'done' as const,
                }
              : item,
        );
        setPublicSessionCache(sessionId, {
          sessionInfo: sessionInfo ?? undefined,
          messages: doneMessages,
          lastActiveAt: Date.now(),
        });
        return doneMessages;
      });
    } catch (err: any) {
      if (controller.signal.aborted) {
        messageApi.info('已停止生成');
      } else {
        const errorMessage = err.message || '公开聊天失败';
        setStreamError(errorMessage);
        messageApi.error(errorMessage);
        setMessages((prev) =>
          prev.map((item) =>
            item.id === assistantId ? { ...item, status: 'error' } : item,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
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

  const canSend = inputValue.trim().length > 0 && !isStreaming && !warning;
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
        {contextHolder}
        <Empty description={streamError || '公开会话不存在'} />
      </div>
    );
  }

  return (
    <div className="public-session-page">
      {contextHolder}
      <div className="public-session-page__header">
        <div className="public-session-page__header-main">
          <h1>公开会话</h1>
          <Link to="/" className="public-session-page__link">
            返回对话
          </Link>
        </div>
      </div>

      <div className="public-session-page__card">
        <div className="public-session-page__card-head">
          <div>
            <div className="public-session-page__title-row">
              <h2 className="public-session-page__title">{headerTitle}</h2>
              <span className="public-session-page__status">
                {warning
                  ? '配置提醒'
                  : isStreaming
                    ? '助手正在思考...'
                    : '在线'}
              </span>
            </div>
            <div className="public-session-page__subtitle">
              公开会话聊天记录与最近访问记录会缓存到本地 sessionStore。
            </div>
          </div>
          <div className="public-session-page__actions">
            <button
              type="button"
              className="public-session-page__action"
              onClick={() => void refreshPublicSession()}
              disabled={refreshingKnowledge}
            >
              <RefreshCcw size={16} />
              {refreshingKnowledge ? '刷新中...' : '刷新状态'}
            </button>
            <button
              type="button"
              className="public-session-page__action public-session-page__action--danger"
              onClick={() => {
                if (
                  window.confirm('确定要清空当前公开会话的本地聊天记录吗？')
                ) {
                  setMessages([]);
                  clearPublicSessionCache(sessionId);
                }
              }}
            >
              <Trash2 size={16} />
              清空
            </button>
          </div>
        </div>

        {warning && (
          <div className="public-session-page__warning" role="alert">
            <span>{warning}</span>
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

        {streamError && (
          <div className="public-session-page__error" role="alert">
            <span>{streamError}</span>
            <button type="button" onClick={() => setStreamError(null)}>
              关闭
            </button>
          </div>
        )}

        <div className="public-session-page__footer">
          <div className="public-session-page__controls">
            {isStreaming && (
              <button
                type="button"
                className="public-session-page__stop"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={14} fill="currentColor" />
                停止生成
              </button>
            )}
          </div>
          <form
            className="public-session-page__form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              ref={inputRef}
              className="public-session-page__input"
              rows={1}
              placeholder={
                warning
                  ? '当前会话配置不完整，暂不可提问'
                  : '输入消息，Enter 发送，Shift+Enter 换行'
              }
              value={inputValue}
              disabled={isStreaming}
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
            <button type="submit" className="public-session-page__send" disabled={!canSend}>
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

    </div>
  );
}
