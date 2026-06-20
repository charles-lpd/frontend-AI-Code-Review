import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, message } from 'antd';
import { Send, StopCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { sendPublicChatStream } from '../api/index';
import { sessionApi } from '../api/sessions';
import type { PublicChatMessage, PublicSessionInfo } from '../types/chat';
import './PublicSession.css';

const storageKey = (sessionId: string) => `public-session-chat-${sessionId}`;

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
  const [streamError, setStreamError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PublicChatMessage[];
      setMessages(parsed);
    } catch {
      window.localStorage.removeItem(storageKey(sessionId));
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
    if (!sessionId) return;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await sessionApi.getPublicDetail(sessionId);
        setSessionInfo(detail);
        setWarning(detail.warning);
      } catch (err: any) {
        setStreamError(err.message || '公开会话加载失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sessionId]);

  const persistMessages = useCallback(
    (next: PublicChatMessage[]) => {
      setMessages(next);
      window.localStorage.setItem(storageKey(sessionId), JSON.stringify(next));
    },
    [sessionId],
  );

  const handleSend = useCallback(async () => {
    if (!sessionId || !inputValue.trim() || isStreaming) return;

    const userMessage: PublicChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
      createdAt: Date.now(),
      status: 'done',
    };
    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: PublicChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      status: 'streaming',
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    persistMessages(nextMessages);
    setInputValue('');
    setIsStreaming(true);
    setStreamError(null);

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
  ]);

  const clearLocalMessages = useCallback(() => {
    persistMessages([]);
    messageApi.success('本地聊天记录已清空');
  }, [messageApi, persistMessages]);

  const canSend = inputValue.trim().length > 0 && !isStreaming && !warning;

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
        <div>
          <h1>{sessionInfo.title}</h1>
          <p>公开客服问答</p>
        </div>
        <Button onClick={clearLocalMessages}>清空本地聊天</Button>
      </div>

      {warning && (
        <Alert
          type="warning"
          showIcon
          className="public-session-page__warning"
          message={warning}
        />
      )}

      {streamError && (
        <Alert
          type="error"
          showIcon
          message={streamError}
          className="public-session-page__warning"
        />
      )}

      <div className="public-session-page__messages">
        {messages.length === 0 ? (
          <Empty description="发送消息开始使用公开客服" />
        ) : (
          messages.map((item) => (
            <div
              key={item.id ?? `${item.role}-${item.createdAt}`}
              className={`public-session-page__message public-session-page__message--${item.role}`}
            >
              <div className="public-session-page__bubble">
                {item.warning && (
                  <div className="public-session-page__message-warning">
                    系统提醒：{item.warning}
                  </div>
                )}
                <div>
                  {item.content || (item.status === 'streaming' ? '...' : '')}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="public-session-page__input">
        <Input.TextArea
          rows={4}
          value={inputValue}
          placeholder={
            warning ? '当前会话配置不完整，暂不可提问' : '请输入你的问题'
          }
          disabled={isStreaming}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <div className="public-session-page__actions">
          {isStreaming && (
            <Button
              icon={<StopCircle size={16} />}
              onClick={() => abortRef.current?.abort()}
            >
              停止生成
            </Button>
          )}
          <Button
            type="primary"
            icon={<Send size={16} />}
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
