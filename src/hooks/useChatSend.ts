/**
 * 聊天发送 hook：管理发送中的 UI 状态，实际发送逻辑在 services/sendChatMessage
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { sessionApi } from '../api/sessions';
import { useChatStore } from '../store/useChatStore';
import { sendChatMessage } from '../services/sendChatMessage';
import type { ApiErrorCode, StreamingAssistantState } from '../types/chat';

export function useChatSend(sessionId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ApiErrorCode | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsLoading(false);
    setError(null);
    setErrorCode(null);
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [sessionId]);
  useEffect(() => {
    if (retryAfterSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const send = useCallback(
    async (
      content: string,
      onChange: (state: StreamingAssistantState | null) => void,
      targetSessionId?: string,
      retryClientMessageId?: string,
    ) => {
      const activeSessionId = targetSessionId ?? sessionId;
      if (!activeSessionId) return;

      const text = content.trim();
      if (!text || abortControllerRef.current || isLoading || retryAfterSeconds > 0) return;

      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await sendChatMessage(
          activeSessionId,
          text,
          (state) => {
            if (abortControllerRef.current === controller) onChange(state);
          },
          controller.signal,
          retryClientMessageId,
        );
      } catch (err) {
        if (abortControllerRef.current !== controller) return;
        if (err instanceof Error && err.name === 'AbortError') {
          // Handled by stop function
          return;
        }
        if (err instanceof ApiError && err.code === 'KNOWLEDGE_NOT_READY') {
          void sessionApi.getKnowledgeState(activeSessionId).then((state) =>
            useChatStore.getState().syncSessionKnowledgeFiles(activeSessionId, state.knowledgeFiles, state.knowledgeReadiness),
          );
        }
        if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
          setRetryAfterSeconds(err.retryAfterSeconds ?? 60);
        }
        const message = err instanceof ApiError
          ? ({
              CHAT_IN_PROGRESS: '当前会话已有回答正在生成，请等待完成或停止原请求后重试',
              CHAT_TIMEOUT: '本次回答耗时过长已被中止，请重试',
              LLM_STREAM_INCOMPLETE: '回答不完整（连接中断），请重试',
              GITHUB_UNAVAILABLE: 'GitHub 连接超时，请稍后重试',
              GITHUB_REPO_NOT_ACCESSIBLE: '当前账号没有该仓库的权限，请先安装并授权 GitHub App',
              GITHUB_FORBIDDEN: 'GitHub 拒绝访问该仓库，请检查授权范围',
              GITHUB_NOT_FOUND: '仓库或文件不存在',
              GITHUB_RATE_LIMITED: 'GitHub 接口限流，请稍后重试',
              IDEMPOTENCY_CONFLICT: '重试标识对应的问题已改变，请作为新问题发送',
              CHAT_RETRY_CONFLICT: '该问题之后已有新消息，请作为新问题发送',
              KNOWLEDGE_NOT_READY: '知识库正在建立索引，请稍后重试',
              KNOWLEDGE_INDEX_FAILED: '知识库索引失败，请在会话设置中重新索引',
              EMBEDDING_UNAVAILABLE: '知识库服务暂不可用，请稍后重试',
              EMBEDDING_DIMENSION_MISMATCH: '向量配置不一致，请联系管理员检查并重建知识库',
              LLM_TIMEOUT: '回答超时，请重新生成',
              LLM_UNAVAILABLE: '问答服务暂不可用，请稍后重试',
              TOOL_FAILED: '工具调用失败，请重新提问',
              RATE_LIMITED: `请求过于频繁${err.retryAfterSeconds ? `，请 ${err.retryAfterSeconds} 秒后重试` : ''}`,
              SESSION_ACCESS_DENIED: '没有权限访问该会话',
              SESSION_NOT_FOUND: '会话不存在或已被删除',
              INVALID_REQUEST: '消息内容或请求参数不符合要求',
              INTERNAL_ERROR: `服务内部错误${err.requestId ? `（请求 ID：${err.requestId}）` : ''}`,
            } as Partial<Record<string, string>>)[err.code ?? ''] || err.message
          : err instanceof Error ? err.message : '请求失败，请稍后重试';
        setError(message);
        setErrorCode(err instanceof ApiError ? err.code : null);
      } finally {
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
          abortControllerRef.current = null;
        }
      }
    },
    [sessionId, isLoading, retryAfterSeconds],
  );

  return {
    send,
    stop,
    isLoading,
    error,
    errorCode,
    retryAfterSeconds,
    clearError: () => setError(null),
  };
}
