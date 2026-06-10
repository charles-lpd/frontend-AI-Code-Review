import { chatActions } from '../store/useChatStore';
import { sendChatStream } from '../api';
import type { ChatMessage } from '../types/chat';

/**
 * 发送消息：
 * 1. 负责 UI 状态更新 (通过 chatActions)
 * 2. 负责流式响应解析
 * 3. 负责 Abort 控制
 */
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onStreaming: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const text = content.trim();
  if (!text) return;

  const session = chatActions.getSession(sessionId);
  if (!session) throw new Error('会话不存在');

  // 1. 添加用户消息并清空草稿
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    status: 'success',
    createdAt: Date.now(),
  };
  chatActions.addMessage(sessionId, userMessage);
  chatActions.updateDraft(sessionId, '');

  try {
    // 使用 api/index.ts 中封装 of sendChatStream，现在发送包含当前消息的数组
    const res = await sendChatStream(sessionId, [userMessage], signal);

    if (!res.body) throw new Error('响应正文为空');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let buffer = ''; // 增加缓冲区处理跨 chunk 的行

    // 预创建一个 Assistant 消息 ID，用于后续更新
    const assistantMsgId = crypto.randomUUID();

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        chatActions.addMessage(sessionId, {
          id: assistantMsgId,
          role: 'assistant',
          content: result + ' [已停止生成]',
          status: 'success',
          createdAt: Date.now(),
        });
        onStreaming('');
        return;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，留到下次处理

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const data = trimmedLine.replace(/^data:\s*/, '');

        if (data === '[DONE]') {
          // 最终保存
          chatActions.addMessage(sessionId, {
            id: assistantMsgId,
            role: 'assistant',
            content: result,
            status: 'success',
            createdAt: Date.now(),
          });
          onStreaming('');
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // 处理后端可能返回的 SSE 错误对象
          if (parsed.error) {
            const errorMsg = parsed.error.message || 'AI 处理异常';
            throw new Error(errorMsg);
          }

          // 兼容不同的返回格式：parsed.text 或 parsed.choices[0].delta.content
          const delta =
            parsed.text || parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            result += delta;
            onStreaming(result);
          }
        } catch (e) {
          if (e instanceof Error && !data.includes('error')) {
            console.error('解析 SSE 数据失败:', data, e);
          } else if (data.includes('error')) {
            // 如果 JSON 解析失败但包含 error 关键字，尝试抛出
            throw e;
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('Fetch aborted');
    } else {
      throw err;
    }
  }
}
