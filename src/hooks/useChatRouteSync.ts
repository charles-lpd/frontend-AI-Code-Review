/**
 * 同步路由 sessionId 与 Zustand 中的 activeSessionId
 * 并在无会话 / 无效 id 时自动创建或重定向
 */
import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChatStore } from '../store/useChatStore';
import { useAuthStore } from '../store/useAuthStore';

export function useChatRouteSync() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    // sessions,
    fetchSessions,
    switchSession,
    createSession,
    isLoading,
    hasFetched,
  } = useChatStore();
  const initializingRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSessions();
    }
  }, [fetchSessions, isAuthenticated]);

  useEffect(() => {
    // 如果未登录，或者正在加载列表，或者正在初始化新会话，则跳过
    if (!isAuthenticated || isLoading || !hasFetched || initializingRef.current)
      return;

    const sync = async () => {
      const currentSessions = useChatStore.getState().sessions;
      const activeId = useChatStore.getState().activeSessionId;

      // 1. 如果路径中有 sessionId，检查是否存在
      if (sessionId) {
        const exists = currentSessions.some((s) => s.id === sessionId);
        if (exists) {
          // 仅当 activeId 与当前路径不一致，或者该会话尚未加载详情时才触发 switch
          const session = currentSessions.find((s) => s.id === sessionId);
          if (activeId !== sessionId || !session?.detailsLoaded) {
            await switchSession(sessionId);
          }
          return;
        }
      }

      // 2. 如果当前没有会话列表，创建一个
      if (currentSessions.length === 0) {
        initializingRef.current = true;
        try {
          const id = await createSession();
          navigate(`/chat/${id}`, { replace: true });
        } catch (err) {
          console.error('初始化会话失败:', err);
        } finally {
          initializingRef.current = false;
        }
        return;
      }

      // 3. 如果路径中没有有效 ID，跳转到活跃会话或第一个会话
      const targetId = activeId ?? currentSessions[0].id;
      if (sessionId !== targetId) {
        navigate(`/chat/${targetId}`, { replace: true });
      }
    };

    sync();
  }, [
    sessionId,
    navigate,
    isLoading,
    hasFetched,
    switchSession,
    createSession,
  ]);
}
