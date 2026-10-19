import { WorkspaceMessages, WorkspaceHeader, WorkspaceError, WorkspaceComposer, WorkspaceEmpty } from '@/components/workspace/workspace';
import { useChatScroll } from '@/hooks/useChatScroll';
import { Spinner } from '@/ui/spinner';
import { Button } from '@/ui/button';
import { ConfirmAction } from '@/components/confirm-action';
import { Badge } from '@/ui/badge';
import { Textarea } from '@/ui/textarea';
/**
 * 聊天主面板
 * - 输入时：saveSessionDraft 持久化草稿
 * - 发送时：useChatSend → sendChatMessage 读取历史并调 API
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { toast as message } from 'sonner';
import { Link, useParams } from 'react-router-dom';
import { Square, Send, Trash2, Bot, PanelLeft, Settings } from 'lucide-react';
import { useChatSend } from '../../hooks/useChatSend';
import { chatActions, useChatStore } from '../../store/useChatStore';
import type { ChatMessage } from '../../types/chat';
import MessageItem from './MessageItem/MessageItem';
import './ChatPanel.css';

interface ChatMessageView {
  id: string;
  role: ChatMessage['role'];
  content: string;
  metadata?: ChatMessage['metadata'];
  status?: ChatMessage['status'];
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
    <WorkspaceMessages className="chat__messages" ref={listRef} onScroll={onScroll}>
      {isLoadingMore && (
        <div className="message-container">
          <div className="chat__history-loading">
            <Spinner />
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
        <WorkspaceEmpty icon={<Bot size={40} />} title="有什么我可以帮你的吗？" description="发送消息开始对话，我可以帮你回答问题、编写代码或进行数据分析。" />
      )}
      {messagesHistory.map((message) => (
        <div className="message-container" key={message.id}>
          <MessageItem
            streamKey={`private-chat:${message.id}`}
            role={message.role}
            content={message.content}
            metadata={message.metadata}
          />
          {message.role === 'assistant' && (message.status === 'failed' || message.status === 'aborted') && (
            <div role="status" className="chat__knowledge-notice">
              {message.status === 'aborted' ? '已停止生成' : '回答未完成'}
            </div>
          )}
        </div>
      ))}
      {isLoading && !hasStreamingContent && (
        <div className="message-container">
          <div className="chat__loading-indicator">
            <div className="dot-pulse"></div>
          </div>
        </div>
      )}
    </WorkspaceMessages>
  );
});

interface ChatPanelProps {
  onSendingChange?: (sessionId: string | null) => void;
  onOpenSessions?: () => void;
  mobileNavOpen?: boolean;
  mobileTriggerRef?: import('react').RefObject<HTMLButtonElement | null>;
}

const ChatPanel = memo(function ChatPanel({
  onSendingChange,
  onOpenSessions,
  mobileNavOpen,
  mobileTriggerRef,
}: ChatPanelProps) {
  const { sessionId } = useParams();
  const createSession = useChatStore((s) => s.createSession);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const session = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === sessionId),
  );

  const messages = session?.messages ?? [];
  const draft = session?.draft ?? '';
  const title = session?.title ?? '新对话';

  const clearMessages = useChatStore((s) => s.clearMessages);
  const fetchMoreMessages = useChatStore((s) => s.fetchMoreMessages);
  const { send, stop, isLoading, error, errorCode, retryAfterSeconds, clearError } = useChatSend(sessionId);
  const [inputValue, setInputValue] = useState(draft);
  const [isClearing, setIsClearing] = useState(false);
  const latestUser = [...messages].reverse().find((item) => item.role === 'user');
  const latestReply = latestUser
    ? messages.find((item) => item.role === 'assistant' && item.replyToMessageId === latestUser.id)
    : undefined;
  const retryConflict = errorCode === 'CHAT_RETRY_CONFLICT' || errorCode === 'IDEMPOTENCY_CONFLICT';
  const canRetry = Boolean(latestUser?.clientMessageId && latestReply &&
    (latestReply.status === 'failed' || latestReply.status === 'aborted') && !retryConflict);

  useEffect(() => {
    setInputValue(draft);
  }, [sessionId, draft]);

  const listRef = useRef<HTMLDivElement>(null);
  const { showLatest, scrollToLatest, preserveHistory } = useChatScroll(listRef, sessionId, messages);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !sessionId || session?.isLoadingMore || !session?.hasMore) {
      return;
    }

    if (el.scrollTop === 0) {
      preserveHistory();
      void fetchMoreMessages(sessionId);
    }
  }, [fetchMoreMessages, session?.hasMore, session?.isLoadingMore, sessionId, preserveHistory]);


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

  const messagesHistory: ChatMessageView[] = messages;
  useEffect(() => {
    onSendingChange?.(isLoading && sessionId ? sessionId : null);
  }, [isLoading, onSendingChange, sessionId]);

  const submit = useCallback(async () => {
    scrollToLatest();
    const text = inputValue.trim();
    if (!text || isLoading || isCreatingSession) return;
    if (session?.manageConfig?.chatMode === 'knowledge') {
      if (session.manageConfig.knowledgeReadiness === 'indexing') {
        message.warning('知识库正在建立索引，请稍后再试');
        return;
      }
      if (session.manageConfig.knowledgeReadiness === 'failed') {
        message.error('知识库索引失败，请在会话设置中重新索引');
        return;
      }
    }

    let targetSessionId = sessionId;
    if (!targetSessionId) {
      setIsCreatingSession(true);
      try {
        targetSessionId = await createSession();
        if (!targetSessionId) return;
      } finally {
        setIsCreatingSession(false);
      }
    }

    if (!targetSessionId) return;
    setInputValue('');
    await send(text, () => {}, targetSessionId);
  }, [
    createSession,
    scrollToLatest,
    inputValue,
    isCreatingSession,
    isLoading,
    send,
    session?.manageConfig?.chatMode,
    session?.manageConfig?.knowledgeReadiness,
    sessionId,
  ]);

  const onSubmit = useCallback(
    (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      void submit();
    },
    [submit],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const nativeEvent = e.nativeEvent as KeyboardEvent<HTMLTextAreaElement>['nativeEvent'] & {
        isComposing?: boolean;
      };
      if (e.key === 'Enter' && !e.shiftKey && !nativeEvent.isComposing) {
        e.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  return (
    <div className="chat">
      <WorkspaceHeader className="chat__header">
        <div className="chat__header-main">
          <Button variant="ghost"
            type="button"
            ref={mobileTriggerRef}
            aria-expanded={mobileNavOpen}
            aria-controls="workspace-session-sidebar"
            className="chat__sessions-toggle min-[1025px]:hidden"
            onClick={onOpenSessions}
            aria-label="展开会话列表"
          >
            <PanelLeft size={18} />
          </Button>
          <div className="chat__header-info">
            <h1 className="chat__title">{title}</h1>
            <Badge className="chat__status">
              {isLoading ? '助手正在思考...' : '在线'}
            </Badge>
          </div>
        </div>
        <div className="chat__header-actions">
          {sessionId && (
            <Link to={`/chat-details/${sessionId}`} className="chat__meta-link">
              <Settings size={16} />
              会话设置
            </Link>
          )}
          <ConfirmAction title="确定要清空当前会话的消息吗？" onConfirm={async () => {
            if (!sessionId) return;
            setIsClearing(true);
            try {
              await clearMessages(sessionId);
              message.success('会话记录已清空');
            } finally { setIsClearing(false); }
          }}><Button variant="outline"
            type="button"
            className="chat__clear"
            title="清空对话"
            disabled={
              messages.length === 0 || isLoading || !sessionId || isClearing
            }
          >
            <Trash2 size={18} />
            <span>清空</span>
          </Button></ConfirmAction>
        </div>
      </WorkspaceHeader>

      {showLatest && <Button className="chat__latest-button" variant="outline" onClick={scrollToLatest}>回到最新</Button>}
      <ChatMessages
        listRef={listRef}
        onScroll={handleScroll}
        isLoadingMore={Boolean(session?.isLoadingMore)}
        summary={session?.summary ?? undefined}
        messagesHistory={messagesHistory}
        isLoading={isLoading}
        hasStreamingContent={Boolean(
          messages.some(item => item.role === 'assistant' && item.status === 'generating'),
        )}
      />

      {error && (
        <WorkspaceError className="chat__error" role="alert">
          <span>{error}</span>
          {retryConflict && latestUser && (
            <Button variant="outline" type="button" onClick={() => {
              setInputValue(latestUser.content);
              if (sessionId) chatActions.updateDraft(sessionId, latestUser.content);
              clearError();
            }}>作为新问题填写</Button>
          )}
          <Button variant="outline" type="button" onClick={() => clearError()}>
            关闭
          </Button>
        </WorkspaceError>
      )}

      {session?.manageConfig?.knowledgeReadiness === 'mixed' &&
        (session.manageConfig.chatMode === 'auto' ||
          session.manageConfig.chatMode === 'knowledge') && (
          <div className="chat__knowledge-notice" role="status">
            部分知识文件仍在处理或索引失败，本次问答仅使用已就绪文件。
          </div>
        )}

      <div className="chat__footer">
        <div className="chat__controls">
          {canRetry && latestUser && (
            <Button variant="outline" type="button" className="chat__stop"
              disabled={isLoading || retryAfterSeconds > 0}
              onClick={() => void send(
                latestUser.content, () => {}, sessionId,
                latestUser.clientMessageId ?? undefined,
              )}>
              重新生成
            </Button>
          )}
          {isLoading && (
            <Button variant="outline" className="chat__stop" onClick={stop}>
              <Square size={14} fill="currentColor" />
              停止生成
            </Button>
          )}
        </div>
        <WorkspaceComposer className="chat__form" onSubmit={onSubmit}>
          <Textarea
            className="chat__input"
            rows={1}
            placeholder={
              retryAfterSeconds > 0
                ? `请求过于频繁，请 ${retryAfterSeconds} 秒后重试`
                : '输入消息，Enter 发送，Shift+Enter 换行'
            }
            maxLength={10_000}
            value={inputValue}
            disabled={isLoading || isCreatingSession || retryAfterSeconds > 0}
            onChange={(e) => {
              const val = e.target.value;
              setInputValue(val);
              if (sessionId) {
                chatActions.updateDraft(sessionId, val);
              }
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onCompositionStart={(e) => {
              e.currentTarget.dataset.composing = 'true';
            }}
            onCompositionEnd={(e) => {
              e.currentTarget.dataset.composing = 'false';
            }}
            onKeyDown={onKeyDown}
          />
          <Button
            type="submit"
            className="chat__send"
            disabled={!inputValue.trim() || isLoading || isCreatingSession || retryAfterSeconds > 0}
          >
            <Send size={20} />
          </Button>
        </WorkspaceComposer>
      </div>
    </div>
  );
});

export default ChatPanel;
