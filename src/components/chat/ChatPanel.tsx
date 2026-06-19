/**
 * 聊天主面板
 * - 输入时：saveSessionDraft 持久化草稿
 * - 发送时：useChatSend → sendChatMessage 读取历史并调 API
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  // type FormEventHandler,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { message } from 'antd';
import { useParams } from 'react-router-dom';
import {
  Square,
  Send,
  Trash2,
  Bot,
  PanelLeft,
  Globe,
  Lock,
  Pencil,
  Save,
  Database,
  Upload,
} from 'lucide-react';
import { useChatSend } from '../../hooks/useChatSend';
import { chatActions, useChatStore } from '../../store/useChatStore';
import type { ChatMessage, StreamingAssistantState } from '../../types/chat';
import MessageItem from './MessageItem/MessageItem';
import RepoSelector from './RepoSelector';
import './ChatPanel.css';

interface ChatMessageView {
  id: string;
  role: ChatMessage['role'];
  content: string;
  metadata?: ChatMessage['metadata'];
}

interface ChatMessagesProps {
  listRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isLoadingMore: boolean;
  summary?: string;
  messagesHistory: ChatMessageView[];
  isLoading: boolean;
  hasStreamingContent: boolean;
}

const ChatMessages = memo(function ChatMessages({
  listRef,
  onScroll,
  isLoadingMore,
  summary,
  messagesHistory,
  isLoading,
  hasStreamingContent,
}: ChatMessagesProps) {
  return (
    <div className="chat__messages" ref={listRef} onScroll={onScroll}>
      {isLoadingMore && (
        <div className="message-container">
          <div className="chat__history-loading">
            <div className="dot-pulse"></div>
            <span>加载历史记录...</span>
          </div>
        </div>
      )}
      {summary && (
        <div className="message-container">
          <div className="chat__summary">
            <div className="chat__summary-title">会话摘要</div>
            <div className="chat__summary-content">{summary}</div>
          </div>
        </div>
      )}
      {messagesHistory.length === 0 && !isLoading && (
        <div className="chat__empty">
          <Bot size={48} className="chat__empty-icon" />
          <h2>有什么我可以帮你的吗？</h2>
          <p>发送消息开始对话，我可以帮你回答问题、编写代码或进行数据分析。</p>
        </div>
      )}
      {messagesHistory.map((message) => (
        <div className="message-container" key={message.id}>
          <MessageItem
            role={message.role}
            content={message.content}
            metadata={message.metadata}
          />
        </div>
      ))}
      {isLoading && !hasStreamingContent && (
        <div className="message-container">
          <div className="chat__loading-indicator">
            <div className="dot-pulse"></div>
          </div>
        </div>
      )}
    </div>
  );
});

interface ChatPanelProps {
  onSendingChange?: (sessionId: string | null) => void;
  onOpenSessions?: () => void;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const ChatPanel = memo(function ChatPanel({
  onSendingChange,
  onOpenSessions,
}: ChatPanelProps) {
  const { sessionId } = useParams();

  const session = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId),
  );
  const updateSessionManageConfig = useChatStore(
    (s) => s.updateSessionManageConfig,
  );
  const addSessionKnowledgeFiles = useChatStore(
    (s) => s.addSessionKnowledgeFiles,
  );
  const removeSessionKnowledgeFile = useChatStore(
    (s) => s.removeSessionKnowledgeFile,
  );

  const messages = session?.messages ?? [];
  const draft = session?.draft ?? '';
  const title = session?.title ?? '新对话';
  const knowledgeFiles = session?.manageConfig?.knowledgeFiles ?? [];

  const clearMessages = useChatStore((s) => s.clearMessages);
  const fetchMoreMessages = useChatStore((s) => s.fetchMoreMessages);
  const { send, stop, isLoading, error, clearError } = useChatSend(sessionId);
  const [streamingMsg, setStreamingMsg] =
    useState<StreamingAssistantState | null>(null);
  const [inputValue, setInputValue] = useState(draft);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [promptDraft, setPromptDraft] = useState('');
  const [isPublicDraft, setIsPublicDraft] = useState(false);
  const [manageSaving, setManageSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const knowledgeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setInputValue(draft);
  }, [sessionId, draft]);

  useEffect(() => {
    setTitleDraft(session?.title ?? '');
    setPromptDraft(session?.manageConfig?.systemPrompt ?? '');
    setIsPublicDraft(session?.manageConfig?.isPublic ?? false);
  }, [
    session?.id,
    session?.title,
    session?.manageConfig?.systemPrompt,
    session?.manageConfig?.isPublic,
  ]);

  const listRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const lastScrollHeightRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !sessionId || session?.isLoadingMore || !session?.hasMore) {
      return;
    }

    if (el.scrollTop === 0) {
      lastScrollHeightRef.current = el.scrollHeight;
      void fetchMoreMessages(sessionId);
    }
  }, [fetchMoreMessages, session?.hasMore, session?.isLoadingMore, sessionId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el || session?.isLoadingMore) return;

    if (lastScrollHeightRef.current > 0) {
      const delta = el.scrollHeight - lastScrollHeightRef.current;
      el.scrollTop = delta;
      lastScrollHeightRef.current = 0;
    } else if (isInitialLoadRef.current && messages.length > 0) {
      el.scrollTop = el.scrollHeight;
      isInitialLoadRef.current = false;
    } else if (!isInitialLoadRef.current) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, session?.isLoadingMore]);

  useEffect(() => {
    if (!streamingMsg?.content) return;

    const el = listRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    if (isNearBottom) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'auto',
      });
    }
  }, [streamingMsg?.content]);

  useEffect(() => {
    isInitialLoadRef.current = true;
    lastScrollHeightRef.current = 0;
  }, [sessionId]);

  useEffect(() => {
    const el = listRef.current;
    if (
      !el ||
      !sessionId ||
      !session?.detailsLoaded ||
      !session?.hasMore ||
      session?.isLoadingMore
    ) {
      return;
    }

    if (el.scrollHeight <= el.clientHeight && messages.length > 0) {
      void fetchMoreMessages(sessionId);
    }
  }, [
    fetchMoreMessages,
    messages.length,
    session?.detailsLoaded,
    session?.hasMore,
    session?.isLoadingMore,
    sessionId,
  ]);

  const messagesHistory = useMemo<ChatMessageView[]>(() => {
    if (!streamingMsg) {
      return messages;
    }

    return [
      ...messages,
      {
        id: 'streaming-temp-id',
        role: 'assistant',
        content: streamingMsg.content,
        metadata: streamingMsg.metadata,
      },
    ];
  }, [messages, streamingMsg]);

  useEffect(() => {
    onSendingChange?.(isLoading && sessionId ? sessionId : null);
  }, [isLoading, onSendingChange, sessionId]);

  const submit = useCallback(() => {
    if (!sessionId || isLoading || !inputValue.trim()) return;
    void send(inputValue, (state) => setStreamingMsg(state));
    setInputValue('');
  }, [inputValue, isLoading, send, sessionId]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submit();
    },
    [submit],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const handleSaveMeta = useCallback(async () => {
    if (!sessionId) return;
    setManageSaving(true);
    setManageError(null);
    try {
      await updateSessionManageConfig(sessionId, {
        title: titleDraft.trim() || '新对话',
        isPublic: isPublicDraft,
        systemPrompt: promptDraft,
      });
      message.success('会话设置已保存');
      setIsEditingMeta(false);
    } catch (err: any) {
      const errorMessage = err.message || '保存会话配置失败';
      setManageError(errorMessage);
      message.error(errorMessage);
    } finally {
      setManageSaving(false);
    }
  }, [
    isPublicDraft,
    promptDraft,
    sessionId,
    titleDraft,
    updateSessionManageConfig,
  ]);

  const handleKnowledgeUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (!sessionId) return;
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;

      setManageSaving(true);
      setManageError(null);
      try {
        await addSessionKnowledgeFiles(sessionId, files);
        event.target.value = '';
      } catch (err: any) {
        setManageError(err.message || '上传知识库文件失败');
      } finally {
        setManageSaving(false);
      }
    },
    [addSessionKnowledgeFiles, sessionId],
  );

  const handleKnowledgeDelete = useCallback(
    async (fileId: string) => {
      if (!sessionId) return;
      setManageSaving(true);
      setManageError(null);
      try {
        await removeSessionKnowledgeFile(sessionId, fileId);
      } catch (err: any) {
        setManageError(err.message || '删除知识库文件失败');
      } finally {
        setManageSaving(false);
      }
    },
    [removeSessionKnowledgeFile, sessionId],
  );

  return (
    <div className="chat">
      <header className="chat__header chat__header--column">
        <div className="chat__header-top">
          <div className="chat__header-main">
            <button
              type="button"
              className="chat__sessions-toggle"
              onClick={onOpenSessions}
              aria-label="展开会话列表"
            >
              <PanelLeft size={18} />
            </button>
            <div className="chat__header-info">
              <h1 className="chat__title">{title}</h1>
              <span className="chat__status">
                {isLoading ? '助手正在思考...' : '在线'}
              </span>
            </div>
          </div>
          <div className="chat__header-actions">
            <button
              type="button"
              className="chat__meta-toggle"
              onClick={() => setIsEditingMeta((prev) => !prev)}
            >
              <Pencil size={16} />
              会话设置
            </button>
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
          </div>
        </div>

        {isEditingMeta && sessionId && (
          <div className="chat__meta-panel">
            <div className="chat__meta-grid">
              <label className="chat__meta-field">
                <span>会话名称</span>
                <input
                  className="chat__meta-input"
                  value={titleDraft}
                  disabled={manageSaving}
                  onChange={(event) => setTitleDraft(event.target.value)}
                />
              </label>
              <label className="chat__meta-field chat__meta-field--switch">
                <span>允许他人访问</span>
                <button
                  type="button"
                  className={`chat__visibility${isPublicDraft ? ' chat__visibility--public' : ''}`}
                  disabled={manageSaving}
                  onClick={() => setIsPublicDraft((prev) => !prev)}
                >
                  {isPublicDraft ? <Globe size={16} /> : <Lock size={16} />}
                  {isPublicDraft ? '公开' : '私有'}
                </button>
              </label>
              <label className="chat__meta-field chat__meta-field--full">
                <span>会话 Prompt</span>
                <textarea
                  className="chat__meta-textarea"
                  value={promptDraft}
                  disabled={manageSaving}
                  placeholder="输入该会话的系统提示词"
                  onChange={(event) => setPromptDraft(event.target.value)}
                />
              </label>
            </div>

            <div className="chat__meta-knowledge">
              <div className="chat__meta-knowledge-header">
                <div className="chat__meta-knowledge-title">
                  <Database size={16} />
                  <span>知识库文件</span>
                </div>
                <button
                  type="button"
                  className="chat__meta-upload"
                  disabled={manageSaving}
                  onClick={() => knowledgeInputRef.current?.click()}
                >
                  <Upload size={16} />
                  上传文件
                </button>
                <input
                  ref={knowledgeInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleKnowledgeUpload}
                />
              </div>

              <div className="chat__knowledge-list">
                {knowledgeFiles.length === 0 ? (
                  <div className="chat__knowledge-empty">暂无知识库文件</div>
                ) : (
                  knowledgeFiles.map((file) => (
                    <div key={file.id} className="chat__knowledge-item">
                      <div className="chat__knowledge-main">
                        <div className="chat__knowledge-name">{file.name}</div>
                        <div className="chat__knowledge-meta">
                          {formatFileSize(file.size)} ·{' '}
                          {new Date(file.uploadedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="chat__knowledge-delete"
                        disabled={manageSaving}
                        onClick={() => void handleKnowledgeDelete(file.id)}
                      >
                        <Trash2 size={14} />
                        删除
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="chat__meta-footer">
              {manageError && (
                <span className="chat__meta-error">{manageError}</span>
              )}
              <button
                type="button"
                className="chat__meta-save"
                disabled={manageSaving}
                onClick={() => void handleSaveMeta()}
              >
                <Save size={16} />
                {manageSaving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        )}
      </header>

      <ChatMessages
        listRef={listRef}
        onScroll={handleScroll}
        isLoadingMore={Boolean(session?.isLoadingMore)}
        summary={session?.summary}
        messagesHistory={messagesHistory}
        isLoading={isLoading}
        hasStreamingContent={Boolean(streamingMsg?.content)}
      />

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
                setInputValue(val);
                chatActions.updateDraft(sessionId, val);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            className="chat__send"
            disabled={!inputValue.trim() || isLoading || !sessionId}
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
});

export default ChatPanel;
