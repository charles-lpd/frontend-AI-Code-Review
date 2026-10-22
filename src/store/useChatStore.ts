/**
 * 多会话聊天存储 (Zustand)
 * 对接 PostgreSQL 后端 API
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ChatMessage,
  ChatSession,
  PublicSessionCacheItem,
  PublicSessionHistoryItem,
  SessionKnowledgeFile,
  SessionManageConfig,
} from '../types/chat';
import { sessionApi } from '../api/sessions';

interface ChatStore {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;
  publicSessionHistory: PublicSessionHistoryItem[];
  publicSessionCache: Record<string, PublicSessionCacheItem>;

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
  syncSessionKnowledgeFiles: (
    sessionId: string,
    files: SessionKnowledgeFile[],
    readiness?: import('../types/chat').KnowledgeReadiness,
  ) => void;
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
  clearMessages: (sessionId: string) => Promise<void>;
  getActiveSession: () => ChatSession | undefined;
  setPublicSessionHistory: (items: PublicSessionHistoryItem[]) => void;
  touchPublicSessionHistory: (item: PublicSessionHistoryItem) => void;
  clearPublicSessionHistory: () => void;
  setPublicSessionCache: (
    sessionId: string,
    cache: PublicSessionCacheItem,
  ) => void;
  clearPublicSessionCache: (sessionId: string) => void;
}

function getDefaultManageConfig() {
  return {
    isPublic: false,
    systemPrompt: '',
    chatMode: 'assistant' as const,
    knowledgeReadiness: 'empty' as const,
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
      publicSessionHistory: [],
      publicSessionCache: {},

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
                        backendSession.manageConfig ??
                        localSession.manageConfig,
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

                  const mergedById = new Map(s.messages.map((m) => [m.id, m]));
                  newMessages.forEach((m) => {
                    const local = mergedById.get(m.id);
                    // An active local stream owns its draft until it settles.
                    if (local?.status !== 'generating') {
                      mergedById.set(m.id, { ...local, ...m, metadata: m.metadata ?? local?.metadata });
                    }
                  });
                  const mergedMessages = [...mergedById.values()].sort(
                    (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
                  );

                  return {
                    ...s,
                    ...detail,
                    messages: mergedMessages,
                    detailsLoaded: true,
                    hasMore: detail.hasMore ?? false,
                    lastCursor: detail.nextCursor ?? s.lastCursor,
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
                    hasMore: detail.hasMore ?? false,
                    lastCursor: detail.nextCursor ?? undefined,
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
                    hasMore: detail.hasMore ?? false,
                    lastCursor: detail.nextCursor ?? undefined,
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
          chatMode: patch.chatMode,
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
        const result = await sessionApi.uploadKnowledge(
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
                    knowledgeFiles: result.knowledgeFiles,
                    knowledgeReadiness:
                      result.knowledgeReadiness ?? s.manageConfig?.knowledgeReadiness ?? 'indexing',
                  },
                }
              : s,
          ),
        }));
      },

      syncSessionKnowledgeFiles: (sessionId, files, readiness) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  manageConfig: {
                    ...getDefaultManageConfig(),
                    ...s.manageConfig,
                    knowledgeFiles: files,
                    knowledgeReadiness: readiness ?? s.manageConfig?.knowledgeReadiness ?? 'empty',
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
                  messages: s.messages
                    .filter((m) => m.id === messageId || !patch.id || m.id !== patch.id)
                    .map((m) => m.id === messageId ? { ...m, ...patch } : m),
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

      clearMessages: async (sessionId) => {
        const clearedSession = await sessionApi.clearMessages(sessionId);
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  ...clearedSession,
                  draft: s.draft,
                  messages: [],
                  hasMore: false,
                  lastCursor: undefined,
                  isLoadingMore: false,
                  detailsLoaded: true,
                }
              : s,
          ),
        }));
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },

      setPublicSessionHistory: (items) => {
        set({ publicSessionHistory: items });
      },

      touchPublicSessionHistory: (item) => {
        set((state) => {
          const next = state.publicSessionHistory.filter(
            (historyItem) => historyItem.sessionId !== item.sessionId,
          );
          next.unshift(item);
          return { publicSessionHistory: next };
        });
      },

      clearPublicSessionHistory: () => {
        set({ publicSessionHistory: [] });
      },

      setPublicSessionCache: (sessionId, cache) => {
        set((state) => ({
          publicSessionCache: {
            ...state.publicSessionCache,
            [sessionId]: cache,
          },
        }));
      },

      clearPublicSessionCache: (sessionId) => {
        set((state) => {
          const next = { ...state.publicSessionCache };
          delete next[sessionId];
          return { publicSessionCache: next };
        });
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
        publicSessionHistory: state.publicSessionHistory,
        publicSessionCache: state.publicSessionCache,
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
