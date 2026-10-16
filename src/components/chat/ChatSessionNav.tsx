import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
/**
 * 会话导航：通过 /chat/:sessionId 切换会话
 */
import { memo, useCallback } from 'react';
import { WorkspaceSessionRow, WorkspaceSidebar } from '@/components/workspace/workspace';
import { ConfirmAction } from '@/components/confirm-action';
import { NavLink, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/useChatStore';


interface ChatSessionNavProps {
  mobileTriggerRef?: import('react').RefObject<HTMLButtonElement | null>;
  sendingSessionId?: string | null;
  mobileOpen?: boolean;
  desktopCollapsed?: boolean;
  onDesktopToggle?: () => void;
  onMobileToggle?: () => void;
  onMobileClose?: () => void;
}

interface SessionListProps {
  sessions: ReturnType<typeof useChatStore.getState>['sessions'];
  sendingSessionId: string | null;
  onMobileClose?: () => void;
  onRemove: (id: string) => Promise<void>;
}

const SessionList = memo(function SessionList({
  sessions,
  sendingSessionId,
  onMobileClose,
  onRemove
}: SessionListProps) {
  const listRenderStart = performance.now();
  if (typeof window !== 'undefined') {
    const host = window as typeof window & {
      __SIDEBAR_SYNC_PROFILE__?: unknown[];
    };
    const bucket = (host.__SIDEBAR_SYNC_PROFILE__ ??= []);
    bucket.push({
      component: 'SessionList',
      phase: 'render-start',
      sessionsCount: sessions.length,
      sendingSessionId,
      ts: listRenderStart,
    });
  }

  return (
    <ul className="session-nav__list">
      {sessions.map((session) => (
        <li key={session.id}>
<WorkspaceSessionRow deleteAction={sessions.length > 1 ? <ConfirmAction title="确定要删除这个会话吗？" onConfirm={() => onRemove(session.id)}>
              <Button variant="ghost" type="button" className="session-nav__delete" title="删除会话" aria-label={`删除会话：${session.title}`}>
                <span aria-hidden="true">×</span>
              </Button>
            </ConfirmAction> : undefined}><NavLink
            to={`/chat/${session.id}`}
            className={({ isActive }) =>
              `session-nav__item${isActive ? ' session-nav__item--active' : ''}`
            }
            onClick={onMobileClose}
          >
            <span className="session-nav__title">{session.title}</span>
            {sendingSessionId === session.id && (
              <Badge className="session-nav__badge">…</Badge>
            )}
</NavLink></WorkspaceSessionRow>
        </li>
      ))}
    </ul>
  );
});

function ChatSessionNav({
  mobileTriggerRef,
  sendingSessionId = null,
  mobileOpen = false,
  desktopCollapsed = false,
  onDesktopToggle,
  onMobileClose,
}: ChatSessionNavProps) {
  const navRenderStart = performance.now();
  const navigate = useNavigate();
  const sessions = useChatStore((s) => s.sessions);
  const createSession = useChatStore((s) => s.createSession);
  const removeSession = useChatStore((s) => s.removeSession);

  if (typeof window !== 'undefined') {
    const host = window as typeof window & {
      __SIDEBAR_SYNC_PROFILE__?: unknown[];
    };
    const bucket = (host.__SIDEBAR_SYNC_PROFILE__ ??= []);
    bucket.push({
      component: 'ChatSessionNav',
      phase: 'render-start',
      mobileOpen,
      desktopCollapsed,
      sessionsCount: sessions.length,
      sendingSessionId,
      ts: navRenderStart,
    });
  }

  const handleNew = useCallback(async () => {
    try {
      const id = await createSession();
      navigate(`/chat/${id}`);
      onMobileClose?.();
    } catch (err) {
      console.error('创建会话失败:', err);
    }
  }, [createSession, navigate, onMobileClose]);

  const handleRemove = useCallback(
    async (id: string) => {
      if (sessions.length <= 1) return;

      {
        await removeSession(id);
        const currentActiveId = useChatStore.getState().activeSessionId;
        if (currentActiveId) {
          navigate(`/chat/${currentActiveId}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    },
    [sessions.length, removeSession, navigate],
  );

  return (
    <WorkspaceSidebar mobileTriggerRef={mobileTriggerRef} title="EverPay" newLabel="新对话" mobileOpen={mobileOpen} desktopCollapsed={desktopCollapsed} onDesktopToggle={onDesktopToggle} onMobileClose={onMobileClose} onNew={() => void handleNew()}>
      <SessionList sessions={sessions} sendingSessionId={sendingSessionId} onMobileClose={onMobileClose} onRemove={handleRemove} />
    </WorkspaceSidebar>
  );
}

export default memo(ChatSessionNav);
