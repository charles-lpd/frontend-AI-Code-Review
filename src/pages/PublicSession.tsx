import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Empty, message } from 'antd';
import { Bot, PanelLeft, Send, Square, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { sendPublicChatStream } from '../api/index';
import { sessionApi } from '../api/sessions';
import type { PublicChatMessage, PublicSessionInfo } from '../types/chat';
import './PublicSession.css';

const storageKey = (sessionId: string) => `public-session-chat-${sessionId}`;
const publicSessionListKey = 'public-session-history';
const PUBLIC_DESKTOP_NAV_COLLAPSED_KEY = 'public.chat.desktopNavCollapsed';
const PUBLIC_MOBILE_NAV_OPEN_KEY = 'public.chat.mobileNavOpen';
const DESKTOP_MEDIA_QUERY = '(min-width: 1025px)';

type PublicSessionHistoryItem = {
  sessionId: string;
  title: string;
  lastActiveAt: number;
};

function readStoredBoolean(key: string, fallback = false) {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function readPublicSessionHistory(): PublicSessionHistoryItem[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(publicSessionListKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as PublicSessionHistoryItem[];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item?.sessionId)
          .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      : [];
  } catch {
    window.localStorage.removeItem(publicSessionListKey);
    return [];
  }
}

function writePublicSessionHistory(items: PublicSessionHistoryItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(publicSessionListKey, JSON.stringify(items));
}

function touchPublicSessionHistory(
  sessionId: string,
  title: string,
  lastActiveAt: number,
) {
  const next = readPublicSessionHistory().filter(
    (item) => item.sessionId !== sessionId,
  );
  next.unshift({ sessionId, title, lastActiveAt });
  writePublicSessionHistory(
    next.sort((a, b) => b.lastActiveAt - a.lastActiveAt),
  );
  return next.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}

function parseSseChunk(chunk: string) {
  return chunk
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block === ': ping') return { type: 'ping' as const };
      const line = block
        .split('\n')
        .find((item) => item.startsWith('data:'))
        ?.replace(/^data:\s*/, '');
      if (!line) return null;
      if (line === '[DONE]') return { type: 'done' as const };
      try {
        return { type: 'data' as const, payload: JSON.parse(line) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  return `${Math.floor(diff / day)} 天前`;
}

interface PublicSessionNavProps {
  sessions: PublicSessionHistoryItem[];
  currentSessionId: string;
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  onDesktopToggle: () => void;
  onMobileClose: () => void;
}

function PublicSessionNav({
  sessions,
  currentSessionId,
  mobileOpen,
  desktopCollapsed,
  onDesktopToggle,
  onMobileClose,
}: PublicSessionNavProps) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="session-nav__overlay"
          aria-label="关闭公开会话列表遮罩"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`session-nav${mobileOpen ? ' session-nav--mobile-open' : ''}${desktopCollapsed ? ' session-nav--desktop-collapsed' : ''}`}
      >
        <div className="session-nav__desktop-header">
          <button
            type="button"
            className="session-nav__desktop-toggle"
            onClick={onDesktopToggle}
            aria-label={desktopCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <PanelLeft size={18} />
          </button>
        </div>

        <div className="session-nav__mobile-header">
          <div className="session-nav__mobile-brand">公开会话</div>
          <button
            type="button"
            className="session-nav__mobile-close"
            onClick={onMobileClose}
            aria-label="关闭公开会话列表"
          >
            ×
          </button>
        </div>

        <ul className="session-nav__list">
          {sessions.length === 0 ? (
            <li className="public-session-page__nav-empty">暂无公开会话记录</li>
          ) : (
            sessions.map((session) => (
              <li key={session.sessionId}>
                <Link
                  to={`/public/session/${session.sessionId}`}
                  className={`session-nav__item${currentSessionId === session.sessionId ? ' session-nav__item--active' : ''}`}
                  onClick={onMobileClose}
                >
                  <span className="session-nav__title">{session.title}</span>
                  <span className="session-nav__badge">
                    {formatRelativeTime(session.lastActiveAt)}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </aside>
    </>
  );
}

export default function PublicSession() {
  const { id } = useParams();
  const sessionId = id ?? '';
  const [messageApi, contextHolder] = message.useMessage();
  const [sessionInfo, setSessionInfo] = useState<PublicSessionInfo | null>(
    null,
  );
  const [historySessions, setHistorySessions] = useState<
    PublicSessionHistoryItem[]
  >([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [messages, setMessages] = useState<PublicChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(() =>
    readStoredBoolean(PUBLIC_MOBILE_NAV_OPEN_KEY),
  );
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() =>
    readStoredBoolean(PUBLIC_DESKTOP_NAV_COLLAPSED_KEY),
  );
  const [sidebarTransitionEnabled, setSidebarTransitionEnabled] =
    useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHistorySessions(readPublicSessionHistory());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      PUBLIC_MOBILE_NAV_OPEN_KEY,
      String(mobileNavOpen),
    );
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      PUBLIC_DESKTOP_NAV_COLLAPSED_KEY,
      String(desktopNavCollapsed),
    );
  }, [desktopNavCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frameId = window.requestAnimationFrame(() => {
      setSidebarTransitionEnabled(true);
    });

    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSidebarTransitionEnabled(false);
      setMobileNavOpen(false);
      if (!event.matches) {
        setDesktopNavCollapsed(
          readStoredBoolean(PUBLIC_DESKTOP_NAV_COLLAPSED_KEY),
        );
      }
      frameId = window.requestAnimationFrame(() => {
        setSidebarTransitionEnabled(true);
      });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      window.cancelAnimationFrame(frameId);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) {
      setMessages([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as PublicChatMessage[];
      setMessages(parsed);
    } catch {
      window.localStorage.removeItem(storageKey(sessionId));
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    window.localStorage.setItem(
      storageKey(sessionId),
      JSON.stringify(messages),
    );
  }, [messages, sessionId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      setLoading(true);
      setStreamError(null);
      try {
        const detail = await sessionApi.getPublicDetail(sessionId);
        setSessionInfo(detail);
        setWarning(detail.warning);
        setHistorySessions(
          touchPublicSessionHistory(detail.id, detail.title, Date.now()),
        );
      } catch (err: any) {
        setSessionInfo(null);
        setStreamError(err.message || '公开会话加载失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sessionId]);

  const persistMessages = useCallback(
    (next: PublicChatMessage[], lastActiveAt = Date.now()) => {
      setMessages(next);
      window.localStorage.setItem(storageKey(sessionId), JSON.stringify(next));
      if (sessionInfo) {
        setHistorySessions(
          touchPublicSessionHistory(sessionId, sessionInfo.title, lastActiveAt),
        );
      }
    },
    [sessionId, sessionInfo],
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
    persistMessages(nextMessages, now);
    setInputValue('');
    setIsStreaming(true);
    setStreamError(null);
    setMobileNavOpen(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await sendPublicChatStream(
        sessionId,
        nextMessages.map(({ role, content }) => ({ role, content })),
        controller.signal,
      );

      const reader = response.body?.getReader();
      if (!reader) throw new Error('未获取到流式响应');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let finalWarning: string | null = null;
      let finalText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = parseSseChunk(buffer);
        const consumed = buffer.lastIndexOf('\n\n');
        if (consumed >= 0) {
          buffer = buffer.slice(consumed + 2);
        }

        chunks.forEach((chunk) => {
          if (!chunk || chunk.type !== 'data') return;
          const payload = chunk.payload as {
            text?: string;
            warning?: string;
            error?: string;
          };
          if (payload.error) {
            throw new Error(payload.error);
          }
          if (payload.warning) {
            finalWarning = payload.warning;
            setWarning(payload.warning);
          }
          if (payload.text) {
            finalText += payload.text;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantId
                  ? {
                      ...item,
                      content: finalText,
                      warning: finalWarning ?? undefined,
                      status: 'streaming',
                    }
                  : item,
              ),
            );
          }
        });
      }

      setMessages((prev) => {
        const doneMessages: PublicChatMessage[] = prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: finalText,
                warning: finalWarning ?? undefined,
                status: 'done',
              }
            : item,
        );
        window.localStorage.setItem(
          storageKey(sessionId),
          JSON.stringify(doneMessages),
        );
        if (sessionInfo) {
          setHistorySessions(
            touchPublicSessionHistory(sessionId, sessionInfo.title, Date.now()),
          );
        }
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
  }, [
    inputValue,
    isStreaming,
    messageApi,
    messages,
    persistMessages,
    sessionId,
    sessionInfo,
  ]);

  const clearLocalMessages = useCallback(() => {
    persistMessages([]);
    messageApi.success('本地聊天记录已清空');
  }, [messageApi, persistMessages]);

  const handleDesktopToggle = useCallback(() => {
    setDesktopNavCollapsed((prev) => !prev);
  }, []);

  const handleMobileOpen = useCallback(() => {
    setMobileNavOpen(true);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

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
    <div
      className={`home public-session-shell${mobileNavOpen ? ' home--mobile-nav-open' : ''}${desktopNavCollapsed ? ' home--desktop-nav-collapsed' : ''}${sidebarTransitionEnabled ? ' home--sidebar-transition-enabled' : ''}`}
    >
      {contextHolder}
      <PublicSessionNav
        sessions={historySessions}
        currentSessionId={sessionId}
        mobileOpen={mobileNavOpen}
        desktopCollapsed={desktopNavCollapsed}
        onDesktopToggle={handleDesktopToggle}
        onMobileClose={handleMobileClose}
      />

      <div className="chat public-session-page__chat">
        <header className="chat__header chat__header--column">
          <div className="chat__header-top">
            <div className="chat__header-main">
              <button
                type="button"
                className="chat__sessions-toggle"
                onClick={handleMobileOpen}
                aria-label="展开公开会话列表"
              >
                <PanelLeft size={18} />
              </button>
              <div className="chat__header-info">
                <h1 className="chat__title">{headerTitle}</h1>
                <span className="chat__status">
                  {warning
                    ? '配置提醒'
                    : isStreaming
                      ? '助手正在思考...'
                      : '在线'}
                </span>
              </div>
            </div>
            <div className="chat__header-actions">
              <button
                type="button"
                className="chat__clear"
                onClick={clearLocalMessages}
              >
                <Trash2 size={18} />
                <span>清空</span>
              </button>
            </div>
          </div>
          {warning && (
            <div
              className="chat__error public-session-page__inline-warning"
              role="alert"
            >
              <span>{warning}</span>
            </div>
          )}
          {streamError && (
            <div className="chat__error" role="alert">
              <span>{streamError}</span>
              <button type="button" onClick={() => setStreamError(null)}>
                关闭
              </button>
            </div>
          )}
        </header>

        <div className="chat__messages" ref={listRef}>
          {messagesHistory.length === 0 ? (
            <div className="chat__empty">
              <Bot size={48} className="chat__empty-icon" />
              <h2>有什么我可以帮你的吗？</h2>
              <p>发送消息开始公开问答，聊天记录仅保存在当前浏览器。</p>
            </div>
          ) : (
            messagesHistory.map((item) => (
              <div
                className="message-container"
                key={item.id ?? `${item.role}-${item.createdAt}`}
              >
                <div
                  className={`public-session-page__message public-session-page__message--${item.role}`}
                >
                  <div className="public-session-page__bubble">
                    {item.warning && (
                      <div className="public-session-page__message-warning">
                        系统提醒：{item.warning}
                      </div>
                    )}
                    <div>
                      {item.content ||
                        (item.status === 'streaming' ? '...' : '')}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="chat__footer">
          <div className="chat__controls">
            {isStreaming && (
              <button
                className="chat__stop"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={14} fill="currentColor" />
                停止生成
              </button>
            )}
          </div>
          <form
            className="chat__form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              className="chat__input"
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
                event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <button type="submit" className="chat__send" disabled={!canSend}>
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
