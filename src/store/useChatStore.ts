/**
 * 多会话聊天存储 (Zustand)
 * 对接 PostgreSQL 后端 API
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChatMessage, ChatSession } from '../types/chat';
import { sessionApi } from '../api/sessions';

interface ChatStore {
  // State
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;

  // Actions
  fetchSessions: (force?: boolean) => Promise<void>;
  fetchSessionDetail: (id: string, limit?: number) => Promise<void>;
  fetchMoreMessages: (id: string, limit?: number) => Promise<void>;
  createSession: (title?: string) => Promise<string>;
  switchSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;

  // Local UI Actions
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (
    sessionId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  updateDraft: (sessionId: string, draft: string) => void;
  clearMessages: (sessionId: string) => void;

  // Helpers
  getActiveSession: () => ChatSession | undefined;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      hasFetched: false,
      error: null,

      /** 加载所有会话列表 */
      fetchSessions: async (force = false) => {
        const { sessions } = get();

        // 如果有本地缓存数据且不是强制刷新，直接使用本地缓存，后台静默同步后端
        if (!force && sessions.length > 0) {
          // 后台异步同步后端数据，不阻塞 UI
          (async () => {
            try {
              const rawSessions = await sessionApi.list();
              set((state) => {
                // 合并本地和后端数据
                const backendSessions = new Map(
                  rawSessions.map((s) => [s.id, s]),
                );
                const mergedSessions = state.sessions.map((localSession) => {
                  const backendSession = backendSessions.get(localSession.id);
                  if (backendSession) {
                    // 如果后端有这个会话，保留本地消息，更新其他字段
                    return {
                      ...backendSession,
                      messages:
                        localSession.messages || backendSession.messages || [],
                      detailsLoaded: localSession.detailsLoaded,
                      hasMore: localSession.hasMore,
                      lastCursor: localSession.lastCursor,
                      draft: localSession.draft,
                    };
                  }
                  return localSession;
                });

                // 添加后端有但本地没有的会话
                rawSessions.forEach((backendSession) => {
                  if (!mergedSessions.find((s) => s.id === backendSession.id)) {
                    mergedSessions.unshift({
                      ...backendSession,
                      detailsLoaded: false,
                    });
                  }
                });

                return { sessions: mergedSessions };
              });
            } catch (err) {
              console.error('后台同步会话失败:', err);
            }
          })();
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const rawSessions = await sessionApi.list();
          // 核心修改：确保列表中的会话不包含 messages，并标记未加载详情
          const sessions = rawSessions.map((s) => ({
            ...s,
            messages: s.messages || [],
            detailsLoaded: false,
          }));
          set({ sessions, isLoading: false, hasFetched: true });
        } catch (err) {
          set({
            error: (err as Error).message,
            isLoading: false,
            hasFetched: true, // 即使失败也标记为已尝试，防止无限循环
          });
        }
      },

      /** 加载会话详情（初始第一页消息） */
      fetchSessionDetail: async (id: string, limit = 10) => {
        const session = get().sessions.find((s) => s.id === id);

        // 如果本地已经有缓存的消息，直接使用本地消息，后台同步最新消息
        if (
          session &&
          session.messages &&
          session.messages.length > 0 &&
          session.detailsLoaded
        ) {
          // 后台异步同步最新消息，不阻塞 UI
          (async () => {
            try {
              const detail = await sessionApi.get(id, limit);
              const newMessages = detail.messages || [];

              set((state) => ({
                sessions: state.sessions.map((s) => {
                  if (s.id !== id) return s;

                  // 合并本地和后端消息（去重）
                  const existingIds = new Set(s.messages.map((m) => m.id));
                  const mergedMessages = [
                    ...s.messages,
                    ...newMessages.filter((m) => !existingIds.has(m.id)),
                  ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

                  return {
                    ...s,
                    ...detail,
                    messages: mergedMessages,
                    detailsLoaded: true,
                    hasMore: newMessages.length >= limit,
                    lastCursor: newMessages[0]?.id || s.lastCursor,
                  };
                }),
              }));
            } catch (err) {
              console.error('后台同步会话详情失败:', err);
            }
          })();
          return;
        }

        try {
          const detail = await sessionApi.get(id, limit);
          const messages = detail.messages || [];

          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id
                ? {
                    ...s,
                    ...detail,
                    messages,
                    detailsLoaded: true,
                    hasMore: messages.length >= limit,
                    lastCursor: messages[0]?.id, // 后端反转后，[0] 是该批次最旧的消息
                  }
                : s,
            ),
          }));
        } catch (err) {
          set({ error: (err as Error).message });
        }
      },

      /** 加载更多历史消息 */
      fetchMoreMessages: async (id: string, limit = 10) => {
        const session = get().sessions.find((s) => s.id === id);
        if (
          !session ||
          session.isLoadingMore ||
          !session.hasMore ||
          !session.lastCursor
        )
          return;

        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, isLoadingMore: true } : s,
          ),
        }));

        try {
          const detail = await sessionApi.get(id, limit, session.lastCursor);
          const newMessages = detail.messages || [];

          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id
                ? {
                    ...s,
                    messages: [...newMessages, ...(s.messages || [])], // 历史消息放在前面
                    hasMore: newMessages.length >= limit,
                    lastCursor: newMessages[0]?.id || s.lastCursor,
                    isLoadingMore: false,
                  }
                : s,
            ),
          }));
        } catch (err) {
          console.error('加载更多消息失败:', err);
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === id ? { ...s, isLoadingMore: false } : s,
            ),
            error: '加载历史消息失败',
          }));
        }
      },

      /** 创建新会话 */
      createSession: async (title?: string) => {
        set({ isLoading: true });
        try {
          const newSession = await sessionApi.create(title);
          const sessionWithFlag = { ...newSession, detailsLoaded: true };
          set((state) => ({
            sessions: [sessionWithFlag, ...state.sessions],
            activeSessionId: newSession.id,
            isLoading: false,
          }));
          return newSession.id;
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false });
          throw err;
        }
      },

      /** 切换会话并加载详情 */
      switchSession: async (id: string) => {
        const { sessions, activeSessionId } = get();

        // 如果 ID 没变且已经加载过详情，直接跳过
        if (activeSessionId === id) {
          const session = sessions.find((s) => s.id === id);
          if (session?.detailsLoaded) return;
        }

        set({ activeSessionId: id });
        const session = get().sessions.find((s) => s.id === id);

        // 如果没有加载过详情，则请求
        if (session && !session.detailsLoaded) {
          await get().fetchSessionDetail(id);
        }
      },

      /** 删除会话 */
      removeSession: async (id: string) => {
        try {
          await sessionApi.delete(id);
          const { sessions, activeSessionId } = get();
          const nextSessions = sessions.filter((s) => s.id !== id);

          let nextActiveId = activeSessionId;
          if (activeSessionId === id) {
            nextActiveId = nextSessions[0]?.id ?? null;
          }

          set({ sessions: nextSessions, activeSessionId: nextActiveId });
        } catch (err) {
          set({ error: (err as Error).message });
        }
      },

      // --- 本地 UI 操作（用于流式响应等即时更新） ---

      addMessage: (sessionId, message) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? { ...s, messages: [...(s.messages || []), message] }
              : s,
          ),
        }));
      },

      updateMessage: (sessionId, messageId, patch) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m,
                  ),
                }
              : s,
          ),
        }));
      },

      updateDraft: (sessionId, draft) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, draft } : s,
          ),
        }));
      },

      clearMessages: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, messages: [] } : s,
          ),
        }));
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },
    }),
    {
      name: 'everpay-chat-storage', // 存储在 localStorage 中的 key
      storage: createJSONStorage(() => localStorage),
      // 核心配置：持久化会话列表和所有消息
      // 不持久化加载状态等临时状态
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messages: s.messages, // 保存所有消息到本地缓存
          draft: s.draft, // 保存草稿
          detailsLoaded: s.detailsLoaded,
          hasMore: s.hasMore,
          lastCursor: s.lastCursor,
        })),
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);

// --- 便捷导出 ---

export function useActiveSession() {
  return useChatStore((s) => s.getActiveSession());
}

export const chatActions = {
  addMessage: (sessionId: string, msg: ChatMessage) =>
    useChatStore.getState().addMessage(sessionId, msg),
  updateMessage: (
    sessionId: string,
    msgId: string,
    patch: Partial<ChatMessage>,
  ) => useChatStore.getState().updateMessage(sessionId, msgId, patch),
  updateDraft: (sessionId: string, draft: string) =>
    useChatStore.getState().updateDraft(sessionId, draft),
  getSession: (sessionId: string) =>
    useChatStore.getState().sessions.find((s) => s.id === sessionId),
};
