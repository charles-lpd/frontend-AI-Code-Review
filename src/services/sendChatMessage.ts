import { sendChatStream } from '../api';
import { chatActions } from '../store/useChatStore';
import type {
  ChatMessage,
  KnowledgeAgentStreamState,
  StreamingAssistantState,
} from '../types/chat';
import { consumeKnowledgeChatStream } from './knowledgeAgentStream';

/**
 * 普通聊天消息发送：
 * - 只解析 /chat 的纯文本流
 * - 不再承载 GitHub 审查流程
 */
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onStreaming: (state: StreamingAssistantState | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  const text = content.trim();
  if (!text) return;

  const session = chatActions.getSession(sessionId);
  if (!session) throw new Error('会话不存在');

  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text,
    status: 'success',
    createdAt: Date.now(),
  };
  chatActions.addMessage(sessionId, userMessage);
  chatActions.updateDraft(sessionId, '');

  const assistantMsgId = crypto.randomUUID();
  const latestStateRef: { current: KnowledgeAgentStreamState | null } = {
    current: null,
  };

  try {
    const response = await sendChatStream(sessionId, [userMessage], signal);
    if (!response.body) throw new Error('响应正文为空');

    const finalState = await consumeKnowledgeChatStream(response, {
      signal,
      onState: (state) => {
        latestStateRef.current = state;
        onStreaming({
          content: state.answer,
          metadata: { knowledgeAgent: state },
        });
      },
    });

    chatActions.addMessage(sessionId, {
      id: assistantMsgId,
      role: 'assistant',
      content: finalState.answer,
      metadata: { knowledgeAgent: finalState },
      status: 'success',
      createdAt: Date.now(),
    });
    onStreaming(null);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const latestState = latestStateRef.current;
      if (latestState) {
        chatActions.addMessage(sessionId, {
          id: assistantMsgId,
          role: 'assistant',
          content: latestState.answer
            ? `${latestState.answer} [已停止生成]`
            : '已停止生成',
          metadata: { knowledgeAgent: latestState },
          status: 'success',
          createdAt: Date.now(),
        });
      }
      onStreaming(null);
      return;
    }
    throw err;
  }
}
