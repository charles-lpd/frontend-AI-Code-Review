/**
 * 聊天发送 hook：管理发送中的 UI 状态，实际发送逻辑在 services/sendChatMessage
 */
import { useCallback, useRef, useState } from 'react';
import { sendChatMessage } from '../services/sendChatMessage';
import type { StreamingAssistantState } from '../types/chat';

export function useChatSend(sessionId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const send = useCallback(
    async (
      content: string,
      onChange: (state: StreamingAssistantState | null) => void,
    ) => {
      if (!sessionId) return;

      const text = content.trim();
      if (!text || isLoading) return;

      setIsLoading(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await sendChatMessage(sessionId, text, onChange, controller.signal);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Handled by stop function
          return;
        }
        const message =
          err instanceof Error ? err.message : '请求失败，请稍后重试';
        setError(message);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, isLoading],
  );

  return {
    send,
    stop,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}
