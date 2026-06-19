/**
 * 多会话聊天存储 (Zustand)
 * 对接 PostgreSQL 后端 API
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ChatMessage,
  ChatSession,
  SessionManageConfig,
} from '../types/chat';
import { sessionApi } from '../api/sessions';

interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;

  fetchSessions: (force?: boolean) => Promise<void>;
  fetchSessionDetail: (id: string, limit?: number) => Promise<void>;
  fetchMoreMessages: (id: string, limit?: number) => Promise<void>;
  createSession: (title?: string) => Promise<string>;
  switchSession: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  updateSessionManageConfig: (
    sessionId: string,
    patch: Partial<SessionManageConfig>,
  ) => Promise<void>;
  addSessionKnowledgeFiles: (sessionId: string, files: File[]) => Promise<void>;
  removeSessionKnowledgeFile: (
    sessionId: string,
    fileId: string,
  ) => Promise<void>;

  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateMessage: (
    sessionId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  updateDraft: (sessionId: string, draft: string) => void;
  clearMessages: (sessionId: string) => void;
  getActiveSession: () => ChatSession | undefined;
}

function getDefaultManageConfig() {
  return {
    isPublic: false,
    systemPrompt: '',
    knowledgeFiles: [],
  };
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      hasFetched: false,
      error: null,

      fetchSessions: async (force = false) => {
        const { sessions } = get();

        if (!force && sessions.length > 0) {
          void (async () => {
            try {
              const rawSessions = await sessionApi.list();
              set((state) => {
                const backendSessions = new Map(
                  rawSessions.map((s) => [s.id, s]),
                );
                const mergedSessions = state.sessions.map((localSession) => {
                  const backendSession = backendSessions.get(localSession.id);
                  if (backendSession) {
                    return {
                      ...backendSession,
                      messages:
                        localSession.messages || backendSession.messages || [],
                      detailsLoaded: localSession.detailsLoaded,
                      hasMore: localSession.hasMore,
                      lastCursor: localSession.lastCursor,
                      draft: localSession.draft,
                      manageConfig:
                        localSession.manageConfig ??
                        backendSession.manageConfig,
                    };
                  }
                  return localSession;
                });

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
            hasFetched: true,
          });
        }
      },

      fetchSessionDetail: async (id: string, limit = 10) => {
        const session = get().sessions.find((s) => s.id === id);

        if (
          session &&
          session.messages &&
          session.messages.length > 0 &&
          session.detailsLoaded
        ) {
          void (async () => {
            try {
              const detail = await sessionApi.get(id, limit);
              const newMessages = detail.messages || [];

              set((state) => ({
                sessions: state.sessions.map((s) => {
                  if (s.id !== id) return s;

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
                    lastCursor: messages[0]?.id,
                  }
                : s,
            ),
          }));
        } catch (err) {
          set({ error: (err as Error).message });
        }
      },

      fetchMoreMessages: async (id: string, limit = 10) => {
        const session = get().sessions.find((s) => s.id === id);
        if (
          !session ||
          session.isLoadingMore ||
          !session.hasMore ||
          !session.lastCursor
        ) {
          return;
        }

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
                    messages: [...newMessages, ...(s.messages || [])],
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

      switchSession: async (id: string) => {
        const { sessions, activeSessionId } = get();

        if (activeSessionId === id) {
          const session = sessions.find((s) => s.id === id);
          if (session?.detailsLoaded) return;
        }

        set({ activeSessionId: id });
        const session = get().sessions.find((s) => s.id === id);

        if (session && !session.detailsLoaded) {
          await get().fetchSessionDetail(id);
        }
      },

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

      updateSessionManageConfig: async (sessionId, patch) => {
        const session = await sessionApi.updateManageConfig(sessionId, {
          title: typeof patch.title === 'string' ? patch.title : undefined,
          isPublic:
            typeof patch.isPublic === 'boolean' ? patch.isPublic : undefined,
          systemPrompt:
            typeof patch.systemPrompt === 'string'
              ? patch.systemPrompt
              : undefined,
        });
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  ...session,
                  manageConfig: {
                    ...getDefaultManageConfig(),
                    ...session.manageConfig,
                  },
                }
              : s,
          ),
        }));
      },

      addSessionKnowledgeFiles: async (sessionId, files) => {
        const knowledgeFiles = await sessionApi.uploadKnowledge(
          sessionId,
          files,
        );
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  manageConfig: {
                    ...getDefaultManageConfig(),
                    ...s.manageConfig,
                    knowledgeFiles,
                  },
                }
              : s,
          ),
        }));
      },

      removeSessionKnowledgeFile: async (sessionId, fileId) => {
        await sessionApi.deleteKnowledge(sessionId, fileId);
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  manageConfig: {
                    ...getDefaultManageConfig(),
                    ...s.manageConfig,
                    knowledgeFiles: (
                      s.manageConfig?.knowledgeFiles ?? []
                    ).filter((file) => file.id !== fileId),
                  },
                }
              : s,
          ),
        }));
      },

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
      name: 'everpay-chat-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messages: s.messages,
          draft: s.draft,
          detailsLoaded: s.detailsLoaded,
          hasMore: s.hasMore,
          lastCursor: s.lastCursor,
          manageConfig: s.manageConfig,
        })),
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);

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
