import { createTextStreamRuntime } from './textStreamRuntime';
import { ApiError, sendChatStream } from '../api';
import { chatActions } from '../store/useChatStore';
import type { ChatMessage, KnowledgeAgentStreamState, StreamingAssistantState } from '../types/chat';
import { consumeKnowledgeChatStream, createKnowledgeAgentState } from './knowledgeAgentStream';

/** 把流式状态映射为消息的终态：completed / truncated（被截断）/ aborted（用户停止）/ failed。 */
function toTerminalMessageStatus(status: KnowledgeAgentStreamState['status']): ChatMessage['status'] {
  if (status === 'completed' || status === 'truncated' || status === 'aborted') return status;
  return 'failed';
}

/** A retry reuses the persisted user turn and replaces its assistant draft. */
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onStreaming: (state: StreamingAssistantState | null) => void,
  signal?: AbortSignal,
  retryClientMessageId?: string,
): Promise<void> {
  const text = content.trim();
  if (!text) return;
  // 文档约定：单条 content 最长 10000 字符，前端先拦截，避免无谓请求。
  if (text.length > 10000) throw new ApiError('问题最长 10000 个字符，请精简后再发送', 'INVALID_REQUEST');
  const session = chatActions.getSession(sessionId);
  if (!session) throw new Error('会话不存在');

  const clientMessageId = retryClientMessageId ?? crypto.randomUUID();
  const existingUser = retryClientMessageId
    ? session.messages.find((m) => m.role === 'user' && m.clientMessageId === clientMessageId)
    : undefined;
  if (retryClientMessageId && (!existingUser || existingUser.content !== text)) {
    throw new ApiError('重试的问题与原消息不一致，请作为新问题发送', 'IDEMPOTENCY_CONFLICT');
  }
  let userId = existingUser?.id ?? crypto.randomUUID();
  const existingReply = existingUser
    ? session.messages.find((m) => m.role === 'assistant' && m.replyToMessageId === userId)
    : undefined;
  let assistantId = existingReply?.id ?? crypto.randomUUID();
  const update = (id: string, patch: Partial<ChatMessage>) => chatActions.updateMessage(sessionId, id, patch);
  let state: KnowledgeAgentStreamState = createKnowledgeAgentState();

  if (!existingUser) {
    chatActions.addMessage(sessionId, {
      id: userId, role: 'user', content: text, clientMessageId,
      status: 'completed', createdAt: Date.now(),
    });
  }
  if (!existingReply) {
    chatActions.addMessage(sessionId, {
      id: assistantId, role: 'assistant', content: '', replyToMessageId: userId,
      status: 'generating', createdAt: Date.now(), metadata: { knowledgeAgent: state },
    });
  } else {
    update(assistantId, { content: '', status: 'generating', metadata: { knowledgeAgent: state } });
  }
  chatActions.updateDraft(sessionId, '');
  // Private drafts live in the session store, so route switches cannot move them.
  onStreaming(null);

  const runtime = createTextStreamRuntime({
    identity: { scope: 'private-chat', conversationId: sessionId, requestId: crypto.randomUUID() },
    key: `private-chat:${assistantId}`,
    onCheckpoint: (snapshot, terminal) => update(assistantId, {
      content: snapshot.content, metadata: snapshot.metadata,
      status: terminal ? toTerminalMessageStatus(state.status) : 'generating',
    }),
  });
  const publish = (next: KnowledgeAgentStreamState, replaced = false) => {
    state = next;
    runtime.receive({ content: state.answer, metadata: { knowledgeAgent: state } }, replaced);
  };
  try {
    const response = await sendChatStream(
      sessionId, [{ role: 'user', content: text }], signal, clientMessageId,
    );
    const finalState = await consumeKnowledgeChatStream(response, {
      signal,
      onState: publish,
      onMessageMeta: (meta) => {
        update(userId, { id: meta.userMessageId, clientMessageId: meta.clientMessageId ?? clientMessageId });
        userId = meta.userMessageId;
        update(assistantId, { id: meta.assistantMessageId, replyToMessageId: userId });
        assistantId = meta.assistantMessageId;
        runtime.rekey(`private-chat:${assistantId}`);
      },
    });
    state = finalState;
    runtime.finish({ content: finalState.answer, metadata: { knowledgeAgent: finalState } });
  } catch (error) {
    const aborted = signal?.aborted || (error instanceof Error && error.name === 'AbortError');
    const status = aborted ? 'aborted' : 'failed';
    publish({
      ...state, status,
      error: aborted ? undefined : error instanceof Error ? error.message : '回答生成失败',
      errorCode: error instanceof ApiError ? error.code : state.errorCode,
      requestId: error instanceof ApiError ? error.requestId ?? state.requestId : state.requestId,
    });
    runtime.finish();
    if (!aborted) throw error;
  }
}
