/**
 * 聊天主面板
 * - 输入时：saveSessionDraft 持久化草稿
 * - 发送时：useChatSend → sendChatMessage 读取历史并调 API
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useParams } from 'react-router-dom';
import { Square, Send, Trash2, Bot } from 'lucide-react';
import { useChatSend } from '../../hooks/useChatSend';
import {
  chatActions,
  useActiveSession,
  useChatStore,
} from '../../store/useChatStore';
import MessageItem from './MessageItem/MessageItem';
import RepoSelector from './RepoSelector';
import './ChatPanel.css';

interface ChatPanelProps {
  onSendingChange?: (sessionId: string | null) => void;
}

export default function ChatPanel({ onSendingChange }: ChatPanelProps) {
  const { sessionId } = useParams();

  // 直接根据路由中的 sessionId 查找会话，而不是依赖 Store 的 activeSessionId
  const session = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId),
  );

  const messages = session?.messages ?? [];
  const draft = session?.draft ?? '';
  const title = session?.title ?? '新对话';

  const clearMessages = useChatStore((s) => s.clearMessages);
  const fetchMoreMessages = useChatStore((s) => s.fetchMoreMessages);
  const { send, stop, isLoading, error, clearError } = useChatSend(sessionId);
  const [streamingMsg, setStreamingMsg] = useState('');

  // 增加局部 state 来管理输入，确保输入的即时响应
  const [inputValue, setInputValue] = useState(draft);

  // 当切换会话时，同步草稿到局部 state
  useEffect(() => {
    setInputValue(draft);
  }, [sessionId, draft]);

  const listRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const lastScrollHeightRef = useRef(0);

  // 处理滚动加载历史记录
  const handleScroll = () => {
    const el = listRef.current;
    if (!el || !sessionId || session?.isLoadingMore || !session?.hasMore)
      return;

    // 当滚动到顶部时，加载更多
    if (el.scrollTop === 0) {
      lastScrollHeightRef.current = el.scrollHeight;
      void fetchMoreMessages(sessionId);
    }
  };

  // 监听内容变化，如果是加载历史消息，保持滚动位置
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    if (session?.isLoadingMore) return;

    // 如果是加载了更多历史消息（prepend）
    if (lastScrollHeightRef.current > 0) {
      const delta = el.scrollHeight - lastScrollHeightRef.current;
      el.scrollTop = delta;
      lastScrollHeightRef.current = 0;
    } else if (isInitialLoadRef.current && messages.length > 0) {
      // 首次加载详情，滚动到底部
      el.scrollTop = el.scrollHeight;
      isInitialLoadRef.current = false;
    } else if (!isInitialLoadRef.current) {
      // 发送新消息，平滑滚动到底部
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, session?.isLoadingMore]);

  // 当切换会话时，重置初始加载标记
  useEffect(() => {
    isInitialLoadRef.current = true;
    lastScrollHeightRef.current = 0;
  }, [sessionId]);

  // 检查是否需要自动填满屏幕
  useEffect(() => {
    const el = listRef.current;
    if (
      !el ||
      !sessionId ||
      !session?.detailsLoaded ||
      !session?.hasMore ||
      session?.isLoadingMore
    )
      return;

    // 如果消息没占满屏幕，自动加载下一页
    if (el.scrollHeight <= el.clientHeight && messages.length > 0) {
      void fetchMoreMessages(sessionId);
    }
  }, [messages.length, session?.detailsLoaded, session?.hasMore, sessionId]);

  const messagesHistory = useMemo(() => {
    if (!streamingMsg) {
      return messages;
    }
    return [
      ...messages,
      {
        id: 'streaming-temp-id',
        role: 'assistant' as const,
        content: streamingMsg,
        status: 'sending' as const,
      },
    ];
  }, [messages, streamingMsg]);

  useEffect(() => {
    onSendingChange?.(isLoading && sessionId ? sessionId : null);
  }, [isLoading, sessionId, onSendingChange]);

  const submit = () => {
    if (!sessionId || isLoading || !inputValue.trim()) return;
    void send(inputValue, (val) => setStreamingMsg(val));
    setInputValue(''); // 发送后清空局部 state
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat">
      <header className="chat__header">
        <div className="chat__header-info">
          <h1 className="chat__title">{title}</h1>
          <span className="chat__status">
            {isLoading ? '助手正在思考...' : '在线'}
          </span>
        </div>
        <button
          type="button"
          className="chat__clear"
          title="清空对话"
          disabled={messages.length === 0 || isLoading || !sessionId}
          onClick={() => {
            if (window.confirm('确定要清空当前会话的消息吗？')) {
              sessionId && clearMessages(sessionId);
            }
          }}
        >
          <Trash2 size={18} />
          <span>清空</span>
        </button>
      </header>

      <div className="chat__messages" ref={listRef} onScroll={handleScroll}>
        {session?.isLoadingMore && (
          <div className="chat__history-loading">
            <div className="dot-pulse"></div>
            <span>加载历史记录...</span>
          </div>
        )}
        {session?.summary && (
          <div className="chat__summary">
            <div className="chat__summary-title">会话摘要</div>
            <div className="chat__summary-content">{session.summary}</div>
          </div>
        )}
        {messagesHistory.length === 0 && !isLoading && (
          <div className="chat__empty">
            <Bot size={48} className="chat__empty-icon" />
            <h2>有什么我可以帮你的吗？</h2>
            <p>
              发送消息开始对话，我可以帮你回答问题、编写代码或进行数据分析。
            </p>
          </div>
        )}
        {messagesHistory.map((m) => (
          <MessageItem key={m.id} role={m.role} content={m.content} />
        ))}
        {isLoading && !streamingMsg && (
          <div className="chat__loading-indicator">
            <div className="dot-pulse"></div>
          </div>
        )}
      </div>

      {error && (
        <div className="chat__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => clearError()}>
            关闭
          </button>
        </div>
      )}

      <div className="chat__footer">
        <RepoSelector
          onSelect={(repo) => {
            const text = `请帮我审查 ${repo.fullName} 仓库的代码`;
            setInputValue(text);
            if (sessionId) chatActions.updateDraft(sessionId, text);
          }}
        />
        <div className="chat__controls">
          {isLoading && (
            <button className="chat__stop" onClick={stop}>
              <Square size={14} fill="currentColor" />
              停止生成
            </button>
          )}
        </div>
        <form className="chat__form" onSubmit={onSubmit}>
          <textarea
            className="chat__input"
            rows={1}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            value={inputValue}
            disabled={isLoading || !sessionId}
            onChange={(e) => {
              if (sessionId) {
                const val = e.target.value;
                setInputValue(val); // 立即更新 UI
                chatActions.updateDraft(sessionId, val); // 异步保存到 Store
                // 自动调整高度
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="chat__send"
            disabled={!draft.trim() || isLoading || !sessionId}
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
