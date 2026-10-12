import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createCodeReviewSession, deleteCodeReviewSession, listCodeReviewSessions } from '../api/codeReview';
import type { CodeReviewConversationSummary } from '../types/codeReview';

interface CodeReviewStore {
  conversations: CodeReviewConversationSummary[];
  isLoading: boolean;
  hasFetched: boolean;
  error: string | null;
  fetchConversations: (force?: boolean) => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  upsertConversation: (conversation: CodeReviewConversationSummary) => void;
  removeConversation: (reviewId: string) => Promise<void>;
  clearConversations: () => void;
}

const EMPTY_STORAGE = { conversations: [] as CodeReviewConversationSummary[] };

export const useCodeReviewStore = create<CodeReviewStore>()(
  persist(
    (set) => ({
      conversations: [],
      isLoading: false,
      hasFetched: false,
      error: null,
      fetchConversations: async (force = false) => {
        const current = useCodeReviewStore.getState().conversations;
        if (!force && current.length > 0) {
          void (async () => {
            try {
              const sessions = await listCodeReviewSessions();
              set((state) => {
                const backendMap = new Map(
                  sessions.map((item) => [item.reviewId, item]),
                );
                const merged = state.conversations
                  .map((item) => backendMap.get(item.reviewId) ?? item)
                  .filter(Boolean);

                sessions.forEach((item) => {
                  if (!merged.find((conversation) => conversation.reviewId === item.reviewId)) {
                    merged.unshift(item);
                  }
                });

                return {
                  conversations: merged.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 30),
                  error: null,
                };
              });
            } catch (error) {
              console.error('同步代码审查会话列表失败:', error);
            }
          })();
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const sessions = await listCodeReviewSessions();
          set({
            conversations: sessions,
            isLoading: false,
            hasFetched: true,
          });
        } catch (error) {
          set({
            error: (error as Error).message,
            isLoading: false,
            hasFetched: true,
          });
        }
      },
      createConversation: async (title?: string) => {
        const session = await createCodeReviewSession({ title });
        set((state) => ({
          conversations: [
            session,
            ...state.conversations.filter(
              (item) => item.reviewId !== session.reviewId,
            ),
          ].sort((left, right) => right.updatedAt - left.updatedAt),
        }));
        return session.reviewId;
      },
      upsertConversation: (conversation) =>
        set((state) => {
          const next = [
            conversation,
            ...state.conversations.filter(
              (item) => item.reviewId !== conversation.reviewId,
            ),
          ].sort((left, right) => right.updatedAt - left.updatedAt);

          return { conversations: next.slice(0, 30) };
        }),
      removeConversation: async (reviewId) => {
        await deleteCodeReviewSession(reviewId);
        set((state) => ({
          conversations: state.conversations.filter(
            (item) => item.reviewId !== reviewId,
          ),
        }));
      },
      clearConversations: () => set(EMPTY_STORAGE),
    }),
    {
      name: 'code-review-conversations',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
