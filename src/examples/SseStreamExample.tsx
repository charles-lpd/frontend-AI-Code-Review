import { useCallback, useRef, useState } from 'react';

type StreamMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type SsePayload = {
  type?: 'text' | 'agent_status';
  text?: string;
  warning?: string;
  error?: string | { message?: string };
};

async function postStream(
  url: string,
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 如果你项目里有 token，可以在这里补 Authorization
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message ||
        errorData?.error ||
        `请求失败: ${response.status}`,
    );
  }

  if (!response.body) {
    throw new Error('响应正文为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    // 1. 先把新到的字节追加到缓冲区
    buffer += decoder.decode(value, { stream: true });

    // 2. SSE 事件以空行分隔，所以按 \n\n 切帧
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      consumeFrame(frame, onDelta);
      boundary = buffer.indexOf('\n\n');
    }
  }

  // 3. 处理最后残留的半包
  if (buffer.trim()) {
    consumeFrame(buffer, onDelta);
  }
}

function consumeFrame(frame: string, onDelta: (text: string) => void) {
  const trimmed = frame.trim();
  if (!trimmed) return;
  if (trimmed.startsWith(':')) return; // SSE 心跳，忽略

  const dataText = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');

  if (!dataText) return;
  if (dataText === '[DONE]') return;

  let payload: SsePayload;
  try {
    payload = JSON.parse(dataText) as SsePayload;
  } catch {
    return;
  }

  if (payload.error) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error.message || '流式响应失败';
    throw new Error(message);
  }

  if (payload.type === 'text' && typeof payload.text === 'string') {
    onDelta(payload.text);
  }
}

export default function SseStreamExample() {
  const [input, setInput] = useState('你好，请帮我写一个简单示例。');
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const nextMessages: StreamMessage[] = [
      ...messages,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await postStream(
        '/api/chat',
        {
          sessionId: 'your-session-id',
          messages: [{ role: 'user', content: text }],
        },
        (delta) => {
          setMessages((current) => {
            const last = current[current.length - 1];
            if (!last || last.role !== 'assistant') return current;

            const updated = [...current];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + delta,
            };
            return updated;
          });
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('已停止生成');
      } else {
        setError(err?.message || '发送失败');
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, isLoading, messages]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h2>流式接收最小示例</h2>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        style={{ width: '100%', marginBottom: 12 }}
        placeholder="输入内容后点击发送"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => void handleSend()} disabled={isLoading}>
          {isLoading ? '发送中...' : '发送'}
        </button>
        <button
          type="button"
          onClick={() => abortRef.current?.abort()}
          disabled={!isLoading}
        >
          停止
        </button>
      </div>

      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>{error}</div>}

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: 16,
          minHeight: 240,
          whiteSpace: 'pre-wrap',
        }}
      >
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} style={{ marginBottom: 12 }}>
            <strong>{message.role === 'user' ? '用户' : '助手'}：</strong>
            <div>{message.content || (message.role === 'assistant' && isLoading ? '...' : '')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
